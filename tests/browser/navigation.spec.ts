import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const viewports = [
  { name: 'desktop', width: 1366, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
]

for (const viewport of viewports) {
  test(`navigates idle, save, back, load, back at ${viewport.name} viewport`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'ZX ACOUSTIC TRANSFER' })).toBeVisible()
    await expect(page.getByText('READY', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'SAVE' }).click()
    await expect(page.getByText('SELECT FILE (MAX 4096 BYTES / 256-BYTE BLOCKS)')).toBeVisible()
    await page.getByRole('button', { name: 'BACK' }).click()
    await expect(page.getByRole('button', { name: 'LOAD' })).toBeVisible()

    await page.getByRole('button', { name: 'LOAD' }).click()
    await expect(page.getByText('READY TO LISTEN')).toBeVisible()
    await page.getByRole('button', { name: 'BACK' }).click()
    await expect(page.getByRole('heading', { name: 'ZX ACOUSTIC TRANSFER' })).toBeVisible()
    expect(errors).toEqual([])
    await context.close()
  })
}

test('shows the explicit LISTEN control on the load screen without mocking microphone hardware', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'LOAD' }).click()
  await expect(page.getByText('READY TO LISTEN')).toBeVisible()
  await expect(page.getByRole('button', { name: 'LISTEN' })).toBeVisible()
})

test('does not expose RESET MAX until an actual receive session exists', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'LOAD' }).click()
  await expect(page.getByRole('button', { name: 'RESET MAX' })).toHaveCount(0)
})

test('starts and stops both diagnostic tone controls through the application UI', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'SAVE' }).click()

  await page.getByRole('button', { name: 'TEST 0' }).click()
  await expect(page.getByText('TEST 0 ACTIVE')).toBeVisible()
  await page.getByRole('button', { name: 'STOP TEST' }).click()
  await expect(page.getByText('TEST 0 ACTIVE')).toBeHidden()

  await page.getByRole('button', { name: 'TEST 1' }).click()
  await expect(page.getByText('TEST 1 ACTIVE')).toBeVisible()
  await page.getByRole('button', { name: 'STOP TEST' }).click()
  await expect(page.getByText('TEST 1 ACTIVE')).toBeHidden()
})

/**
 * Exercises sender and receiver UI instances as separate browser contexts.
 * @param {import('@playwright/test').Browser} browser - Browser supplied by Playwright.
 * @returns {Promise<void>} Completion after both application instances handle their actions.
 */
test('operates independent sender and receiver application instances', async ({ browser }) => {
  const senderContext = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const receiverContext = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: [] })
  const sender = await senderContext.newPage()
  const receiver = await receiverContext.newPage()
  const errors: string[] = []

  for (const page of [sender, receiver]) {
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))
  }

  await Promise.all([sender.goto('/'), receiver.goto('/')])

  await receiver.getByRole('button', { name: 'LOAD' }).click()
  await expect(receiver.getByText('READY TO LISTEN')).toBeVisible()
  await expect(receiver.getByRole('button', { name: 'LISTEN' })).toBeVisible()

  await sender.getByRole('button', { name: 'SAVE' }).click()
  await sender.getByRole('button', { name: 'TEST 0' }).click()
  await expect(sender.getByText('TEST 0 ACTIVE')).toBeVisible()
  await sender.getByRole('button', { name: 'STOP TEST' }).click()
  await expect(sender.getByText('TEST 0 ACTIVE')).toBeHidden()
  await sender.getByRole('button', { name: 'TEST 1' }).click()
  await expect(sender.getByText('TEST 1 ACTIVE')).toBeVisible()
  await sender.getByRole('button', { name: 'STOP TEST' }).click()
  await sender.getByRole('button', { name: 'TRANSMIT' }).click()

  expect(errors).toEqual([])
  await Promise.all([senderContext.close(), receiverContext.close()])
})

/**
 * Verifies a browser fixture where only the audio I/O boundary is virtualized.
 * @param {import('@playwright/test').Page} page - Playwright page hosting two isolated Vue applications.
 * @returns {Promise<void>} Completion after real production PCM reaches real production detection.
 */
test('connects sender protocol framing to receiver acquisition through a virtual acoustic channel', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/tests/browser/virtual-acoustic.html')
  const sender = page.locator('#sender')
  const receiver = page.locator('#receiver')
  await receiver.getByRole('button', { name: 'LOAD' }).click()
  await receiver.getByRole('button', { name: 'LISTEN' }).click()
  await expect(receiver.getByText('LISTENING')).toBeVisible()

  await sender.getByRole('button', { name: 'SAVE' }).click()
  await sender.getByRole('button', { name: 'TRANSMIT' }).click()
  await expect(receiver.getByText('SYNC DETECTED / RECEIVING DATA')).toBeVisible()
  await receiver.getByRole('button', { name: 'STOP' }).click()
  await expect(receiver.getByRole('button', { name: 'LISTEN' })).toBeVisible()

  expect(errors).toEqual([])
})

/**
 * Verifies file selection, validated virtual acoustic delivery, and explicit download in the browser UI.
 * @param {import('@playwright/test').Page} page - Browser page hosting isolated sender and receiver instances.
 * @returns {Promise<void>} Completion after the file becomes downloadable.
 */
test('transfers and downloads a selected multi-block file through the virtual acoustic channel', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/browser/virtual-acoustic.html?fast=1')
  const sender = page.locator('#sender')
  const receiver = page.locator('#receiver')
  await receiver.getByRole('button', { name: 'LOAD' }).click()
  await receiver.getByRole('button', { name: 'LISTEN' }).click()
  await sender.getByRole('button', { name: 'SAVE' }).click()
  const source = Buffer.from(Array.from({ length: 513 }, (_, index) => (index * 37) % 256))
  await sender.locator('input[type="file"]').setInputFiles({ name: 'data.bin', mimeType: 'application/octet-stream', buffer: source })
  await sender.getByRole('button', { name: 'TRANSMIT' }).click()
  await expect(receiver.getByText('FILE VERIFIED: data.bin (513 BYTES)')).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await receiver.getByRole('button', { name: 'DOWNLOAD FILE' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('data.bin')
  expect(await readFile(await download.path())).toEqual(source)
  expect(errors).toEqual([])
})

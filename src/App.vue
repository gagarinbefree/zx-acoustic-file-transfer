<script setup lang="ts">
import TransferMenu from './components/TransferMenu.vue'
import { inject, shallowRef } from 'vue'
import { createDefaultTransferApplicationServices, transferApplicationServicesKey, type TransferApplicationServices } from './application/transferApplicationServices'
import { useTransferStore } from './stores/transfer'
import type { TransferMode } from './types/transfer'
import { maximumFileBytes } from './domain/fileFrame'

/**
 * App composes the responsive application shell with typed state and user intents.
 */
const transfer = useTransferStore()
const transmissionMessage = 'HELLO SPECTRUM'
const services = inject<TransferApplicationServices>(transferApplicationServicesKey) ?? createDefaultTransferApplicationServices()
const { transmitter, receiver, diagnosticTone } = services
const selectedFile = shallowRef<File | null>(null)
const sendError = shallowRef<string | null>(null)

/**
 * selectMode forwards a UI mode-selection event to application state.
 * @param {Exclude<TransferMode, 'idle'>} mode - Send or receive mode selected by the user.
 * @returns {void} Updates the transfer store.
 */
function selectMode(mode: Exclude<TransferMode, 'idle'>): void {
  transfer.selectMode(mode)
}

/**
 * transmit forwards the preset message to the application transmitter.
 * @returns {Promise<void>} Resolves when playback has been scheduled.
 */
async function transmit(): Promise<void> {
  await stopTestTone()
  sendError.value = null
  const file = selectedFile.value
  if (file === null) {
    await transmitter.transmit({ message: transmissionMessage }, transfer.recordTransmissionEvent)
    return
  }
  if (file.size > maximumFileBytes) {
    sendError.value = `File exceeds the ${maximumFileBytes}-byte acoustic limit.`
    return
  }
  try {
    await transmitter.transmit({ file: { name: file.name, data: new Uint8Array(await file.arrayBuffer()) } }, (event) => {
      transfer.recordTransmissionEvent(event)
      if (event.type === 'failed') sendError.value = event.message
    })
  } catch (error: unknown) {
    sendError.value = error instanceof Error ? error.message : 'Could not read the selected file.'
  }
}

/**
 * chooseFile remembers the browser-selected file for the next transmission.
 * @param {Event} event - File input change event.
 * @returns {void} Updates the selected file and clears prior errors.
 */
function chooseFile(event: Event): void {
  selectedFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
  sendError.value = null
}

/**
 * downloadReceived saves a checksum-verified file after an explicit user action.
 * @returns {void} Starts the browser download when a received file exists.
 */
function downloadReceived(): void {
  receiver.downloadCompletedFile()
}

/**
 * startTestTone starts a shared-configuration diagnostic BFSK tone.
 * @param {0 | 1} bit - Diagnostic BFSK symbol to hold for physical testing.
 * @returns {Promise<void>} Resolves after the tone has been scheduled.
 */
async function startTestTone(bit: 0 | 1): Promise<void> {
  transfer.setDiagnosticTone(await diagnosticTone.start(bit))
}

/**
 * stopTestTone stops diagnostic playback and releases its output resources.
 * @returns {Promise<void>} Resolves after audio output cleanup.
 */
async function stopTestTone(): Promise<void> {
  transfer.setDiagnosticTone(await diagnosticTone.stop())
}

/**
 * listen starts microphone capture through the application receiver.
 * @returns {Promise<void>} Resolves when the receiver becomes active or reports a failure.
 */
async function listen(): Promise<void> {
  await receiver.start(transfer.recordReceiveEvent)
}

/**
 * stopListening releases active microphone resources through the application receiver.
 * @returns {Promise<void>} Resolves after capture shutdown.
 */
async function stopListening(): Promise<void> {
  await receiver.stop()
}

/**
 * resetReceiveMaximums clears retained diagnostic maxima for the current listen session.
 * @returns {void} Refreshes aggregate receive telemetry.
 */
function resetReceiveMaximums(): void {
  receiver.resetMaximums()
}

/**
 * returnToReady stops microphone capture before restoring the ready screen.
 * @returns {Promise<void>} Resolves after safe capture cleanup and state reset.
 */
async function returnToReady(): Promise<void> {
  await stopTestTone()
  await stopListening()
  transfer.returnToReady()
}
</script>

<template>
  <div class="application-shell py-4 py-md-5">
    <main class="container">
      <div class="row justify-content-center">
        <div class="col-12 col-md-10 col-lg-8 col-xl-7">
          <section class="card border-0 shadow-sm" aria-labelledby="application-title">
            <div class="card-body p-4 p-md-5">
              <header class="mb-4 pb-3 border-bottom">
                <p class="text-primary fw-semibold text-uppercase small mb-2">Acoustic modem</p>
                <h1 id="application-title" class="h2 mb-1">ZX Acoustic Transfer</h1>
                <p class="text-body-secondary mb-0">Send a small file or message using two audio frequencies.</p>
              </header>
              <TransferMenu
                :mode="transfer.state.mode"
                :status="transfer.state.status"
                :message="transmissionMessage"
                :selected-file-name="selectedFile?.name ?? null"
                :send-error="sendError"
                :diagnostic-tone="transfer.diagnosticTone"
                :receive="transfer.receiveVisualization"
                @select="selectMode"
                @back="returnToReady"
                @transmit="transmit"
                @choose-file="chooseFile"
                @download="downloadReceived"
                @listen="listen"
                @stop="stopListening"
                @reset-max="resetReceiveMaximums"
                @test-tone="startTestTone"
                @stop-test="stopTestTone"
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.application-shell { min-height: 100dvh; }
</style>

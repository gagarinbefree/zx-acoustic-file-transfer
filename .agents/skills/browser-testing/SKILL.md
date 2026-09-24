---
name: browser-testing
description: Run browser checks for ZX Acoustic Transfer UI and browser API changes using browser-control tools or the local Playwright fallback.
---

# Browser Testing

Use this workflow after changes to UI, browser APIs, or Web Audio APIs. Keep unit, virtual acoustic integration, and real hardware verification explicitly separate: virtual channels are test-only and never prove a physical speaker-to-air-to-microphone path.

1. First use an available built-in browser or browser-control tool to inspect the requested UI flow, console, and viewport behavior.
2. If no browser-control surface is available, run `npm run test:browser`.
3. If Playwright reports that Chromium is absent, inspect `npx playwright install --list` and run `npx playwright install chromium`. On Windows, verify that both `chromium-<build>` and the required `chromium_headless_shell-<build>` are available.
4. If the official Chromium installer leaves the headless shell absent but a system Microsoft Edge or Google Chrome is installed, configure the Playwright project with `channel: 'msedge'` or `channel: 'chrome'`; do not hardcode an executable path.
5. Rerun `npm run test:browser` and confirm a real browser process completes the tests. Treat browser automation as unavailable only when both paths cannot run, and record the exact failure.

The Playwright suite launches Vite automatically, checks both 1366×768 and 390×844 viewports, and fails on `console.error` or `pageerror`. For microphone lifecycle checks, grant `microphone` permission for the localhost origin in the browser context where available; if no real device exists, use a test-only virtual `AudioInput` fixture and report it as virtual—not hardware—coverage.

For every functional change run the mandatory matrix: `npm test`, `npm run test:acoustic`, `npm run typecheck`, `npm run build`, and `npm run test:browser`.

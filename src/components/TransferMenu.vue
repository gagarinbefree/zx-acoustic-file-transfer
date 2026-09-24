<script setup lang="ts">
import type { DiagnosticToneVisualizationState, ReceiveVisualizationState, TransferMode } from '../types/transfer'

/**
 * TransferMenu renders the typed transfer state and emits user intentions.
 * @prop {TransferMode} mode - Current transfer mode to display.
 * @prop {string} status - Current application status text.
 * @prop {string} message - Preset message displayed on the send screen.
 * @prop {string | null} selectedFileName - File selected for acoustic transmission.
 * @prop {string | null} sendError - File selection or transmission error.
 * @prop {ReceiveVisualizationState} receive - Aggregated microphone UI state.
 * @prop {DiagnosticToneVisualizationState} diagnosticTone - Active diagnostic tone state.
 * @event select - Emits a send or receive mode selection.
 * @event back - Emits a request to return to the ready screen.
 * @event transmit - Emits a request to transmit the preset message.
 * @event chooseFile - Emits the native file input change event.
 * @event download - Emits a request to download a validated received file.
 * @event listen - Emits a request to start microphone capture.
 * @event stop - Emits a request to stop microphone capture.
 * @event resetMax - Emits a request to reset retained receive diagnostics.
 * @event testTone - Emits a request to start a diagnostic BFSK symbol.
 * @event stopTest - Emits a request to stop the diagnostic tone.
 */
defineProps<{ mode: TransferMode; status: string; message: string; selectedFileName: string | null; sendError: string | null; receive: ReceiveVisualizationState; diagnosticTone: DiagnosticToneVisualizationState }>()
const emit = defineEmits<{ select: [mode: 'send' | 'receive']; back: []; transmit: []; chooseFile: [event: Event]; download: []; listen: []; stop: []; resetMax: []; testTone: [bit: 0 | 1]; stopTest: [] }>()

/**
 * displaySetting renders browser-reported microphone values safely.
 * @param {number | boolean | null} value - Setting value that may be unavailable.
 * @returns {string} Human-readable setting text.
 */
function displaySetting(value: number | boolean | null): string {
  return value === null ? 'NOT REPORTED' : String(value).toUpperCase()
}
</script>

<template>
  <div class="d-flex flex-column gap-4">
    <template v-if="mode === 'idle'">
      <div>
        <span class="badge text-bg-success">{{ status }}</span>
        <p class="text-body-secondary mt-3 mb-0">Choose what this device should do.</p>
      </div>
      <nav class="d-grid gap-2 d-sm-flex" aria-label="Transfer mode">
        <button type="button" class="btn btn-primary px-4" @click="emit('select', 'send')">SAVE</button>
        <button type="button" class="btn btn-outline-primary px-4" @click="emit('select', 'receive')">LOAD</button>
      </nav>
    </template>
    <template v-else-if="mode === 'send'">
      <div>
        <h2 class="h4 mb-1">Send</h2>
        <p class="text-body-secondary mb-0">The selected file is transmitted as 256-byte blocks.</p>
      </div>
      <div>
        <label class="form-label fw-semibold" for="transfer-file">SELECT FILE (MAX 1024 BYTES / 256-BYTE BLOCKS)</label>
        <input id="transfer-file" class="form-control" type="file" @change="emit('chooseFile', $event)" />
        <div class="form-text">{{ selectedFileName === null ? 'No file selected: the HELLO SPECTRUM demo will be sent.' : `Selected: ${selectedFileName}` }}</div>
      </div>
      <div v-if="sendError" class="alert alert-danger mb-0" role="alert">{{ sendError }}</div>
      <button type="button" class="btn btn-primary align-self-start" @click="emit('transmit')">TRANSMIT</button>
      <div class="border-top pt-4">
        <h3 class="h6 mb-3">BFSK diagnostic tones</h3>
        <p v-if="diagnosticTone.activeBit !== null" class="alert alert-warning py-2">TEST {{ diagnosticTone.activeBit }} ACTIVE</p>
        <nav class="d-flex flex-wrap gap-2" aria-label="BFSK diagnostic tones">
          <button type="button" class="btn btn-outline-secondary" @click="emit('testTone', 0)">TEST 0</button>
          <button type="button" class="btn btn-outline-secondary" @click="emit('testTone', 1)">TEST 1</button>
          <button v-if="diagnosticTone.activeBit !== null" type="button" class="btn btn-outline-danger" @click="emit('stopTest')">STOP TEST</button>
        </nav>
      </div>
      <button type="button" class="btn btn-link px-0 align-self-start" @click="emit('back')">BACK</button>
    </template>
    <template v-else>
      <div>
        <h2 class="h4 mb-1">Receive</h2>
        <p v-if="receive.phase === 'idle'" class="text-body-secondary mb-0">READY TO LISTEN</p>
        <p v-else-if="receive.phase === 'starting'" class="text-body-secondary mb-0">REQUESTING MICROPHONE</p>
        <p v-else class="text-success mb-0 fw-semibold">LISTENING</p>
      </div>
      <div v-if="receive.error" class="alert alert-danger mb-0" role="alert">{{ receive.error }}</div>
      <div v-if="receive.frameError" class="alert alert-danger mb-0" role="alert">{{ receive.frameError }}</div>
      <div v-if="receive.receivedFile" class="alert alert-success mb-0" role="status">
        <p class="mb-2">FILE VERIFIED: {{ receive.receivedFile.name }} ({{ receive.receivedFile.bytes }} BYTES)</p>
        <button type="button" class="btn btn-success" @click="emit('download')">DOWNLOAD FILE</button>
      </div>
      <template v-if="receive.phase === 'listening'">
        <section class="border rounded-3 p-3" aria-label="Receive diagnostics">
          <p class="fw-semibold mb-3">{{ receive.protocolState === 'listening' ? 'SEARCHING' : receive.protocolState === 'pilotDetected' ? 'PILOT DETECTED' : receive.protocolState === 'synchronizing' ? 'SYNCHRONIZING' : 'SYNC DETECTED / RECEIVING DATA' }}</p>
          <div v-if="receive.transferProgress.blockCount > 0" class="mb-3">
            <div class="d-flex justify-content-between small mb-1"><span>BLOCK {{ receive.transferProgress.blockIndex + 1 }} / {{ receive.transferProgress.blockCount }}</span><span>{{ Math.round(receive.transferProgress.progress * 100) }}%</span></div>
            <div class="progress" role="progressbar" aria-label="File transfer progress" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(receive.transferProgress.progress * 100)"><div class="progress-bar" :style="{ width: `${receive.transferProgress.progress * 100}%` }"></div></div>
            <p class="small text-body-secondary mb-0 mt-1">{{ receive.transferProgress.bytesReceived }} BYTES</p>
          </div>
          <div class="mb-3">
            <div class="d-flex justify-content-between small mb-1"><span>Microphone signal level</span><span>{{ Math.round(Math.min(receive.telemetry.peak, 1) * 100) }}%</span></div>
            <div class="progress" role="progressbar" aria-label="Microphone signal level" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(Math.min(receive.telemetry.peak, 1) * 100)"><div class="progress-bar bg-info" :style="{ width: `${Math.min(receive.telemetry.peak, 1) * 100}%` }"></div></div>
          </div>
          <dl class="row small mb-3 telemetry-grid">
            <dt class="col-6">RMS / Peak</dt><dd class="col-6">{{ Math.round(receive.telemetry.rms * 100) }}% / {{ Math.round(receive.telemetry.peak * 100) }}%</dd>
            <dt class="col-6">Signal</dt><dd class="col-6">{{ receive.telemetry.detection.symbol === 'none' ? 'NO SIGNAL' : `F${receive.telemetry.detection.symbol} DETECTED` }}</dd>
            <dt class="col-6">Samples / chunks</dt><dd class="col-6">{{ receive.telemetry.samples }} / {{ receive.telemetry.chunks }}</dd>
            <dt class="col-6">Detector confidence</dt><dd class="col-6">{{ receive.telemetry.detection.confidence.toFixed(1) }}</dd>
            <dt class="col-6">Block CRC32</dt><dd class="col-6">{{ receive.telemetry.lastBlockCrc }}</dd>
            <dt class="col-6">Blocks passed / failed</dt><dd class="col-6">{{ receive.telemetry.successfulBlocks }} / {{ receive.telemetry.failedBlocks }}</dd>
          </dl>
          <details v-if="receive.settings" class="small">
            <summary class="mb-2">Microphone details</summary>
            <p class="mb-1">GRAPH RATE {{ receive.sampleRate }} HZ · TRACK RATE {{ displaySetting(receive.settings.sampleRate) }} HZ</p>
            <p class="mb-1">CHANNELS {{ displaySetting(receive.settings.channelCount) }}</p>
            <p class="mb-0">EC {{ displaySetting(receive.settings.echoCancellation) }} · NS {{ displaySetting(receive.settings.noiseSuppression) }} · AGC {{ displaySetting(receive.settings.autoGainControl) }}</p>
          </details>
          <button type="button" class="btn btn-sm btn-outline-secondary mt-3" @click="emit('resetMax')">RESET MAX</button>
        </section>
      </template>
      <div class="d-flex flex-wrap gap-2">
        <button v-if="receive.phase === 'idle'" type="button" class="btn btn-primary" @click="emit('listen')">LISTEN</button>
        <button v-else type="button" class="btn btn-outline-danger" :disabled="receive.phase === 'starting'" @click="emit('stop')">STOP</button>
        <button type="button" class="btn btn-link" @click="emit('back')">BACK</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.telemetry-grid dd { margin-bottom: .5rem; }
</style>

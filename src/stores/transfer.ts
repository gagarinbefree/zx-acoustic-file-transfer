import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { DiagnosticToneVisualizationState, ReceiveVisualizationState, TransmissionVisualizationState, TransferMode, TransferViewState } from '../types/transfer'
import type { TransmissionLifecycleEvent } from '../application/transmissionEvents'
import type { ReceiveLifecycleEvent } from '../application/receiveMicrophone'

export const useTransferStore = defineStore('transfer', () => {
  const mode = ref<TransferMode>('idle')
  const status = ref<TransferViewState['status']>('READY')
  const visualization = ref<TransmissionVisualizationState>({ phase: 'idle', activeBit: null, symbolIndex: null })
  const diagnosticTone = ref<DiagnosticToneVisualizationState>({ activeBit: null })
  const receiveVisualization = shallowRef<ReceiveVisualizationState>({
    phase: 'idle', sampleRate: null, settings: null, telemetry: {
      rms: 0, peak: 0, samples: 0, chunks: 0, detection: { symbol: 'none', zeroEnergy: 0, oneEnergy: 0, confidence: 0 },
      maximumZeroEnergy: 0, maximumOneEnergy: 0, maximumConfidence: 0,
      maximumRms: 0, maximumPeak: 0,
      recognizedSymbols: 0, erroneousSymbols: 0, successfulBlocks: 0, failedBlocks: 0, lastBlockCrc: 'pending',
    }, error: null, protocolState: 'listening', receivedFile: null, frameError: null,
    transferProgress: { blockIndex: 0, blockCount: 0, bytesReceived: 0, progress: 0, complete: false, failed: false },
  })
  const state = computed<TransferViewState>(() => ({ mode: mode.value, status: status.value }))

  /**
   * selectMode changes the visible transfer mode.
   * @param {Exclude<TransferMode, 'idle'>} nextMode - Send or receive mode to display.
   * @returns {void} Updates the reactive transfer state.
   */
  function selectMode(nextMode: Exclude<TransferMode, 'idle'>): void {
    mode.value = nextMode
  }

  /**
   * returnToReady restores the initial ready screen.
   * @returns {void} Sets the mode to idle and status to READY.
   */
  function returnToReady(): void {
    mode.value = 'idle'
    status.value = 'READY'
  }

  /**
   * recordTransmissionEvent aggregates neutral lifecycle telemetry for UI rendering.
   * @param {TransmissionLifecycleEvent} event - Application-level transmission lifecycle event.
   * @returns {void} Updates only presentation-safe visualization state.
   */
  function recordTransmissionEvent(event: TransmissionLifecycleEvent): void {
    if (event.type === 'started') {
      visualization.value = { phase: 'pilot', activeBit: null, symbolIndex: null }
    } else if (event.type === 'symbol') {
      visualization.value = { phase: event.phase, activeBit: event.bit, symbolIndex: event.index }
    } else {
      visualization.value = { phase: 'idle', activeBit: null, symbolIndex: null }
    }
  }

  /**
   * setDiagnosticTone updates the presentation-safe state of a diagnostic BFSK tone.
   * @param {DiagnosticToneVisualizationState} state - Active diagnostic tone state.
   * @returns {void} Stores only the active symbol, never PCM or audio resources.
   */
  function setDiagnosticTone(state: DiagnosticToneVisualizationState): void {
    diagnosticTone.value = state
  }

  /**
   * recordReceiveEvent aggregates neutral microphone lifecycle events for the receive UI.
   * @param {ReceiveLifecycleEvent} event - Application-level microphone receive event.
   * @returns {void} Updates presentation-safe microphone state only.
   */
  function recordReceiveEvent(event: ReceiveLifecycleEvent): void {
    if (event.type === 'starting') {
      receiveVisualization.value = { ...receiveVisualization.value, phase: 'starting', error: null, frameError: null, receivedFile: null, protocolState: 'listening', transferProgress: { blockIndex: 0, blockCount: 0, bytesReceived: 0, progress: 0, complete: false, failed: false } }
    } else if (event.type === 'listening') {
      receiveVisualization.value = {
        ...receiveVisualization.value, phase: 'listening', sampleRate: event.sampleRate, settings: event.settings, error: null,
      }
    } else if (event.type === 'level') {
      receiveVisualization.value = { ...receiveVisualization.value, telemetry: event.telemetry }
    } else if (event.type === 'protocol') {
      receiveVisualization.value = { ...receiveVisualization.value, protocolState: event.state }
    } else if (event.type === 'progress') {
      receiveVisualization.value = { ...receiveVisualization.value, transferProgress: event.progress }
    } else if (event.type === 'file') {
      receiveVisualization.value = { ...receiveVisualization.value, receivedFile: event.file, frameError: null, transferProgress: event.progress }
    } else if (event.type === 'frameError') {
      receiveVisualization.value = { ...receiveVisualization.value, frameError: event.message, transferProgress: { ...receiveVisualization.value.transferProgress, failed: true, complete: false } }
    } else if (event.type === 'failed') {
      receiveVisualization.value = { ...receiveVisualization.value, phase: 'idle', error: event.message }
    } else {
      receiveVisualization.value = { ...receiveVisualization.value, phase: 'idle' }
    }
  }

  return { mode, status, visualization, diagnosticTone, receiveVisualization, state, selectMode, returnToReady, recordTransmissionEvent, setDiagnosticTone, recordReceiveEvent }
})

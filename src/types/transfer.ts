export type TransferMode = 'idle' | 'send' | 'receive'

export interface TransferViewState {
  mode: TransferMode
  status: 'READY'
}

export interface TransmissionVisualizationState {
  phase: 'idle' | 'pilot' | 'sync' | 'data'
  activeBit: import('../domain/bits').Bit | null
  symbolIndex: number | null
}

export interface DiagnosticToneVisualizationState {
  activeBit: import('../domain/bits').Bit | null
}

export interface ReceiveVisualizationState {
  phase: 'idle' | 'starting' | 'listening'
  sampleRate: number | null
  settings: import('../audio/input').MicrophoneSettings | null
  telemetry: import('../application/receiveMicrophone').SignalTelemetry
  error: string | null
  protocolState: import('../domain/acousticProtocol').ProtocolSynchronizationState
  receivedFile: { readonly name: string; readonly bytes: number } | null
  frameError: string | null
  transferProgress: import('../domain/fileFrame').FileReceiveProgress
}

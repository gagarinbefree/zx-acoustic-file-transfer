export interface MicrophoneSettings {
  sampleRate: number | null
  channelCount: number | null
  echoCancellation: boolean | null
  noiseSuppression: boolean | null
  autoGainControl: boolean | null
}

export type PcmChunkHandler = (samples: Float32Array) => void

export interface MicrophoneCapture {
  readonly sampleRate: number
  readonly settings: MicrophoneSettings
  stop(): Promise<void>
}

export interface AudioInput {
  start(onPcmChunk: PcmChunkHandler): Promise<MicrophoneCapture>
}

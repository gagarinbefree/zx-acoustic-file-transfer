import type { Bit } from '../domain/bits'
import type { ProtocolPhase } from '../domain/acousticProtocol'

export type TransmissionLifecycleEvent =
  | { type: 'started' }
  | { type: 'symbol'; bit: Bit; index: number; phase: ProtocolPhase }
  | { type: 'completed' }
  | { type: 'failed'; message: string }

export type TransmissionObserver = (event: TransmissionLifecycleEvent) => void

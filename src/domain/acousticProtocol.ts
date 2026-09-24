import type { Bit } from './bits'
import type { PcmDetector } from './detection'
import { FileFrameDecoder, type FileDecodeErrorCode, type FileReceiveProgress, type TransferFile } from './fileFrame'

/**
 * ProtocolPhase identifies the neutral physical phase carrying a transmitted symbol.
 */
export type ProtocolPhase = 'pilot' | 'sync' | 'data'

/**
 * ProtocolSynchronizationState describes sample-stream acquisition without decoding DATA.
 */
export type ProtocolSynchronizationState = 'listening' | 'pilotDetected' | 'synchronizing' | 'syncDetected'

/**
 * SymbolDetection is the minimum detector result required by protocol synchronization.
 */
export interface SymbolDetection { readonly symbol: Bit | 'none' }

/**
 * AcousticProtocolConfiguration defines the shared physical preamble and symbol cadence.
 */
export interface AcousticProtocolConfiguration {
  readonly symbolRate: number
  readonly pilot: readonly Bit[]
  readonly sync: readonly Bit[]
  readonly searchPhaseDivisions: number
}

/**
 * defaultAcousticProtocolConfiguration defines a 1.28-second alternating pilot and 160 ms sync word.
 */
export const defaultAcousticProtocolConfiguration: AcousticProtocolConfiguration = {
  symbolRate: 100,
  pilot: Array.from({ length: 128 }, (_, index): Bit => index % 2 === 0 ? 0 : 1),
  sync: [1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1, 0],
  searchPhaseDivisions: 8,
}

/**
 * ProtocolSymbol associates a physical bit with its preamble or payload phase.
 */
export interface ProtocolSymbol { readonly bit: Bit; readonly phase: ProtocolPhase }

/**
 * frameProtocolSymbols prefixes data with the shared PILOT and SYNC sequence.
 * @param {readonly Bit[]} data - Payload symbols that remain undecoded by this stage.
 * @param {AcousticProtocolConfiguration} configuration - Shared transmitter/receiver protocol configuration.
 * @returns {ProtocolSymbol[]} Framed symbols in physical transmission order.
 */
export function frameProtocolSymbols(data: readonly Bit[], configuration: AcousticProtocolConfiguration = defaultAcousticProtocolConfiguration): ProtocolSymbol[] {
  return [
    ...configuration.pilot.map((bit) => ({ bit, phase: 'pilot' as const })),
    ...configuration.sync.map((bit) => ({ bit, phase: 'sync' as const })),
    ...data.map((bit) => ({ bit, phase: 'data' as const })),
  ]
}

/**
 * ProtocolSynchronizationEvent exposes acquisition progress without payload decoding.
 */
export type ProtocolSynchronizationEvent =
  | { readonly type: 'state'; readonly state: ProtocolSynchronizationState }
  | { readonly type: 'progress'; readonly progress: FileReceiveProgress }
  | { readonly type: 'file'; readonly file: TransferFile; readonly progress: FileReceiveProgress }
  | { readonly type: 'error'; readonly code: FileDecodeErrorCode; readonly message: string }

/**
 * PcmProtocolSynchronizer discovers PILOT and SYNC from sample windows independently of chunk boundaries.
 */
export class PcmProtocolSynchronizer {
  private samples = new Float32Array()
  private processedOffset = 0
  private sampleRate: number | undefined
  private samplesPerSymbol = 0
  private searchStep = 0
  private state: ProtocolSynchronizationState = 'listening'
  private candidates: Array<{ expectedIndex: number; lastOffset: number }> = []
  private syncBits: Bit[] = []
  private nextSyncOffset = 0
  private nextDataOffset = 0
  private frameDecoder = new FileFrameDecoder()
  private sampleOrigin = 0

  /**
   * constructor receives an abstract symbol detector and shared protocol configuration.
   * @param {PcmDetector<SymbolDetection>} detector - Detector producing neutral 0, 1, or none symbols.
   * @param {AcousticProtocolConfiguration} configuration - Shared protocol parameters.
   */
  constructor(
    private readonly detector: PcmDetector<SymbolDetection>,
    private readonly configuration: AcousticProtocolConfiguration = defaultAcousticProtocolConfiguration,
  ) {}

  /**
   * push accepts arbitrary PCM chunks and publishes acquired protocol states.
   * @param {Float32Array} chunk - Consecutive mono PCM samples.
   * @param {number} sampleRate - Actual input graph sample rate in hertz.
   * @returns {ProtocolSynchronizationEvent[]} State transitions detected from sample windows.
   */
  push(chunk: Float32Array, sampleRate: number): ProtocolSynchronizationEvent[] {
    if (this.sampleRate === undefined || this.sampleRate !== sampleRate) this.resetForSampleRate(sampleRate)
    const joined = new Float32Array(this.samples.length + chunk.length)
    joined.set(this.samples)
    joined.set(chunk, this.samples.length)
    this.samples = joined
    const events: ProtocolSynchronizationEvent[] = []
    while (this.state === 'listening' && this.processedOffset + this.samplesPerSymbol <= this.samples.length) {
      this.consumePilotWindow(this.processedOffset, events)
      this.processedOffset += this.searchStep
    }
    if (this.state === 'pilotDetected') {
      this.state = 'synchronizing'
      events.push({ type: 'state', state: 'synchronizing' })
    }
    while (this.state === 'synchronizing' && this.nextSyncOffset + this.samplesPerSymbol <= this.samples.length) {
      this.consumeSyncWindow(this.nextSyncOffset, events)
      this.nextSyncOffset += this.samplesPerSymbol
    }
    while (this.state === 'syncDetected' && this.nextDataOffset + this.samplesPerSymbol <= this.samples.length) {
      this.consumeDataWindow(this.nextDataOffset, events)
      this.nextDataOffset += this.samplesPerSymbol
    }
    this.discardProcessedSamples()
    return events
  }

  /**
   * reset clears acquisition state after loss, mismatch, or a changed input sample rate.
   * @returns {void} Restores the synchronizer to listening state.
   */
  reset(): void {
    this.samples = new Float32Array()
    this.processedOffset = 0
    this.state = 'listening'
    this.candidates = []
    this.syncBits = []
    this.nextSyncOffset = 0
    this.nextDataOffset = 0
    this.frameDecoder = new FileFrameDecoder()
    this.sampleOrigin = 0
  }

  /**
   * resetForSampleRate initializes sample-window sizes for the active audio graph.
   * @param {number} sampleRate - Actual graph rate in hertz.
   * @returns {void} Resets acquisition with a deterministic search stride.
   */
  private resetForSampleRate(sampleRate: number): void {
    this.reset()
    this.sampleRate = sampleRate
    this.samplesPerSymbol = Math.round(sampleRate / this.configuration.symbolRate)
    this.searchStep = Math.max(1, Math.round(this.samplesPerSymbol / this.configuration.searchPhaseDivisions))
  }

  /**
   * consumePilotWindow evaluates one candidate phase window against the alternating pilot.
   * @param {number} offset - Start sample of the candidate symbol window.
   * @param {ProtocolSynchronizationEvent[]} events - State transition sink.
   * @returns {void} Advances candidate state or rejects an invalid preamble.
   */
  private consumePilotWindow(offset: number, events: ProtocolSynchronizationEvent[]): void {
    const phaseIndex = Math.round((this.sampleOrigin + offset) / this.searchStep) % this.configuration.searchPhaseDivisions
    const detection = this.detector.detect(this.samples.slice(offset, offset + this.samplesPerSymbol), this.sampleRate!)
    const candidate = this.candidates[phaseIndex] ?? { expectedIndex: 0, lastOffset: offset - this.samplesPerSymbol }
    if (Math.abs(offset - candidate.lastOffset - this.samplesPerSymbol) > this.searchStep || detection.symbol !== this.configuration.pilot[candidate.expectedIndex]) {
      candidate.expectedIndex = detection.symbol === this.configuration.pilot[0] ? 1 : 0
    } else {
      candidate.expectedIndex += 1
    }
    candidate.lastOffset = offset
    this.candidates[phaseIndex] = candidate
    if (candidate.expectedIndex === this.configuration.pilot.length) {
      this.state = 'pilotDetected'
      events.push({ type: 'state', state: 'pilotDetected' })
      this.nextSyncOffset = offset + this.samplesPerSymbol
      this.syncBits = []
    }
  }

  /**
   * consumeSyncWindow compares one grid-aligned symbol with the fixed sync word.
   * @param {number} offset - Start sample of an aligned sync window.
   * @param {ProtocolSynchronizationEvent[]} events - State transition sink.
   * @returns {void} Emits syncDetected only after the complete word matches.
   */
  private consumeSyncWindow(offset: number, events: ProtocolSynchronizationEvent[]): void {
    const detection = this.detector.detect(this.samples.slice(offset, offset + this.samplesPerSymbol), this.sampleRate!)
    if (detection.symbol === 'none' || detection.symbol !== this.configuration.sync[this.syncBits.length]) {
      this.reset()
      events.push({ type: 'state', state: 'listening' })
      return
    }
    this.syncBits.push(detection.symbol)
    if (this.syncBits.length === this.configuration.sync.length) {
      this.state = 'syncDetected'
      events.push({ type: 'state', state: 'syncDetected' })
      this.nextDataOffset = offset + this.samplesPerSymbol
    }
  }

  /**
   * consumeDataWindow feeds one aligned symbol into the block-framed file decoder.
   * @param {number} offset - Start sample of the aligned DATA window.
   * @param {ProtocolSynchronizationEvent[]} events - Aggregate event sink.
   * @returns {void} Emits a file or checksum failure and restarts acquisition.
   */
  private consumeDataWindow(offset: number, events: ProtocolSynchronizationEvent[]): void {
    const detection = this.detector.detect(this.samples.slice(offset, offset + this.samplesPerSymbol), this.sampleRate!)
    const result = this.frameDecoder.push(detection.symbol)
    if (result === null) return
    if (result.type === 'progress') {
      events.push(result)
      return
    }
    if (result.type === 'file') events.push({ type: 'file', file: result.file, progress: result.progress })
    else events.push(result)
    this.reset()
    events.push({ type: 'state', state: 'listening' })
  }

  /**
   * discardProcessedSamples bounds retained PCM to unconsumed windows across arbitrary chunks.
   * @returns {void} Removes samples already inspected by acquisition or frame decoding.
   */
  private discardProcessedSamples(): void {
    const consumed = this.state === 'listening' ? this.processedOffset
      : this.state === 'synchronizing' ? this.nextSyncOffset : this.nextDataOffset
    if (consumed <= 0) return
    const length = Math.min(consumed, this.samples.length)
    this.samples = this.samples.slice(length)
    this.sampleOrigin += length
    this.processedOffset -= length
    this.nextSyncOffset -= length
    this.nextDataOffset -= length
    for (const candidate of this.candidates) if (candidate !== undefined) candidate.lastOffset -= length
  }
}

import type { AudioInput, MicrophoneCapture, MicrophoneSettings } from '../audio/input'
import { WebAudioMicrophoneInput } from '../adapters/audio/webAudioMicrophoneInput'
import { BfskDetector, type BfskDetectionResult } from '../domain/bfskDetector'
import { defaultBfskConfiguration, defaultBfskDetectorThresholds } from '../domain/bfskConfiguration'
import type { PcmDetector } from '../domain/detection'
import { PcmProtocolSynchronizer, type ProtocolSynchronizationState } from '../domain/acousticProtocol'
import type { TransferFile } from '../domain/fileFrame'
import type { FileDecodeErrorCode, FileReceiveProgress } from '../domain/fileFrame'
import type { FileDownload } from './fileDownload'
import { BrowserFileDownload } from '../adapters/files/browserFileDownload'

export interface SignalTelemetry {
  rms: number
  peak: number
  samples: number
  chunks: number
  detection: BfskDetectionResult
  maximumZeroEnergy: number
  maximumOneEnergy: number
  maximumConfidence: number
  maximumRms: number
  maximumPeak: number
  recognizedSymbols: number
  erroneousSymbols: number
  successfulBlocks: number
  failedBlocks: number
  lastBlockCrc: 'pending' | 'passed' | 'failed'
}

export type ReceiveLifecycleEvent =
  | { type: 'starting' }
  | { type: 'listening'; sampleRate: number; settings: MicrophoneSettings }
  | { type: 'level'; telemetry: SignalTelemetry }
  | { type: 'protocol'; state: ProtocolSynchronizationState }
  | { type: 'progress'; progress: FileReceiveProgress }
  | { type: 'file'; file: { readonly name: string; readonly bytes: number }; progress: FileReceiveProgress }
  | { type: 'frameError'; code: FileDecodeErrorCode; message: string }
  | { type: 'stopped' }
  | { type: 'failed'; message: string }

export type ReceiveObserver = (event: ReceiveLifecycleEvent) => void

/**
 * SignalTelemetryAccumulator calculates lightweight aggregate levels without retaining PCM chunks.
 */
export class SignalTelemetryAccumulator {
  private peak = 0
  private rms = 0
  private samples = 0
  private chunks = 0
  private detection: BfskDetectionResult = { symbol: 'none', zeroEnergy: 0, oneEnergy: 0, confidence: 0 }
  private maximumZeroEnergy = 0
  private maximumOneEnergy = 0
  private maximumConfidence = 0
  private maximumRms = 0
  private maximumPeak = 0
  private recognizedSymbols = 0
  private erroneousSymbols = 0
  private successfulBlocks = 0
  private failedBlocks = 0
  private lastBlockCrc: 'pending' | 'passed' | 'failed' = 'pending'

  /**
   * recordSymbol records one sample-aligned protocol decision without retaining audio.
   * @param {boolean} recognized - Whether the detector produced a valid BFSK symbol.
   * @returns {void} Updates aggregate symbol counters.
   */
  recordSymbol(recognized: boolean): void { if (recognized) this.recognizedSymbols += 1; else this.erroneousSymbols += 1 }

  /**
   * recordBlockCrc records an independent block checksum outcome.
   * @param {'passed' | 'failed'} result - Block checksum result.
   * @returns {void} Updates aggregate block counters.
   */
  recordBlockCrc(result: 'passed' | 'failed'): void { this.lastBlockCrc = result; if (result === 'passed') this.successfulBlocks += 1; else this.failedBlocks += 1 }

  /**
   * add incorporates one PCM chunk into aggregate level telemetry.
   * @param {Float32Array} samples - Mono PCM samples to summarize.
   * @param {BfskDetectionResult} detection - Latest neutral detector result for the chunk.
   * @returns {void} Updates aggregate counters and amplitudes.
   */
  add(samples: Float32Array, detection: BfskDetectionResult): void {
    this.chunks += 1
    this.detection = detection
    let sumOfSquares = 0
    let peak = 0
    this.maximumZeroEnergy = Math.max(this.maximumZeroEnergy, detection.zeroEnergy)
    this.maximumOneEnergy = Math.max(this.maximumOneEnergy, detection.oneEnergy)
    this.maximumConfidence = Math.max(this.maximumConfidence, detection.confidence)
    this.samples += samples.length
    for (const sample of samples) {
      const magnitude = Math.abs(sample)
      sumOfSquares += sample * sample
      peak = Math.max(peak, magnitude)
    }
    this.rms = samples.length === 0 ? 0 : Math.sqrt(sumOfSquares / samples.length)
    this.peak = peak
    this.maximumRms = Math.max(this.maximumRms, this.rms)
    this.maximumPeak = Math.max(this.maximumPeak, this.peak)
  }

  /**
   * snapshot returns current aggregate telemetry without exposing raw PCM.
   * @returns {SignalTelemetry} RMS, peak, and received chunk counters.
   */
  snapshot(): SignalTelemetry {
    return {
      rms: this.rms,
      peak: this.peak,
      samples: this.samples,
      chunks: this.chunks,
      detection: this.detection,
      maximumZeroEnergy: this.maximumZeroEnergy,
      maximumOneEnergy: this.maximumOneEnergy,
      maximumConfidence: this.maximumConfidence,
      maximumRms: this.maximumRms,
      maximumPeak: this.maximumPeak,
      recognizedSymbols: this.recognizedSymbols, erroneousSymbols: this.erroneousSymbols,
      successfulBlocks: this.successfulBlocks, failedBlocks: this.failedBlocks, lastBlockCrc: this.lastBlockCrc,
    }
  }

  /**
   * resetMaximums clears retained diagnostic peaks without discarding current detection or counters.
   * @returns {void} Resets only MAX telemetry values.
   */
  resetMaximums(): void {
    this.maximumZeroEnergy = 0
    this.maximumOneEnergy = 0
    this.maximumConfidence = 0
    this.maximumRms = 0
    this.maximumPeak = 0
  }
}

/**
 * MicrophoneReceiver owns capture lifecycle and throttles PCM-derived UI telemetry.
 * @param {AudioInput} input - Browser-independent microphone input dependency.
 * @param {PcmDetector<BfskDetectionResult>} detector - Replaceable diagnostic PCM detector.
 * @param {() => number} now - Monotonic clock used only to throttle telemetry events.
 */
export class MicrophoneReceiver {
  private capture: MicrophoneCapture | undefined
  private telemetry = new SignalTelemetryAccumulator()
  private lastTelemetryAt = 0
  private observer: ReceiveObserver | undefined
  private readonly synchronizer: PcmProtocolSynchronizer
  private completedFile: TransferFile | undefined

  /**
   * constructor receives the microphone adapter and a clock for telemetry throttling.
   * @param {AudioInput} input - Microphone input adapter.
   * @param {() => number} now - Clock returning milliseconds.
   */
  constructor(
    private readonly input: AudioInput,
    private readonly detector: PcmDetector<BfskDetectionResult>,
    private readonly now: () => number = () => performance.now(),
    private readonly fileDownload: FileDownload = new BrowserFileDownload(),
  ) { this.synchronizer = new PcmProtocolSynchronizer(detector) }

  /**
   * start opens microphone capture and publishes neutral lifecycle state.
   * @param {ReceiveObserver} observer - Listener for aggregate receive events.
   * @returns {Promise<void>} Resolves after microphone capture is active or failed.
   */
  async start(observer: ReceiveObserver): Promise<void> {
    await this.stop()
    this.observer = observer
    this.telemetry = new SignalTelemetryAccumulator()
    this.synchronizer.reset()
    this.completedFile = undefined
    this.lastTelemetryAt = this.now()
    observer({ type: 'starting' })

    try {
      this.capture = await this.input.start((samples) => this.handlePcmChunk(samples))
      observer({ type: 'listening', sampleRate: this.capture.sampleRate, settings: this.capture.settings })
    } catch (error: unknown) {
      this.capture = undefined
      observer({ type: 'failed', message: error instanceof Error ? error.message : 'Microphone capture failed.' })
    }
  }

  /**
   * stop releases microphone resources and resets the receive lifecycle safely.
   * @returns {Promise<void>} Resolves after active capture is fully released.
   */
  async stop(): Promise<void> {
    const capture = this.capture
    this.capture = undefined
    if (capture !== undefined) {
      await capture.stop()
      this.emitTelemetry()
      this.observer?.({ type: 'stopped' })
    }
  }

  /**
   * resetMaximums clears UI-facing maxima for the active receive measurement.
   * @returns {void} Emits refreshed aggregate telemetry without exposing raw PCM.
   */
  resetMaximums(): void {
    this.telemetry.resetMaximums()
    this.emitTelemetry()
  }

  /**
   * downloadCompletedFile saves the last checksum-verified file on explicit UI request.
   * @returns {void} Starts no download when this receive session has no completed file.
   */
  downloadCompletedFile(): void {
    if (this.completedFile !== undefined) this.fileDownload.download(this.completedFile)
  }

  /**
   * handlePcmChunk aggregates input samples and emits bounded-rate telemetry only.
   * @param {Float32Array} samples - Microphone PCM chunk from the adapter.
   * @returns {void} Updates internal telemetry without retaining samples.
   */
  private handlePcmChunk(samples: Float32Array): void {
    const sampleRate = this.capture?.sampleRate
    if (sampleRate === undefined) return
    this.telemetry.add(samples, this.detector.detect(samples, sampleRate))
    for (const event of this.synchronizer.push(samples, sampleRate)) {
      if (event.type === 'state') this.observer?.({ type: 'protocol', state: event.state })
      else if (event.type === 'progress') { this.telemetry.recordBlockCrc('passed'); this.observer?.({ type: 'progress', progress: event.progress }) }
      else if (event.type === 'file') {
        this.completedFile = event.file
        this.observer?.({ type: 'file', file: { name: event.file.name, bytes: event.file.data.length }, progress: event.progress })
      }
      else { if (event.code === 'corruptedBlock') this.telemetry.recordBlockCrc('failed'); this.observer?.({ type: 'frameError', code: event.code, message: event.message }) }
    }
    if (this.now() - this.lastTelemetryAt >= 100) {
      this.emitTelemetry()
    }
  }

  /**
   * emitTelemetry publishes the current aggregate level and refreshes the throttle timestamp.
   * @returns {void} Emits no event when no observer is active.
   */
  private emitTelemetry(): void {
    this.lastTelemetryAt = this.now()
    this.observer?.({ type: 'level', telemetry: this.telemetry.snapshot() })
  }
}

/**
 * createDefaultReceiver assembles the browser microphone receiver for the application shell.
 * @returns {MicrophoneReceiver} Application-facing microphone receiver.
 */
export function createDefaultReceiver(): MicrophoneReceiver {
  return new MicrophoneReceiver(
    new WebAudioMicrophoneInput(),
    new BfskDetector(defaultBfskConfiguration, defaultBfskDetectorThresholds),
  )
}

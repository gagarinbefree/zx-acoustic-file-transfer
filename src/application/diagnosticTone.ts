import type { AudioOutput, AudioPlayback } from '../adapters/audio/webAudioPcmPlayer'
import { WebAudioPcmPlayer } from '../adapters/audio/webAudioPcmPlayer'
import { BfskModulator } from '../domain/bfsk'
import { defaultBfskConfiguration } from '../domain/bfskConfiguration'
import type { Bit } from '../domain/bits'
import type { PcmModulator } from '../domain/modulation'

export interface DiagnosticToneState {
  activeBit: Bit | null
}

/**
 * DiagnosticToneService plays a long BFSK symbol through the production modulation and output pipeline.
 * @param {PcmModulator} modulator - Shared production BFSK modulator.
 * @param {() => AudioOutput} createOutput - Factory for disposable audio outputs.
 */
export class DiagnosticToneService {
  private output: AudioOutput | undefined
  private playback: AudioPlayback | undefined

  /**
   * constructor receives reusable modulation and output dependencies.
   * @param {PcmModulator} modulator - Shared BFSK modulator.
   * @param {() => AudioOutput} createOutput - Factory creating a fresh output for each test.
   */
  constructor(
    private readonly modulator: PcmModulator,
    private readonly createOutput: () => AudioOutput,
  ) {}

  /**
   * start plays a 15-second repeated BFSK test symbol.
   * @param {Bit} bit - Test symbol to hold on the shared BFSK carrier.
   * @returns {Promise<DiagnosticToneState>} Current diagnostic tone state.
   */
  async start(bit: Bit): Promise<DiagnosticToneState> {
    await this.stop()
    const output = this.createOutput()
    const symbols = createRepeatedSymbols(bit, defaultBfskConfiguration.symbolRate * 15)
    const samples = this.modulator.modulate(symbols, output.sampleRate)
    const playback = await output.play(samples)
    this.output = output
    this.playback = playback
    void playback.completed.then(() => this.clearCompletedPlayback(playback))
    return { activeBit: bit }
  }

  /**
   * stop halts any diagnostic tone and releases its audio output.
   * @returns {Promise<DiagnosticToneState>} Safe inactive diagnostic tone state.
   */
  async stop(): Promise<DiagnosticToneState> {
    this.playback?.stop()
    this.playback = undefined
    const output = this.output
    this.output = undefined
    await output?.dispose()
    return { activeBit: null }
  }

  /**
   * clearCompletedPlayback resets state after a tone reaches its natural end.
   * @param {AudioPlayback} playback - Playback handle that completed.
   * @returns {void} Clears state only when it is still current.
   */
  private clearCompletedPlayback(playback: AudioPlayback): void {
    if (this.playback === playback) {
      this.playback = undefined
    }
  }
}

/**
 * createDefaultDiagnosticToneService assembles the production diagnostic-tone pipeline.
 * @returns {DiagnosticToneService} Application-facing tone service.
 */
export function createDefaultDiagnosticToneService(): DiagnosticToneService {
  return new DiagnosticToneService(
    new BfskModulator(defaultBfskConfiguration),
    () => new WebAudioPcmPlayer(),
  )
}

/**
 * createRepeatedSymbols produces a fixed-length run of one diagnostic BFSK symbol.
 * @param {Bit} bit - Symbol value to repeat.
 * @param {number} count - Number of symbol periods to generate.
 * @returns {Bit[]} Repeated binary symbols.
 */
function createRepeatedSymbols(bit: Bit, count: number): Bit[] {
  return Array.from({ length: count }, () => bit)
}

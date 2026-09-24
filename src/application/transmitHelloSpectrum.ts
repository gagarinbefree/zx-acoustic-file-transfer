import { WebAudioPcmPlayer, type AudioOutput } from '../adapters/audio/webAudioPcmPlayer'
import { BfskModulator } from '../domain/bfsk'
import { defaultBfskConfiguration } from '../domain/bfskConfiguration'
import { bytesToBits } from '../domain/bits'
import type { PcmModulator } from '../domain/modulation'
import { encodeUtf8 } from '../domain/text'
import { frameProtocolSymbols } from '../domain/acousticProtocol'
import { encodeFileFrame, type TransferFile } from '../domain/fileFrame'
import type { TransmissionObserver } from './transmissionEvents'

export type TransmissionRequest = { readonly message: string } | { readonly file: TransferFile }

export interface Transmitter {
  /**
   * transmit starts a transmission requested by the application layer.
   * @param {TransmissionRequest} request - Data to transmit.
   * @param {TransmissionObserver} observer - Optional listener for neutral lifecycle events.
   * @returns {Promise<void>} Resolves after real audio playback completes.
   */
  transmit(request: TransmissionRequest, observer?: TransmissionObserver): Promise<void>
}

/**
 * AcousticTransmitter coordinates encoding, modulation, playback, and UI-safe lifecycle events.
 * @param {PcmModulator} modulator - Modulator selected by the application composition root.
 * @param {AudioOutput} player - Device adapter that plays generated PCM samples.
 */
export class AcousticTransmitter implements Transmitter {
  /**
   * constructor receives abstract modulation and audio-output dependencies.
   * @param {PcmModulator} modulator - PCM modulator dependency.
   * @param {AudioOutput} player - PCM output dependency.
   */
  constructor(
    private readonly modulator: PcmModulator,
    private readonly player: AudioOutput,
  ) {}

  /**
   * transmit encodes a message, starts PCM playback, and observes its symbols without affecting timing.
   * @param {TransmissionRequest} request - Message transmission request.
   * @param {TransmissionObserver} observer - Optional neutral lifecycle event listener.
   * @returns {Promise<void>} Resolves after the real playback completion event.
   */
  async transmit(request: TransmissionRequest, observer?: TransmissionObserver): Promise<void> {
    try {
      const file = 'file' in request ? request.file : { name: 'HELLO.TXT', data: encodeUtf8(request.message) }
      const symbols = frameProtocolSymbols(bytesToBits(encodeFileFrame(file)))
      const bits = symbols.map((symbol) => symbol.bit)
      const samples = this.modulator.modulate(bits, this.player.sampleRate)
      const playback = await this.player.play(samples)
      observer?.({ type: 'started' })
      const cancelSymbolEvents = scheduleSymbolEvents(symbols, samples.length / bits.length / this.player.sampleRate, observer)
      await playback.completed
      cancelSymbolEvents()
      observer?.({ type: 'completed' })
    } catch (error: unknown) {
      observer?.({ type: 'failed', message: error instanceof Error ? error.message : 'Transmission failed.' })
    }
  }
}

/**
 * createDefaultTransmitter assembles the stage-two BFSK transmitter implementation.
 * @returns {Transmitter} Application-facing transmitter service.
 */
export function createDefaultTransmitter(): Transmitter {
  return new AcousticTransmitter(
    new BfskModulator(defaultBfskConfiguration),
    new WebAudioPcmPlayer(),
  )
}

/**
 * scheduleSymbolEvents reports already-scheduled audio at symbol granularity without changing playback timing.
 * @param {readonly import('../domain/acousticProtocol').ProtocolSymbol[]} symbols - Framed symbols in playback order.
 * @param {number} symbolDurationSeconds - Effective PCM duration of one symbol.
 * @param {TransmissionObserver} observer - Optional lifecycle event listener.
 * @returns {() => void} Cancels outstanding UI-only symbol notifications.
 */
function scheduleSymbolEvents(
  symbols: readonly import('../domain/acousticProtocol').ProtocolSymbol[],
  symbolDurationSeconds: number,
  observer: TransmissionObserver | undefined,
): () => void {
  if (observer === undefined || symbols.length === 0) {
    return () => undefined
  }

  observer({ type: 'symbol', bit: symbols[0]!.bit, index: 0, phase: symbols[0]!.phase })
  let index = 1
  const timerId = setInterval(() => {
    if (index >= symbols.length) {
      clearInterval(timerId)
      return
    }
    const symbol = symbols[index]!
    observer({ type: 'symbol', bit: symbol.bit, index, phase: symbol.phase })
    index += 1
  }, symbolDurationSeconds * 1000)
  return () => clearInterval(timerId)
}

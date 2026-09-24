import { describe, expect, it, vi } from 'vitest'
import type { AudioOutput, AudioPlayback } from '../../src/adapters/audio/webAudioPcmPlayer'
import type { Bit } from '../../src/domain/bits'
import type { PcmModulator } from '../../src/domain/modulation'
import { AcousticTransmitter } from '../../src/application/transmitHelloSpectrum'
import type { TransmissionLifecycleEvent } from '../../src/application/transmissionEvents'

class TestModulator implements PcmModulator {
  /**
   * modulate produces one deterministic sample per input bit for orchestration tests.
   * @param {readonly Bit[]} bits - Bits to convert to test PCM.
   * @param {number} sampleRate - Unused test sample rate.
   * @returns {Float32Array} Deterministic PCM samples.
   */
  modulate(bits: readonly Bit[], sampleRate: number): Float32Array {
    void sampleRate
    return new Float32Array(bits.map((bit) => bit))
  }
}

class TestAudioOutput implements AudioOutput {
  readonly sampleRate = 8
  playback: AudioPlayback = { completed: Promise.resolve(), stop: () => undefined }

  /**
   * play returns the configurable test playback handle.
   * @param {Float32Array} samples - PCM samples scheduled by the transmitter.
   * @returns {Promise<AudioPlayback>} Playback completion handle.
   */
  async play(samples: Float32Array): Promise<AudioPlayback> {
    void samples
    return this.playback
  }

  /**
   * dispose releases no resources in the test audio output.
   * @returns {Promise<void>} Completed cleanup promise.
   */
  async dispose(): Promise<void> {}
}

describe('AcousticTransmitter', () => {
  it('emits lifecycle events for the real UTF-8 symbol sequence and completion', async () => {
    vi.useFakeTimers()
    let completePlayback: (() => void) | undefined
    const output = new TestAudioOutput()
    output.playback = { completed: new Promise<void>((resolve) => { completePlayback = resolve }), stop: () => undefined }
    const events: TransmissionLifecycleEvent[] = []
    const transmission = new AcousticTransmitter(new TestModulator(), output)

    const result = transmission.transmit({ message: 'A' }, (event) => events.push(event))
    await vi.advanceTimersByTimeAsync(1000)
    completePlayback?.()
    await result

    expect(events).toEqual([
      { type: 'started' },
      { type: 'symbol', bit: 0, index: 0, phase: 'pilot' },
      { type: 'symbol', bit: 1, index: 1, phase: 'pilot' },
      { type: 'symbol', bit: 0, index: 2, phase: 'pilot' },
      { type: 'symbol', bit: 1, index: 3, phase: 'pilot' },
      { type: 'symbol', bit: 0, index: 4, phase: 'pilot' },
      { type: 'symbol', bit: 1, index: 5, phase: 'pilot' },
      { type: 'symbol', bit: 0, index: 6, phase: 'pilot' },
      { type: 'symbol', bit: 1, index: 7, phase: 'pilot' },
      { type: 'symbol', bit: 0, index: 8, phase: 'pilot' },
      { type: 'completed' },
    ])
    vi.useRealTimers()
  })
})

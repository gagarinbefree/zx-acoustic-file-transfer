import type { Bit } from './bits'

export interface PcmModulator {
  /**
   * modulate converts bits to mono PCM samples at the supplied sample rate.
   * @param {readonly Bit[]} bits - Binary symbols to modulate.
   * @param {number} sampleRate - Output sample rate in hertz.
   * @returns {Float32Array} Mono PCM samples in the normalized range.
   */
  modulate(bits: readonly Bit[], sampleRate: number): Float32Array
}

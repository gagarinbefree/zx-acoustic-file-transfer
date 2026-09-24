import type { Bit } from './bits'
import type { BfskConfiguration } from './bfskConfiguration'
import type { PcmModulator } from './modulation'

/**
 * BfskModulator generates PCM waveforms for binary frequency-shift keying symbols.
 * @param {BfskConfiguration} configuration - Frequencies, symbol rate, and amplitude.
 */
export class BfskModulator implements PcmModulator {
  /**
   * constructor stores and validates immutable BFSK modulation settings.
   * @param {BfskConfiguration} configuration - Frequencies, symbol rate, and amplitude.
   */
  constructor(private readonly configuration: BfskConfiguration) {
    validateConfiguration(configuration)
  }

  /**
   * modulate converts binary symbols to a continuous-phase BFSK PCM waveform.
   * @param {readonly Bit[]} bits - Symbols where zero and one select configured frequencies.
   * @param {number} sampleRate - PCM sample rate in hertz.
   * @returns {Float32Array} Generated mono PCM samples.
   */
  modulate(bits: readonly Bit[], sampleRate: number): Float32Array {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new Error('Sample rate must be a positive finite number.')
    }

    const samplesPerSymbol = Math.round(sampleRate / this.configuration.symbolRate)
    if (samplesPerSymbol < 1) {
      throw new Error('Symbol rate must not exceed the sample rate.')
    }

    const samples = new Float32Array(bits.length * samplesPerSymbol)
    for (let symbolIndex = 0; symbolIndex < bits.length; symbolIndex += 1) {
      const frequency = bits[symbolIndex] === 0
        ? this.configuration.zeroFrequency
        : this.configuration.oneFrequency
      const symbolOffset = symbolIndex * samplesPerSymbol

      for (let sampleIndex = 0; sampleIndex < samplesPerSymbol; sampleIndex += 1) {
        const time = (symbolOffset + sampleIndex) / sampleRate
        samples[symbolOffset + sampleIndex] = this.configuration.amplitude * Math.sin(2 * Math.PI * frequency * time)
      }
    }

    return samples
  }
}

/**
 * validateConfiguration verifies that BFSK configuration values are usable for modulation.
 * @param {BfskConfiguration} configuration - Configuration to validate.
 * @returns {void} Throws when a value is outside its valid range.
 */
function validateConfiguration(configuration: BfskConfiguration): void {
  const values = [
    configuration.zeroFrequency,
    configuration.oneFrequency,
    configuration.symbolRate,
    configuration.amplitude,
  ]
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('BFSK configuration values must be finite.')
  }
  if (configuration.zeroFrequency <= 0 || configuration.oneFrequency <= 0 || configuration.symbolRate <= 0) {
    throw new Error('BFSK frequencies and symbol rate must be positive.')
  }
  if (configuration.amplitude <= 0 || configuration.amplitude > 1) {
    throw new Error('BFSK amplitude must be greater than zero and at most one.')
  }
}

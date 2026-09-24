import type { Bit } from './bits'
import type { BfskConfiguration, BfskDetectorThresholds } from './bfskConfiguration'
import type { PcmDetector } from './detection'

export interface BfskDetectionResult {
  symbol: Bit | 'none'
  zeroEnergy: number
  oneEnergy: number
  confidence: number
}

/**
 * BfskDetector estimates narrow-band energy at the configured BFSK frequencies using Goertzel analysis.
 * @param {BfskConfiguration} configuration - Shared BFSK frequency configuration.
 * @param {BfskDetectorThresholds} thresholds - Minimum energy and ratio needed for a detection.
 */
export class BfskDetector implements PcmDetector<BfskDetectionResult> {
  /**
   * constructor stores shared BFSK frequencies and typed diagnostic thresholds.
   * @param {BfskConfiguration} configuration - Shared transmitter and detector configuration.
   * @param {BfskDetectorThresholds} thresholds - Detection thresholds.
   */
  constructor(
    private readonly configuration: BfskConfiguration,
    private readonly thresholds: BfskDetectorThresholds,
  ) {}

  /**
   * detect measures configured frequency energies and returns a neutral symbol decision.
   * @param {Float32Array} samples - Mono PCM chunk to inspect.
   * @param {number} sampleRate - Actual PCM sample rate in hertz.
   * @returns {BfskDetectionResult} Symbol, energy values, and dominance confidence.
   */
  detect(samples: Float32Array, sampleRate: number): BfskDetectionResult {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0 || samples.length === 0) {
      return { symbol: 'none', zeroEnergy: 0, oneEnergy: 0, confidence: 0 }
    }

    const zeroEnergy = calculateGoertzelEnergy(samples, sampleRate, this.configuration.zeroFrequency)
    const oneEnergy = calculateGoertzelEnergy(samples, sampleRate, this.configuration.oneFrequency)
    const dominantEnergy = Math.max(zeroEnergy, oneEnergy)
    const otherEnergy = Math.min(zeroEnergy, oneEnergy)
    const confidence = dominantEnergy / Math.max(otherEnergy, Number.EPSILON)

    if (dominantEnergy < this.thresholds.minimumEnergy || confidence < this.thresholds.minimumConfidence) {
      return { symbol: 'none', zeroEnergy, oneEnergy, confidence }
    }

    return { symbol: zeroEnergy > oneEnergy ? 0 : 1, zeroEnergy, oneEnergy, confidence }
  }
}

/**
 * calculateGoertzelEnergy calculates normalized narrow-band energy for one target frequency.
 * @param {Float32Array} samples - PCM chunk to analyze.
 * @param {number} sampleRate - Actual PCM sample rate in hertz.
 * @param {number} frequency - Target frequency in hertz.
 * @returns {number} Window-length-normalized frequency energy.
 */
function calculateGoertzelEnergy(samples: Float32Array, sampleRate: number, frequency: number): number {
  const angularFrequency = (2 * Math.PI * frequency) / sampleRate
  const coefficient = 2 * Math.cos(angularFrequency)
  let previous = 0
  let previousPrevious = 0

  for (const sample of samples) {
    const current = sample + coefficient * previous - previousPrevious
    previousPrevious = previous
    previous = current
  }

  const energy = previousPrevious * previousPrevious + previous * previous - coefficient * previous * previousPrevious
  return Math.max(energy / (samples.length * samples.length), 0)
}

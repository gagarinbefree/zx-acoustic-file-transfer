import { describe, expect, it } from 'vitest'
import { BfskModulator } from '../../src/domain/bfsk'

describe('BfskModulator', () => {
  const modulator = new BfskModulator({
    zeroFrequency: 1000,
    oneFrequency: 2000,
    symbolRate: 100,
    amplitude: 0.5,
  })

  it('generates the expected PCM sample length', () => {
    expect(modulator.modulate([0, 1, 0], 8000)).toHaveLength(240)
  })

  it('generates distinct waveforms for zero and one symbols', () => {
    const zeroSamples = modulator.modulate([0], 8000)
    const oneSamples = modulator.modulate([1], 8000)

    expect(Array.from(zeroSamples)).not.toEqual(Array.from(oneSamples))
    expect(Math.max(...zeroSamples.map(Math.abs))).toBeLessThanOrEqual(0.5)
    expect(Math.max(...oneSamples.map(Math.abs))).toBeLessThanOrEqual(0.5)
  })
})

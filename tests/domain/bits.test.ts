import { describe, expect, it } from 'vitest'
import { bytesToBits } from '../../src/domain/bits'

describe('bytesToBits', () => {
  it('converts bytes deterministically in most-significant-bit order', () => {
    expect(bytesToBits(new Uint8Array([0x48, 0x01]))).toEqual([
      0, 1, 0, 0, 1, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 1,
    ])
  })
})

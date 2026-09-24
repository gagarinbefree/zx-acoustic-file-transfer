export type Bit = 0 | 1

/**
 * bytesToBits converts every byte to eight bits in most-significant-bit order.
 * @param {Uint8Array} bytes - Source bytes to convert.
 * @returns {Bit[]} Ordered binary values.
 */
export function bytesToBits(bytes: Uint8Array): Bit[] {
  const bits: Bit[] = []

  for (const byte of bytes) {
    for (let position = 7; position >= 0; position -= 1) {
      bits.push(((byte >> position) & 1) as Bit)
    }
  }

  return bits
}

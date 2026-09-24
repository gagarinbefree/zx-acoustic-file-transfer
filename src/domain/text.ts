/**
 * encodeUtf8 encodes text as a UTF-8 byte sequence.
 * @param {string} value - Text to encode.
 * @returns {Uint8Array} UTF-8 encoded bytes.
 */
export function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

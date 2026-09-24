import { describe, expect, it } from 'vitest'
import { bytesToBits } from '../../src/domain/bits'
import { crc32, createFileBlocks, encodeFileFrame, FileFrameDecoder, fileBlockPayloadBytes, maximumFileBytes } from '../../src/domain/fileFrame'

/**
 * decodeFrame feeds a complete encoded frame through the incremental bit decoder.
 * @param {Uint8Array} frame - Encoded file frame bytes.
 * @returns {import('../../src/domain/fileFrame').FileDecodeResult[]} Non-null decoder results.
 */
function decodeFrame(frame: Uint8Array): import('../../src/domain/fileFrame').FileDecodeResult[] {
  const decoder = new FileFrameDecoder()
  return bytesToBits(frame).flatMap((bit) => {
    const result = decoder.push(bit)
    return result === null ? [] : [result]
  })
}

describe('block-framed acoustic file frame', () => {
  it('encodes 256-byte blocks and a final incomplete block with independent CRC32 values', () => {
    const data = Uint8Array.from({ length: fileBlockPayloadBytes + 3 }, (_, index) => index % 256)
    const blocks = createFileBlocks(data)
    expect(blocks).toHaveLength(2)
    expect(new DataView(blocks[0]!.buffer).getUint16(0, false)).toBe(0)
    expect(new DataView(blocks[0]!.buffer).getUint16(2, false)).toBe(256)
    expect(new DataView(blocks[1]!.buffer).getUint16(0, false)).toBe(1)
    expect(new DataView(blocks[1]!.buffer).getUint16(2, false)).toBe(3)
    expect(new DataView(blocks[1]!.buffer).getUint32(blocks[1]!.length - 4, false)).toBe(crc32(Uint8Array.from([0, 1, 2])))
  })

  it('round-trips multiple blocks and reports aggregate progress before completion', () => {
    const source = { name: 'данные.bin', data: Uint8Array.from({ length: 513 }, (_, index) => (index * 19) % 256) }
    const results = decodeFrame(encodeFileFrame(source))
    expect(results.filter((result) => result.type === 'progress')).toEqual([
      { type: 'progress', progress: { blockIndex: 0, blockCount: 3, bytesReceived: 256, progress: 256 / 513, complete: false, failed: false } },
      { type: 'progress', progress: { blockIndex: 1, blockCount: 3, bytesReceived: 512, progress: 512 / 513, complete: false, failed: false } },
    ])
    expect(results.at(-1)).toEqual({ type: 'file', file: source, progress: { blockIndex: 2, blockCount: 3, bytesReceived: 513, progress: 1, complete: true, failed: false } })
  })

  it('round-trips an empty file with a verified final CRC32', () => {
    const source = { name: 'empty.bin', data: new Uint8Array() }
    expect(decodeFrame(encodeFileFrame(source)).at(-1)).toEqual({ type: 'file', file: source, progress: { blockIndex: 0, blockCount: 0, bytesReceived: 0, progress: 1, complete: true, failed: false } })
  })

  it('returns a typed checksum error for a corrupted block', () => {
    const frame = encodeFileFrame({ name: 'bad.bin', data: Uint8Array.from({ length: 257 }, (_, index) => index) })
    frame[12 + 7 + 4] = frame[12 + 7 + 4]! ^ 1
    expect(decodeFrame(frame).at(-1)).toEqual({ type: 'error', code: 'corruptedBlock', message: 'Checksum mismatch in block 0.' })
  })

  it('returns a typed missing-block error when the block index skips a value', () => {
    const frame = encodeFileFrame({ name: 'skip.bin', data: Uint8Array.from({ length: 257 }, (_, index) => index) })
    const firstBlockLength = 4 + 256 + 4
    const secondBlockIndexOffset = 12 + 8 + firstBlockLength
    frame[secondBlockIndexOffset + 1] = 2
    expect(decodeFrame(frame).at(-1)).toEqual({ type: 'error', code: 'missingBlock', message: 'Expected block 1, received block 2.' })
  })

  it('keeps the final whole-file CRC32 separate from the block checksums', () => {
    const source = { name: 'final.bin', data: Uint8Array.from([1, 2, 3]) }
    const frame = encodeFileFrame(source)
    new DataView(frame.buffer).setUint32(8, 0, false)
    expect(decodeFrame(frame).at(-1)).toEqual({ type: 'error', code: 'finalCrcMismatch', message: 'Final file checksum mismatch.' })
  })

  it('rejects oversized files and path-like names before modulation', () => {
    expect(() => encodeFileFrame({ name: 'too-big.bin', data: new Uint8Array(maximumFileBytes + 1) })).toThrow(/limit/)
    expect(() => encodeFileFrame({ name: '../unsafe.bin', data: new Uint8Array() })).toThrow(/name/)
  })
})

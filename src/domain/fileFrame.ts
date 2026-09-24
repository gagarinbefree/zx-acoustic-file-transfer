import type { Bit } from './bits'

/** Maximum payload size accepted by the current acoustic file protocol. */
export const maximumFileBytes = 1024
/** Number of payload bytes protected by one independent block checksum. */
export const fileBlockPayloadBytes = 256
const maximumNameBytes = 63
const frameHeaderBytes = 12
const blockHeaderBytes = 4
const checksumBytes = 4

/** A validated file carried by an acoustic transfer. */
export interface TransferFile { readonly name: string; readonly data: Uint8Array }

/** Aggregate receive status safe to expose outside protocol code. */
export interface FileReceiveProgress {
  readonly blockIndex: number
  readonly blockCount: number
  readonly bytesReceived: number
  readonly progress: number
  readonly complete: boolean
  readonly failed: boolean
}

/** Typed reasons for terminating an acoustic file transfer. */
export type FileDecodeErrorCode = 'lostSignal' | 'invalidHeader' | 'corruptedBlock' | 'missingBlock' | 'finalCrcMismatch'

/** A terminal protocol decoding failure. */
export interface FileDecodeError { readonly type: 'error'; readonly code: FileDecodeErrorCode; readonly message: string }

/** Decoder output containing progress, a verified file, or a typed failure. */
export type FileDecodeResult =
  | { readonly type: 'progress'; readonly progress: FileReceiveProgress }
  | { readonly type: 'file'; readonly file: TransferFile; readonly progress: FileReceiveProgress }
  | FileDecodeError

/**
 * encodeFileFrame builds a version-two header followed by CRC-protected sequential blocks.
 * @param {TransferFile} file - File name and content to encode.
 * @returns {Uint8Array} Complete file frame including the final CRC32 of the source file.
 */
export function encodeFileFrame(file: TransferFile): Uint8Array {
  const name = new TextEncoder().encode(file.name)
  if (!validName(file.name) || name.length > maximumNameBytes) throw new Error('File name must be 1–63 UTF-8 bytes without path characters.')
  if (file.data.length > maximumFileBytes) throw new Error(`File exceeds the ${maximumFileBytes}-byte acoustic limit.`)
  const blockCount = Math.ceil(file.data.length / fileBlockPayloadBytes)
  const blocks = createFileBlocks(file.data)
  const frame = new Uint8Array(frameHeaderBytes + name.length + blocks.reduce((length, block) => length + block.length, 0))
  const view = new DataView(frame.buffer)
  frame[0] = 2
  frame[1] = name.length
  view.setUint32(2, file.data.length, false)
  view.setUint16(6, blockCount, false)
  view.setUint32(8, crc32(file.data), false)
  frame.set(name, frameHeaderBytes)
  let offset = frameHeaderBytes + name.length
  for (const block of blocks) {
    frame.set(block, offset)
    offset += block.length
  }
  return frame
}

/**
 * createFileBlocks creates ordered payload blocks with an independent CRC32 for every block.
 * @param {Uint8Array} data - Source file data.
 * @returns {Uint8Array[]} Encoded block records in ascending block-index order.
 */
export function createFileBlocks(data: Uint8Array): Uint8Array[] {
  const blocks: Uint8Array[] = []
  for (let offset = 0, blockIndex = 0; offset < data.length; offset += fileBlockPayloadBytes, blockIndex += 1) {
    const payload = data.slice(offset, offset + fileBlockPayloadBytes)
    const block = new Uint8Array(blockHeaderBytes + payload.length + checksumBytes)
    const view = new DataView(block.buffer)
    view.setUint16(0, blockIndex, false)
    view.setUint16(2, payload.length, false)
    block.set(payload, blockHeaderBytes)
    view.setUint32(block.length - checksumBytes, crc32(payload), false)
    blocks.push(block)
  }
  return blocks
}

/** Incrementally assembles a block-framed file from detected DATA symbols. */
export class FileFrameDecoder {
  private bytes: number[] = []
  private partialByte = 0
  private partialBits = 0
  private header: FileHeader | undefined
  private nextBlockIndex = 0
  private bytesReceived = 0
  private blocks: Uint8Array[] = []
  private nextBlockLength = 0

  /**
   * push consumes one detected bit and emits aggregate progress or a terminal result.
   * @param {Bit | 'none'} symbol - Detected DATA symbol.
   * @returns {FileDecodeResult | null} Result when a block, file, or failure completes.
   */
  push(symbol: Bit | 'none'): FileDecodeResult | null {
    if (symbol === 'none') return this.error('lostSignal', 'Lost signal while receiving a file block.')
    this.partialByte = (this.partialByte << 1) | symbol
    this.partialBits += 1
    if (this.partialBits < 8) return null
    this.bytes.push(this.partialByte)
    this.partialByte = 0
    this.partialBits = 0
    if (this.header === undefined) return this.consumeHeader()
    return this.consumeBlock()
  }

  /**
   * consumeHeader validates fixed metadata before accepting any block payload.
   * @returns {FileDecodeResult | null} Typed failure or no output while metadata is incomplete.
   */
  private consumeHeader(): FileDecodeResult | null {
    if (this.bytes.length < frameHeaderBytes) return null
    const fixed = Uint8Array.from(this.bytes)
    const view = new DataView(fixed.buffer)
    const version = fixed[0]!
    const nameLength = fixed[1]!
    const length = view.getUint32(2, false)
    const blockCount = view.getUint16(6, false)
    const finalCrc = view.getUint32(8, false)
    if (version !== 2 || nameLength === 0 || nameLength > maximumNameBytes || length > maximumFileBytes || blockCount !== Math.ceil(length / fileBlockPayloadBytes)) {
      return this.error('invalidHeader', 'Invalid or unsupported acoustic file header.')
    }
    if (this.bytes.length < frameHeaderBytes + nameLength) return null
    try {
      const name = new TextDecoder('utf-8', { fatal: true }).decode(fixed.slice(frameHeaderBytes, frameHeaderBytes + nameLength))
      if (!validName(name)) return this.error('invalidHeader', 'Invalid acoustic file name.')
      this.header = { name, length, blockCount, finalCrc }
      this.bytes.splice(0, frameHeaderBytes + nameLength)
      if (length === 0) {
        if (crc32(new Uint8Array()) !== finalCrc) return this.error('finalCrcMismatch', 'Final file checksum mismatch.')
        return { type: 'file', file: { name, data: new Uint8Array() }, progress: this.progress(true, false) }
      }
      return null
    } catch {
      return this.error('invalidHeader', 'Invalid UTF-8 file name.')
    }
  }

  /**
   * consumeBlock validates the next sequential block and reports completed-block progress.
   * @returns {FileDecodeResult | null} Progress, completed file, failure, or no output while incomplete.
   */
  private consumeBlock(): FileDecodeResult | null {
    const header = this.header!
    if (this.nextBlockLength === 0) {
      if (this.bytes.length < blockHeaderBytes) return null
      const prefix = Uint8Array.from(this.bytes)
      const view = new DataView(prefix.buffer)
      const index = view.getUint16(0, false)
      const payloadLength = view.getUint16(2, false)
      const expectedLength = Math.min(fileBlockPayloadBytes, header.length - this.bytesReceived)
      if (index !== this.nextBlockIndex) return this.error('missingBlock', `Expected block ${this.nextBlockIndex}, received block ${index}.`)
      if (payloadLength !== expectedLength || payloadLength === 0) return this.error('corruptedBlock', `Invalid payload length for block ${index}.`)
      this.nextBlockLength = blockHeaderBytes + payloadLength + checksumBytes
    }
    if (this.bytes.length < this.nextBlockLength) return null
    const record = Uint8Array.from(this.bytes.splice(0, this.nextBlockLength))
    const payload = record.slice(blockHeaderBytes, -checksumBytes)
    const expectedCrc = new DataView(record.buffer).getUint32(record.length - checksumBytes, false)
    if (crc32(payload) !== expectedCrc) return this.error('corruptedBlock', `Checksum mismatch in block ${this.nextBlockIndex}.`)
    this.blocks.push(payload)
    this.bytesReceived += payload.length
    this.nextBlockIndex += 1
    this.nextBlockLength = 0
    const progress = this.progress(false, false)
    if (this.nextBlockIndex < header.blockCount) return { type: 'progress', progress }
    const data = joinBlocks(this.blocks, header.length)
    if (crc32(data) !== header.finalCrc) return this.error('finalCrcMismatch', 'Final file checksum mismatch.')
    return { type: 'file', file: { name: header.name, data }, progress: this.progress(true, false) }
  }

  /**
   * progress creates a presentation-safe progress snapshot without exposing payload bytes.
   * @param {boolean} complete - Whether the whole file has been verified.
   * @param {boolean} failed - Whether decoding has failed.
   * @returns {FileReceiveProgress} Aggregate block and byte counters.
   */
  private progress(complete: boolean, failed: boolean): FileReceiveProgress {
    const header = this.header
    return { blockIndex: Math.max(0, this.nextBlockIndex - 1), blockCount: header?.blockCount ?? 0, bytesReceived: this.bytesReceived, progress: header === undefined || header.length === 0 ? (complete ? 1 : 0) : this.bytesReceived / header.length, complete, failed }
  }

  /**
   * error creates a terminal typed error with the best available aggregate progress.
   * @param {FileDecodeErrorCode} code - Failure category.
   * @param {string} message - User-safe failure description.
   * @returns {FileDecodeError} Typed terminal failure.
   */
  private error(code: FileDecodeErrorCode, message: string): FileDecodeError {
    return { type: 'error', code, message }
  }
}

/** Internal parsed metadata for the enclosing file frame. */
interface FileHeader { readonly name: string; readonly length: number; readonly blockCount: number; readonly finalCrc: number }

/**
 * joinBlocks joins verified payload blocks to an exact declared file length.
 * @param {readonly Uint8Array[]} blocks - Verified block payloads in sequence.
 * @param {number} length - Declared final file length.
 * @returns {Uint8Array} Reconstructed file bytes.
 */
function joinBlocks(blocks: readonly Uint8Array[], length: number): Uint8Array {
  const data = new Uint8Array(length)
  let offset = 0
  for (const block of blocks) { data.set(block, offset); offset += block.length }
  return data
}

/**
 * validName rejects empty names, paths, and control characters.
 * @param {string} name - Candidate file name.
 * @returns {boolean} Whether the name can safely identify a downloaded file.
 */
function validName(name: string): boolean {
  return name.length > 0 && !/[\\/\u0000-\u001f\u007f]/u.test(name) && name !== '.' && name !== '..'
}

/**
 * crc32 computes the IEEE CRC32 checksum for bytes.
 * @param {Uint8Array} bytes - Bytes covered by the checksum.
 * @returns {number} Unsigned CRC32 value.
 */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

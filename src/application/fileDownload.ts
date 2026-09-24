import type { TransferFile } from '../domain/fileFrame'

/** FileDownload persists a checksum-verified received file on explicit user request. */
export interface FileDownload {
  /**
   * download saves a verified received file through a platform-specific adapter.
   * @param {TransferFile} file - Verified file retained at the application boundary.
   * @returns {void} Starts the platform download.
   */
  download(file: TransferFile): void
}

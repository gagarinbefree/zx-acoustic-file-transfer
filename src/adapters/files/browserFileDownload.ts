import type { FileDownload } from '../../application/fileDownload'
import type { TransferFile } from '../../domain/fileFrame'

/** BrowserFileDownload saves verified acoustic transfer files through a browser download. */
export class BrowserFileDownload implements FileDownload {
  /**
   * download creates and immediately invokes a temporary browser download link.
   * @param {TransferFile} file - Verified file to persist locally.
   * @returns {void} Starts a browser download without exposing bytes to Vue or Pinia.
   */
  download(file: TransferFile): void {
    const url = URL.createObjectURL(new Blob([new Uint8Array(file.data)]))
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

import { createDefaultDiagnosticToneService, type DiagnosticToneService } from './diagnosticTone'
import { createDefaultReceiver, type MicrophoneReceiver } from './receiveMicrophone'
import { createDefaultTransmitter, type Transmitter } from './transmitHelloSpectrum'

/**
 * TransferApplicationServices groups application-facing services selected by a composition root.
 */
export interface TransferApplicationServices {
  readonly transmitter: Transmitter
  readonly receiver: MicrophoneReceiver
  readonly diagnosticTone: DiagnosticToneService
}

/**
 * transferApplicationServicesKey identifies an optional composition-root override for the Vue shell.
 */
export const transferApplicationServicesKey = Symbol('zx-acoustic-transfer.application-services')

/**
 * createDefaultTransferApplicationServices composes the browser production adapters.
 * @returns {TransferApplicationServices} Services backed by real Web Audio input and output.
 */
export function createDefaultTransferApplicationServices(): TransferApplicationServices {
  return {
    transmitter: createDefaultTransmitter(),
    receiver: createDefaultReceiver(),
    diagnosticTone: createDefaultDiagnosticToneService(),
  }
}

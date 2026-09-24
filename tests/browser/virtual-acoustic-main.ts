import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '../../src/App.vue'
import { DiagnosticToneService } from '../../src/application/diagnosticTone'
import { MicrophoneReceiver } from '../../src/application/receiveMicrophone'
import { AcousticTransmitter } from '../../src/application/transmitHelloSpectrum'
import { transferApplicationServicesKey, type TransferApplicationServices } from '../../src/application/transferApplicationServices'
import { BfskModulator } from '../../src/domain/bfsk'
import { defaultBfskConfiguration, defaultBfskDetectorThresholds } from '../../src/domain/bfskConfiguration'
import { BfskDetector } from '../../src/domain/bfskDetector'
import { VirtualAcousticChannel } from '../support/virtualAcousticChannel'
import '../../src/styles/base.css'

/**
 * createReceiver constructs a production receiver and detector around an injected AudioInput endpoint.
 * @param {VirtualAcousticChannel} channel - Test-only channel used solely at the audio I/O boundary.
 * @returns {MicrophoneReceiver} Application receiver with real detection logic.
 */
function createReceiver(channel: VirtualAcousticChannel): MicrophoneReceiver {
  return new MicrophoneReceiver(
    channel.createInput(),
    new BfskDetector(defaultBfskConfiguration, defaultBfskDetectorThresholds),
  )
}

/**
 * createSenderServices composes production transmit services with a test-only output endpoint.
 * @param {VirtualAcousticChannel} channel - Shared test channel receiving production PCM.
 * @returns {TransferApplicationServices} Services for the sender application instance.
 */
function createSenderServices(channel: VirtualAcousticChannel): TransferApplicationServices {
  const modulator = new BfskModulator(defaultBfskConfiguration)
  const inactiveReceiverChannel = new VirtualAcousticChannel()
  return {
    transmitter: new AcousticTransmitter(modulator, channel.createOutput()),
    diagnosticTone: new DiagnosticToneService(modulator, () => channel.createOutput()),
    receiver: createReceiver(inactiveReceiverChannel),
  }
}

/**
 * mountTransferApplication mounts an isolated Vue application with an explicit composition root.
 * @param {string} selector - Fixture element receiving the application.
 * @param {TransferApplicationServices} services - Application services selected by the test harness.
 * @returns {void} Mounts the application instance.
 */
function mountTransferApplication(selector: string, services: TransferApplicationServices): void {
  const application = createApp(App)
  application.use(createPinia())
  application.provide(transferApplicationServicesKey, services)
  application.mount(selector)
}

const fastDelivery = new URLSearchParams(window.location.search).has('fast')
const channel = new VirtualAcousticChannel({
  sampleRate: 44_100,
  leadingSilenceSamples: 0,
  attenuation: 1,
  whiteNoiseAmplitude: 0,
  chunkSizes: [441],
  deliveryIntervalMilliseconds: fastDelivery ? 0 : 15,
  deliveryPauseAfterChunks: fastDelivery ? 0 : 32,
  deliveryPauseMilliseconds: fastDelivery ? 0 : 500,
})
mountTransferApplication('#sender', createSenderServices(channel))
mountTransferApplication('#receiver', {
  transmitter: new AcousticTransmitter(new BfskModulator(defaultBfskConfiguration), new VirtualAcousticChannel().createOutput()),
  diagnosticTone: new DiagnosticToneService(new BfskModulator(defaultBfskConfiguration), () => new VirtualAcousticChannel().createOutput()),
  receiver: createReceiver(channel),
})

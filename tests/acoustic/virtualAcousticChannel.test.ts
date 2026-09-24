import { describe, expect, it } from 'vitest'
import { DiagnosticToneService } from '../../src/application/diagnosticTone'
import { MicrophoneReceiver, type ReceiveLifecycleEvent } from '../../src/application/receiveMicrophone'
import { AcousticTransmitter } from '../../src/application/transmitHelloSpectrum'
import { BfskModulator } from '../../src/domain/bfsk'
import { defaultBfskConfiguration, defaultBfskDetectorThresholds } from '../../src/domain/bfskConfiguration'
import { BfskDetector } from '../../src/domain/bfskDetector'
import { bytesToBits, type Bit } from '../../src/domain/bits'
import { encodeUtf8 } from '../../src/domain/text'
import { defaultAcousticProtocolConfiguration, frameProtocolSymbols, type ProtocolSynchronizationState } from '../../src/domain/acousticProtocol'
import { encodeFileFrame } from '../../src/domain/fileFrame'
import { VirtualAcousticChannel, type VirtualAcousticChannelConfiguration } from '../support/virtualAcousticChannel'

/**
 * createReceivingChannel assembles production receiver and detector services around a test-only PCM channel.
 * @param {Partial<VirtualAcousticChannelConfiguration>} configuration - Optional deterministic channel conditions.
 * @returns {Promise<{channel: VirtualAcousticChannel; receiver: MicrophoneReceiver; events: ReceiveLifecycleEvent[]}>} Active virtual receive fixture.
 */
async function createReceivingChannel(
  configuration: Partial<VirtualAcousticChannelConfiguration> = {},
): Promise<{ channel: VirtualAcousticChannel; receiver: MicrophoneReceiver; events: ReceiveLifecycleEvent[] }> {
  const channel = new VirtualAcousticChannel({
    sampleRate: 44_100,
    leadingSilenceSamples: 0,
    attenuation: 1,
    whiteNoiseAmplitude: 0,
    chunkSizes: [441],
    ...configuration,
  })
  let now = 0
  const receiver = new MicrophoneReceiver(
    channel.createInput(),
    new BfskDetector(defaultBfskConfiguration, defaultBfskDetectorThresholds),
    () => {
      now += 100
      return now
    },
  )
  const events: ReceiveLifecycleEvent[] = []
  await receiver.start((event) => events.push(event))
  return { channel, receiver, events }
}

/**
 * detectedSymbols extracts production detector symbols published through receive telemetry.
 * @param {readonly ReceiveLifecycleEvent[]} events - Application-level receive lifecycle events.
 * @returns {Array<Bit | 'none'>} Detector symbols in their delivered order.
 */
function detectedSymbols(events: readonly ReceiveLifecycleEvent[]): Array<Bit | 'none'> {
  let observedChunks = 0
  return events.flatMap((event) => {
    if (event.type !== 'level' || event.telemetry.chunks <= observedChunks) return []
    observedChunks = event.telemetry.chunks
    return [event.telemetry.detection.symbol]
  })
}

/**
 * protocolStates extracts acquisition transitions published by the production receiver.
 * @param {readonly ReceiveLifecycleEvent[]} events - Application receive lifecycle events.
 * @returns {ProtocolSynchronizationState[]} Observed protocol state transitions.
 */
function protocolStates(events: readonly ReceiveLifecycleEvent[]): ProtocolSynchronizationState[] {
  return events.flatMap((event) => event.type === 'protocol' ? [event.state] : [])
}

describe('virtual acoustic integration', () => {
  it('delivers production TEST 0 PCM to the production detector as F0', async () => {
    const { channel, receiver, events } = await createReceivingChannel()
    const tone = new DiagnosticToneService(new BfskModulator(defaultBfskConfiguration), () => channel.createOutput())

    await tone.start(0)
    await tone.stop()
    await receiver.stop()

    expect(detectedSymbols(events)).toContain(0)
    expect(detectedSymbols(events)).not.toContain(1)
    expect(channel.disposedOutputCount).toBe(1)
    expect(channel.inputStopped).toBe(true)
  })

  it('delivers production TEST 1 PCM to the production detector as F1', async () => {
    const { channel, receiver, events } = await createReceivingChannel()
    const tone = new DiagnosticToneService(new BfskModulator(defaultBfskConfiguration), () => channel.createOutput())

    await tone.start(1)
    await tone.stop()
    await receiver.stop()

    expect(detectedSymbols(events)).toContain(1)
    expect(detectedSymbols(events)).not.toContain(0)
    expect(channel.disposedOutputCount).toBe(1)
    expect(channel.inputStopped).toBe(true)
  })

  it('reports none for virtual silence without replacing the production detector', async () => {
    const { channel, receiver, events } = await createReceivingChannel()

    channel.emitSilence(882)
    await receiver.stop()

    expect(detectedSymbols(events)).toContain('none')
  })

  it('detects PILOT and SYNC before HELLO SPECTRUM production transmitter symbols across noisy chunks', async () => {
    const { channel, receiver, events } = await createReceivingChannel({
      leadingSilenceSamples: 441,
      attenuation: 0.7,
      whiteNoiseAmplitude: 0.01,
      chunkSizes: [147, 294, 441, 882],
    })
    const transmitter = new AcousticTransmitter(new BfskModulator(defaultBfskConfiguration), channel.createOutput())

    await transmitter.transmit({ message: 'HELLO SPECTRUM' })
    await receiver.stop()

    expect(detectedSymbols(events)).toContain(0)
    expect(detectedSymbols(events)).toContain(1)
    expect(protocolStates(events)).toEqual(['pilotDetected', 'synchronizing', 'syncDetected', 'listening'])
    expect(events.filter((event) => event.type === 'file')).toMatchObject([{
      type: 'file', file: { name: 'HELLO.TXT', bytes: encodeUtf8('HELLO SPECTRUM').length }, progress: { complete: true, failed: false },
    }])
  })

  it('preserves F1 detection with deterministic attenuation, noise, leading silence, and varied chunks', async () => {
    const { channel, receiver, events } = await createReceivingChannel({
      leadingSilenceSamples: 441,
      attenuation: 0.6,
      whiteNoiseAmplitude: 0.02,
      chunkSizes: [147, 294, 441],
    })
    const tone = new DiagnosticToneService(new BfskModulator(defaultBfskConfiguration), () => channel.createOutput())

    await tone.start(1)
    await receiver.stop()

    expect(detectedSymbols(events)).toContain('none')
    expect(detectedSymbols(events)).toContain(1)
  })

  it('does not detect pilot or sync for silence or constant TEST 0 and TEST 1 tones', async () => {
    const { channel, receiver, events } = await createReceivingChannel()
    channel.emitSilence(44_100)
    const tone = new DiagnosticToneService(new BfskModulator(defaultBfskConfiguration), () => channel.createOutput())
    await tone.start(0)
    await tone.stop()
    await tone.start(1)
    await tone.stop()
    await receiver.stop()

    expect(protocolStates(events)).toEqual([])
  })

  it('resets to listening when a pilot is followed by a corrupted sync word', async () => {
    const { channel, receiver, events } = await createReceivingChannel()
    const corruptSync = defaultAcousticProtocolConfiguration.sync.map((bit, index): Bit => index === 3 ? (bit === 0 ? 1 : 0) : bit)
    const symbols = [...defaultAcousticProtocolConfiguration.pilot, ...corruptSync]
    channel.deliver(new BfskModulator(defaultBfskConfiguration).modulate(symbols, channel.sampleRate))
    await receiver.stop()

    expect(protocolStates(events)).toEqual(['pilotDetected', 'synchronizing', 'listening'])
    expect(protocolStates(events)).not.toContain('syncDetected')
  })

  it('round-trips a selected binary file through production modulation and detection at uneven chunk boundaries', async () => {
    const { channel, receiver, events } = await createReceivingChannel({
      leadingSilenceSamples: 0,
      attenuation: 0.7,
      whiteNoiseAmplitude: 0.005,
      chunkSizes: [127, 333, 881, 19],
    })
    const file = { name: 'sample.bin', data: Uint8Array.from([0, 1, 255, 128, 0, 42]) }
    await new AcousticTransmitter(new BfskModulator(defaultBfskConfiguration), channel.createOutput()).transmit({ file })
    await receiver.stop()
    expect(events.filter((event) => event.type === 'file')).toMatchObject([{ type: 'file', file: { name: file.name, bytes: file.data.length }, progress: { complete: true } }])
    expect(events.filter((event) => event.type === 'frameError')).toEqual([])
  })

  it('decodes a whole transmission delivered as one PCM chunk', async () => {
    const { channel, receiver, events } = await createReceivingChannel({ chunkSizes: [10_000_000] })
    const file = { name: 'one.bin', data: Uint8Array.from([1, 0, 255]) }
    await new AcousticTransmitter(new BfskModulator(defaultBfskConfiguration), channel.createOutput()).transmit({ file })
    await receiver.stop()
    expect(events.filter((event) => event.type === 'file')).toMatchObject([{ type: 'file', file: { name: file.name, bytes: file.data.length }, progress: { complete: true } }])
  })

  it('rejects a corrupted payload after valid PILOT and SYNC acquisition', async () => {
    const { channel, receiver, events } = await createReceivingChannel({ chunkSizes: [137, 443, 991] })
    const frame = encodeFileFrame({ name: 'bad.bin', data: Uint8Array.from([1, 2, 3]) })
    frame[12 + new TextEncoder().encode('bad.bin').length + 4] ^= 1
    const symbols = frameProtocolSymbols(bytesToBits(frame)).map((symbol) => symbol.bit)
    channel.deliver(new BfskModulator(defaultBfskConfiguration).modulate(symbols, channel.sampleRate))
    await receiver.stop()
    expect(events.filter((event) => event.type === 'file')).toEqual([])
    expect(events.filter((event) => event.type === 'frameError')).toEqual([{ type: 'frameError', code: 'corruptedBlock', message: 'Checksum mismatch in block 0.' }])
  })

  it('transfers a multiple-block file through production modulation and detection across arbitrary PCM chunks', async () => {
    const { channel, receiver, events } = await createReceivingChannel({
      leadingSilenceSamples: 217,
      attenuation: 1,
      whiteNoiseAmplitude: 0,
      chunkSizes: [127, 333, 881, 61],
    })
    const file = { name: 'blocks.bin', data: Uint8Array.from({ length: 513 }, (_, index) => (index * 37) % 256) }
    await new AcousticTransmitter(new BfskModulator(defaultBfskConfiguration), channel.createOutput()).transmit({ file })
    await receiver.stop()
    expect(events.filter((event) => event.type === 'progress')).toContainEqual(
      { type: 'progress', progress: { blockIndex: 0, blockCount: 3, bytesReceived: 256, progress: 256 / 513, complete: false, failed: false } },
    )
    expect(events.filter((event) => event.type === 'frameError')).toEqual([])
    expect(events.filter((event) => event.type === 'file')).toMatchObject([{ type: 'file', file: { name: file.name, bytes: file.data.length }, progress: { blockIndex: 2, blockCount: 3, complete: true, failed: false } }])
    expect(events.filter((event) => event.type === 'frameError')).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import type { AudioInput, MicrophoneCapture, PcmChunkHandler } from '../../src/audio/input'
import type { BfskDetectionResult } from '../../src/domain/bfskDetector'
import type { PcmDetector } from '../../src/domain/detection'
import { MicrophoneReceiver, SignalTelemetryAccumulator, type ReceiveLifecycleEvent } from '../../src/application/receiveMicrophone'

class TestCapture implements MicrophoneCapture {
  readonly sampleRate = 8000
  readonly settings = {
    sampleRate: 8000,
    channelCount: 1,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  }
  stopped = false

  /**
   * stop marks the test capture as released.
   * @returns {Promise<void>} Completed cleanup promise.
   */
  async stop(): Promise<void> {
    this.stopped = true
  }
}

class TestAudioInput implements AudioInput {
  readonly capture = new TestCapture()
  handler: PcmChunkHandler | undefined

  /**
   * start stores the PCM callback and returns the test capture.
   * @param {PcmChunkHandler} onPcmChunk - Callback to receive test chunks.
   * @returns {Promise<MicrophoneCapture>} Active test microphone capture.
   */
  async start(onPcmChunk: PcmChunkHandler): Promise<MicrophoneCapture> {
    this.handler = onPcmChunk
    return this.capture
  }
}

class TestDetector implements PcmDetector<BfskDetectionResult> {
  /**
   * detect returns a stable neutral result for receive lifecycle tests.
   * @param {Float32Array} samples - Unused PCM samples.
   * @param {number} sampleRate - Unused PCM sample rate.
   * @returns {BfskDetectionResult} Neutral diagnostic result.
   */
  detect(samples: Float32Array, sampleRate: number): BfskDetectionResult {
    void samples
    void sampleRate
    return { symbol: 'none', zeroEnergy: 0, oneEnergy: 0, confidence: 0 }
  }
}

describe('SignalTelemetryAccumulator', () => {
  it('calculates aggregate RMS, peak, samples, and chunks', () => {
    const telemetry = new SignalTelemetryAccumulator()
    telemetry.add(new Float32Array([0.5, -0.5]), { symbol: 0, zeroEnergy: 0.1, oneEnergy: 0.01, confidence: 10 })

    expect(telemetry.snapshot()).toEqual({
      rms: 0.5, peak: 0.5, samples: 2, chunks: 1, detection: { symbol: 0, zeroEnergy: 0.1, oneEnergy: 0.01, confidence: 10 },
      maximumZeroEnergy: 0.1, maximumOneEnergy: 0.01, maximumConfidence: 10, maximumRms: 0.5, maximumPeak: 0.5, recognizedSymbols: 0, erroneousSymbols: 0, successfulBlocks: 0, failedBlocks: 0, lastBlockCrc: 'pending',
    })
  })
})

describe('MicrophoneReceiver', () => {
  it('emits a throttled receive lifecycle and releases microphone capture', async () => {
    let time = 0
    const input = new TestAudioInput()
    const receiver = new MicrophoneReceiver(input, new TestDetector(), () => time)
    const events: ReceiveLifecycleEvent[] = []

    await receiver.start((event) => events.push(event))
    input.handler?.(new Float32Array([0.25, -0.5]))
    time = 100
    input.handler?.(new Float32Array([0.5, -0.5]))
    await receiver.stop()

    expect(events).toEqual([
      { type: 'starting' },
      { type: 'listening', sampleRate: 8000, settings: input.capture.settings },
      { type: 'level', telemetry: { rms: 0.5, peak: 0.5, samples: 4, chunks: 2, detection: { symbol: 'none', zeroEnergy: 0, oneEnergy: 0, confidence: 0 }, maximumZeroEnergy: 0, maximumOneEnergy: 0, maximumConfidence: 0, maximumRms: 0.5, maximumPeak: 0.5, recognizedSymbols: 0, erroneousSymbols: 0, successfulBlocks: 0, failedBlocks: 0, lastBlockCrc: 'pending' } },
      { type: 'level', telemetry: { rms: 0.5, peak: 0.5, samples: 4, chunks: 2, detection: { symbol: 'none', zeroEnergy: 0, oneEnergy: 0, confidence: 0 }, maximumZeroEnergy: 0, maximumOneEnergy: 0, maximumConfidence: 0, maximumRms: 0.5, maximumPeak: 0.5, recognizedSymbols: 0, erroneousSymbols: 0, successfulBlocks: 0, failedBlocks: 0, lastBlockCrc: 'pending' } },
      { type: 'stopped' },
    ])
    expect(input.capture.stopped).toBe(true)
  })

  it('resets retained maxima without exposing or discarding PCM', () => {
    const telemetry = new SignalTelemetryAccumulator()
    telemetry.add(new Float32Array([0.5]), { symbol: 0, zeroEnergy: 0.1, oneEnergy: 0.01, confidence: 10 })
    telemetry.resetMaximums()

    expect(telemetry.snapshot()).toMatchObject({
      samples: 1,
      chunks: 1,
      detection: { symbol: 0 },
      maximumZeroEnergy: 0,
      maximumOneEnergy: 0,
      maximumConfidence: 0,
      maximumRms: 0,
      maximumPeak: 0,
      recognizedSymbols: 0, erroneousSymbols: 0, successfulBlocks: 0, failedBlocks: 0, lastBlockCrc: 'pending',
    })
  })
})

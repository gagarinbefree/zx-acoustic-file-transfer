import type { AudioInput, MicrophoneCapture, MicrophoneSettings, PcmChunkHandler } from '../../src/audio/input'
import type { AudioOutput, AudioPlayback } from '../../src/adapters/audio/webAudioPcmPlayer'

/**
 * VirtualAcousticChannelConfiguration controls deterministic test-only PCM transport conditions.
 */
export interface VirtualAcousticChannelConfiguration {
  readonly sampleRate: number
  readonly leadingSilenceSamples: number
  readonly attenuation: number
  readonly whiteNoiseAmplitude: number
  readonly chunkSizes: readonly number[]
  readonly deliveryIntervalMilliseconds?: number
  readonly deliveryPauseAfterChunks?: number
  readonly deliveryPauseMilliseconds?: number
}

/**
 * defaultVirtualAcousticChannelConfiguration provides an ideal deterministic PCM baseline.
 */
export const defaultVirtualAcousticChannelConfiguration: VirtualAcousticChannelConfiguration = {
  sampleRate: 44_100,
  leadingSilenceSamples: 0,
  attenuation: 1,
  whiteNoiseAmplitude: 0,
  chunkSizes: [441],
  deliveryIntervalMilliseconds: 0,
  deliveryPauseAfterChunks: 0,
  deliveryPauseMilliseconds: 0,
}

/**
 * VirtualAcousticChannel delivers production PCM to a production AudioInput callback in test code only.
 */
export class VirtualAcousticChannel {
  private handler: PcmChunkHandler | undefined
  private capture: VirtualMicrophoneCapture | undefined
  private noiseState = 0x1234abcd
  private disposedOutputs = 0

  /**
   * constructor stores deterministic virtual-channel parameters.
   * @param {VirtualAcousticChannelConfiguration} configuration - Test transport configuration.
   */
  constructor(private readonly configuration: VirtualAcousticChannelConfiguration = defaultVirtualAcousticChannelConfiguration) {}

  /**
   * createInput returns a test-only AudioInput endpoint for a production receiver.
   * @returns {AudioInput} Endpoint that receives transformed PCM chunks.
   */
  createInput(): AudioInput {
    return {
      start: async (onPcmChunk) => {
        const capture = new VirtualMicrophoneCapture(this.configuration.sampleRate)
        this.handler = onPcmChunk
        this.capture = capture
        return capture
      },
    }
  }

  /**
   * createOutput returns a test-only AudioOutput endpoint for a production transmitter.
   * @returns {AudioOutput} Endpoint that forwards its real PCM into this channel.
   */
  createOutput(): AudioOutput {
    return new VirtualAudioOutput(this, this.configuration.sampleRate)
  }

  /**
   * emitSilence supplies deterministic zero-valued input for receiver baseline tests.
   * @param {number} sampleCount - Number of silence samples to deliver.
   * @returns {void} Delivers channel chunks when capture is active.
   */
  emitSilence(sampleCount: number): void {
    this.deliver(new Float32Array(sampleCount))
  }

  /**
   * sampleRate exposes the configured virtual audio graph rate.
   * @returns {number} Sample rate in hertz.
   */
  get sampleRate(): number {
    return this.configuration.sampleRate
  }

  /**
   * inputStopped reports whether the active test capture was released.
   * @returns {boolean} True after the production receiver stops its input.
   */
  get inputStopped(): boolean {
    return this.capture?.stopped === true
  }

  /**
   * disposedOutputCount reports test-output cleanup requests.
   * @returns {number} Number of virtual AudioOutput instances disposed by application code.
   */
  get disposedOutputCount(): number {
    return this.disposedOutputs
  }

  /**
   * deliver transforms and chunks PCM before invoking the attached receive callback.
   * @param {Float32Array} source - Production PCM samples from the output endpoint.
   * @returns {void} Delivers no samples after capture has stopped.
   */
  deliver(source: Float32Array): void {
    if (this.handler === undefined || this.capture?.stopped === true) return
    const padded = new Float32Array(this.configuration.leadingSilenceSamples + source.length)
    for (let index = 0; index < source.length; index += 1) {
      padded[this.configuration.leadingSilenceSamples + index] = source[index]! * this.configuration.attenuation + this.nextNoise()
    }
    let offset = 0
    let chunkIndex = 0
    while (offset < padded.length) {
      const chunkSize = this.configuration.chunkSizes[chunkIndex % this.configuration.chunkSizes.length]!
      this.handler(padded.slice(offset, offset + chunkSize))
      offset += chunkSize
      chunkIndex += 1
    }
  }

  /**
   * deliverPlayback forwards PCM in scheduled test chunks so browser UI can render lifecycle transitions.
   * @param {Float32Array} source - Production PCM samples from a virtual output.
   * @returns {Promise<void>} Resolves after all deterministic chunks are delivered.
   */
  async deliverPlayback(source: Float32Array): Promise<void> {
    const interval = this.configuration.deliveryIntervalMilliseconds ?? 0
    if (interval <= 0) {
      this.deliver(source)
      return
    }
    const padded = new Float32Array(this.configuration.leadingSilenceSamples + source.length)
    for (let index = 0; index < source.length; index += 1) padded[this.configuration.leadingSilenceSamples + index] = source[index]! * this.configuration.attenuation + this.nextNoise()
    let offset = 0
    let chunkIndex = 0
    while (offset < padded.length) {
      if (this.handler === undefined || this.capture?.stopped === true) return
      const chunkSize = this.configuration.chunkSizes[chunkIndex % this.configuration.chunkSizes.length]!
      this.handler(padded.slice(offset, offset + chunkSize))
      offset += chunkSize
      chunkIndex += 1
      if (chunkIndex === this.configuration.deliveryPauseAfterChunks) {
        await new Promise<void>((resolve) => setTimeout(resolve, this.configuration.deliveryPauseMilliseconds ?? 0))
      }
      await new Promise<void>((resolve) => setTimeout(resolve, interval))
    }
  }

  /**
   * nextNoise creates deterministic zero-mean pseudo-white noise for tests.
   * @returns {number} Noise sample bounded by the configured amplitude.
   */
  private nextNoise(): number {
    this.noiseState = (Math.imul(1_664_525, this.noiseState) + 1_013_904_223) >>> 0
    return ((this.noiseState / 0x1_0000_0000) * 2 - 1) * this.configuration.whiteNoiseAmplitude
  }

  /**
   * recordOutputDisposal tracks a virtual output released by application code.
   * @returns {void} Increments test-only cleanup telemetry.
   */
  recordOutputDisposal(): void {
    this.disposedOutputs += 1
  }
}

/**
 * VirtualMicrophoneCapture records deterministic test-only input cleanup.
 */
class VirtualMicrophoneCapture implements MicrophoneCapture {
  readonly settings: MicrophoneSettings
  stopped = false

  /**
   * constructor initializes browser-like mono input metadata.
   * @param {number} sampleRate - Virtual graph rate in hertz.
   */
  constructor(readonly sampleRate: number) {
    this.settings = { sampleRate, channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
  }

  /**
   * stop prevents further virtual PCM delivery.
   * @returns {Promise<void>} Completed cleanup promise.
   */
  async stop(): Promise<void> {
    this.stopped = true
  }
}

/**
 * VirtualAudioOutput adapts real production PCM output to the virtual channel.
 */
class VirtualAudioOutput implements AudioOutput {
  private disposed = false

  /**
   * constructor stores the channel receiving production PCM.
   * @param {VirtualAcousticChannel} channel - Test-only channel endpoint.
   */
  constructor(
    private readonly channel: VirtualAcousticChannel,
    private readonly channelSampleRate: number,
  ) {}

  /**
   * sampleRate returns the channel graph sample rate.
   * @returns {number} Virtual output sample rate in hertz.
   */
  get sampleRate(): number {
    return this.channelSampleRate
  }

  /**
   * play forwards unmodified production PCM to the virtual channel.
   * @param {Float32Array} samples - Production transmitter PCM.
   * @returns {Promise<AudioPlayback>} Playback handle completed after delivery.
   */
  async play(samples: Float32Array): Promise<AudioPlayback> {
    let stopped = false
    let resolveCompleted: () => void = () => undefined
    const completed = new Promise<void>((resolve) => { resolveCompleted = resolve })
    queueMicrotask(async () => {
      if (!stopped && !this.disposed) await this.channel.deliverPlayback(samples)
      resolveCompleted()
    })
    return { completed, stop: () => { stopped = true } }
  }

  /**
   * dispose prevents future virtual PCM playback.
   * @returns {Promise<void>} Completed cleanup promise.
   */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.channel.recordOutputDisposal()
  }
}

export interface AudioPlayback {
  readonly completed: Promise<void>
  stop(): void
}

export interface AudioOutput {
  /**
   * sampleRate exposes the actual output device rate.
   * @returns {number} Audio output sample rate in hertz.
   */
  readonly sampleRate: number
  /**
   * play sends normalized mono PCM samples to an output device.
   * @param {Float32Array} samples - PCM samples to play.
   * @returns {Promise<AudioPlayback>} Resolves with a handle for the scheduled playback.
   */
  play(samples: Float32Array): Promise<AudioPlayback>
  /**
   * dispose stops active playback and releases output resources.
   * @returns {Promise<void>} Resolves after audio resources are closed.
   */
  dispose(): Promise<void>
}

/**
 * WebAudioPcmPlayer plays normalized mono PCM samples through the browser audio output.
 */
export class WebAudioPcmPlayer implements AudioOutput {
  private context: AudioContext | undefined
  private activeSource: AudioBufferSourceNode | undefined

  /**
   * play schedules PCM samples on the current audio output.
   * @param {Float32Array} samples - Mono normalized PCM samples to play.
   * @returns {Promise<AudioPlayback>} Resolves after the audio context has resumed and playback starts.
   */
  async play(samples: Float32Array): Promise<AudioPlayback> {
    const context = this.getContext()
    await context.resume()

    const buffer = context.createBuffer(1, samples.length, context.sampleRate)
    buffer.copyToChannel(samples, 0)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    const completed = new Promise<void>((resolve) => {
      source.addEventListener('ended', () => {
        if (this.activeSource === source) this.activeSource = undefined
        resolve()
      }, { once: true })
    })
    this.activeSource?.stop()
    this.activeSource = source
    source.start()
    return { completed, stop: () => source.stop() }
  }

  /**
   * sampleRate returns the sample rate of the real browser audio context.
   * @returns {number} Audio output sample rate in hertz.
   */
  get sampleRate(): number {
    return this.getContext().sampleRate
  }

  /**
   * dispose stops the active source and closes the browser audio context.
   * @returns {Promise<void>} Resolves after context resources are released.
   */
  async dispose(): Promise<void> {
    this.activeSource?.stop()
    this.activeSource = undefined
    const context = this.context
    this.context = undefined
    if (context !== undefined && context.state !== 'closed') {
      await context.close()
    }
  }

  /**
   * getContext creates or returns the adapter's browser audio context.
   * @returns {AudioContext} Reusable audio context instance.
   */
  private getContext(): AudioContext {
    if (this.context === undefined) {
      this.context = new AudioContext()
    }
    return this.context
  }
}

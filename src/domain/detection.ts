export interface PcmDetector<TResult> {
  /**
   * detect analyzes a mono PCM chunk at its actual sample rate.
   * @param {Float32Array} samples - Mono PCM samples to analyze.
   * @param {number} sampleRate - PCM sample rate in hertz.
   * @returns {TResult} Typed diagnostic detection result.
   */
  detect(samples: Float32Array, sampleRate: number): TResult
}

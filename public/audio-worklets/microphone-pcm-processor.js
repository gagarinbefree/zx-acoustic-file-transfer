/**
 * MicrophonePcmProcessor forwards the first microphone channel as PCM chunks.
 */
class MicrophonePcmProcessor extends AudioWorkletProcessor {
  /**
   * process forwards a copied mono channel without performing signal analysis.
   * @param {Float32Array[][]} inputs - AudioWorklet input buses and channels.
   * @returns {boolean} Keeps the processor active while the graph is connected.
   */
  process(inputs) {
    const channel = inputs[0]?.[0]
    if (channel !== undefined) {
      this.port.postMessage(new Float32Array(channel))
    }
    return true
  }
}

registerProcessor('microphone-pcm-processor', MicrophonePcmProcessor)

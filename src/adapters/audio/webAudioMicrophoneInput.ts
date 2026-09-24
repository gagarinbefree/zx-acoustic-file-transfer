import type { AudioInput, MicrophoneCapture, MicrophoneSettings, PcmChunkHandler } from '../../audio/input'

/**
 * WebAudioMicrophoneInput captures microphone PCM through a browser AudioWorklet.
 */
export class WebAudioMicrophoneInput implements AudioInput {
  /**
   * start requests microphone access and starts a mono PCM callback stream.
   * @param {PcmChunkHandler} onPcmChunk - Callback receiving mono PCM chunks outside Vue and Pinia.
   * @returns {Promise<MicrophoneCapture>} Active capture with actual audio graph details.
   */
  async start(onPcmChunk: PcmChunkHandler): Promise<MicrophoneCapture> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone capture is not supported by this browser.')
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
    const track = stream.getAudioTracks()[0]
    if (track === undefined) {
      stream.getTracks().forEach((streamTrack) => streamTrack.stop())
      throw new Error('No audio track was provided by the microphone.')
    }

    let context: AudioContext | undefined
    try {
      context = new AudioContext()
      await context.audioWorklet.addModule(`${import.meta.env.BASE_URL}audio-worklets/microphone-pcm-processor.js`)
      const source = context.createMediaStreamSource(stream)
      const processor = new AudioWorkletNode(context, 'microphone-pcm-processor')
      const silentGain = context.createGain()
      silentGain.gain.value = 0
      processor.port.onmessage = (event: MessageEvent<Float32Array>) => onPcmChunk(event.data)
      source.connect(processor)
      processor.connect(silentGain)
      silentGain.connect(context.destination)
      await context.resume()

      return createCapture(context, stream, source, processor, silentGain, track.getSettings())
    } catch (error: unknown) {
      stream.getTracks().forEach((streamTrack) => streamTrack.stop())
      await context?.close()
      throw error
    }
  }
}

/**
 * createCapture builds a resource-owning microphone capture from a connected Web Audio graph.
 * @param {AudioContext} context - Active browser audio context.
 * @param {MediaStream} stream - Captured microphone stream.
 * @param {MediaStreamAudioSourceNode} source - Stream source node.
 * @param {AudioWorkletNode} processor - PCM worklet node.
 * @param {GainNode} silentGain - Muted keep-alive graph node.
 * @param {MediaTrackSettings} trackSettings - Browser-reported microphone settings.
 * @returns {MicrophoneCapture} Capture with idempotent resource cleanup.
 */
function createCapture(
  context: AudioContext,
  stream: MediaStream,
  source: MediaStreamAudioSourceNode,
  processor: AudioWorkletNode,
  silentGain: GainNode,
  trackSettings: MediaTrackSettings,
): MicrophoneCapture {
  let stopped = false
  const settings: MicrophoneSettings = {
    sampleRate: trackSettings.sampleRate ?? null,
    channelCount: trackSettings.channelCount ?? null,
    echoCancellation: trackSettings.echoCancellation ?? null,
    noiseSuppression: trackSettings.noiseSuppression ?? null,
    autoGainControl: trackSettings.autoGainControl ?? null,
  }

  return {
    sampleRate: context.sampleRate,
    settings,
    /**
     * stop disconnects audio nodes, stops all stream tracks, and closes the audio context.
     * @returns {Promise<void>} Resolves after graph resources are released.
     */
    async stop(): Promise<void> {
      if (stopped) return
      stopped = true
      processor.port.onmessage = null
      processor.port.close()
      source.disconnect()
      processor.disconnect()
      silentGain.disconnect()
      stream.getTracks().forEach((streamTrack) => streamTrack.stop())
      await context.close()
    },
  }
}

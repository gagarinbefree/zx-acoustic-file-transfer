# ZX Acoustic Transfer development rules

These rules apply to every subsequent change in this repository.

- Keep all project-specific skills, agent instructions, templates, scripts, references, and supporting materials inside this project directory. Read project guidance only from files located in this project; do not rely on externally stored project skills or instructions.
- Use Vue 3.5.42, TypeScript with `strict: true` and no `any`, Composition API, Pinia, Vite, Vue SFCs, and `style scoped`.
- Follow SOLID, SRP, OCP, and DIP pragmatically. Prefer composition and dependency inversion to hard dependencies, without adding abstractions before a real use case requires them.
- Keep DSP, modulation, modem, protocol, and audio-processing independent from Vue and Pinia. Components and stores must not create `AudioContext` instances or contain DSP/audio-processing logic.
- Expose modem and audio telemetry to UI only through typed, aggregated application lifecycle events; never connect DSP or audio-processing code directly to Vue or Pinia.
- Keep audio input adapters independent from Vue, Pinia, and modem/domain code; never pass or store raw PCM samples in Vue or Pinia.
- Keep DSP detectors framework-independent and expose only typed, aggregate diagnostic results to application/UI layers; do not perform decoding or retain raw PCM outside the audio/application boundary.
- UI may depend only on typed application state and typed application events. Concrete acoustic-transfer implementations must be replaceable without rewriting UI, stores, or the application shell.
- Future BFSK, 4-FSK, PSK, OFDM, or other implementations must not require changes to existing consumers; introduce contracts only when real integration justifies them.
- Every new component and named function requires an English JSDoc comment stating its purpose, parameters with TypeScript types, and return type when applicable.
- Preserve the ZX Spectrum visual language, static 4:3 border, responsive behavior, semantic keyboard-accessible controls, and visible focus states. Do not introduce UI libraries, Tailwind, Bootstrap, gradients, glass, cards, or dashboard styling.
- Maintain three separate verification levels: unit tests, virtual acoustic integration tests, and real hardware tests. Virtual tests must use production PCM/modulation/detection through test-only audio I/O adapters and must never claim speaker-to-air-to-microphone coverage.
- Keep protocol acquisition framework-independent and sample-based: PILOT/SYNC detection must consume PCM windows through neutral detector contracts, tolerate arbitrary input chunk boundaries, and expose only aggregate typed protocol states to UI.
- For every functional change, run `npm test`, `npm run test:acoustic`, `npm run typecheck`, and a production build. When browser-control tooling is available, verify the requested flow and browser console.
- After any UI, browser, or Web Audio API change, run `npm run test:browser`. Browser automation may be reported unavailable only after following `.agents/skills/browser-testing/SKILL.md` and recording the specific failure reason.

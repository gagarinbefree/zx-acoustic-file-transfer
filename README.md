# ZX Acoustic Transfer

[![Tests](https://github.com/gagarinbefree/zx-acoustic-file-transfer/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/gagarinbefree/zx-acoustic-file-transfer/actions/workflows/tests.yml)
[![Deploy GitHub Pages](https://github.com/gagarinbefree/zx-acoustic-file-transfer/actions/workflows/deploy-pages.yml/badge.svg?branch=main)](https://github.com/gagarinbefree/zx-acoustic-file-transfer/actions/workflows/deploy-pages.yml)

> **Live demo:** [Open ZX Acoustic Transfer in GitHub Pages](https://gagarinbefree.github.io/zx-acoustic-file-transfer/)

ZX Acoustic Transfer is a browser-based experiment in sending small files through sound. It uses binary frequency-shift keying (BFSK): one frequency represents `0`, another represents `1`, and the receiving browser reconstructs the file from microphone audio.

The project is deliberately small, inspectable, and browser-native. It is designed as a foundation for experimenting with acoustic links before introducing higher data rates, retransmission, or forward error correction.

## What it does

- Transmits a text demo or a file up to **1024 bytes** using the browser audio output.
- Receives audio from a real microphone using the Web Audio API.
- Uses **1200 Hz / 2400 Hz BFSK** at **100 bit/s**.
- Acquires a transmission with an alternating PILOT and a fixed SYNC word.
- Splits files into ordered **256-byte blocks**.
- Validates every block with an independent CRC32 and validates the restored file with a final CRC32.
- Stops a corrupted, missing, or invalid transfer with a typed protocol error.
- Provides a responsive Bootstrap UI for sending, receiving, file download, signal level, detector confidence, block status, and CRC status.

## Protocol overview

```text
PILOT → SYNC → file header → block 0 → block 1 → … → final file CRC32
```

Each file block contains its sequence index, payload length, payload bytes, and CRC32. The receiver processes the PCM stream independently of browser audio chunk boundaries.

The current protocol intentionally has no ACKs, retransmissions, duplex mode, or FEC. Those are future decisions that should be based on measured real-channel behavior.

## Architecture

The codebase keeps audio and protocol concerns outside the UI:

```text
Vue + Pinia UI
        │ typed aggregate lifecycle events only
Application services
        │
Protocol / modem / DSP
        │
Web Audio adapters (output and microphone input)
```

Raw PCM never enters Vue or Pinia. The UI receives only typed, aggregate state such as acquisition phase, signal diagnostics, block progress, and verified-file metadata.

## Getting started

Requirements: Node.js 20+ and a modern desktop browser with Web Audio and microphone access.

```bash
npm install
npm run build
npm run dev
```

Open the URL printed by Vite. Choose **SAVE** to transmit a demo or file, or **LOAD** to request microphone access and receive a transfer.

## Verification

```bash
npm test
npm run test:acoustic
npm run typecheck
npm run build
npm run test:browser
```

- `npm test` covers unit and application behavior.
- `npm run test:acoustic` runs a virtual acoustic integration channel using production modulation and detection.
- `npm run test:browser` runs browser flows, including multi-block file transfer and byte-for-byte download verification.

Virtual acoustic tests are useful for deterministic protocol coverage, but they **do not** verify the physical path `speaker → air → microphone`.

## Real hardware testing

The reproducible physical test procedure is in [docs/manual-real-acoustic-test.md](docs/manual-real-acoustic-test.md). Its current status is **NOT RUN**: a real speaker-to-air-to-microphone result must be observed and recorded manually.

Suggested measurements include volume, distance, background noise, detector confidence, PILOT/SYNC acquisition, passed and failed blocks, CRC outcomes, and byte-for-byte output comparison.

## Current limitations

- Maximum file size: 1024 bytes.
- Transmission rate: 100 bit/s.
- No error correction, retry, acknowledgement, or bidirectional protocol.
- Real-world reliability depends on device audio processing, volume, distance, room acoustics, and background noise.

## License

No license has been selected yet.

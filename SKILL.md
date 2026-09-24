---
name: zx-acoustic-transfer
description: Build and evolve the ZX Acoustic Transfer frontend while preserving its Spectrum UI and transport-independent architecture.
---

# ZX Acoustic Transfer

Keep all project-specific skills, instructions, templates, scripts, references, and supporting materials in this project directory. Read project guidance only from this directory.

Use Vue 3 with TypeScript in strict mode, Composition API, `<script setup lang="ts">`, Pinia, Vite, and scoped styles. Do not use `any`.

## Architecture

- Keep visual components dependent only on typed application state and emitted user intents.
- Keep future acoustic transport/modem implementations out of Vue components and Pinia stores.
- Add abstractions only when a concrete next-stage integration needs them; do not add placeholders for modem, audio, DSP, protocol, backend, or Electron.
- Preserve single responsibility: display primitives, feature views, state, and domain types belong in separate files.
- Document every new component and named function with an English JSDoc comment. State its name/purpose, parameters with their TypeScript types, and return type when applicable.

## Visual language

- Preserve the ZX Spectrum aesthetic: a static, visible border around a 4:3 screen, limited palette exposed through CSS variables, monospace bitmap-like typography, and square controls.
- Use responsive sizing for both desktop and mobile.
- Do not add UI libraries, Tailwind, Bootstrap, gradients, glass effects, cards, or dashboard styling.
- All interactive controls must be semantic keyboard-accessible buttons with visible focus states.

## Verification

After a frontend change, run `npm run typecheck` and `npm run build`. When browser automation is available, validate the requested state flow, keyboard navigation, console output, and relevant desktop/mobile viewport sizes.

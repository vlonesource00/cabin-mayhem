# Test Plan

## Automated

- Unit: phase transitions, finite flight state, turbulence force, secured cargo, collision stability, host grab ownership, latency delivery.
- Integration: phase progression, system damage, debug triggers, cleanup/reset and bounded simulation.
- Browser: menu reaches scene, debug action gives visible feedback, phase control advances.
- Build: typecheck, lint, formatting, data/assets validators, Vite build and Tauri build.

## Manual matrix

Run 1/2 local players, keyboard/gamepad, network simulation on/off, low/high latency, each debug incident, cargo secure/unsecure, grab race, host reset, every phase and emergency collision. Record FPS, physics object count, queued packets and any NaN/stuck object. Real remote multiplayer test begins only after transport exists.

## Acceptance

No NaN state; players remain inside cabin bounds; secured cargo stays anchored; loose objects react to severe aircraft inputs; one owner per held object; latency does not break local client intent; phase rejects invalid terminal progression; reset cleans simulation.

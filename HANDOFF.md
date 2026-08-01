# Handoff

## Current state

Cabin Mayhem Phase 1 exists as a first-person Three.js web/Tauri prototype. Host owns flight, cabin physics, damage and object reservation. One local client runs through deterministic latency/jitter/loss simulation. Walkable 3D aircraft exposes all required technical triggers.

## Last changes

- Replaced Signal Run presentation with Cabin Mayhem technical scene.
- Added explicit flight model, aircraft-local cabin simulation, host session and simulated transport.
- Added cockpit/aisle/seats/shelves/cart/crates/straps/two spawns and visual debug UI.
- Added validated Phase 1 object definitions, docs, tests and browser test bridge.
- Replaced top-down Canvas presentation with pointer-lock first-person Three.js world.
- Added project-owned 3D cockpit, seats, overhead bins, cabin shell, cargo bay, crew and physical prop assets.
- Added camera-relative look/movement and collision against aircraft fixtures.
- Fixed `S` input, queued interactions at simulation-step time and connected 3D crosshair targets to host-authoritative pickup.
- Held objects now render in front of the first-person camera; an in-game pickup drill explains the loop.
- Built `cabin-mayhem.exe`, MSI and NSIS Windows artifacts successfully.

## Known problems

- Network simulation is local harness only; no WebRTC/WebSocket remote client yet.
- Object collision is intentionally small-count pairwise physics; add broadphase before content expansion.
- No production audio, accessibility settings migration or real save schema for Cabin Mayhem yet.
- Windows artifacts are development builds and `NotSigned`; SmartScreen may warn.

## Next recommended task

Run manual first-person collision/interaction pass, then two-device/browser transport spike. Record frame rate, bandwidth, reconnect behavior and held-object ownership recovery.

## Verification baseline

Run `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm validate:data`, `pnpm validate:assets`, unit/integration/E2E, `pnpm build`, then `pnpm desktop:build` where Rust toolchain exists.

# Handoff

## Current state

Cabin Mayhem Phase 1 exists as web/Tauri greybox prototype. Host owns flight, cabin physics, damage and object reservation. One local client runs through deterministic latency/jitter/loss simulation. Canvas test scene exposes all required technical triggers.

## Last changes

- Replaced Signal Run presentation with Cabin Mayhem technical scene.
- Added explicit flight model, aircraft-local cabin simulation, host session and simulated transport.
- Added cockpit/aisle/seats/shelves/cart/crates/straps/two spawns and visual debug UI.
- Added validated Phase 1 object definitions, docs, tests and browser test bridge.
- Built `cabin-mayhem.exe`, MSI and NSIS Windows artifacts successfully.

## Known problems

- Network simulation is local harness only; no WebRTC/WebSocket remote client yet.
- Object collision is intentionally small-count pairwise physics; add broadphase before content expansion.
- No production audio, accessibility settings migration or real save schema for Cabin Mayhem yet.
- Windows artifacts are development builds and `NotSigned`; SmartScreen may warn.

## Next recommended task

Run manual two-device/browser transport spike before Phase 2 passenger/content systems. Record bandwidth, reconnect behavior and held-object ownership recovery.

## Verification baseline

Run `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm validate:data`, `pnpm validate:assets`, unit/integration/E2E, `pnpm build`, then `pnpm desktop:build` where Rust toolchain exists.

# Architecture

## Scope

Phase 1 web/Tauri technical prototype for Cabin Mayhem. Vite/browser is intentional platform choice; Tauri packages same static web application. This replaces Unity direction from master brief because web app was explicit product decision.

## Folder layout

```text
src/
  app/       menu, Canvas renderer, HUD, debug UI, test bridge
  input/     keyboard/gamepad intent collection
  sim/       host authority, flight model, cabin physics, simulated transport
  data/      validated static Phase 1 cabin definitions
tests/       unit, integration and browser journeys
docs/        game, network, authoring, test and roadmap records
src-tauri/   optional Rust native shell
```

## Main systems

- `HostSession`: only owner of phase, flight, cabin objects, damage, reservation and events.
- `flight-model`: compact aircraft state; derives cabin acceleration without moving aircraft world coordinates.
- `cabin-simulation`: aircraft-local kinematic crew plus selective loose-object physics, friction, straps and collision impulses.
- `simulated-transport`: deterministic latency, jitter and packet loss harness for local host/client proof.
- `CabinMayhemApp`: presentation only; turns input into intention, reads snapshots and draws Canvas geometry.

## Data flow

```text
Keyboard/gamepad or local client
  -> PlayerCommand intent
  -> simulated transport (non-host)
  -> HostSession validation and fixed-step simulation
  -> MissionState snapshot
  -> Canvas HUD/debug presentation
```

## Dependencies

Runtime: no required online service. `zod` validates authored cabin data. Build/test: Vite, TypeScript, Vitest, Playwright, ESLint, Prettier. Optional desktop shell: Tauri v2, Rust and WebView2.

## Decisions

- Aircraft remains local; cabin responds to derived acceleration. Avoids large-coordinate precision and unstable fully-physical aircraft coupling.
- Only compact intent moves through transport; host creates authoritative state.
- Phase changes use one explicit transition function, never scattered flags.
- Canvas runtime geometry is project-owned placeholder art; no copied aviation-game content.

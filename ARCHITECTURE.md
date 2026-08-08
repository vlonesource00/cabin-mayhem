# Architecture

## Scope

Web/Tauri architecture for Cabin Mayhem under the cruise-ship premise
([ADR 0001](docs/adr/0001-cruise-ship-pivot.md)). Vite/browser is the
intentional platform choice; Tauri packages the same static web application.
Systems marked **planned** are designed and budgeted but not implemented; the
shipped code is still the airliner vertical at `79bb002`.

## Folder layout

```text
  src/
  app/       menu, 3D game shell, HUD, debug UI, test bridge
  audio/     procedural Web Audio beds and cues projected from mission state
  input/     keyboard/gamepad intent collection
  sim/       host authority, ship model, cabin physics, job/hazard rules, simulated transport
  network/   optional PeerJS/WebRTC room transport
  three/     Three.js world, GLB streaming, procedural fallback, characters, FPS camera, coordinates
  data/      validated compartment, guest, job, incident, obstacle and upgrade definitions
assets-src/  tracked Blender source assets and generators
public/      runtime assets and asset manifest
tests/       unit, integration and browser journeys
docs/        design, layout, performance, network, authoring, test and roadmap records
src-tauri/   optional Rust native shell
```

## Main systems

Existing, carried over:

- `HostSession`: only owner of phase, voyage, deck objects, guests, jobs, hazard
  state, score, damage, reservation and events.
- `cabin-simulation`: vehicle-local kinematic crew plus selective loose-object
  physics, friction, securing and collision impulses. Unchanged by the pivot; it
  reads derived acceleration and does not care what produces it.
- `simulated-transport`: deterministic latency, jitter and packet loss harness.
- `service-mission`: deterministic requests, finite inventory, guest pressure,
  delivery validation, scoring, terminal outcome. Generalises to guest requests
  across decks.
- `fire-response` / `repair-response`: authored hazard sites, host-validated
  tool/target/range/hold. Generalise into one hazard system covering fire,
  breach, breakdown and power loss.
- `PeerRoom`: two-player PeerJS/WebRTC adapter. Transports validated commands and
  ordered host snapshots; never owns simulation rules.
- `debrief`: pure result projection. Becomes the voyage debrief.
- `CabinMayhemApp`: presentation coordinator; turns input into intent and reads
  host snapshots.
- `CabinWorld`: Three.js world, lighting, GLB/procedural visuals, prop
  synchronisation, interaction raycast.
- `compartment-loader` / `CompartmentStreamer`: validate and load the authored
  compartment GLBs and keep the right rooms resident, falling back to greybox
  on failure.
- `FirstPersonController`, `interaction-animation`, `animated-rig`,
  `animation-contract`, `animation-state`: unchanged. The `CM_HUMANOID` skeleton
  and arms rig survive the pivot intact.
- `mission-audio` / `CabinAudio`: pure snapshot projections, no audio files.

Renamed:

- `flight-model` → `ship-model`: compact ship state — heading, rudder,
  telegraph, speed, momentum, sea state. Derives deck acceleration without
  moving the hull in world coordinates.

Planned:

- `ocean`: shader-displaced sea plane plus the matching simulation-side wave
  function that produces hull pitch, roll and heave.
- `helm`: bridge station, rudder and telegraph authority, obstacle avoidance
  validation.
- `obstacle-field`: authored and scheduled hazards on collision bearings, with
  time-to-impact, warnings and countdowns.
- `compartment-streaming`: portal-graph residency, async load, pre-warm, unload.
- `job-economy`: stock outlets, restocking, cleaning, housekeeping, medical.
- `defence`: boarder AI, deck weapon mounts, host-validated hits.
- `upgrades`: persisted currency and authored modifiers read by existing systems.

## Data flow

```text
Keyboard/gamepad or remote client
  -> PlayerCommand intent (movement, interaction, helm, weapon)
  -> SimulatedTransport or PeerRoom
  -> HostSession validation and fixed-step simulation
  -> voyage + ocean + deck + jobs + hazards + defence MissionState snapshot
  -> Three.js world + DOM HUD/debrief presentation + procedural audio
```

## Dependencies

Runtime: no required online service in solo mode. Two-player rooms use the free
PeerJS cloud for signaling and direct WebRTC data channels; TURN is optional.
`zod` validates authored compartment, job, incident and upgrade data.
Build/test: Vite, TypeScript, Vitest, Playwright, ESLint, Prettier. Optional
desktop shell: Tauri v2, Rust and WebView2.

## Decisions

- The hull stays at the local origin; decks respond to derived acceleration.
  This avoids large-coordinate precision loss over an ocean and unstable fully
  physical vehicle coupling. It is the same decision the aircraft used and the
  main reason the pivot is cheap.
- Only compact intent moves through transport; the host creates authoritative
  state.
- Phase changes use one explicit transition function, never scattered flags.
- Presentation is per-compartment GLB streamed against an authored portal graph.
  Procedural greybox remains the fallback for every compartment and continues to
  represent gameplay props, hazard effects and interaction proxies. A missing
  GLB never ends a voyage.
- Interaction is host-validated: the client selects a candidate, the host checks
  selection, stock, ownership, held item, request type, range and state.
- Rendering, animation, audio and debrief projection cannot mutate simulation
  state. The host alone resolves dodges, hazards, hits, score, outcome and
  replay reset.
- Performance budgets in [docs/PERFORMANCE.md](docs/PERFORMANCE.md) are gates,
  not guidance. Content that breaks them does not merge.

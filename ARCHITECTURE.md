# Architecture

## Scope

Web/Tauri architecture for Cabin Mayhem under the cruise-ship premise
([ADR 0001](docs/adr/0001-cruise-ship-pivot.md)). Vite/browser is the
intentional platform choice; Tauri packages the same static web application.
Systems marked **planned** are designed and budgeted but not implemented.

The pivot is done. The ship is authored — fourteen compartments plus the
exterior, streamed against a portal graph, described in
[docs/SHIP_LAYOUT.md](docs/SHIP_LAYOUT.md) and decided in
[ADR 0003](docs/adr/0003-ship-layout-redesign.md) and
[ADR 0004](docs/adr/0004-stair-tower-traversal.md). What remains from the
airliner build is the part that was always vehicle-agnostic: fixed-step host
authority, crew kinematics, loose-object physics and the interaction contract.

## Folder layout

```text
  src/
  app/       menu, 3D game shell, HUD, deck plan, debug UI, test bridge
  audio/     procedural Web Audio beds and cues projected from mission state
  input/     keyboard/gamepad intent collection
  sim/       host authority, ship model, cabin physics, job/hazard rules, simulated transport
  network/   optional PeerJS/WebRTC room transport
  three/     Three.js world, GLB streaming, procedural fallback, characters, FPS camera, coordinates
  data/      validated ship layout, guest, job, incident, obstacle and upgrade definitions
tools/
  blender/   deterministic headless build scripts for the exterior and every compartment
assets-src/  tracked Blender source assets from the airliner build
public/      runtime assets (one GLB per compartment, plus the exterior) and the manifest
tests/       unit, integration and browser journeys
docs/        design, layout, performance, network, authoring, test and roadmap records
docs/adr/    numbered architecture decisions
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
  compartment GLBs, keep the right rooms resident against the portal graph,
  apply the reduced-detail and exterior tiers, and fall back to greybox on
  failure. `dressLoadedMesh` is where transparency is made safe (see
  [docs/PERFORMANCE.md](docs/PERFORMANCE.md) §7).
- `ship-layout` (`src/data/`): the fourteen compartments, their extents,
  anchors, portals, glazing flags and budgets. Zod-validated, the single source
  of ship truth, and read by the streamer, the deck plan, the Blender build
  scripts' expectations and the validators alike.
- `deck-plan` (`src/app/`): a pure function from the layout data to an SVG
  string — ship in section, current deck in plan, occupied room marked. Held
  open with **N** during a voyage. It touches no DOM and no loaded GLB, which is
  what makes it testable in a suite with neither.
- `ocean` / `ocean-surface`: the summed-wave sea, evaluated on the simulation
  side for hull motion and in the vertex shader for the visible surface.
- `waypoint-travel` / `navigation-incident` / `navigation-obstacle-presenter`:
  the voyage's route, its scheduled hazards and their presentation.
- `ambient-crowd` / `boarding-invasion` and their presenters: host-authoritative
  guest and boarder populations, rendered through the character LOD tiers.
- `FirstPersonController`, `interaction-animation`, `animated-rig`,
  `animation-contract`, `animation-state`: unchanged. The `CM_HUMANOID` skeleton
  and arms rig survive the pivot intact.
- `mission-audio` / `CabinAudio`: pure snapshot projections, no audio files.

Renamed:

- `flight-model` → `ship-model`: compact ship state — heading, rudder,
  telegraph, speed, momentum, sea state. Derives deck acceleration without
  moving the hull in world coordinates.

Planned:

- `helm`: bridge station with rudder and telegraph authority, and host-validated
  obstacle avoidance. Today the bridge is a place; it is not yet a station.
- `job-economy`: stock outlets, restocking, cleaning, housekeeping, medical.
- `defence`: deck weapon mounts and host-validated hits on top of the existing
  boarder population.
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
- **Local view state never enters `PlayerCommand`.** Everything in that type is
  replicated to the other client and validated by the host, so a purely local
  affordance — the spectator camera, the dev drawer, the deck plan — lives on
  the app instead. Adding a field there to hold a UI toggle would spend
  bandwidth per tick and hand the host a rule it has no business enforcing.
- The exterior owns the shell and everything permanently outboard of or above a
  compartment; a compartment owns what stands on its own deck. Nothing is
  authored twice ([ADR 0003](docs/adr/0003-ship-layout-redesign.md)).
- Performance budgets in [docs/PERFORMANCE.md](docs/PERFORMANCE.md) are gates,
  not guidance. Content that breaks them does not merge.

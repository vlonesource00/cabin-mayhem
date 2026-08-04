# Handoff

## Current state

Cabin Mayhem is a browser-first Vite/Three.js cooperative game with an optional
Tauri/Rust Windows wrapper. The stable project branch is `novo-main-stable`.

**The premise changed.** The game is now a cruise ship, not an airliner. See
[ADR 0001](docs/adr/0001-cruise-ship-pivot.md) for what is kept, what is renamed
and what is retired. The documentation is rewritten for the ship. Implementation
has started on `new-idea-vlone`: the vocabulary is renamed and the ocean is in,
but every gameplay system below is still the airliner vertical.

What actually runs today, on top of the ocean:

- Automatic ground, taxi, takeoff, cruise, approach and landing progression.
- Host-authoritative cabin physics, service-cart stock, passenger requests,
  delivery validation, patience, panic, injury, score and mission outcome.
- A galley-fire objective with extinguisher ownership, aim and range validation.
- A deterministic breaker repair: carry the toolbox, aim, hold `E` for three
  uninterrupted seconds.
- An icon-first contextual HUD with a closed-by-default `F1` drawer.
- Free two-player PeerJS/WebRTC rooms, host-authoritative.
- A landing debrief with reviews and room-preserving replay.
- A Blender-authored static cabin GLB with runtime validation and automatic
  procedural fallback.
- Two Blender skeletal rigs — a shared 19-bone humanoid (25 clips) and a 7-bone
  first-person arms rig (19 clips) — on a Three.js `AnimationMixer` layer, each
  degrading independently to the procedural layer.

Roughly 40% of that runtime carries to the ship unchanged, 25% with a rename or
generalisation, and the rest is new.

## Last changes

Phase 5 step 2 added the ocean, on branch `new-idea-vlone`. `src/sim/ocean.ts`
holds one directional-sine wave table that is the single source of truth for the
water: the simulation evaluates it in TypeScript at four hull sample points to
fit pitch, roll and heave, and `oceanWaveGlsl()` generates the vertex-shader
version of the same function for `src/three/ocean-surface.ts`, so the two cannot
be edited apart. The hull holds the world origin — headway is stored as
`sea.drift`, the water sliding beneath it, and hull attitude is applied by
counter-rotating the ocean group about `hullCentreZ`. `SeaState` and `HullMotion`
are new fields on `VoyageState`; the commanded `pitch`/`roll` and
`cabinAcceleration` are deliberately untouched, so coupling the deck to the swell
is the motion model's job next.

Visible interior change: the cabin now has a horizon through the windows, so fog
thinned from `0.018` to `0.0042`, the background moved from near-black to sea
blue and the camera far plane went from 160 m to 2400 m.

Before that, Phase 5 opened with the mechanical rename. `FlightState`→`VoyageState`,
`FlightPhase`→`VoyagePhase`, `src/sim/flight-model.ts`→`src/sim/ship-model.ts`,
`PilotInput`→`HelmInput`, `MissionState.flight`→`voyage`,
`PlayerCommand.pilot`→`helm` and the `flight` event type→`voyage`. Behaviour is
unchanged: phase values are still the airliner set and every check reproduces the
`79bb002` baseline exactly.

Before that, documentation only. No runtime code changed.

- Added [ADR 0001](docs/adr/0001-cruise-ship-pivot.md) recording the pivot.
- Added [docs/PERFORMANCE.md](docs/PERFORMANCE.md): hard budgets and the twelve
  techniques that meet them. New content that breaks a budget does not merge.
- Added [docs/SHIP_LAYOUT.md](docs/SHIP_LAYOUT.md): six decks, ~25 compartments,
  the portal graph and the streaming residency rule.
- Rewrote `README.md`, `ARCHITECTURE.md`, `docs/GAME_DESIGN.md`,
  `docs/TECHNICAL_ARCHITECTURE.md`, `docs/NETWORK_MODEL.md`,
  `docs/TEST_PLAN.md`, `docs/CONTENT_AUTHORING.md`, `docs/assets.md`,
  `docs/assumptions.md`, `docs/ROADMAP.md`, `TODO.md` and `CONTRIBUTING.md` for
  the ship.
- Reconciled the revised project plan into those docs: real firearms alongside
  non-lethal defence, a `preparation` voyage phase, a one-to-four-player target,
  six upgrade lines, extra hazards and ship-failure events, modular Blender kit
  naming standards, and a mapping table between the plan's phase numbers and this
  repo's.

## Settled decisions

- **Camera: first person.** [ADR 0002](docs/adr/0002-first-person-camera.md).
  `CM_FPARMS_ROOT`, pointer lock and camera-forward raycasting all stay. No
  third-person camera, and no selectable one. Phase 6 is unblocked.

## Open decisions

- **Git LFS.** Not enabled. Decide before Phase 6 starts producing one GLB per
  compartment.
- **Blender version.** `passengers.blend` was written by 502.44 and warns of data
  loss in 5.1. Nothing gets skinned until both collaborators agree one version.
- **Restricted/hidden compartments.** Wanted, but no gating rule yet.

## Known problems and limits

- The cruise premise is mostly designed, not built. Phase 5 in
  [docs/ROADMAP.md](docs/ROADMAP.md) is the implementation slice in progress.
- The 1400 m sea plane is 156×156 segments with `frustumCulled = false`, and its
  GPU cost has not been measured against the
  [docs/PERFORMANCE.md](docs/PERFORMANCE.md) budgets on a low-end target.
- Loose-object collision is pairwise and O(n²). A uniform spatial-hash broadphase
  is a prerequisite for the second compartment, not an optimisation.
- Snapshot delta compression does not exist. Crews above two are blocked on it.
- The default Playwright suite does not run cloud multiplayer; the live room test
  is skipped unless `LIVE_MULTIPLAYER=1`. A manual two-browser playtest is still
  required.
- The character rigs are authored but never visually reviewed in motion at full
  frame rate. Clip poses are keyframed by script, so exaggeration and timing are
  the most likely second pass.
- The production JavaScript bundle still emits Vite's non-blocking `>500 kB`
  chunk warning.
- Windows installers are unsigned development artifacts.
- The passenger cast (`passengers.blend`) is 2257 loose, unrigged mesh objects.
  Shipping it as-is would be a draw-call explosion.

## Next recommended task

1. The ship motion model: heading, rudder, telegraph, momentum and turning
   radius, replacing the `airspeed * 0.5` placeholder in `updateVoyage` with real
   knots. This is where hull pitch/roll/heave finally couple into the deck
   through `cabinAcceleration`, and where the airliner phase values become
   `moored` → `preparation` → `departure` → `open-sea` → `approach` → `docked`.
2. Then the helm station with positional input authority.
3. Then greybox compartments behind the streaming loader and the portal graph.
4. Then the collision-course incident end to end — the slice that proves the
   whole design.

## Current verification

Run against the ocean slice on `new-idea-vlone`:

- `git diff --check`, Prettier check, ESLint, TypeScript, authored-data
  validation and asset validation pass. Asset validation covers 4 project-owned
  assets and both rigs (2 rigs, 44 authored clips).
- Unit: 115 tests pass, 19 of them new for the ocean. Integration: 2 tests pass.
- Playwright: 11 collected; 10 pass, 1 live-multiplayer test skipped without
  `LIVE_MULTIPLAYER`.
- Vite production build passes with the existing large-chunk warning.
- Tauri MSI and NSIS packaging passes; installers unsigned.
- Manual: dev server, no console errors, so the injected GLSL compiled. Driving
  the test bridge 600 fixed steps gives live non-zero hull motion on a calm sea
  (`pitch -0.0079`, `roll 0.0136`, `heave 0.180`) with `drift` still zero,
  correct for a ship at `airspeed: 0`.

## Verification commands

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm validate:data
pnpm validate:assets
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm desktop:build
```

For the optional live room smoke, set `LIVE_MULTIPLAYER=1` and use two browser
contexts with a reachable PeerJS/TURN path. Do not commit TURN credentials.

## Git handoff

Before changing code in a new conversation, run `git status --short --branch`,
`git log -5 --oneline --decorate` and inspect the actual diff. Preserve the
untracked `.codex-remote-attachments/` folder and do not stage it.
`novo-main-stable` is protected: every change lands through a pull request with
`verify` green and one approval. Do not assume a slice was committed or pushed
unless Git proves it.

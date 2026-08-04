# Handoff

## Current state

Cabin Mayhem is a browser-first Vite/Three.js cooperative game with an optional
Tauri/Rust Windows wrapper. The stable project branch is `novo-main-stable`.

**The premise changed.** The game is now a cruise ship, not an airliner. See
[ADR 0001](docs/adr/0001-cruise-ship-pivot.md) for what is kept, what is renamed
and what is retired. The documentation is rewritten for the ship. Implementation
has started on `new-idea-vlone`: the vocabulary is renamed, the ocean is in and
the ship handles like a ship, but every gameplay system below is still the
airliner vertical.

**Read this before looking at a screenshot.** The three slices done so far
replaced the simulation, not the geometry. The ship sails, but the compartment
the player stands in is still the airliner cabin, because replacing it is the
next slice (greybox compartments). That is expected, not a regression.

What actually runs today, on top of the ocean:

- Moored → preparation → departure → open-sea → approach → docked progression,
  driven by the telegraph rather than by a debug phase skip.
- A rate-command helm: the wheel and telegraph hold position, speed is in knots
  with a long deceleration tail, turning radius is emergent from steerage way,
  the hull heels outward in a turn and the swell is felt through the deck.
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

Phase 5 step 3 gave the ship real handling, on branch `new-idea-vlone`.
`src/sim/ship-model.ts` is now a rate-command helm: `HelmInput` carries
`rudder`/`telegraph` deltas plus `emergencyStop`, and the wheel and telegraph
positions live in `VoyageState` and hold where the crew left them. Speed is in
knots and responds asymmetrically — `0.09/s` building way, `0.032/s` shedding it,
`0.30/s` on a crash stop — so there are no brakes at sea. Turning radius is
emergent: rudder authority scales with steerage way, so a dead ship cannot steer
and sternway reverses the rudder, and the hull heels _outward_, opposite an
aircraft. `cabinAcceleration` now sums centripetal force with the `g·sin`
component of steering trim, heel and both sea-driven hull angles, plus the second
difference of heave, so loose props inherit the sea without any change to
`src/sim/cabin-simulation.ts`. The airliner phase values are gone: `moored` →
`preparation` → `departure` → `open-sea` → `approach` → `docked`, with
`foundered` as the failure terminal.

Controls: left/right arrows wind the wheel, `R`/`F` (or up/down arrows) work the
telegraph, `B` is the crash stop. The HUD's altitude field became a three-digit
bridge heading, and the camera couples hull pitch and roll.

Before that, Phase 5 step 2 added the ocean. `src/sim/ocean.ts`
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

1. **Greybox compartments — bridge, one corridor, one public room, engine room —
   behind the streaming loader and the portal graph.** This is the slice that
   retires the airliner cabin. It is deliberately first now: the simulation is
   already a ship, so the interior is the single largest remaining thing that
   still reads as the old game.
2. Then the helm station with positional input authority — the host accepts
   `HelmInput` only from a player standing in the bridge helm volume. It needs a
   bridge to stand in, which is why it follows the greybox.
3. Then the collision-course incident end to end — the slice that proves the
   whole design.

## Current verification

Run against the ship motion slice on `new-idea-vlone`:

- `git diff --check`, Prettier check, ESLint, TypeScript, authored-data
  validation and asset validation pass. Asset validation covers 4 project-owned
  assets and both rigs (2 rigs, 44 authored clips).
- Unit: 118 tests pass across 15 files, 6 of them rewritten for ship handling.
  Integration: 2 tests pass.
- Playwright: 11 collected; 10 pass, 1 live-multiplayer test skipped without
  `LIVE_MULTIPLAYER`.
- Vite production build passes with the existing large-chunk warning.
- Tauri MSI and NSIS packaging passes; installers unsigned.
- Manual: dev server, no console errors. Driving the test bridge to `open-sea`
  gives `speed 19` knots on `heading 082` with the wheel and telegraph holding
  position, which is the motion model running live in the browser rather than
  only under Vitest.
- Not yet done: nobody has looked at the sea through a window on screen. The
  camera starts facing down the cabin aisle and the windows are to the side, so
  the obvious screenshot shows interior. Verify this while doing the greybox
  slice, where the geometry changes anyway.

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

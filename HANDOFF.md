# Handoff

## Current state

Cabin Mayhem is a browser-first Vite/Three.js cooperative game with an optional
Tauri/Rust Windows wrapper. The stable project branch is `novo-main-stable`.

**The premise changed.** The game is now a cruise ship, not an airliner. See
[ADR 0001](docs/adr/0001-cruise-ship-pivot.md) for what is kept, what is renamed
and what is retired. The documentation is rewritten for the ship. Implementation
is underway on `new-idea-vlone`: the vocabulary is renamed, the ocean is in, the
ship handles like a ship, and the interior is now streamed ship compartments
rather than an aircraft cabin. The gameplay systems below — service, fire,
repair — are still the airliner vertical's, generalised but not yet replaced.

**The airliner geometry is gone.** Earlier handoffs warned that a screenshot
would show a fuselage. That is no longer true: `src/three/cabin-world.ts` has no
cabin, seat or overhead-bin geometry, `src/three/scenario-loader.ts` is deleted,
and the player stands in an authored compartment served by the streamer. The
room is no longer aircraft-sized either: the playfield and the atrium are both
24 m abeam by 46 m fore-and-aft, 12.8 m tall, at one metre per sim unit.

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
- Four Blender-authored ship compartments — `atrium`, `cabin-corridor-a`,
  `bridge`, `engine-room` — streamed by portal residency, contract-checked at
  load, each degrading independently to a greybox of the same dimensions.
- Two Blender skeletal rigs — a shared 19-bone humanoid (25 clips) and a 7-bone
  first-person arms rig (19 clips) — on a Three.js `AnimationMixer` layer, each
  degrading independently to the procedural layer.

Roughly 40% of that runtime carries to the ship unchanged, 25% with a rename or
generalisation, and the rest is new.

## Last changes

Phase 5 step 4 replaced the airliner interior with streamed ship compartments,
on branch `new-idea-vlone`. `src/data/ship-layout.ts` is a Zod-validated
compartment graph: four rooms, their sizes, deck numbers, world anchors, per-room
budgets and a symmetric portal pair per connection, plus `residency(origin)`,
which returns the occupied room and its one-hop neighbours at full detail and its
two-hop neighbours at reduced detail. `src/three/compartment-loader.ts` refuses a
GLB that lacks `CM_<ID>_ROOT`, that is missing a `CM_PORTAL_<TARGET>` empty for a
declared portal, or that exceeds its draw-mesh budget, and
`buildGreyboxCompartment()` stands in with the same footprint and the same
doorways when it does. `src/three/compartment-streamer.ts` owns residency: it
loads neighbours in the background, hides dressing but keeps the shell on
reduced-detail rooms, evicts what leaves the set, and reports `glb` or `fallback`
through `canvas.dataset.assetMode`. 198 lines of fuselage geometry and the whole
single-scenario loader are deleted.

The four rooms are generated deterministically by
`tools/blender/compartments/build_compartments.py` and merged by material, so the
draw-mesh count tracks materials rather than props: 13, 10, 13 and 10 against a
budget of 40. The atrium was authored twice. The first version put thirty-two
chairs on a two-aisle-two grid, which is an aircraft seating plan whatever the
room is called; it now has a lit feature column with a fourteen-step spiral stair
wrapped around it, fore and aft balconies that leave the middle open to the full
double height, a piano, a bar and eight angled armchairs standing exactly where
the simulation seats its guests. The remaining aeroplane vocabulary went with it:
`MS CABIN MAYHEM / DECK LOG`, `SAIL ANOTHER SHIFT`, a ship icon, and debrief
verdicts about ports rather than airports.

Before that, Phase 5 step 3 gave the ship real handling.
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
- **You cannot change compartments.** `src/three/cabin-world.ts` calls
  `setCurrent(defaultCompartmentId)` once at startup and nothing calls it again.
  There is no portal trigger volume, no input binding, and the simulation has no
  notion of which room a player occupies. The streamer, the portal graph and the
  four authored rooms are real and unreachable — the player is locked in the
  atrium, and the bridge and engine room have never been walked into.
- **There is no exterior.** Every authored compartment is a sealed interior box.
  No hull exterior, no promenade or sun deck, no pool, no balcony, no railings,
  funnels or lifeboats, and no window you can stand at and see the sea through.
  The ocean renders and the hull heels correctly, but from inside a room with no
  view. This is the largest gap against the "Scale and density" requirement in
  [docs/SHIP_LAYOUT.md](docs/SHIP_LAYOUT.md) and the reason the game still does
  not read as a cruise ship.
- **The ship is wide but not yet tall.** The atrium is now 24 m x 46 m x 12.8 m
  at `CABIN_SCALE = 1`, so the fuselage footprint is gone. Only four compartments
  exist across three of the twelve declared decks.
- **Two portals are stand-ins.** `atrium` <-> `bridge` and `cabin-corridor-a` <->
  `engine-room` should each pass through a stairwell across several decks. The
  stairwells are not authored, so the streamer links the rooms directly, which
  flatters both crew-movement timing and the residency set.
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

1. **Compartment traversal.** Put the occupied compartment in authoritative
   state, detect portal entry positionally in `HostSession`, remap the player
   into the destination room's local frame, and drive the streamer from the
   snapshot instead of from startup. Nothing else here is verifiable until you
   can walk out of the atrium.
2. **The stairwells, `stairwell-fwd` and `stairwell-aft`.** They retire the two
   stand-in portals and are the first rooms a player would reach unaided.
3. **The exterior and the open decks.** Hull exterior and superstructure,
   walkable promenade, pool deck and sun deck, balconies, real glazing so the
   sea is visible from inside, and exterior dressing — funnels, lifeboats,
   davits, deck furniture. All GLB. Exterior compartments see the ocean, the sky
   and the rest of the ship at once, so their budgets and LOD tiers belong in
   [docs/PERFORMANCE.md](docs/PERFORMANCE.md) before they are authored.
4. **The uniform spatial-hash broadphase.** Loose-object collision is pairwise
   and O(n²); this is a prerequisite for the second populated compartment, not
   an optimisation.
5. Then the helm station with positional input authority — the host accepts
   `HelmInput` only from a player standing in the bridge helm volume.
6. Then the collision-course incident end to end — the slice that proves the
   whole design.

## Current verification

Run against the compartment-streaming slice on `new-idea-vlone`:

- `git diff --check`, Prettier check, ESLint, TypeScript, authored-data
  validation and asset validation pass. Asset validation covers 7 project-owned
  assets, both rigs (2 rigs, 44 authored clips) and 4 compartments within budget.
- Unit: 133 tests pass across 17 files, including new suites for the ship layout,
  the compartment loader and the streamer. Integration: 2 tests pass.
- Playwright: 11 collected; 10 pass, 1 live-multiplayer test skipped without
  `LIVE_MULTIPLAYER`. The GLB-failure test now aborts the atrium request and
  asserts the greybox fallback.
- Vite production build passes with the existing large-chunk warning.
- Tauri MSI and NSIS packaging passes; installers unsigned.
- Manual: dev server, no console errors. `canvas.dataset` reads
  `assetMode: 'glb'`, `characterRig: 'glb'`, `armsRig: 'glb'`, and a browser
  screenshot of a solo shift shows the atrium — feature column, spiral stair,
  balconies — with no seat rows anywhere.
- Not yet done: nobody has looked at the sea through a window on screen, and no
  manual two-browser room playtest has been run against this slice.

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

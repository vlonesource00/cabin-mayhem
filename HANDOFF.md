# Handoff

> **Current status (2026-08-10):** This handoff is subordinate to
> [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md). Current checkpoint is
> `551c2f7`, pushed to `origin/luna-attempt-at-cruise-map-design`; unresolved
> runtime observations must not be promoted to fixes or shipped-visibility
> claims. Planned work is in [docs/ROADMAP.md](docs/ROADMAP.md).

## Current state

Cabin Mayhem is a browser-first Vite/Three.js cooperative game with an optional
Tauri/Rust Windows wrapper. The stable project branch is `novo-main-stable`.

**The premise changed, and the ship is built.** The game is a cruise ship, not an
airliner. See [ADR 0001](docs/adr/0001-cruise-ship-pivot.md) for what is kept,
what is renamed and what is retired. Current work is on
`luna-attempt-at-cruise-map-design`: the vocabulary is renamed, the ocean is in,
the ship handles like a ship, and the interior is fourteen streamed compartments
across eight occupied decks inside one always-resident hull exterior
([ADR 0003](docs/adr/0003-ship-layout-redesign.md),
[ADR 0004](docs/adr/0004-stair-tower-traversal.md)). The gameplay systems below —
service, fire, repair — are still the airliner vertical's, generalised but not
yet replaced.

**The airliner geometry is gone.** Earlier handoffs warned that a screenshot
would show a fuselage. That is no longer true: `src/three/cabin-world.ts` has no
cabin, seat or overhead-bin geometry, `src/three/scenario-loader.ts` is deleted,
and the player stands in an authored compartment served by the streamer. The
room is no longer aircraft-sized either: the playfield and the atrium are both
24 m abeam by 46 m fore-and-aft, 12.8 m tall, at one metre per sim unit.

What the current checkpoint establishes:

- First-person cruise-ship presentation with 14 Blender-authored compartments on
  8 decks, three stair towers, waypoint/elevator travel, and a bridge/commander
  room.
- Host-authoritative navigation and invasion slices, GLB crowd/invasion assets,
  and procedural bounded audio.
- Source crowd state creates 78 residents across 8 zones, but normal packaged
  NPC visibility is not proven. Focused E2E `showCrowd()` teleport is not normal
  startup evidence.
- A 2026-08-10 user screenshot shows no atrium NPCs and a HUD mismatch:
  `MOORED` alongside `IMPACT: HYDRAULICS DAMAGED`. Source defaults and trigger
  gates do not explain that runtime state yet; no root cause or fix is claimed.
- A 290 m ship: fourteen Blender-authored compartments from the engine room on
  deck 0 to the navigating bridge on deck 9, plus `ship-exterior.glb` — hull,
  sheer, superstructure, balconies, windows, funnels, masts, lifeboats and
  davits — resident from the first frame. Streamed by portal residency,
  contract-checked at load, each degrading independently to a greybox of the
  same dimensions.
- Three stair towers (aft decks 0–9, midship 1–9, forward 5–9) as the ship's
  only vertical connection, and a 260 m promenade as the horizontal one.
- Three exterior compartments you can stand on in the weather — promenade, lido
  pool deck, sun deck — and real glazing, so the sea is visible from inside.
- The deck plan on **N**: the ship in section and the current deck in plan, at
  true scale, drawn from the layout data rather than from anything loaded.
- Two Blender skeletal rigs — a shared 19-bone humanoid (25 clips) and a 7-bone
  first-person arms rig (19 clips) — on a Three.js `AnimationMixer` layer, each
  degrading independently to the procedural layer.

Roughly 40% of that runtime carries to the ship unchanged, 25% with a rename or
generalisation, and the rest is new.

## Last changes

**The ship.** `src/data/ship-layout.ts` is now one vessel rather than a list of
rooms: origin amidships on the centreline at the waterline, +X starboard, +Y up,
+Z bow; LOA 290, beam 38, draught 8.4, air draught 45;
`deckFloorY(deck) = deck × 3.2 − 7.2` across ten numbered decks, eight of them
occupied; and one beam curve `halfBeamAt(z)` read by the exterior builder, the
deck-edge geometry and the deck plan alike, so all three agree by construction.
Fourteen compartments hang off that, from `engine-room` on deck 0 to `bridge` on
deck 9, with the atrium four decks tall and the well punched through it.
[ADR 0003](docs/adr/0003-ship-layout-redesign.md) records the ownership rule that
makes it work: the exterior owns the shell and everything permanently outboard of
or above the compartment volumes, a compartment owns what stands on its own deck,
and nothing is authored twice.

`tools/blender/exterior/build_exterior.py` produces the one always-resident
`ship-exterior.glb` — hull plating and sheer, superstructure, tier on tier of
balconies, windows, funnels, masts, lifeboats and davits — joined into a
`STRUCTURE` mesh and a `DRESSING` mesh so the X0/X1/X2 tiers in
[docs/PERFORMANCE.md](docs/PERFORMANCE.md) §5 can drop dressing and then the
whole group as the crew move inboard. `bridge` declares `panoramic: true` and
pins X0 from indoors, because you can see the entire foredeck from it.

**Traversal.** The two stand-in portals are gone. Three stair towers — aft
(decks 0–9, eight landings), midship (1–9, six) and forward (5–9, three) — are
the only vertical connection in the ship, no room-to-room portal crosses a deck,
and the 260 m promenade reaches all three
([ADR 0004](docs/adr/0004-stair-tower-traversal.md)). Towers are deliberately the
leanest compartments aboard: standing on a landing makes eight rooms one hop
away, so a tower earns its detail from its own stairs, rails and signage.

**Glazing.** `glass_clear` exports `alphaMode: BLEND` at 0.17 opacity and
`dressLoadedMesh` makes it safe — `depthWrite = false`, `side = FrontSide`
because Blender's exporter writes `doubleSided: true` on every material, and no
shadow casting or receiving, because a shadow map has no notion of opacity. The
sea is visible from the atrium, the dining room, the cabin decks and the bridge.

**The deck plan.** Hold **N** during a voyage: the ship in section and the
current deck in plan, at one true scale. It is a pure function from the layout
data to an SVG string — it touches no DOM and no loaded GLB, which is what makes
it testable in a suite that has neither. It is app state, never a
`PlayerCommand` field; nothing local-only is replicated.

Fresh evidence for this slice: all fourteen compartments rebuilt headlessly in
Current evidence is recorded in
[`docs/CURRENT_STATUS.md`](docs/CURRENT_STATUS.md): `pnpm build` passed data
validation, asset validation, TypeScript checking, and Vite; elevated
`pnpm desktop:build` passed and produced the Windows EXE, MSI, and NSIS bundles;
37 live unit files and 262 tests passed with archived bridge worktrees excluded.

The following historical notes explain how an earlier Phase 5 step replaced the airliner interior with streamed ship compartments;
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

- **Git LFS.** Not enabled. Fifteen GLBs are tracked in the repo and the largest
  is 8 MB, so it is not urgent — but decide before the resort spaces land.
- **Blender version.** `passengers.blend` was written by 502.44 and warns of data
  loss in 5.1. Nothing gets skinned until both collaborators agree one version.
- **Restricted/hidden compartments.** Wanted, but no gating rule yet.

## Known problems and limits

- **The interior design pass is the open quality bar.** The exterior reads as a
  ship. The insides need the same standard — placement that answers to a service
  route, a sightline or a queue rather than props scattered at scale, no stair to
  nowhere, no clipping. Nothing about this is a checklist item; it is judged by
  walking the ship.
- **Nothing has been seen running.** This is the single largest verification gap
  in the project. `requestAnimationFrame` never fires in the agent environment,
  so no frame time, draw-call count, triangle count or texture-memory figure in
  [docs/PERFORMANCE.md](docs/PERFORMANCE.md) has been measured — they are budgets,
  not observations. The perf smoke test has to be run by a human on hardware.
- The 1400 m sea plane is 156×156 segments with `frustumCulled = false`, and its
  GPU cost is part of that unmeasured set.
- Repeated exterior and compartment dressing is authored as joined static
  geometry, not instanced. The instancing sweep is deferred until the smoke test
  says where the cost actually is.
- Loose-object collision is pairwise and O(n²). Not blocking at current
  per-compartment object counts, but it is the known fix when it bites.
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

1. **Walk the ship.** Everything below is guesswork until someone with a working
   `requestAnimationFrame` walks from the tank top to the bridge: the interior
   design pass, the perf smoke test and the frame budget all resolve on the same
   playthrough. Nothing in the agent environment can substitute for it.
2. **The interior design pass**, informed by that walk. Rooms designed rather
   than filled, no stair to nowhere, no clipping, placement that makes sense.
3. **The perf smoke test and the runtime counters** — frame time, draw calls,
   triangles, texture memory and mixer count along an authored route through
   every deck. This is Phase 6's one real gap.
4. **More of the ship.** Fourteen compartments is the working vessel, not the
   ceiling. Candidates and the four tolls each one pays are at the end of
   [docs/SHIP_LAYOUT.md](docs/SHIP_LAYOUT.md).
5. Then the task economy — Phase 7 in [docs/ROADMAP.md](docs/ROADMAP.md) — which
   is what turns fourteen rooms into fourteen places with work in them.

## Current verification

Run against the ship slice on `luna-attempt-at-cruise-map-design`:

- Blender 5.1.2 rebuilt all fourteen compartments headlessly, exit 0, 39.08 MB
  total, 12–17 draw meshes each against a rail of 320. Draw meshes are a
  **material** count — geometry is joined per material at export — so that number
  does not track prop density.
- `pnpm validate:data`: 14 compartments on 8 decks, all inside a 290 × 38 m hull,
  34 doorways paired, reachable and loop-free. A stair that goes nowhere would be
  a failing test here, not something a player finds.
- `pnpm validate:assets`: 27 project-owned assets, both rigs (44 authored clips)
  and 14 rooms within budget.
- TypeScript clean. Unit: 234 tests across 35 files, including the ship layout,
  the compartment loader, the streamer and the deck plan.
- Vite production build passes with the existing large-chunk warning.
- Tauri MSI and NSIS packaging passes; installers unsigned.
- **Not done, and not doable from here:** nothing has been seen rendering.
  `requestAnimationFrame` never fires in the agent environment, so there is no
  screenshot of the ship, no frame-time measurement, and no manual two-browser
  room playtest against this slice. Scope any run of the suite with
  `--exclude "**/.codex-app-task-bridge/**"`; that folder holds frozen full-repo
  snapshots that vitest would otherwise collect.

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

## Current Luna slice: navigation incident

Date: 2026-08-08. Worktree baseline: `b9c6ec7c6d36a7c1fec8f0000f2c8fb342d11aef`.
This slice is intentionally uncommitted and remains on the detached worktree.

Implemented in the scoped files:

- deterministic collision-course state with warning/countdown and relative
  north-shoal contact;
- bridge/command-center presence validation for helm input, including remote
  rejection and stale disconnected-input protection;
- host-owned +35 avoidance bonus or impact damage/score loss;
- authored engine-room steering-relay repair requiring toolbox ownership,
  compartment, range and hold action; completion restores hydraulics and scores;
- PeerRoom snapshot validation, HUD/world warning and repair presentation, debug
  trigger, unit/integration/network/UI coverage;
- authored Blender 5.1 vessel source/GLB production path, loaded as the normal
  obstacle renderer with a tested procedural load-failure fallback;
- centralized current-interactable feedback coverage and honest north-star
  documentation separating this implemented slice from planned invasions,
  crowds, jobs and further Blender/GLB map expansion.

Final evidence for this slice: typecheck, lint, data/assets validation, 165 unit
tests, 4 integration tests, production build and 12 Playwright tests passed;
the default browser suite has one explicit live-multiplayer skip. The opt-in
PeerJS smoke was attempted but remained `waiting` through its 20-second connect
poll in this environment. Ignored screenshots are under
`test-results/navigation-evidence/`. `git diff --check` is clean and only the
scoped files are changed. Never commit or touch the parent recovery stash. The
current relay marker is a presentation/interaction aid; it does not replace the
authored bridge or engine-room GLBs.

## Current V2 slice: authored boarding invasion presentation

Date: 2026-08-09. The existing host-owned boarding state now reaches the player:

- `src/three/invasion-presenter.ts` loads and contract-checks all eight invasion
  GLBs, clones skeletal boarders safely, attaches weapons/explosives at authored
  sockets, stages links and hostiles deterministically in the promenade frame,
  and drives Blender Actions solely from snapshot phase/status;
- `CabinWorld` exposes invasion asset source, phase, visibility and hostile count
  for browser evidence without feeding presentation back into simulation;
- the shared incident HUD now shows invasion warning/approach timers, hostile
  count, passenger injuries, infrastructure integrity and link-detachment goal;
- `boardInvasion()` is a deterministic test-only bridge path that advances the
  normal bounded host tick cadence and frames the promenade encounter;
- `tests/unit/invasion-presenter.test.ts` covers the authored production path and
  explicit partial fallback; Playwright captures
  `test-results/invasion-evidence/pirates-aboard-promenade.png`.

Fresh combined evidence: typecheck and lint pass; 197 unit and 5 integration
tests pass; data and 27-asset validation pass; production build passes with the
existing large-chunk warning; Playwright reports 13 pass and one intentionally
skipped live-multiplayer case. The opt-in PeerJS smoke still leaves the host in
`waiting`, so two physical Windows 11 PCs on different networks are not proven.
Combat AI, hit resolution, bomber search/disarm, crowds, cruise jobs and the full
massive ship remain future work.

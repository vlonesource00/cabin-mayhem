# Handoff

## Current state

Cabin Mayhem is a browser-first Vite/Three.js cooperative game with an optional
Tauri/Rust Windows wrapper. The stable project branch is `novo-main-stable`.

**The premise changed.** The game is now a cruise ship, not an airliner. See
[ADR 0001](docs/adr/0001-cruise-ship-pivot.md) for what is kept, what is renamed
and what is retired. The documentation is rewritten for the ship; **none of the
cruise premise is implemented yet.**

What actually runs today is the airliner vertical at `79bb002`:

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

Documentation only. No runtime code changed.

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

- The cruise premise is designed, not built. Phase 5 in
  [docs/ROADMAP.md](docs/ROADMAP.md) is the first implementation slice.
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

1. Start Phase 5 with the mechanical rename commit: `FlightState`→`VoyageState`,
   `FlightPhase`→`VoyagePhase`, `flight-model.ts`→`ship-model.ts`,
   `PilotInput`→`HelmInput`. Nothing else in that commit.
2. Then the ocean: shader-displaced sea plane plus the identical wave function on
   the simulation side, with hull pitch/roll/heave derived from it.
3. Then the ship motion model and the helm station.
4. Then the collision-course incident end to end — the slice that proves the
   whole design.

## Current verification

The last runtime evidence is for the airliner line through `79bb002`:

- `git diff --check`, Prettier check, ESLint, TypeScript, authored-data
  validation and asset validation pass. Asset validation covers 4 project-owned
  assets and both rigs (2 rigs, 44 authored clips).
- Unit: 96 tests pass. Integration: 2 tests pass.
- Playwright: 11 collected; 10 pass, 1 live-multiplayer test skipped without
  `LIVE_MULTIPLAYER`.
- Vite production build passes with the existing large-chunk warning.
- Tauri MSI and NSIS packaging passes; installers unsigned.

The pivot changed documentation only, so these results still stand.

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

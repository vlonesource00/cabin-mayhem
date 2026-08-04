# Next conversation prompt

Copy everything inside the block below into a new conversation with this
repository selected.

```text
[$single-executor](C:\\Users\\Martim Costa\\.codex\\skills\\single-executor\\SKILL.md)

Continue Cabin Mayhem in this repository:
C:\\Users\\Martim Costa\\Desktop\\nigger\\Dear Passengers clone

GitHub repository:
https://github.com/vlonesource00/cabin-mayhem

Stable project branch:
novo-main-stable (protected: pull request, `verify` green, one approval)

Cabin Mayhem is an original cooperative cruise-ship game. Vite + TypeScript +
Three.js are the game runtime; Tauri v2 + Rust wrap the same web build as a
Windows EXE. Do not convert it to another engine or a 2D/top-down game.

The premise changed from an airliner to a cruise ship. Read
docs/adr/0001-cruise-ship-pivot.md first. The documentation describes the ship;
the code still implements the airliner. That gap is expected, not a bug.

Before changing code:
1. Run `git status --short --branch`, `git log -5 --oneline --decorate`, then
   inspect the actual diff. Preserve uncommitted work, especially
   `.codex-remote-attachments/` — never stage it.
2. Read `README.md`, `ARCHITECTURE.md`, `HANDOFF.md`, `TODO.md`,
   `docs/adr/0001-cruise-ship-pivot.md`, `docs/GAME_DESIGN.md`,
   `docs/SHIP_LAYOUT.md`, `docs/PERFORMANCE.md`,
   `docs/TECHNICAL_ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/TEST_PLAN.md`,
   `docs/CONTENT_AUTHORING.md` and `docs/assets.md`.
3. Inspect `src/sim/types.ts`, `src/sim/host-session.ts`,
   `src/sim/ship-model.ts`, `src/sim/cabin-simulation.ts`,
   `src/sim/service-mission.ts`, `src/sim/fire-response.ts`,
   `src/sim/repair-response.ts`, `src/network/peer-room.ts`,
   `src/three/cabin-world.ts`, `src/three/scenario-loader.ts`,
   `src/three/animated-rig.ts`, `src/app/cabin-mayhem-app.ts` and the tests.
4. Trust current code, tests, Git and CI over stale prose. Keep docs current when
   implementation changes.

What runs today (the airliner vertical at 79bb002):
- Walkable pointer-lock Three.js interior with deterministic host-authoritative
  vehicle and cabin physics.
- Host-authoritative service-cart pickup/delivery, passenger requests,
  patience/panic/injury, scoring and mission outcome.
- Galley fire with extinguisher ownership/aim/range validation.
- Breaker repair: carry the toolbox, aim, hold `E` for three uninterrupted
  seconds.
- Icon-first neon HUD with a closed-by-default `F1` development drawer.
- Free two-player PeerJS/WebRTC rooms, host-only authority, ordered snapshots.
  The default E2E suite skips the cloud smoke unless `LIVE_MULTIPLAYER=1`.
- Landing debrief with reviews and room-preserving replay.
- Blender-authored static cabin GLB with validated loading and procedural
  fallback.
- Procedural Web Audio; the repository ships no audio files.
- Two Blender skeletal rigs: a shared 19-bone humanoid (25 clips) and a 7-bone
  first-person arms rig (19 clips), on a Three.js `AnimationMixer` that
  crossfades snapshot-selected clips and layers upper-body actions by disjoint
  track masking. Each rig falls back independently, reported through
  `data-character-rig` and `data-arms-rig`.

Settled: the camera is first person (docs/adr/0002-first-person-camera.md). No
third-person camera and no selectable one. `CM_FPARMS_ROOT`, pointer lock and
camera-forward interaction raycasting all stay.

Open decisions to resolve before building interiors:
- Git LFS, before one GLB per compartment starts landing.
- One Blender version. `passengers.blend` was written by 502.44 and warns of data
  loss in 5.1; nothing gets skinned until this is settled.

Done in Phase 5: the mechanical rename. `VoyageState`, `VoyagePhase`,
`HelmInput`, `src/sim/ship-model.ts`, `MissionState.voyage`, `PlayerCommand.helm`
and the `voyage` event type are the current names. Phase *values* are still the
airliner set (`ground`/`taxi`/`takeoff`/`cruise`/`approach`/`landed`/`crashed`);
they change with the ship motion model, not before.

Immediate task — Phase 5 in docs/ROADMAP.md, in this order:
1. Ocean: shader-displaced sea plane plus the identical wave function evaluated
   on the simulation side at hull sample points. Hull pitch, roll and heave
   derived from it.
2. Ship motion model: heading, rudder, telegraph, speed, turning radius,
   momentum. Derived deck acceleration feeds the existing cabin simulation
   unchanged through `cabinAcceleration`.
3. Greybox compartments — bridge, one corridor, one public room, engine room —
   behind the streaming loader and the portal graph.
4. Helm station with positional input authority.
5. The collision-course incident end to end: host spawns the obstacle, every
   client shows the same warning and countdown, a player must physically reach
   the bridge, the host validates the avoidance, clearing throws loose objects,
   missing breaches the hull.

Exit condition: the ship moves on an ocean, you can steer it, and two players can
dodge one iceberg together.

Important rules:
- `HostSession` is authoritative. UI and Three.js may request interaction but
  never determine success. Animation never decides whether a dodge, repair,
  delivery, suppression or hit succeeds.
- The hull never translates in world coordinates. The ocean, obstacle field and
  horizon move relative to a stationary hull.
- Helm authority is positional: the host accepts `HelmInput` only from a player
  standing in the bridge helm volume.
- Client raycasts choose a candidate only; the host validates ownership, tool,
  target and range.
- Keep authored data Zod-validated and fixed-step behaviour deterministic.
- Keep GLB loading non-authoritative with a usable greybox fallback.
- Every compartment must meet its budget in docs/PERFORMANCE.md before it merges.
- Loose-object collision is pairwise O(n²). A uniform spatial-hash broadphase is
  a prerequisite for the second compartment.
- Snapshot delta compression is a prerequisite for crews above two.
- Never commit TURN credentials.

Verification, all of it, every slice:
git diff --check, pnpm format:check, pnpm lint, pnpm typecheck,
pnpm validate:data, pnpm validate:assets, pnpm test:unit, pnpm test:integration,
pnpm test:e2e, pnpm build, pnpm desktop:build (close any running
cabin-mayhem.exe first). Report the live room smoke separately; it needs
LIVE_MULTIPLAYER=1.

Last recorded evidence, for the airliner line through 79bb002:
- Format, lint, typecheck, data validation and asset validation pass. Asset
  validation covers 4 project-owned assets and both rigs (2 rigs, 44 clips).
- 96 unit tests pass; 2 integration tests pass; 11 Playwright tests collected,
  10 passing, 1 live-multiplayer test skipped without LIVE_MULTIPLAYER.
- Vite production build passes with a non-blocking large-chunk warning.
- Tauri MSI and NSIS packaging passes; installers unsigned.
- Manual two-browser room play and in-motion review of the authored clips remain
  pending.
```

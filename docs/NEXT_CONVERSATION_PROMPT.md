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

Working branch:
new-idea-vlone — all cruise implementation lands here. Do not merge into
novo-main-stable without being told to.

Cabin Mayhem is an original cooperative cruise-ship game. Vite + TypeScript +
Three.js are the game runtime; Tauri v2 + Rust wrap the same web build as a
Windows EXE. Do not convert it to another engine or a 2D/top-down game.

The premise changed from an airliner to a cruise ship. Read
docs/adr/0001-cruise-ship-pivot.md first. The documentation describes the whole
ship. The code has the renamed vocabulary, the ocean and a real ship motion
model; every gameplay system and all of the interior geometry underneath are
still the airliner. That gap is expected, not a bug.

Read this before you look at the game or judge a screenshot: the three slices
done so far replaced the simulation, not the geometry. The ship genuinely sails,
but the compartment the player stands in is still the airliner cabin, because
replacing it is the very next slice. Do not spend time testing gameplay inside
the fuselage — build the greybox compartments instead.

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

Done in Phase 5:
1. The mechanical rename. `VoyageState`, `VoyagePhase`, `HelmInput`,
   `src/sim/ship-model.ts`, `MissionState.voyage`, `PlayerCommand.helm` and the
   `voyage` event type are the current names.
2. The ocean. `src/sim/ocean.ts` holds one directional-sine wave table that is
   the single source of truth: the simulation evaluates it in TypeScript at four
   hull sample points to fit `HullMotion` (pitch, roll, heave), and
   `oceanWaveGlsl()` generates the vertex-shader copy used by
   `src/three/ocean-surface.ts`, so the two cannot be edited apart. `SeaState`
   (`drift`, `swell`) and `HullMotion` are new `VoyageState` fields. The hull
   holds the world origin; headway is recorded as `sea.drift`.
3. The ship motion model. `src/sim/ship-model.ts` is a rate-command helm:
   `HelmInput` carries `rudder`/`telegraph` deltas plus `emergencyStop`, and the
   wheel and telegraph positions live in `VoyageState` and hold where the crew
   left them. Speed is in knots with an asymmetric response (`0.09/s` building
   way, `0.032/s` shedding it, `0.30/s` crash stop), so there are no brakes at
   sea. Turning radius is emergent from steerage way: a dead ship cannot steer,
   sternway reverses the rudder, and the hull heels outward, opposite an
   aircraft. `cabinAcceleration` sums centripetal force, the g-sine component of
   trim, heel and both hull angles, and the second difference of heave;
   `src/sim/cabin-simulation.ts` is untouched. Phase values are now `moored`,
   `preparation`, `departure`, `open-sea`, `approach`, `docked`, with
   `foundered` as the failure terminal. Controls: arrows left/right wind the
   wheel, `R`/`F` work the telegraph, `B` crash stops.

Immediate task — Phase 5 in docs/ROADMAP.md, in this order:
1. **Greybox compartments: bridge, one corridor, one public room, engine room,
   behind the streaming loader and the portal graph. Start here.** This is the
   slice that retires the airliner cabin, and it is the largest remaining thing
   that still reads as the old game. Author against docs/SHIP_LAYOUT.md and the
   eye height fixed by docs/adr/0002-first-person-camera.md, keep GLB loading
   non-authoritative with a usable greybox fallback, and hold each compartment to
   its docs/PERFORMANCE.md budget. The uniform spatial-hash broadphase is a
   prerequisite for the second compartment, not an optimisation.
2. Helm station with positional input authority: the host accepts `HelmInput`
   only from a player standing in the bridge helm volume. It needs a bridge to
   stand in, which is why it follows the greybox.
3. The collision-course incident end to end: host spawns the obstacle, every
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

Last recorded evidence, for the ship motion slice on new-idea-vlone:
- git diff --check, format, lint, typecheck, data validation and asset validation
  pass. Asset validation covers 4 project-owned assets and both rigs (2 rigs, 44
  clips).
- 118 unit tests pass across 15 files, 6 of them rewritten for ship handling; 2
  integration tests pass; 11 Playwright tests collected, 10 passing, 1
  live-multiplayer test skipped without LIVE_MULTIPLAYER.
- Vite production build passes with a non-blocking large-chunk warning.
- Tauri MSI and NSIS packaging passes; installers unsigned.
- Manual: driving the test bridge to open-sea gives 19 knots on heading 082 with
  the wheel and telegraph holding position, so the motion model runs live in the
  browser, not only under Vitest.
- Still pending: nobody has seen the sea through a window on screen (the camera
  starts facing down the aisle and the windows are to the side), manual
  two-browser room play, and in-motion review of the authored clips.
```

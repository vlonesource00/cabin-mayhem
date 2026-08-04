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
docs/adr/0001-cruise-ship-pivot.md first. The simulation is a ship, the interior
is ship compartments, and the gameplay systems underneath (service, fire, repair)
are still the airliner vertical's, generalised but not yet replaced. That gap is
expected, not a bug.

The airliner geometry is gone. src/three/cabin-world.ts has no fuselage, seat or
overhead-bin geometry and src/three/scenario-loader.ts is deleted. The room is no
longer aircraft-sized either: the playfield and the atrium are both 24 m abeam by
46 m fore-and-aft, 12.8 m tall, at one metre per sim unit.

Two things are missing that the documentation has been implying are present, and
they are the whole of the immediate task. Read them before believing any other
claim in this prompt:

- **You cannot change compartments.** `src/three/cabin-world.ts` calls
  `this.compartments.setCurrent(defaultCompartmentId)` once at startup and
  nothing calls it again. There is no portal trigger volume, no input binding,
  and `grep -rn "compartment" src/sim/` returns a single comment — the
  simulation has no concept of which room a player occupies. The streamer, the
  portal graph and the four authored rooms are all real and all unreachable. The
  player is hard-locked in the atrium; the bridge and engine room have never
  been walked into.
- **There is no exterior and no cruise-ship exterior life.** Every authored
  compartment is a sealed interior box. No hull exterior, no open promenade or
  sun deck, no pool, no balcony, no railings, no funnels, no lifeboats, and no
  window you can actually stand at and see the sea through. The ocean renders
  and the hull heels correctly, but from inside a room with no view. "Cruise
  ship" so far means the vocabulary, the physics and the portal graph — not the
  place.

Before changing code:
1. Run `git status --short --branch`, `git log -5 --oneline --decorate`, then
   inspect the actual diff. Preserve uncommitted work, especially
   `.codex-remote-attachments/` — never stage it.
2. Read `README.md`, `ARCHITECTURE.md`, `HANDOFF.md`, `TODO.md`,
   `docs/adr/0001-cruise-ship-pivot.md`, `docs/adr/0002-first-person-camera.md`,
   `docs/GAME_DESIGN.md`, `docs/SHIP_LAYOUT.md`, `docs/PERFORMANCE.md`,
   `docs/TECHNICAL_ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/TEST_PLAN.md`,
   `docs/CONTENT_AUTHORING.md` and `docs/assets.md`.
3. Inspect `src/sim/types.ts`, `src/sim/host-session.ts`,
   `src/sim/ship-model.ts`, `src/sim/ocean.ts`, `src/sim/cabin-simulation.ts`,
   `src/sim/service-mission.ts`, `src/sim/fire-response.ts`,
   `src/sim/repair-response.ts`, `src/network/peer-room.ts`,
   `src/data/ship-layout.ts`, `src/three/coordinates.ts`,
   `src/three/cabin-world.ts`, `src/three/compartment-loader.ts`,
   `src/three/compartment-streamer.ts`, `src/three/animated-rig.ts`,
   `src/app/cabin-mayhem-app.ts`, `tools/blender/compartments/` and the tests.
4. Trust current code, tests, Git and CI over stale prose. Keep docs current when
   implementation changes.

What runs today on new-idea-vlone:
- A rate-command helm. The wheel and telegraph hold position, speed is in knots
  with a long deceleration tail, turning radius is emergent from steerage way,
  the hull heels outward in a turn, and `B` is a crash stop. Phases are moored,
  preparation, departure, open-sea, approach, docked, with foundered as failure.
- An ocean. `src/sim/ocean.ts` holds one directional-sine wave table that is the
  single source of truth: the simulation evaluates it at four hull sample points
  to fit pitch, roll and heave, and `oceanWaveGlsl()` generates the vertex-shader
  copy, so the water seen and the water fitted to cannot desynchronise. The hull
  holds the world origin; headway is `sea.drift`.
- Streamed compartments. `src/data/ship-layout.ts` is a Zod-validated portal
  graph of four rooms (atrium, cabin-corridor-a, bridge, engine-room).
  `compartment-loader.ts` refuses a GLB missing `CM_<ID>_ROOT`, missing a
  `CM_PORTAL_<TARGET>` empty, or over its draw-mesh budget, and greyboxes it
  instead. `compartment-streamer.ts` keeps the occupied room and one-hop
  neighbours at full detail, two-hop at reduced detail with dressing hidden,
  evicts the rest, and reports `glb`/`fallback` on `canvas.dataset.assetMode`.
  The rooms are generated by `tools/blender/compartments/build_compartments.py`,
  merged by material to 10-13 draw meshes against a budget of 40.
- Host-authoritative cabin physics, service-cart stock, passenger requests,
  delivery validation, patience, panic, injury, score and mission outcome.
- A galley-fire objective with extinguisher ownership, aim and range validation.
- A breaker repair: carry the toolbox, aim, hold `E` for three seconds.
- Icon-first neon HUD with a closed-by-default `F1` drawer, and a debrief with
  reviews and room-preserving replay.
- Free two-player PeerJS/WebRTC rooms, host-only authority, ordered snapshots.
  The default E2E suite skips the cloud smoke unless `LIVE_MULTIPLAYER=1`.
- Procedural Web Audio; the repository ships no audio files.
- Two Blender skeletal rigs: a shared 19-bone humanoid (25 clips) and a 7-bone
  first-person arms rig (19 clips), on a Three.js `AnimationMixer` that
  crossfades snapshot-selected clips and layers upper-body actions by disjoint
  track masking. Each rig falls back independently, reported through
  `data-character-rig` and `data-arms-rig`.

Settled: the camera is first person (docs/adr/0002-first-person-camera.md). No
third-person camera and no selectable one.

Open decisions:
- Git LFS. Four compartment GLBs totalling ~3.4 MB are landing as tracked binary,
  and the exterior work will multiply that. Decide before the fifth room.
- One Blender version. `passengers.blend` was written by 502.44 and warns of data
  loss in 5.1; nothing gets skinned until this is settled.
- Gating for restricted compartments.

Immediate task — make it an actual cruise ship you can walk around, in this
order. Do not start at step 3; steps 1 and 2 are what make the rest visible.

1. **Compartment traversal.** Put the occupied compartment in authoritative
   state: a `compartmentId` per player on `PlayerState`, owned by `HostSession`
   like every other fact. Author a walkable connector volume per portal, have
   the host detect entry positionally and reassign the player, and drive
   `CompartmentStreamer.setCurrent` from the snapshot rather than from startup.
   The player's sim-space position must be remapped into the destination room's
   local frame on transition — today `src/three/coordinates.ts` assumes one room
   at a fixed `COMPARTMENT_ORIGIN_Z`, and that assumption has to go. Nothing else
   on this list is verifiable until you can walk out of the atrium.
2. **Author the stairwells: `stairwell-fwd` and `stairwell-aft`.** They retire
   the two stand-in portals, correct the distances in `src/data/ship-layout.ts`,
   and are what makes the declared deck count something the crew feels. With
   step 1 done these are the first rooms a player reaches on their own.
3. **The exterior and the open decks — the largest gap and the reason the game
   does not look like a cruise.** Everything authored so far is a sealed
   interior. Author, all in GLB, held to docs/PERFORMANCE.md:
   - a hull exterior and superstructure, seen from the open decks and readable
     as a ship from outside;
   - walkable open deck compartments: a promenade running the ship's length, a
     pool deck with pools, loungers, bar and railings, and a sun deck;
   - balconies on the cabin decks, and cabin interiors that open onto them;
   - real windows and glazing — the atrium, corridors, restaurants and the
     bridge all need to see the sea, which means the ocean must be visible from
     inside a compartment and the interior fog and far plane retuned for it;
   - exterior dressing: funnels, lifeboats, davits, masts, deck furniture,
     signage, rigging and lighting.
   Exterior compartments are a different streaming case from interior ones: they
   see the ocean, the sky and the rest of the ship at once, so their budgets and
   LOD tiers need stating in docs/PERFORMANCE.md before they are authored, not
   after.
4. **The uniform spatial-hash broadphase.** Loose-object collision is pairwise
   and O(n²); this is a prerequisite for the second populated compartment, not
   an optimisation.
5. Helm station with positional input authority: the host accepts `HelmInput`
   only from a player standing in the bridge helm volume. Step 1 is what makes
   "standing in the bridge" possible at all.
6. The collision-course incident end to end: host spawns the obstacle, every
   client shows the same warning and countdown, a player must physically reach
   the bridge, the host validates the avoidance, clearing throws loose objects,
   missing breaches the hull.

Exit condition: you can walk from the atrium out onto an open deck, see the ship
and the sea around you, climb to the bridge, steer, and dodge one iceberg with a
second player.

Also outstanding:
- Snapshot delta compression. Crews above two players are blocked on it.
- The 1400 m sea plane is 156x156 segments with `frustumCulled = false` and its
  GPU cost has never been measured against docs/PERFORMANCE.md on a low-end target.

Important rules:
- `HostSession` is authoritative. UI and Three.js may request interaction but
  never determine success. Animation never decides whether a dodge, repair,
  delivery, suppression or hit succeeds.
- The hull never translates in world coordinates. The ocean, obstacle field and
  horizon move relative to a stationary hull.
- Helm authority is positional.
- Client raycasts choose a candidate only; the host validates ownership, tool,
  target and range.
- Keep authored data Zod-validated and fixed-step behaviour deterministic.
- Keep GLB loading non-authoritative with a usable greybox fallback.
- Everything is authored in GLB. Procedural geometry is the fallback, never the
  shipped look.
- Every compartment must meet its budget in docs/PERFORMANCE.md before it merges.
- Snapshot delta compression is a prerequisite for crews above two.
- Never commit TURN credentials.

Verification, all of it, every slice:
git diff --check, pnpm format:check, pnpm lint, pnpm typecheck,
pnpm validate:data, pnpm validate:assets, pnpm test:unit, pnpm test:integration,
pnpm test:e2e, pnpm build, pnpm desktop:build (close any running
cabin-mayhem.exe first). Report the live room smoke separately; it needs
LIVE_MULTIPLAYER=1.

Last recorded evidence, for the compartment-streaming slice on new-idea-vlone:
- git diff --check, format, lint, typecheck, data validation and asset validation
  pass. Asset validation covers 7 project-owned assets, 2 rigs with 44 clips, and
  4 compartments within budget.
- 133 unit tests pass across 17 files; 2 integration tests pass; 11 Playwright
  tests collected, 10 passing, 1 live-multiplayer test skipped without
  LIVE_MULTIPLAYER.
- Vite production build passes with a non-blocking large-chunk warning.
- Tauri MSI and NSIS packaging passes; installers unsigned.
- Manual: a browser screenshot of a solo shift shows the atrium with its feature
  column, spiral stair and balconies, `assetMode: 'glb'`, and no seat rows.
- Still pending: nobody has seen the sea through a window on screen, nobody has
  ever left the atrium, no manual two-browser room playtest against this slice,
  and no in-motion review of the authored clips.
```

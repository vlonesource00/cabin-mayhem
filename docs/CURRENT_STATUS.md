# Current Status

**Date:** 2026-08-11  
**Base checkpoint:** `551c2f775e8050421502745f68901e56b9365cde` (`551c2f7`)  
**Published ref:** `origin/luna-attempt-at-cruise-map-design`

This page is the source of truth for the current first-person cruise-ship
checkpoint. The attached large cruise proposal is roadmap inspiration only; it
does not establish shipped functionality. Planned work remains in
[`ROADMAP.md`](ROADMAP.md).

## Status vocabulary

- **Implemented** means present in the checkpoint or supported by the evidence
  listed here.
- **Observed-but-unresolved** means seen in a user/runtime observation without a
  verified root cause or fix.
- **Not implemented / proof gap** means planned, incomplete, or not freshly
  demonstrated by the required evidence.

## Implemented at this checkpoint

- First-person cruise-ship runtime with 14 Blender-authored compartments on 8
  decks, three stair towers, waypoint/elevator travel, and a bridge/commander
  room.
- GLB crowd and invasion assets, host-authoritative navigation and invasion
  slices, and procedural bounded audio.
- Build evidence: `pnpm build` passed data validation, asset validation,
  TypeScript checking, and Vite. Elevated `pnpm desktop:build` passed and
  produced `src-tauri/target/release/cabin-mayhem.exe`, an MSI, and NSIS
  bundles.
- Live unit evidence: 37 live unit files and 262 tests passed, with archived
  bridge worktrees excluded.

### NPC implementation truth

`createAmbientCrowdState` creates 78 residents across 8 zones. `CabinWorld`
calls `AmbientCrowdPresenter.sync`. Crowd instances are created only after the
async `loadRig(characterRigId)` resolves. The load catch only sets
`data-character-rig=fallback`; it does not expose a visible error. The presenter
also applies residency and 96 m culling, a 24-instance cap, and fades.

The older E2E crowd proof used the test-only `showCrowd()` teleport to
`pool-deck`, which proved the focused test path rather than normal-start
visibility. `tests/e2e/ambient-crowd-normal-start.spec.ts` now covers the
normal start without any teleport.

## Resolved runtime issues (2026-08-11)

Both issues previously listed here as observed-but-unresolved now have a
verified root cause, a fix, and a normal-start regression test:
`tests/e2e/ambient-crowd-normal-start.spec.ts`. That test never teleports. It
starts the app, waits for the authored rig, and reads the atrium the crew
actually spawns in.

### NPC visibility — the host spawned inside the scenic lift car

> **Correction (2026-08-11).** The paragraph that used to open this section
> claimed the crowd "was always present and always drawn" on the strength of
> `data-crowd-visible=24`. That conclusion was wrong, and the metric behind it
> was worthless: `visibleCount()` returns `this.instances.size`, i.e. instances
> **allocated**, not meshes drawn. The crowd was allocated and never submitted
> to a render list. See "NPC visibility — the material shape" below for the
> real root cause. The spawn-inside-the-lift-car bug recorded here was real and
> is fixed, but it was a second, independent fault, not the reason the ship
> looked empty.

`data-crowd-residents=78`, `data-crowd-asset=glb`, `data-character-rig=glb`,
`data-crowd-floating-count=0`, `data-crowd-contact-max=0.000` at a clean start.
A headless run of the real `AmbientCrowdPresenter` against the real
`cabin-mayhem-characters.glb` returned every instance `visible: true`,
`opacity: 1`, contact error 3.6e-15 — all true, and all compatible with a
crowd that is never drawn.

The camera also could not see the room. `createCabinState` spawned `crew-alpha` at
playfield `(12, 6.5)`. The atrium is 24 x 46 with its aft bulkhead at
playfield y 0, so that is authored ship `(0, -16.5)` — inside the solid
`lift_car` cube `build_atrium` places over authored z -16.85..-14.55 on the
centreline. The host started boxed inside a brass box with backfaces culled,
which reads as a dark grey slab and an empty room. `crew-bravo` at `(12, 39)`
was authored z +16, inside the grand stair flight (authored z 10.60..17.00).

Fix: both crew now spawn on the centreline walk `build_atrium` deliberately
keeps clear — alpha on the sole medallion (authored z -6), bravo on the forward
runner (authored z +8). The spec asserts the authored z of the spawn is outside
both the lift car and the stair flight.

Density is unchanged and is a separate design question: the atrium zone holds
10 of the 78 residents across 24 x 46 m, so a single forward view frames only a
few of them.

### NPC visibility — the material shape (the real root cause)

Guests were invisible in every compartment, on both the normal start and the
`showCrowd()` teleport, while every observable property read healthy: `visible`,
`opacity`, `transparent`, `colorWrite`, `layers`, `frustumCulled`, bone count,
bind matrix, and posed world bounds. Thirteen rounds of elimination found
nothing because none of those properties is the one that was wrong.

`applyAmbientNpcStyle` cloned each mesh's materials through `source.map(...)`
and assigned the resulting **array** back to `entry.material`. three.js
`WebGLRenderer.projectObject` branches on `Array.isArray(material)`: for an
array it walks `geometry.groups` and pushes one render item per group; for a
scalar it pushes the object directly. The exporter splits the four-material body
into four **single-primitive** meshes, and a single-primitive geometry declares
no `geometry.groups` — so the loop had nothing to iterate and the mesh was
silently dropped from every render list while still reporting `visible: true`.
`crew-bravo` rendered throughout because the player rigs never pass through
`applyAmbientNpcStyle`.

Two probes isolated it: magenta unlit marker boxes added to the crowd group
_did_ draw (so the group, the transforms and the placement were fine), and
swapping in a scalar `MeshBasicMaterial` made full green humanoids appear (so
the geometry, skinning and submission were fine). The console carried no shader
errors, ruling out a compile failure.

Fix, in `src/three/ambient-npc-style.ts`: remember whether the source was an
array and restore that shape — `entry.material = wasArray ? cloned : cloned[0]!`.

The same investigation exposed a second bug in the same function. The palette
slot was chosen by array index, but because each primitive carries exactly one
material every mesh saw `index === 0`, so every guest was painted head-to-toe in
`palette.skin` and shirt, trousers and hair were never applied. The slot is now
resolved from the authored material name (`cm_pax_skin`, `cm_pax_shirt`,
`cm_pax_trousers`, `cm_pax_accent`; `cm_crew_*` for crew).

**Metric correction.** `data-crowd-visible` cannot guard this and never could —
it counts allocated instances. `data-crowd-drawn-meshes` was added alongside it
and counts ambient meshes the renderer actually drew last frame, tallied from
`onAfterRender`, which three.js fires from `renderObject` only after the mesh has
survived projection, frustum culling and material setup.
`tests/e2e/ambient-crowd-normal-start.spec.ts` asserts it is above zero, and
`tests/unit/ambient-npc-style.test.ts` asserts a single-material primitive stays
scalar and that the four name-keyed slots land on four different colours.

### NPC orientation — toes pointed backwards

Two faults that cancelled out on the face and therefore hid each other.

`tools/blender/build_character_rig.py` placed the head's face plate on Blender
−Y and the seated lap strap likewise, while both foot boxes and both foot bones
(`foot.L`/`foot.R`, tails at ±0.11, **+0.17**, 0.05) point +Y. The exporter maps
Blender (x, y, z) to glTF (x, z, −y), so the feet arrived on three.js −Z — the
project's forward — and the face on +Z.

The presenters then compounded it: `ambient-crowd-presenter.ts` and
`cabin-world.ts`'s crew-bravo peer used `Math.atan2(facing.x, facing.y)` where
the ship-wide convention, set in `src/sim/compartment-space.ts`, is
`Math.atan2(-dx, -dz)` for a −Z-forward model. The two errors are a half turn
apart, so the _face_ ended up pointing along travel and the feet trailed behind.

Both halves are fixed together — the face plate and lap strap moved to +Y and
the GLB re-exported, and both yaws switched to the negated form. Because the net
rotation change is exactly π and the model flipped by exactly π, absolute
hand-tuned yaws on the `CM_*` rig needed +π: the seated service passengers in
`cabin-world.ts` are now `Math.PI + (toPort ? -0.08 : 0.08)`. Relative seat
`yawOffset` leans in `src/data/ambient-crowd.ts` were unaffected.
`invasion-presenter.ts` was checked and left alone — hostiles come from a
separate asset pack, not `cabin-mayhem-characters.glb`.

### Navigation and hydraulics state mismatch — a CSS cascade bug

Not a state bug. `state.navigation.phase` is `idle` and `voyage.phase` is
`moored` at a clean start, exactly as the source defaults say, and
`cabin-mayhem-app.ts` correctly sets `navigationAlert.hidden = true`. But
`.navigation-alert` declared `display: grid` with no `[hidden]` companion rule,
so the author declaration outranked the user-agent `[hidden] { display: none }`
and the panel never hid. Its `navigationAlertTitle` idle fall-through is
`IMPACT: HYDRAULICS DAMAGED`, which is what the permanently-visible panel
showed next to the `MOORED` chip. `.debrief[hidden]` already carried the same
guard.

Fix: `.navigation-alert[hidden] { display: none; }` in `src/styles.css`. The
node-environment unit suite cannot catch this class of bug — a JS-level
`hidden` assertion passes while the pixel is still on screen — so the guard is
a Playwright `toBeHidden()` assertion in the normal-start spec.

### End-to-end suite — three separate causes, none of them a runtime defect

The suite reported 9 failing specs at this checkpoint. Stashing the source
changes above and re-running reproduced the same failures at an untouched
`551c2f7`, so none of them were a regression from the two fixes. They decomposed
into three causes:

- **Parallel-worker contention (4 of the 9).** The default worker count spawned
  competing Chromium instances against one dev server. `--workers=1` alone
  dropped the count from 9 to 5. Not a code defect; the config already declares
  `fullyParallel: false`.
- **Timeouts sized for the old single-cabin scenario (4 specs).** Every spec
  boots the whole 14-compartment ship plus the resident exterior before it does
  any work, which costs roughly 25 s against an unbundled dev server even on a
  real GPU. The 30 s default left nothing for the test itself. The config now
  allows 90 s with a 10 s local `expect`, and the long journeys raise their own
  budget: the two waypoint specs to 180 s, the impact-HUD and pool-deck crowd
  specs to 120 s.
- **Two stale test contracts (2 specs).** `waypoint-navigation` searched the
  portal option _id_ for `main-galley`, but a stairwell pass-through id encodes
  only the tower and two indices — `door-option:atrium:stairwell:stairwell-aft:0:2`
  — so the match could never succeed. It now resolves the id out of
  `data-portal-pad-options`, whose entries are `id:label:Ddeck`. And
  `cabin-mayhem` pinned `data-crowd-visible` to `12`, the pool-deck zone's own
  resident count; `residency('pool-deck')` also admits the sun deck and
  promenade within 96 m, so the presenter's 24-instance budget is the real
  ceiling. That assertion is now a >= 12 / <= 24 range.

Evidence: `npx playwright test --workers=1` gives 20 passed, 1 skipped, 0
failed in 9.6 m. The skip is the two-browser WebRTC room test, skipped by
design. `pnpm test:integration` passes 136 tests across 28 files. `pnpm build`
and `pnpm desktop:build` both pass; the desktop build produced a fresh
`cabin-mayhem.exe`, MSI, and NSIS installer.

`pnpm test:unit` reports 3 failures out of 5984, all three inside frozen
`.codex-app-task-bridge/worktrees/` snapshots that predate the current
`ship-layout` portal ordering. The live `tests/unit` tree is green. Scope
ad-hoc runs to avoid sweeping the archives.

## Not implemented / proof gaps

- No two-Windows-11-machines, separate-network multiplayer proof.
- No hardware performance smoke.
- No full playable task economy, disaster, combat, or progression loop.
- No spawn audit for the other 13 compartments. The atrium spawn defect was
  authored-geometry drift: playfield coordinates that predate the cruise map
  were never re-checked against what `build_compartments.py` now puts there.
  Only the atrium has been checked.

## Prioritized next actions

1. Audit the remaining debug-teleport and arrival positions against authored
   geometry the same way the atrium spawn was, so no other view starts inside a
   prop.
2. Run the two-machine, two-network room gate and hardware performance smoke.
3. Decide whether the atrium's 10-resident zone density is enough for the ship's
   front room now that the view is unobstructed.
4. Track the larger task-economy, disaster, combat, and progression work in the
   roadmap; do not infer it from the cruise proposal.

## Preserved state

Protected Claude baseline remains unchanged: branch
`claude-protected-pre-luna-cruise-map-2026-08-09` and `stash@{0}` both remain at
`0df1d45c7a173e02f1cd859d19220a53d3cdedfc`.

The generated `.codex-app-task-bridge/state/threads.json` remains untouched.
The requested uncommitted artifact `artifacts/bridge-commander-room-preview-open.png`
was not present in this detached worktree; no artifact was created or removed.

## Related documents

Use this page with [`ROADMAP.md`](ROADMAP.md), [`TEST_PLAN.md`](TEST_PLAN.md),
and [`SHIP_LAYOUT.md`](SHIP_LAYOUT.md). Historical ADR decisions remain
unchanged.

# Codex hand-off — ship-wide collider manifest and geometry audit

Copy everything below the line into Codex. It is written to stand alone.

---

## Task

Cabin Mayhem (`luna-attempt-at-cruise-map-design`) has no real collision. Give the
whole ship authored colliders that come from the same source of truth as the
geometry, and produce an audit of the geometry faults that collision cannot hide.

Player-reported symptoms, all confirmed in code:

- You can walk straight through most props and bulkhead furniture.
- You can walk into thin air where nothing is drawn.
- Props are embedded inside other props and inside the hull.
- Some drawn objects have no collision at all.

## Why it is broken today

`src/sim/cabin-simulation.ts` only resolves furniture in a single compartment:

```ts
const field = playfieldFor(player.compartmentId);
const intended = clampToPlayfield(add(player.position, scale(velocity, dt)), playerRadius, field);
// The atrium is the only compartment whose furniture the simulation knows
// about; the rest collide against their own bulkheads until their fixtures
// are authored.
const position =
  player.compartmentId === 'atrium'
    ? resolveCabinFixtures(intended, player.position, playerRadius)
    : intended;
```

The other 13 compartments get playfield clamping only — a rectangle, nothing
else. And the atrium's own list, `cabinFixtures` in the same file, is a
**hand-copied** mirror of what Blender authors:

```ts
/**
 * The atrium's solid furniture, in metres on the 24 x 46 playfield. These
 * mirror what `tools/blender/compartments/build_compartments.py` authors, so
 * the crew collides with the furniture they can see and nothing else.
 */
```

Three structural problems follow from that:

1. **Two sources of truth.** Every Blender edit silently desynchronises the
   collision. The atrium list already omits the scenic lift car and the grand
   stair, which is how a spawn ended up *inside* the lift car.
2. **No height.** `resolveCabinFixtures` is a 2D AABB slide-resolver (x-only,
   then y-only, then `pushToNearestEdge`). It cannot express "walk under the
   stair", "step over the coaming", or "the railing stops at 1.12 m", so any
   naive extension of it walls off doorways and stair undersides.
3. **Prop identity is destroyed at export.** `kit.export()` calls
   `join_by_material(root)` before writing the GLB, so the runtime asset has no
   per-prop objects left to derive colliders from. Colliders must be captured
   during authoring, before that join.

## Ship coordinate facts you need

- Origin amidships on the centreline at the waterline. **+X starboard, +Y up,
  +Z bow.** `deckFloorY(deck) = deck * 3.2 - 7.2` (`kit.deck_floor_y`).
- A compartment's `anchor` in `src/data/ship-layout.ts` is its **centre**.
- Playfield to ship: `ship x = playfieldX - width / 2`,
  `ship z = playfieldY - length / 2`. The atrium is 24 x 46, so authored
  `x = playfieldX - 12`, `z = playfieldY - 23`.
- Model forward is **−Z**. Yaw convention is `Math.atan2(-dx, -dz)`
  (`src/sim/compartment-space.ts:229`, `:255`).
- 14 compartments: 11 rooms built by `build_*` functions in
  `tools/blender/compartments/build_compartments.py` (`engine-room`,
  `crew-corridor`, `main-galley`, `atrium`, `dining-room`, `cabin-deck-four`,
  `cabin-deck-seven`, `promenade`, `pool-deck`, `sun-deck`, `bridge`) plus 3
  stair towers built from `TOWERS` via `kit.stair_tower` (`stairwell-aft`,
  `stairwell-mid`, `stairwell-fwd`).

## Hard constraints

- **The simulation is deterministic and replicated at a fixed 1/60 s step.**
  Collider data must be identical on host and client and must be loaded before
  the first tick. `cabinFixtures` is also consumed by `src/net/host-session.ts`
  (~line 306) — keep host and client resolving against the same data.
- **Never add local-only view state to `PlayerCommand`.** It is replicated.
- TypeScript runs with `noUncheckedIndexedAccess`. Authored data is
  Zod-validated — follow the existing pattern in `src/data/ship-layout.ts`.
- Blender is **5.1.2, headless, not on PATH**:
  `"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --python <script>`.
  A full 14-compartment rebuild takes **over 10 minutes** — budget for it.
- `python` is **not** on this machine. Use `node -e` for scripted file surgery.
- There is no `pnpm test`. The scripts are `lint`, `typecheck`, `format:check`,
  `validate:data`, `validate:assets`, `test:unit`, `test:integration`,
  `test:e2e`, `build`, `desktop:build`.
- `pnpm test:unit` sweeps `.codex-app-task-bridge/worktrees/`, which holds ~10
  frozen full-repo snapshots. It reports ~3 failures that live **only** inside
  those archives. Ignore those; do not "fix" them.
- Do not merge into `novo-main-stable`. Never commit TURN credentials. Never
  stage `.codex-remote-attachments/`.

## Deliverable 1 — emit a collider manifest from Blender

Extend `tools/blender/compartments/kit.py` so authoring records colliders, and
have `kit.export()` write them out **before** `join_by_material` runs.

- Capture each solid object's world-space AABB (`minX/maxX, minY/maxY,
  minZ/maxZ`) in compartment-local coordinates, plus a `kind` tag.
- Tag at authoring time, not by guessing afterwards. Suggested kinds:
  `solid` (blocks at all heights), `low` (step-over, e.g. coamings, kerbs),
  `overhead` (a ceiling for headroom, walk under freely), `rail`
  (waist-height barrier), `stair` (a walkable ramp, give it a rise/run),
  `trigger` (no collision, e.g. portal pads), `none` (decorative).
- `kit.cube`, `kit.cylinder`, `kit.prism`, `kit.railing`, `kit.stair_tower` and
  `kit.shell` are the choke points — default them sensibly so the eleven
  builders need minimal editing, and allow an explicit override argument.
- Write one JSON per compartment next to the GLB. Keep it small: merge adjacent
  identical-height boxes, and drop anything fully contained in another collider.

## Deliverable 2 — load and resolve it in the sim

- Add a Zod-validated loader for the manifests, mirroring `src/data/ship-layout.ts`.
- Replace the `player.compartmentId === 'atrium'` gate with a lookup that works
  for all 14 compartments. Delete the hand-mirrored `cabinFixtures` array once
  the manifest covers the atrium — do not leave both alive.
- Make the resolver **height-aware**: the player is a capsule (use the existing
  `playerRadius` and the eye height already in the controller). A collider only
  blocks when its Y span overlaps the capsule's span, so `overhead` never blocks
  walking, `low` is stepped over, and `stair` raises the floor instead of
  blocking. Keep the existing slide behaviour for the horizontal case.
- Keep it deterministic: no `Math.random`, no wall-clock, no iteration over an
  unordered `Set`/`Map` whose order could differ between peers.
- Point `src/net/host-session.ts` at the same resolver.

## Deliverable 3 — the geometry audit (report, do not silently "fix")

Write a script that reads the authored compartments and reports, per compartment:

1. **Prop-inside-prop** — pairs of `solid` colliders whose AABBs overlap by more
   than a small tolerance. Some overlap is legitimate (a table leg into a
   plinth); rank by overlap volume and report the worst.
2. **Prop-outside-shell** — any collider extending past the compartment's own
   playfield or below its floor / above its deckhead. These are the objects
   sticking through the hull.
3. **Drawn but not solid** — meshes above a size threshold that carry `none`.
   These are the "no collision inside other objects" cases.
4. **Solid but not drawn** — colliders with no corresponding drawn mesh.
5. **Stairs to nowhere** — `stair` colliders whose top landing does not meet a
   walkable surface or a portal.

Output a markdown report at `docs/GEOMETRY_AUDIT.md`. Fix the clear-cut faults
in the Blender builders; list the judgement calls for the user to rule on.

### Known lead to check first

`house_aft` is a capped prism spanning roughly world z −100…−16 at about x ±15.4,
from y 18.4 to 21.46. The `pool-deck` compartment's world extent is
z ∈ [−70, 49]. Those overlap over z −70…−16. Confirm in Blender whether the pool
deck is actually intersecting the aft deckhouse; the user's standing rule is
**"ensure there's no z clipping"**.

## Evidence to produce before you report done

Run each once:

```
pnpm typecheck
pnpm lint
pnpm validate:data
pnpm validate:assets
pnpm test:unit
pnpm test:integration
npx playwright test --workers=1
pnpm build
```

The Browser preview pane **cannot** verify this game — the page does not
composite while the pane is hidden, so rAF never fires. Playwright is the only
live-verification path, and it cannot drive mouse-look (pointer lock hangs
`page.mouse.move`). Drive movement through `window.__CABIN_MAYHEM_TEST__`.

Add at least one e2e that walks the player into a known solid prop in a
**non-atrium** compartment and asserts the position stops. Prefer assertions
backed by something the renderer actually did over counters that merely count
allocations — `data-crowd-visible` reported a full crowd for days while nothing
was being drawn, which is why `data-crowd-drawn-meshes` now exists.

## Do not

- Convert the project to another engine, or to a 2D/top-down game.
- Introduce a physics engine. The sim is a hand-rolled deterministic stepper and
  must stay that way.
- Widen the scope into the interior art pass; that is tracked separately.

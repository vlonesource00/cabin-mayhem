# Ledger — MS Cabin Mayhem hull redesign

Branch: `luna-attempt-at-cruise-map-design`. Base at slice start: `bcc9dd9`.

## Goal

Replace the four-box stand-in layout with a real cruise ship: one hull-referenced
coordinate frame, decks stacked on the 3.2 m pitch inside a 290 m x 38 m x 45 m
envelope, exterior and interior authored together, and portals that are doors and
stair towers inside that hull rather than teleports between disconnected boxes.

## Acceptance criteria

1. `src/data/ship-layout.ts` declares every compartment in hull-referenced ship
   space: origin amidships on the waterline, +X starboard, +Y up, +Z bow.
2. Every compartment floor sits on `deckFloorY(deck) = deck * 3.2 - 7.2` and
   inside the hull envelope; `pnpm validate:data` fails if it does not.
3. Every portal pair resolves to the same world point in ship space (<= 0.05 m);
   `pnpm validate:data` fails if it does not. This is the invariant the old
   layout violated by 68 m.
4. Vertical traversal exists: three stair towers (aft, mid, forward) whose
   portals are at different heights within one compartment, so the crew climbs
   between decks without leaving the hull.
5. Exterior exists and is always resident: hull, superstructure, funnels,
   lifeboats, masts, railings, authored as a GLB outside the portal graph.
6. Open-deck compartments exist and are walkable: promenade, pool deck, sun deck.
7. Cabin decks have balconies; interior rooms have glazing that shows the sea.
8. The crew can change compartment: `compartmentId` is host-owned state on
   `PlayerState`, entry is positional, and `CompartmentStreamer.setCurrent` is
   driven from the snapshot, not from startup.
9. Full verification suite green.

## Non-goals for this slice

- New gameplay verticals (pirates, tsunami, birds, mall stock, upgrades). They
  are roadmap items and stay in `docs/ROADMAP.md`.
- Spatial-hash broadphase, helm positional authority, collision-course incident.
  They come after the ship is walkable.
- Skinned character work; the Blender version question is still open.
- Git LFS migration; decide separately, note the growth.

## Decisions

- **D1. Ship space is the only frame.** Origin amidships at the waterline, +X
  starboard, +Y up, +Z bow. LOA 290 (z in [-145, 145]), beam 38 (x in [-19, 19]),
  draught 8.4 (hull bottom y = -8.4), air draught 45.
- **D2. Deck datum.** `deckFloorY(deck) = deck * 3.2 - 7.2`. Deck 0 tank top at
  -7.2 (1.2 m double bottom), deck 2 main at -0.8, deck 5 promenade at +8.8
  (freeboard deck), deck 8 lido at +18.4, deck 9 bridge/sun at +21.6.
- **D3. The compartment box is a streaming extent, not a collision hull.**
  Walkability comes from geometry and host rules. This is why the promenade may
  declare the full 38 x 260 m footprint while only its outer ring is walked.
- **D4. Stair towers are single tall compartments.** One compartment spans many
  decks and carries portals at different local `y`. That is what makes the ship
  read as stacked instead of as a flat graph.
- **D5. The exterior is not a compartment.** `shipLayout.exterior` is a separate
  always-resident asset with its own larger budget, because it is visible from
  every open deck and from every window.
- **D6. The atrium keeps its 24 x 46 m footprint.** The simulation playfield,
  fixtures, guests, fire and repair positions are authored against it; moving it
  would churn gameplay data for no design gain.
- **D7. The exterior owns the shell.** Everything permanently outboard of or
  above the compartment volumes belongs to `ship-exterior.glb`; a compartment
  owns only what stands on its own deck. A horizontal plate spanning the hull at
  a height a compartment occupies is an ownership violation, not a detail.
- **D8. Doors are opened, not walked into.** Proximity publishes
  `PlayerState.pendingDoor` (host-derived, so both players read the same prompt
  off the same snapshot); the transit itself waits on `PlayerCommand.interact`.
  No new field was added to `PlayerCommand`, so nothing extra is replicated.
- **D9. The playfield frame is corrected at the controller, not the mapping.**
  `playfieldHeading` recovers, by finite difference on `simToCompartmentLocal`,
  the world yaw that playfield +y actually faces; the controller subtracts it
  before converting the stick. A stair tower's playfield is its flights
  unrolled, so world-forward reverses twice per deck — this is what made the
  stairs fight the camera. The difference is taken on one side of a landing lip
  only, because straddling one averages two opposite directions.
- **D10. Arriving turns the view into the room.** `arrivalHeading` gives the
  yaw from doorway to arrival point; the renderer applies it when it notices
  `compartmentId` changed, not on the frame the field appears, because a
  multi-substep catch-up can swallow that frame.
- **D11. Asset budgets are rails, not gates.** `maxDrawMeshes` 320 and
  `maxBytes` 24 MB per compartment, 640 / 48 MB for the exterior. They sit well
  above a fully dressed room and exist to catch a broken export, not to shape a
  design. The runtime budgets in `docs/PERFORMANCE.md` (frame time, draw calls,
  triangles, texture memory) remain gates.
- **D12. Glass is made safe at load, not at export.** `dressLoadedMesh` sets
  `depthWrite = false`, forces `side = FrontSide` because Blender's glTF
  exporter writes `doubleSided: true` on every material, and disables shadow
  casting and receiving, because a shadow map has no notion of opacity.
- **D13. Local view state never enters `PlayerCommand`.** The deck plan (**N**)
  is app state. Everything in `PlayerCommand` is replicated per tick and
  validated by the host; a UI toggle is neither.

## Files touched

- `.ordo/ledger.md` (new)
- `src/data/ship-layout.ts` (rewritten)
- `scripts/validate-data.ts` (new geometric invariants)
- `src/three/coordinates.ts` (single-room assumption removed)
- `src/sim/types.ts`, `src/sim/host-session.ts`, `src/sim/cabin-simulation.ts`
  (compartment traversal)
- `src/three/cabin-world.ts`, `src/three/compartment-streamer.ts`,
  `src/three/compartment-loader.ts`, `src/three/first-person-controller.ts`,
  `src/three/spectator-camera.ts`
- `src/sim/compartment-space.ts` (playfield mapping, headings, arrivals)
- `src/app/cabin-mayhem-app.ts` (arrival snap, door prompt, spectator toggle,
  deck-plan overlay on **N**)
- `src/app/deck-plan.ts` (new; pure layout-data-to-SVG-string), `src/styles.css`
- `src/input/cabin-input.ts`
- `tools/blender/compartments/kit.py`, `build_compartments.py`,
  `build_exterior.py`
- `scripts/validate-assets.ts`, `public/assets/manifest.json`, the GLBs
- `tests/unit/{cabin-simulation,compartment-space,compartment-streamer,ship-layout,
first-person-controller,spectator-camera}.test.ts`
- docs

## Evidence

Latest full pass, after the promenade/tower rewrites, the atrium well, glazing
and the deck plan:

- Blender 5.1.2 rebuilt all fourteen compartments headlessly, exit 0, 39.08 MB
  total, 12–17 draw meshes each against a rail of 320. Only the benign
  `Warning: No mesh data to join` lines, from material groups with no users.
- `pnpm validate:data` — 14 compartments on 8 decks, all inside the 290 × 38 m
  hull, 34 doorways paired, reachable and loop-free.
- `pnpm validate:assets` — 27 project-owned assets; 14 rooms within budget.
- `npx tsc --noEmit` clean.
- `npx vitest run tests/unit --exclude "**/.codex-app-task-bridge/**"` — 35
  files, 234 tests, all passing. Covers the unrolled stair mapping, portal-pair
  coincidence, door offer/use separation, the playfield heading correction on
  landings and flights, arrival facing, and the deck plan.
- `pnpm build` passes with the known non-blocking Vite large-chunk warning;
  `pnpm desktop:build` produced the MSI and NSIS bundles (unsigned).
- Live in-browser verification is not possible in this environment:
  `requestAnimationFrame` never fires because the Browser pane is not displayed.
  All evidence is headless. Nothing has been seen rendering.

## Blockers

None in the agent environment. The two remaining items both need a human at a
running client — see Next action.

## Next action

Walk the ship on real hardware. Two things resolve on that one playthrough and
cannot resolve without it:

1. **The interior design pass** — the open quality bar. Rooms designed rather
   than filled, placement that answers to a service route or a sightline, no
   stair to nowhere, no clipping. The budgets are no longer in the way (D11);
   what is missing is judgement about what a room looks like when you stand in
   it. Builders live in `tools/blender/compartments/build_compartments.py`.
2. **The perf smoke test and the runtime counters** — frame time, draw calls,
   triangles, texture memory and mixer count along an authored route from the
   tank top to the bridge, against the gates in `docs/PERFORMANCE.md`. This is
   the largest verification gap in the project.

After those, Phase 7 (the task economy) is what turns fourteen rooms into
fourteen places with work in them.

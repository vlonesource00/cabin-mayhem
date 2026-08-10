# Performance

A cruise ship is roughly two orders of magnitude more world than one aircraft
cabin. The airliner build could afford to render everything it owned every
frame. This one cannot. Performance is what makes a ship this size possible at
all — it buys the density, it does not ration it.

The friend-authored passenger cast still in `assets-src/` is the warning:
2257 loose mesh objects for 22 characters. Shipped as-is that is 2257 draw calls
for a crowd that should cost 22 or fewer. The fix there is joining and
instancing, not fewer passengers — which is the shape of every decision on this
page.

## Budgets

Two different kinds of number live here, and they are not read the same way.

**Runtime budgets are gates.** They describe what the machine can actually
sustain, and content that breaks them does not ship as-is.

| Metric                            | Budget                                               | Enforced by                                |
| --------------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| Frame time                        | 16.6 ms at 1080p on the reference machine            | Perf smoke test                            |
| Worst-case frame                  | No frame above 33 ms during a compartment transition | Perf smoke test                            |
| Draw calls                        | ≤ 300 resident                                       | Runtime counter, asserted in the perf test |
| Triangles                         | ≤ 1.2 M resident                                     | Runtime counter                            |
| Active `AnimationMixer` instances | ≤ 16                                                 | Runtime counter                            |
| Skinned characters at full detail | ≤ 12                                                 | LOD manager                                |
| Texture memory                    | ≤ 256 MB                                             | Runtime counter                            |

**Asset budgets are rails.** They exist to catch a broken export — a room that
exported unjoined, a mesh duplicated a hundred times, a texture nobody meant to
bake — and they are set well above what a fully dressed compartment costs. A
well-dressed room that needs more room gets more room; the number moves, the
detail stays.

| Metric              | Budget                | Enforced by       |
| ------------------- | --------------------- | ----------------- |
| Per-compartment GLB | ≤ 24 MB, ≤ 320 meshes | `validate:assets` |
| Ship exterior GLB   | ≤ 48 MB, ≤ 640 meshes | `validate:assets` |
| Initial JS chunk    | ≤ 500 kB              | Vite build        |

"Draw meshes" counts **materials**, not props: every compartment joins its
geometry per material on export, so a room with two thousand authored objects
across fifteen materials exports as fifteen meshes. The current fourteen
compartments each land at fifteen meshes and 1.5–8 MB — an order of magnitude
inside the rail, which is where a rail belongs.

The reference machine is recorded in `docs/assumptions.md`. A runtime budget
change is a documented decision. An asset rail moving up because a room got
better is just Tuesday.

## Techniques

### 1. Compartment streaming

One GLB per compartment, loaded and unloaded against the portal graph in
[`SHIP_LAYOUT.md`](SHIP_LAYOUT.md). Resident set is the current compartment, its
direct neighbours at full detail, and two-hop neighbours reduced. Loads are
asynchronous and pre-warmed when the player approaches a portal, so crossing a
door never blocks a frame.

The cause of stutter is not usually steady-state cost; it is a hitch when
something loads, compiles or uploads. Every one of those is scheduled ahead of
the transition, never on it.

### 2. Portal and frustum culling

A ship is corridors and closed rooms, which is close to the ideal case for
portal culling. Today the portal graph culls at the coarsest possible grain —
residency itself: a compartment three hops away is not in the scene at all, so
it costs nothing to cull. Three.js frustum culling handles the rest. Per-portal
visibility resolution (a closed door hiding a resident neighbour) is the next
step up and is not needed while the resident set is this small.

### 3. Instancing

Repeated props use `InstancedMesh`, always: deck chairs, cabin doors, railings,
dining tables, slot machines, lifebuoys, bunks, portholes. A ship is mostly
repeated furniture, so this is the single largest win available.

### 4. Merged geometry and shared materials

Static geometry within a compartment is joined per material at author time in
the Blender script, and materials come from one shared palette across the whole
ship so batching survives. This is the single reason a room can hold two
thousand authored objects and still cost fifteen draws: density is paid for at
export, not at runtime.

It is also why the asset rail is a mesh count rather than an object count.
Adding a hundred more bottles behind a bar costs bytes and triangles; it costs
no draw calls at all.

### 5. Level of detail

Characters:

| Tier | Condition                    | Cost                                         |
| ---- | ---------------------------- | -------------------------------------------- |
| T0   | Same compartment, near, ≤ 12 | Skinned mesh, own `AnimationMixer`, 60 Hz    |
| T1   | Same compartment, far        | Skinned mesh, shared mixer, updated at 15 Hz |
| T2   | Neighbouring compartment     | Static posed mesh, instanced, no mixer       |
| T3   | Beyond two portals           | Not rendered; simulated as state only        |

The ship exterior is one always-loaded asset rather than a streamed one — it is
what makes the vessel read as a ship instead of a stack of rooms, and it is
visible from every open deck and through every window. It is never unloaded, but
it is not always drawn in full:

| Tier | Condition                                | Cost                                                                          |
| ---- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| X0   | Crew on an exterior deck, or panoramic   | Whole asset, shadows on: hull, superstructure, funnels, boats, rails, signage |
| X1   | Crew in a glazed interior compartment    | Hull, superstructure and rails only; dressing hidden, shadow casting off      |
| X2   | Crew in an unglazed interior compartment | Not drawn — nothing can see it                                                |

X1 is selected by mesh name — `CM_DRESSING_*` hidden, `CM_STRUCTURE_*` kept —
the same way `CompartmentStreamer.applyDetail` picks a compartment's shell out
of its dressing, so the tier costs a visibility flag per mesh and no extra draw
state.

**The panoramic exception.** A compartment may declare `panoramic: true`, which
pins the exterior at X0 even though the crew are indoors. There is exactly one:
the navigating bridge, whose windows look down the entire foredeck. X1 would
strip the forward mooring gear, the mast and the boats out of the one view in
the game that is composed of them. The flag is per-compartment authored data
(`exteriorTier` in `src/data/ship-layout.ts`), so a future observation lounge
opts in without touching the renderer — and every other glazed interior keeps
paying X1, because a cabin porthole cannot see enough to justify the dressing.

Guests are simulated by the host regardless of tier. Rendering tier never
affects the simulation — a guest two decks away still gets angry on schedule.

### 6. Ocean

One plane, displaced in the vertex shader from a summed-wave function. No CPU
geometry updates, no per-frame buffer uploads. Wake, foam and spray are
screen-space or texture-driven. The same wave function is evaluated on the
simulation side at a handful of sample points to derive hull pitch, roll and
heave, so the visible sea and the felt sea agree without sharing a mesh.

### 7. Transparency

Glazing is the one material class that cannot be batched away, so it is kept
cheap by rule instead. `dressLoadedMesh` in `src/three/compartment-loader.ts`
does three things to every transparent material it loads:

- **`depthWrite = false`.** A pane that writes depth occludes whatever is
  behind it in later passes, which is exactly backwards for a window.
- **`side = THREE.FrontSide`.** Blender's glTF exporter marks every material
  double sided; a closed pane would then be drawn twice and tint twice.
- **no shadow casting or receiving.** A shadow map stores depth and has no
  notion of opacity, so a transparent pane casts a solid black one.

Tinted `glass` is for panes only ever seen from outside. `glass_clear` — the
0.17-opacity pane the crew actually stands behind — is the expensive one, and it
is authored deliberately rather than sprayed across every opening.

### 8. Physics broadphase

The current pairwise loop is O(n²). It was already flagged as a limit at the
aircraft's object count, and a uniform spatial hash is the known fix. It is
**not** in the current slice: loose-object counts are still per-compartment and
the profile has not made it the bottleneck. Recorded here so that when it does
become the bottleneck nobody has to rediscover the answer.

### 9. Simulation and render decoupling

Already correct and preserved: fixed 1/60 s simulation, frame delta clamped to
50 ms, rendering interpolates between snapshots. Adding world size must not
change the step rate.

### 10. Snapshot bandwidth

`NETWORK_MODEL.md` already states the rule: before raising object or player
count, add a public snapshot projection, delta compression and backpressure
rather than raising the send rate. The ship raises the object count by an order
of magnitude, so that work is now required, not deferred.

### 11. Asset compression

Not yet applied. The compartments export uncompressed and untextured — colour
comes from the shared material palette, so there is no texture set to transcode
and the largest GLB aboard is 8 MB. When textures arrive, or when a compartment
starts pressing the rail for real reasons, geometry goes through meshopt and
textures through KTX2/Basis: both are decode costs paid once at load, inside the
pre-warm window, in exchange for permanent memory and bandwidth savings. Draco
is available in the Blender export path and deliberately unused — it trades
decode time on the main thread for bytes that are not currently scarce.

### 12. Bundle splitting

The build already emits Vite's `>500 kB` warning. With per-deck systems and a
streaming loader this stops being cosmetic. Code splits per subsystem so the
menu does not pay for the engine room.

### 13. Shader and pipeline pre-warm

Materials are compiled during the loading screen and at portal pre-warm, never
first-seen mid-frame. First-appearance shader compilation is the most common
cause of a single 200 ms hitch in a Three.js game.

## Measurement

`pnpm validate:assets` reads every GLB in `public/assets/` and fails on a
missing file, a manifest mismatch, a lost `CM_*_ROOT`, a missing portal empty or
a breached asset rail. It is the check that actually runs today, on every asset
change.

The runtime budgets need a perf smoke test that walks an authored route through
every deck and records frame times, draw calls, triangles, resident texture
memory and mixer count. That test does not exist yet, and it cannot be written
here: `requestAnimationFrame` never fires in this environment, so nothing that
depends on a real presented frame can be measured from the agent side. It is the
largest outstanding verification gap in the project and it is owned by whoever
next runs the game on hardware.

Numbers get recorded per slice in `HANDOFF.md`. "It felt fine" is not evidence —
but neither is a green headless suite, when the thing being claimed is frame
time.

## Non-goals

No dynamic global illumination, no real-time reflections beyond a cheap
screen-space or cubemap approximation, no per-guest cloth or hair simulation, no
ray tracing. The look is colourful, exaggerated and low-poly. Fidelity comes
from silhouette, colour and animation, which are cheap, rather than from
lighting and material complexity, which are not.

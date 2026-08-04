# Performance

A cruise ship is roughly two orders of magnitude more world than one aircraft
cabin. The airliner build could afford to render everything it owned every
frame. This one cannot. Performance is a gate on every asset and gameplay slice,
not a polish phase at the end.

The friend-authored passenger cast already in `assets-src/` is the warning:
2257 loose mesh objects for 22 characters. Shipped as-is that is 2257 draw calls
for a crowd that should cost 22 or fewer. Nothing enters `public/assets/` until
it meets the budgets below.

## Budgets

These are hard limits enforced by `pnpm validate:assets` and a perf smoke test,
not aspirations.

| Metric                            | Budget                                               | Enforced by                                |
| --------------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| Frame time                        | 16.6 ms at 1080p on the reference machine            | Perf smoke test                            |
| Worst-case frame                  | No frame above 33 ms during a compartment transition | Perf smoke test                            |
| Draw calls                        | ≤ 300 resident                                       | Runtime counter, asserted in the perf test |
| Triangles                         | ≤ 1.2 M resident                                     | Runtime counter                            |
| Per-compartment GLB               | ≤ 3 MB, ≤ 40 draw meshes                             | `validate:assets`                          |
| Active `AnimationMixer` instances | ≤ 16                                                 | Runtime counter                            |
| Skinned characters at full detail | ≤ 12                                                 | LOD manager                                |
| Texture memory                    | ≤ 256 MB                                             | Runtime counter                            |
| Initial JS chunk                  | ≤ 500 kB                                             | Vite build (currently failing; see below)  |

The reference machine is recorded in `docs/assumptions.md`. A budget change is a
documented decision, not a quiet edit.

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
portal culling. Visibility is resolved through authored portals rather than by
testing every object against the frustum. A closed door culls an entire
compartment.

### 3. Instancing

Repeated props use `InstancedMesh`, always: deck chairs, cabin doors, railings,
dining tables, slot machines, lifebuoys, bunks, portholes. A ship is mostly
repeated furniture, so this is the single largest win available.

### 4. Merged geometry and shared materials

Static geometry within a compartment is joined per material at author time in
the Blender script. Materials are shared from one palette across the whole ship
so batching survives. This already happens for the cabin scenario — it becomes
mandatory.

### 5. Character LOD

| Tier | Condition                    | Cost                                         |
| ---- | ---------------------------- | -------------------------------------------- |
| T0   | Same compartment, near, ≤ 12 | Skinned mesh, own `AnimationMixer`, 60 Hz    |
| T1   | Same compartment, far        | Skinned mesh, shared mixer, updated at 15 Hz |
| T2   | Neighbouring compartment     | Static posed mesh, instanced, no mixer       |
| T3   | Beyond two portals           | Not rendered; simulated as state only        |

Guests are simulated by the host regardless of tier. Rendering tier never
affects the simulation — a guest two decks away still gets angry on schedule.

### 6. Ocean

One plane, displaced in the vertex shader from a summed-wave function. No CPU
geometry updates, no per-frame buffer uploads. Wake, foam and spray are
screen-space or texture-driven. The same wave function is evaluated on the
simulation side at a handful of sample points to derive hull pitch, roll and
heave, so the visible sea and the felt sea agree without sharing a mesh.

### 7. Physics broadphase

The current pairwise loop is O(n²) and was already flagged as a limit at the
aircraft's object count. A uniform spatial hash is a prerequisite for the ship,
not an optimisation. Broadphase lands before the second compartment does.

### 8. Simulation and render decoupling

Already correct and preserved: fixed 1/60 s simulation, frame delta clamped to
50 ms, rendering interpolates between snapshots. Adding world size must not
change the step rate.

### 9. Snapshot bandwidth

`NETWORK_MODEL.md` already states the rule: before raising object or player
count, add a public snapshot projection, delta compression and backpressure
rather than raising the send rate. The ship raises the object count by an order
of magnitude, so that work is now required, not deferred.

### 10. Asset compression

GLB geometry uses meshopt compression; textures use KTX2/Basis. Both are decode
costs paid once at load, inside the pre-warm window, in exchange for permanent
memory and bandwidth savings.

### 11. Bundle splitting

The build already emits Vite's `>500 kB` warning. With per-deck systems and a
streaming loader this stops being cosmetic. Code splits per subsystem so the
menu does not pay for the engine room.

### 12. Shader and pipeline pre-warm

Materials are compiled during the loading screen and at portal pre-warm, never
first-seen mid-frame. First-appearance shader compilation is the most common
cause of a single 200 ms hitch in a Three.js game.

## Measurement

A perf smoke test walks an authored route through every deck, records frame
times, draw calls, triangles, resident texture memory and mixer count, and fails
on any budget breach or any frame over the worst-case threshold. It runs in the
same Playwright suite as the other browser journeys.

Numbers get recorded per slice in `HANDOFF.md`. "It felt fine" is not evidence.

## Non-goals

No dynamic global illumination, no real-time reflections beyond a cheap
screen-space or cubemap approximation, no per-guest cloth or hair simulation, no
ray tracing. The look is colourful, exaggerated and low-poly. Fidelity comes
from silhouette, colour and animation, which are cheap, rather than from
lighting and material complexity, which are not.

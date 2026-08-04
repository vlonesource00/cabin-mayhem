# Asset Catalog

All shipped visuals are project-owned. No external art, characters, cruise-line
branding or copied game layouts are used.

## Naming and modularity standards

Ship interiors are built from a shared modular kit, not from one bespoke mesh per
room. Walls, floors, ceilings, doorways, stairs and railings are authored once on
a fixed grid with consistent dimensions and pivot conventions, then repeated to
assemble a compartment. This is what makes instancing, merged geometry and a
shared material palette possible at all — see
[`PERFORMANCE.md`](PERFORMANCE.md).

Every object carries a prefix that says what it is:

| Prefix  | Meaning                                 | Example                    |
| ------- | --------------------------------------- | -------------------------- |
| `ENV_`  | Structural environment kit piece        | `ENV_Corridor_Wall_A`      |
| `PROP_` | Decorative or carryable prop            | `PROP_LuggageCart_A`       |
| `INT_`  | Interactive gameplay object             | `INT_EngineValve_A`        |
| `SYS_`  | Ship system fixture                     | `SYS_BridgeRadarConsole_A` |
| `LOD1_` | Reduced-detail variant of a named asset | `LOD1_DeckChair_A`         |
| `CM_`   | Runtime contract node the code looks up | `CM_ENGINE_ROOM_ROOT`      |

`CM_` names are the only ones the runtime resolves by string. Everything else is
an authoring convention, so renaming a wall never breaks the game.

Each asset is classified as structural, interactive, decorative, collision-only,
animated, destructible, an LOD variant, or an instanced prop. The classification
decides its budget, whether it needs a collision proxy and whether it may be
merged at author time.

### GLB export standards

- Y-up on export (`export_yup=True`), which maps Blender `(x, y, z)` to glTF
  `(x, z, −y)`
- Metric scale, one Blender unit is one metre
- Transforms applied, pivots at the object's natural anchor point
- Compartment geometry joined per material before export
- Meshopt geometry compression; KTX2/Basis for any texture that ships
- No packed images that are not actually referenced
- Actions exported by name (`export_animation_mode="ACTIONS"`) for anything rigged

## Ship compartments

Every compartment in [`SHIP_LAYOUT.md`](SHIP_LAYOUT.md) is one authored GLB, one
build script under `tools/blender/compartments/`, one entry in
`public/assets/manifest.json` and one node in the portal graph. None of them are
built yet — Phase 5 authors the greybox set and Phase 6 authors the rest.

Runtime contract per compartment:

- Root node `CM_<COMPARTMENT>_ROOT`
- One empty named `CM_PORTAL_<TARGET>` per portal, positioned at the threshold
- Portals symmetric: if A declares a portal to B, B declares one back
- Budget met before merge: ≤3 MB, ≤40 draw meshes (see
  [`PERFORMANCE.md`](PERFORMANCE.md))

Loading is non-authoritative. A missing or invalid compartment GLB degrades to
greybox and the voyage continues.

## Blender cabin scenario (retired premise)

The airliner cabin GLB still builds and still loads. It is superseded by the
per-compartment set above ([ADR 0001](adr/0001-cruise-ship-pivot.md)) and is kept
because it is the working reference for a deterministic Blender build script.

- Source: `assets-src/blender/cabin-mayhem-scenario.blend`
- Runtime: `public/assets/scenarios/cabin-mayhem-scenario.glb`
- Generator: `tools/blender/build_cabin_scenario.py`
- Blender: 5.1
- Runtime contract: `CM_SCENARIO_ROOT`, at least four render meshes, Three.js
  Y-up cabin-local coordinates
- Optimization: material-batched geometry, 12 draw meshes, no textures,
  approximately 2.12 MB uncompressed

Regenerate deterministically:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --python tools/blender/build_cabin_scenario.py
```

`CabinWorld` starts with the procedural cabin visible. Once the GLB validates and
loads, authored visuals replace it while invisible procedural interaction proxies
remain. Load or validation failure leaves the procedural scene active. That
fallback rule carries forward unchanged to compartment streaming.

## Blender character rigs

Two skinned, animated rigs. Bone names, clip names and clip lengths are a hard
interface documented in [`rig-contract.md`](rig-contract.md) and enforced by
`pnpm validate:assets`, which opens both GLBs and compares them to
`src/three/animation-contract.ts`.

|           | Characters                                             | First-person arms                                   |
| --------- | ------------------------------------------------------ | --------------------------------------------------- |
| Source    | `assets-src/blender/cabin-mayhem-characters.blend`     | `assets-src/blender/cabin-mayhem-fp-arms.blend`     |
| Runtime   | `public/assets/characters/cabin-mayhem-characters.glb` | `public/assets/characters/cabin-mayhem-fp-arms.glb` |
| Generator | `tools/blender/build_character_rig.py`                 | `tools/blender/build_first_person_arms.py`          |
| Root node | `CM_CHARACTER_ROOT`                                    | `CM_FPARMS_ROOT`                                    |
| Meshes    | `CM_CREW`, `CM_PASSENGER`                              | `CM_FP_ARMS`                                        |
| Bones     | 19                                                     | 7                                                   |
| Clips     | 25                                                     | 19                                                  |

Regenerate deterministically:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --python tools/blender/build_character_rig.py
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --python tools/blender/build_first_person_arms.py
```

Both are authored at 30 fps with rigid one-bone-per-part weighting, which keeps
the chunky low-poly silhouette crisp and the export repeatable. Crew and guests
share one skeleton, so a single fetch and a single skeleton clone cover the whole
ship.

Both rigs survive the pivot. The arms rig survives only if the camera stays first
person — that decision is open and is recorded in
[`assumptions.md`](assumptions.md).

`src/three/animated-rig.ts` loads each rig independently and refuses one that is
missing its root node or any declared clip. Either failure drops that half of the
cast onto the procedural animation in `src/three/interaction-animation.ts`; the
mission is unaffected because no clip choice reaches `HostSession`. The canvas
reports which path is live through `data-character-rig` and `data-arms-rig`
(`glb` or `fallback`), which is what the end-to-end tests assert.

## Blender passenger cast (source only)

- Source: `assets-src/blender/passengers.blend`
- Generators: `assets-src/passengers/` (`character_factory.py`,
  `build_new_and_tpose.py`, `chars/*`)
- Blender: 5.x
- Contents: 22 stylized seated passengers plus matching `T_*` T-pose duplicates
  (project-owned primitives; googly-eye cartoon cast)
- Runtime: **not shipped yet**. In-game guests keep using the authored
  `CM_PASSENGER` rig above until a validated GLB export is added to
  `public/assets/` and `public/assets/manifest.json`. Do not wire this `.blend`
  into the world without a procedural fallback path.

The cast is unrigged: 44 root objects (22 seated characters plus a `T_*` T-pose
duplicate of each), 2257 loose mesh objects, no armature, no shape keys and no
actions. Shipping it means joining each character into one mesh and skinning the
T-pose copies to the shared `CM_HUMANOID` skeleton, so the cast inherits the
authored clips instead of needing its own. As it stands it is also the clearest
in-repo example of what the modularity standards above exist to prevent: 2257
loose objects is a draw-call explosion.

Regenerate in a Blender GUI session with the factory scripts (MCP or Scripting
workspace). Background regeneration is not yet deterministic like the cabin
scenario tool.

`passengers.blend` was written by Blender 502.44 and warns of data loss when
opened in 5.1. Both collaborators must agree one version before anything here is
skinned.

Before adding assets, record source, license, owner, import transformation and
every use in `public/assets/manifest.json`.

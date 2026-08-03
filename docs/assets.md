# Asset Catalog

All shipped visuals are project-owned. No external art, characters, airline branding or copied game layouts are used.

## Blender cabin scenario

- Source: `assets-src/blender/cabin-mayhem-scenario.blend`
- Runtime: `public/assets/scenarios/cabin-mayhem-scenario.glb`
- Generator: `tools/blender/build_cabin_scenario.py`
- Blender: 5.1
- Runtime contract: `CM_SCENARIO_ROOT`, at least four render meshes, Three.js Y-up cabin-local coordinates
- Optimization: material-batched geometry, 12 draw meshes, no textures, approximately 2.12 MB uncompressed

Regenerate deterministically:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --python tools/blender/build_cabin_scenario.py
```

`CabinWorld` starts with the procedural cabin visible. Once the GLB validates and loads, authored visuals replace it while invisible procedural interaction proxies remain. Load or validation failure leaves the procedural scene active.

Current scope stops at the static cabin shell, seats, bins, windows and lighting surfaces, plus a dressed flight deck (windscreen, glareshield, instrument panel and displays, overhead panel, centre pedestal with throttles, yokes, rudder pedals, breaker panels, bulkhead and door), a forward galley with cabinet doors and handles, a rear service area with galley carcasses, oven stack, coffee machine, side towers, stowed trolley, fire station and lavatory door, and an aft cargo hold with shelves, strapped crates and a cargo door. Service cart contents, loose gameplay props, fire/repair effects and interaction proxies remain procedural until later production-asset slices.

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
the chunky low-poly silhouette crisp and the export repeatable. Crew and
passengers share one skeleton, so a single fetch and a single skeleton clone
cover the whole cabin.

`src/three/animated-rig.ts` loads each rig independently and refuses one that is
missing its root node or any declared clip. Either failure leaves that half of
the cabin on the procedural animation in `src/three/interaction-animation.ts`;
the mission is unaffected because no clip choice reaches `HostSession`. The
canvas reports which path is live through `data-character-rig` and
`data-arms-rig` (`glb` or `fallback`), which is what the end-to-end tests assert.

Before adding assets, record source, license, owner, import transformation and every use in `public/assets/manifest.json`.

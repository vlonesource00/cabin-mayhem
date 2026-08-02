# Asset Catalog

All shipped visuals are project-owned. No external art, characters, airline branding or copied game layouts are used.

## Blender cabin scenario

- Source: `assets-src/blender/cabin-mayhem-scenario.blend`
- Runtime: `public/assets/scenarios/cabin-mayhem-scenario.glb`
- Generator: `tools/blender/build_cabin_scenario.py`
- Blender: 5.1
- Runtime contract: `CM_SCENARIO_ROOT`, at least four render meshes, Three.js Y-up cabin-local coordinates
- Optimization: material-batched geometry, 12 draw meshes, no textures, approximately 1.24 MB uncompressed

Regenerate deterministically:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --python tools/blender/build_cabin_scenario.py
```

`CabinWorld` starts with the procedural cabin visible. Once the GLB validates and loads, authored visuals replace it while invisible procedural interaction proxies remain. Load or validation failure leaves the procedural scene active.

Current scope stops at the static cabin shell, seats, bins, windows, galley dressing and lighting surfaces. Passenger avatars, service cart contents, loose gameplay props, fire/repair effects and interaction proxies remain procedural until later production-asset and animation slices.

Before adding assets, record source, license, owner, import transformation and every use in `public/assets/manifest.json`.

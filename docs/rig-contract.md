# Rig and animation contract

Bone names, clip names and clip lengths are a hard interface between the Blender
build scripts and the Three.js runtime. The machine-readable copy lives in
[`src/three/animation-contract.ts`](../src/three/animation-contract.ts); this
document explains the conventions behind it and how to change them safely.

`pnpm validate:assets` opens both GLBs and fails if the exported skeleton or clip
set drifts from the contract, so a rename that only lands in one place is a build
error rather than a silent runtime degradation.

## Non-negotiables

- **Animation is never authoritative.** `HostSession` resolves every delivery,
  repair, fire suppression and collision. The runtime only projects the resulting
  snapshot onto clips; nothing in `src/three/animation-*.ts` writes to simulation
  state.
- **The GLB is optional.** If a rig fails to load or violates the contract,
  `src/three/animated-rig.ts` throws and `src/three/interaction-animation.ts`
  keeps driving the procedural fallback. The game stays playable.
- **Everything is generated.** Both rigs are produced deterministically by the
  scripts in `tools/blender/`. Do not hand-edit the `.blend` files or the GLBs;
  edit the script and re-run it.

## Rigs

Two rigs, deliberately not one.

| Rig                       | Root node           | Bones | Clips | Built by                                   |
| ------------------------- | ------------------- | ----- | ----- | ------------------------------------------ |
| `cabin-mayhem-characters` | `CM_CHARACTER_ROOT` | 19    | 25    | `tools/blender/build_character_rig.py`     |
| `cabin-mayhem-fp-arms`    | `CM_FPARMS_ROOT`    | 7     | 19    | `tools/blender/build_first_person_arms.py` |

The first-person arms are a separate rig because they are authored in camera
space with exaggerated proportions and screen-space framing. Those proportions
read wrong from the outside, and a body rig that reads correctly from the outside
frames badly at 72° from the eye position. Sharing one skeleton would compromise
both.

Crew and passengers _do_ share the humanoid skeleton — one skin, two meshes
(`CM_CREW`, `CM_PASSENGER`), so all 25 clips are available to either.

## Bone naming

Humanoid, root first, `.L`/`.R` suffix for mirrored pairs:

```
hips
  spine → chest → neck → head
  chest → shoulder.L → upperArm.L → forearm.L → hand.L
  chest → shoulder.R → upperArm.R → forearm.R → hand.R
  thigh.L → shin.L → foot.L
  thigh.R → shin.R → foot.R
```

First-person arms, mirrored around the camera axis:

```
fp_root
  fp_upperArm.L → fp_forearm.L → fp_hand.L
  fp_upperArm.R → fp_forearm.R → fp_hand.R
```

The `fp_` prefix is not decoration: it guarantees the two rigs can never be
confused by a lookup, and it makes the upper-body mask in `animated-rig.ts`
unambiguous.

### Upper-body mask

`animated-rig.ts` layers an action clip over a locomotion clip by splitting both
into disjoint track sets, so two actions can run at full weight without fighting.
The upper set is `chest`, `neck`, `head`, `shoulder.*`, `upperArm.*`, `forearm.*`
and `hand.*`. `spine` stays with the lower half on purpose: the torso should
follow the legs rather than snap between two competing sources.

Adding a bone above the waist means adding its prefix to that mask.

## Clip naming

- Crew and world clips are bare verbs: `idle`, `walk`, `sprint`, `crouch_idle`,
  `carry_idle`, `carry_walk`, `push_cart`, `serve`, `recoil`, `throw`, `spray`,
  `repair`, `brace`, `stumble`, `celebrate`.
- Seated passenger clips are prefixed `seat_`.
- First-person clips are prefixed `fp_`.

Each clip declares `loop` in the contract. Looping clips hold a state and are
selected from the snapshot; one-shots are triggered by a state _delta_ and hand
control back to whatever loop is underneath when they finish. The mapping from
snapshot to clip lives in `src/three/animation-state.ts` and is pure.

## Coordinates and timing

Blender is Z-up. The exporter runs with `export_yup=True`, which maps Blender
`(x, y, z)` to glTF `(x, z, −y)` — so Blender **+Y is Three.js −Z**, the forward
direction. Author facing along +Y in Blender.

Both rigs are authored at **30 fps**. Clips are authored from frame 1 but **baked
from frame 0**: the glTF exporter emits a key's time as `frame / fps` without
rebasing to the action's start frame, so baking from frame 1 would leave every
clip with a one-frame dead zone before its first pose and a duration one frame
too long. `frameTolerance` in the contract is 0.25 frames — enough for float
rounding, not enough to hide drift.

Authored duration in seconds is `(frames − 1) / fps`.

## Changing the contract

1. Edit the relevant script in `tools/blender/`.
2. Re-run it:

```bash
"/c/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background --python tools/blender/build_character_rig.py
```

3. Update `src/three/animation-contract.ts` to match.
4. Update `public/assets/manifest.json` and `docs/assets.md` if the asset's
   description changed.
5. Run `pnpm validate:assets` and `pnpm test:unit`.

To review clips visually, open an authored `.blend` in Blender's Animation
workspace with the clip already assigned and playing:

```bash
"/c/Program Files/Blender Foundation/Blender 5.1/blender.exe" assets-src/blender/cabin-mayhem-characters.blend --python tools/blender/open_animation_review.py
```

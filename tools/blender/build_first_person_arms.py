"""Build Cabin Mayhem's project-owned first-person arms rig and clip library.

Run with Blender 5.x:
  blender --background --python tools/blender/build_first_person_arms.py

This rig is intentionally separate from the shared humanoid skeleton. First-person
arms are authored in camera space with exaggerated proportions and screen-space
framing, which is incompatible with a body rig that has to read correctly from the
outside. `CM_FPARMS_ROOT` sits at the camera origin looking down Blender +Y, which
the glTF Y-up conversion turns into Three.js -Z.

Bone names are a runtime contract; see `docs/rig-contract.md`.
"""

from pathlib import Path
import sys

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))

from rig_common import (  # noqa: E402
    Clip,
    MeshBuilder,
    bake,
    build_armature,
    export,
    material,
    reset_scene,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = PROJECT_ROOT / "assets-src" / "blender" / "cabin-mayhem-fp-arms.blend"
RUNTIME_PATH = PROJECT_ROOT / "public" / "assets" / "characters" / "cabin-mayhem-fp-arms.glb"

FPS = 30

BONES = {
    "fp_root": (None, (0.0, 0.0, 0.0), (0.0, 0.12, 0.0)),
    "fp_upperArm.R": ("fp_root", (0.23, 0.02, -0.30), (0.21, 0.25, -0.25)),
    "fp_forearm.R": ("fp_upperArm.R", (0.21, 0.25, -0.25), (0.18, 0.47, -0.19)),
    "fp_hand.R": ("fp_forearm.R", (0.18, 0.47, -0.19), (0.17, 0.59, -0.17)),
    "fp_upperArm.L": ("fp_root", (-0.23, 0.02, -0.30), (-0.21, 0.25, -0.25)),
    "fp_forearm.L": ("fp_upperArm.L", (-0.21, 0.25, -0.25), (-0.18, 0.47, -0.19)),
    "fp_hand.L": ("fp_forearm.L", (-0.18, 0.47, -0.19), (-0.17, 0.59, -0.17)),
}

DISCONNECTED = {"fp_upperArm.L", "fp_upperArm.R"}


def build_arms(builder):
    sleeve, cuff, skin, accent = range(4)
    for side, sign in (("R", 1.0), ("L", -1.0)):
        builder.box(
            f"fp_upperArm.{side}", (sign * 0.22, 0.13, -0.275), (0.115, 0.26, 0.115), sleeve
        )
        builder.box(f"fp_forearm.{side}", (sign * 0.195, 0.36, -0.22), (0.105, 0.24, 0.105), sleeve)
        builder.box(f"fp_forearm.{side}", (sign * 0.19, 0.455, -0.20), (0.115, 0.05, 0.115), cuff)
        builder.box(f"fp_hand.{side}", (sign * 0.175, 0.525, -0.18), (0.10, 0.13, 0.075), skin)
        # Thumb and finger block: two chunks read as a gripping hand at this scale.
        builder.box(f"fp_hand.{side}", (sign * 0.125, 0.525, -0.18), (0.035, 0.08, 0.06), skin)
        builder.box(f"fp_hand.{side}", (sign * 0.175, 0.60, -0.175), (0.095, 0.055, 0.065), skin)
        builder.box(f"fp_forearm.{side}", (sign * 0.195, 0.30, -0.235), (0.12, 0.035, 0.12), accent)


# --- clip library --------------------------------------------------------


def both(table):
    """Mirror a right-arm pose table onto the left arm.

    Z rotation is negated so a left arm sweeps outward rather than crossing the
    screen. X and Y are shared, which is what reads correctly on a symmetric rig.
    """
    result = {}
    for bone, value in table.items():
        result[bone] = value
        if not bone.endswith(".R"):
            continue
        mirrored = bone[:-2] + ".L"
        if isinstance(value, dict):
            rotation = value.get("r")
            result[mirrored] = {
                "r": (rotation[0], -rotation[1], -rotation[2]) if rotation else None,
                "t": (-value["t"][0], value["t"][1], value["t"][2]) if value.get("t") else None,
            }
        else:
            result[mirrored] = (value[0], -value[1], -value[2])
    return {k: v for k, v in result.items() if v is not None}


def idle_clips():
    clips = []

    idle = Clip("fp_idle", 90)
    for frame, sway in ((1, 0.0), (30, 1.0), (60, -0.6), (90, 0.0)):
        idle.keys_at(
            frame,
            both(
                {
                    "fp_upperArm.R": (1.4 * sway, 0.0, 0.8 * sway),
                    "fp_forearm.R": (-2.0 * sway, 0.0, 0.0),
                    "fp_hand.R": (1.6 * sway, 0.0, 0.0),
                    "fp_root": {"t": (0.0, 0.0, 0.004 * sway)},
                }
            ),
        )
    clips.append(idle)

    walk = Clip("fp_walk", 32)
    for frame, step in [(1, 1.0), (8, 0.0), (16, -1.0), (24, 0.0), (32, 1.0)]:
        walk.keys_at(
            frame,
            {
                "fp_upperArm.R": (-3.5 * step, 0.0, 2.0 * step),
                "fp_upperArm.L": (3.5 * step, 0.0, 2.0 * step),
                "fp_forearm.R": (4.0 * step, 0.0, 0.0),
                "fp_forearm.L": (-4.0 * step, 0.0, 0.0),
                "fp_root": {
                    "r": (0.0, 1.8 * step, 0.0),
                    "t": (0.012 * step, 0.0, -0.010 * abs(step) + 0.005),
                },
            },
        )
    clips.append(walk)

    sprint = Clip("fp_sprint", 20)
    for frame, step in [(1, 1.0), (5, 0.0), (10, -1.0), (15, 0.0), (20, 1.0)]:
        sprint.keys_at(
            frame,
            {
                "fp_upperArm.R": (-11.0 * step - 8.0, 0.0, 5.0 * step),
                "fp_upperArm.L": (11.0 * step - 8.0, 0.0, 5.0 * step),
                "fp_forearm.R": (14.0 * step - 22.0, 0.0, 0.0),
                "fp_forearm.L": (-14.0 * step - 22.0, 0.0, 0.0),
                "fp_root": {
                    "r": (-4.0, 5.0 * step, 0.0),
                    "t": (0.026 * step, -0.02, -0.024 * abs(step) + 0.012),
                },
            },
        )
    clips.append(sprint)

    return clips


def carry_clips():
    """One clip per carried category. Each holds the item at a distinct height so
    the player can tell what they are carrying without reading the HUD."""
    clips = []

    presets = {
        "fp_carry_drink": (-26.0, -34.0, 0.0, 0.02),
        "fp_carry_meal": (-34.0, -26.0, 6.0, -0.01),
        "fp_carry_medical": (-20.0, -40.0, -4.0, 0.04),
        "fp_carry_extinguisher": (-40.0, -18.0, 10.0, -0.05),
        "fp_carry_toolbox": (-8.0, -14.0, 12.0, -0.09),
    }
    for name, (upper, fore, hand, lift) in presets.items():
        clip = Clip(name, 60)
        for frame, breathe in ((1, 0.0), (20, 1.0), (40, -0.7), (60, 0.0)):
            clip.keys_at(
                frame,
                both(
                    {
                        "fp_upperArm.R": (upper + 1.2 * breathe, 0.0, 2.0),
                        "fp_forearm.R": (fore - 1.6 * breathe, 0.0, 0.0),
                        "fp_hand.R": (hand + 1.0 * breathe, 0.0, 0.0),
                        "fp_root": {"t": (0.0, 0.0, lift + 0.004 * breathe)},
                    }
                ),
            )
        clips.append(clip)

    push = Clip("fp_push_cart", 44)
    for frame, shove in [(1, 0.0), (11, 1.0), (22, 0.2), (33, 1.0), (44, 0.0)]:
        push.keys_at(
            frame,
            both(
                {
                    "fp_upperArm.R": (-30.0 - 4.0 * shove, 0.0, 6.0),
                    "fp_forearm.R": (18.0 + 5.0 * shove, 0.0, 0.0),
                    "fp_hand.R": (-14.0, 0.0, 0.0),
                    "fp_root": {
                        "r": (2.0 * shove, 0.0, 0.0),
                        "t": (0.0, 0.03 * shove, -0.012 * shove),
                    },
                }
            ),
        )
    clips.append(push)

    return clips


def action_clips():
    clips = []

    pickup = Clip("fp_pickup", 22, loop=False)
    pickup.keys_at(1, {"fp_upperArm.R": (0.0, 0.0, 0.0), "fp_forearm.R": (0.0, 0.0, 0.0)})
    pickup.keys_at(
        8,
        {
            "fp_upperArm.R": (-16.0, 0.0, -12.0),
            "fp_forearm.R": (-10.0, 0.0, 0.0),
            "fp_hand.R": (24.0, 0.0, 0.0),
            "fp_root": {"t": (0.0, 0.05, -0.05)},
        },
    )
    pickup.keys_at(
        13,
        {
            "fp_upperArm.R": (-22.0, 0.0, -8.0),
            "fp_forearm.R": (-18.0, 0.0, 0.0),
            "fp_hand.R": (-6.0, 0.0, 0.0),
            "fp_root": {"t": (0.0, 0.02, -0.03)},
        },
    )
    pickup.keys_at(
        22,
        {
            "fp_upperArm.R": (-26.0, 0.0, 2.0),
            "fp_forearm.R": (-34.0, 0.0, 0.0),
            "fp_hand.R": (0.0, 0.0, 0.0),
            "fp_root": {"t": (0.0, 0.0, 0.02)},
        },
    )
    clips.append(pickup)

    stow = Clip("fp_stow", 20, loop=False)
    stow.keys_at(
        1,
        {
            "fp_upperArm.R": (-26.0, 0.0, 2.0),
            "fp_forearm.R": (-34.0, 0.0, 0.0),
            "fp_root": {"t": (0.0, 0.0, 0.02)},
        },
    )
    stow.keys_at(
        8,
        {
            "fp_upperArm.R": (-6.0, 0.0, 10.0),
            "fp_forearm.R": (-6.0, 0.0, 0.0),
            "fp_hand.R": (-18.0, 0.0, 0.0),
            "fp_root": {"t": (0.0, -0.03, -0.06)},
        },
    )
    stow.keys_at(
        20,
        {
            "fp_upperArm.R": (0.0, 0.0, 0.0),
            "fp_forearm.R": (0.0, 0.0, 0.0),
            "fp_hand.R": (0.0, 0.0, 0.0),
            "fp_root": {"t": (0.0, 0.0, 0.0)},
        },
    )
    clips.append(stow)

    serve = Clip("fp_serve", 26, loop=False)
    serve.keys_at(1, {"fp_upperArm.R": (-26.0, 0.0, 2.0), "fp_forearm.R": (-34.0, 0.0, 0.0)})
    serve.keys_at(
        9,
        {
            "fp_upperArm.R": (-4.0, 0.0, 14.0),
            "fp_forearm.R": (12.0, 0.0, 0.0),
            "fp_hand.R": (-16.0, 0.0, 0.0),
            "fp_root": {"r": (1.5, 0.0, -2.0), "t": (0.01, 0.07, 0.01)},
        },
    )
    serve.keys_at(
        15,
        {
            "fp_upperArm.R": (-8.0, 0.0, 12.0),
            "fp_forearm.R": (6.0, 0.0, 0.0),
            "fp_hand.R": (10.0, 0.0, 0.0),
            "fp_root": {"t": (0.008, 0.05, 0.0)},
        },
    )
    serve.keys_at(
        26,
        {
            "fp_upperArm.R": (-22.0, 0.0, 2.0),
            "fp_forearm.R": (-28.0, 0.0, 0.0),
            "fp_hand.R": (0.0, 0.0, 0.0),
            "fp_root": {"r": (0.0, 0.0, 0.0), "t": (0.0, 0.0, 0.0)},
        },
    )
    clips.append(serve)

    recoil = Clip("fp_recoil", 30, loop=False)
    recoil.keys_at(1, {"fp_upperArm.R": (-16.0, 0.0, 8.0), "fp_forearm.R": (-10.0, 0.0, 0.0)})
    recoil.keys_at(
        6,
        {
            "fp_upperArm.R": (-40.0, 0.0, -14.0),
            "fp_forearm.R": (-44.0, 0.0, 0.0),
            "fp_hand.R": (26.0, 0.0, 0.0),
            "fp_root": {"r": (-3.0, 0.0, 4.0), "t": (-0.02, -0.07, -0.02)},
        },
    )
    recoil.keys_at(
        14,
        {
            "fp_upperArm.R": (-22.0, 0.0, 4.0),
            "fp_forearm.R": (-26.0, 0.0, 0.0),
            "fp_hand.R": (-8.0, 0.0, 0.0),
            "fp_root": {"r": (1.0, 0.0, -1.0), "t": (0.006, 0.02, 0.006)},
        },
    )
    recoil.keys_at(
        30,
        {
            "fp_upperArm.R": (-26.0, 0.0, 2.0),
            "fp_forearm.R": (-34.0, 0.0, 0.0),
            "fp_hand.R": (0.0, 0.0, 0.0),
            "fp_root": {"r": (0.0, 0.0, 0.0), "t": (0.0, 0.0, 0.0)},
        },
    )
    clips.append(recoil)

    throw = Clip("fp_throw", 22, loop=False)
    throw.keys_at(1, {"fp_upperArm.R": (-26.0, 0.0, 2.0), "fp_forearm.R": (-34.0, 0.0, 0.0)})
    throw.keys_at(
        7,
        {
            "fp_upperArm.R": (-46.0, 0.0, -16.0),
            "fp_forearm.R": (-62.0, 0.0, 0.0),
            "fp_hand.R": (30.0, 0.0, 0.0),
            "fp_root": {"r": (-4.0, 0.0, 5.0), "t": (-0.03, -0.09, -0.03)},
        },
    )
    throw.keys_at(
        12,
        {
            "fp_upperArm.R": (16.0, 0.0, 20.0),
            "fp_forearm.R": (34.0, 0.0, 0.0),
            "fp_hand.R": (-34.0, 0.0, 0.0),
            "fp_root": {"r": (5.0, 0.0, -6.0), "t": (0.03, 0.10, 0.02)},
        },
    )
    throw.keys_at(
        22,
        {
            "fp_upperArm.R": (-6.0, 0.0, 4.0),
            "fp_forearm.R": (-8.0, 0.0, 0.0),
            "fp_hand.R": (0.0, 0.0, 0.0),
            "fp_root": {"r": (0.0, 0.0, 0.0), "t": (0.0, 0.0, 0.0)},
        },
    )
    clips.append(throw)

    spray = Clip("fp_spray", 24)
    for frame, kick in [(1, 0.0), (4, 1.0), (9, 0.35), (14, 0.9), (19, 0.3), (24, 0.0)]:
        spray.keys_at(
            frame,
            both(
                {
                    "fp_upperArm.R": (-38.0 - 3.0 * kick, 0.0, 8.0),
                    "fp_forearm.R": (-14.0 + 4.0 * kick, 0.0, 0.0),
                    "fp_hand.R": (10.0 - 5.0 * kick, 0.0, 0.0),
                    "fp_root": {
                        "r": (-2.4 * kick, 1.6 * kick, 0.0),
                        "t": (0.0, -0.02 * kick, -0.05 + 0.008 * kick),
                    },
                }
            ),
        )
    clips.append(spray)

    repair = Clip("fp_repair", 36)
    for frame, twist in [(1, 0.0), (9, 34.0), (18, -10.0), (27, 34.0), (36, 0.0)]:
        repair.keys_at(
            frame,
            {
                "fp_upperArm.R": (-12.0, 0.0, 6.0),
                "fp_forearm.R": (8.0, twist, 0.0),
                "fp_hand.R": (-6.0, twist * 1.2, 0.0),
                "fp_upperArm.L": (-30.0, 0.0, -10.0),
                "fp_forearm.L": (-18.0, 0.0, 0.0),
                "fp_hand.L": (12.0, 0.0, 0.0),
                "fp_root": {"r": (1.0, 0.0, -2.0), "t": (0.01, 0.04, -0.02)},
            },
        )
    clips.append(repair)

    interact = Clip("fp_interact", 18, loop=False)
    interact.keys_at(1, {"fp_upperArm.R": (0.0, 0.0, 0.0), "fp_forearm.R": (0.0, 0.0, 0.0)})
    interact.keys_at(
        7,
        {
            "fp_upperArm.R": (-6.0, 0.0, 16.0),
            "fp_forearm.R": (20.0, 0.0, 0.0),
            "fp_hand.R": (-12.0, 0.0, 0.0),
            "fp_root": {"t": (0.006, 0.06, 0.0)},
        },
    )
    interact.keys_at(
        18,
        {
            "fp_upperArm.R": (0.0, 0.0, 0.0),
            "fp_forearm.R": (0.0, 0.0, 0.0),
            "fp_hand.R": (0.0, 0.0, 0.0),
            "fp_root": {"t": (0.0, 0.0, 0.0)},
        },
    )
    clips.append(interact)

    brace = Clip("fp_brace", 34)
    for frame, tremor in [(1, 0.0), (9, 1.0), (18, -0.7), (26, 0.9), (34, 0.0)]:
        brace.keys_at(
            frame,
            both(
                {
                    "fp_upperArm.R": (-52.0 - 2.0 * tremor, 0.0, -18.0),
                    "fp_forearm.R": (-56.0, 0.0, 0.0),
                    "fp_hand.R": (18.0 + 3.0 * tremor, 0.0, 0.0),
                    "fp_root": {
                        "r": (3.0 + 1.2 * tremor, 0.0, 0.0),
                        "t": (0.0, 0.0, -0.10 + 0.006 * tremor),
                    },
                }
            ),
        )
    clips.append(brace)

    impact = Clip("fp_impact", 26, loop=False)
    impact.keys_at(1, {"fp_upperArm.R": (0.0, 0.0, 0.0), "fp_root": {"t": (0.0, 0.0, 0.0)}})
    impact.keys_at(
        4,
        both(
            {
                "fp_upperArm.R": (-58.0, 0.0, -26.0),
                "fp_forearm.R": (-40.0, 0.0, 0.0),
                "fp_hand.R": (34.0, 0.0, 0.0),
                "fp_root": {"r": (-7.0, 0.0, 6.0), "t": (-0.04, -0.11, -0.09)},
            }
        ),
    )
    impact.keys_at(
        12,
        both(
            {
                "fp_upperArm.R": (-20.0, 0.0, -4.0),
                "fp_forearm.R": (-14.0, 0.0, 0.0),
                "fp_hand.R": (-10.0, 0.0, 0.0),
                "fp_root": {"r": (2.5, 0.0, -2.0), "t": (0.012, 0.03, 0.02)},
            }
        ),
    )
    impact.keys_at(
        26,
        both(
            {
                "fp_upperArm.R": (0.0, 0.0, 0.0),
                "fp_forearm.R": (0.0, 0.0, 0.0),
                "fp_hand.R": (0.0, 0.0, 0.0),
                "fp_root": {"r": (0.0, 0.0, 0.0), "t": (0.0, 0.0, 0.0)},
            }
        ),
    )
    clips.append(impact)

    return clips


def build():
    reset_scene(FPS)
    armature = build_armature("CM_FPARMS", BONES, DISCONNECTED)

    materials = [
        material("cm_fp_sleeve", (0.12, 0.16, 0.42)),
        material("cm_fp_cuff", (0.98, 0.36, 0.16), roughness=0.4),
        material("cm_fp_skin", (0.86, 0.66, 0.49)),
        material("cm_fp_accent", (0.09, 0.11, 0.30)),
    ]

    arms = MeshBuilder()
    build_arms(arms)
    arms.finish("CM_FP_ARMS", armature, materials)

    clips = idle_clips() + carry_clips() + action_clips()
    for clip in clips:
        bake(armature, clip)

    root = bpy.data.objects.new("CM_FPARMS_ROOT", None)
    bpy.context.collection.objects.link(root)
    armature.parent = root

    export(SOURCE_PATH, RUNTIME_PATH)
    print(f"Exported {len(clips)} clips to {RUNTIME_PATH}")


build()

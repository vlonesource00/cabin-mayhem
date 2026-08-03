"""Build Cabin Mayhem's project-owned character rig and animation library.

Run with Blender 5.x:
  blender --background --python tools/blender/build_character_rig.py

Produces one shared humanoid skeleton, a crew mesh, a passenger mesh and every
named action as a separate glTF animation clip. The rig is deliberately chunky
and low-poly: rigid one-bone-per-part skinning keeps the silhouette readable and
the export deterministic, which matters more for this art direction than smooth
joint deformation would.

Bone names are a runtime contract. `docs/rig-contract.md` is the authority; do
not rename a bone without updating that document and the animation manifest.
"""

from pathlib import Path
import math
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
SOURCE_PATH = PROJECT_ROOT / "assets-src" / "blender" / "cabin-mayhem-characters.blend"
RUNTIME_PATH = PROJECT_ROOT / "public" / "assets" / "characters" / "cabin-mayhem-characters.glb"

FPS = 30

# Characters face Blender +Y so the glTF Y-up conversion lands them on -Z, which
# is the direction Three.js treats as forward.
BONES = {
    "hips": (None, (0.0, 0.0, 0.95), (0.0, 0.0, 1.07)),
    "spine": ("hips", (0.0, 0.0, 1.07), (0.0, 0.0, 1.24)),
    "chest": ("spine", (0.0, 0.0, 1.24), (0.0, 0.0, 1.44)),
    "neck": ("chest", (0.0, 0.0, 1.44), (0.0, 0.0, 1.53)),
    "head": ("neck", (0.0, 0.0, 1.53), (0.0, 0.0, 1.74)),
    "shoulder.L": ("chest", (0.03, 0.0, 1.41), (0.20, 0.0, 1.41)),
    "upperArm.L": ("shoulder.L", (0.20, 0.0, 1.41), (0.20, 0.0, 1.14)),
    "forearm.L": ("upperArm.L", (0.20, 0.0, 1.14), (0.20, 0.0, 0.90)),
    "hand.L": ("forearm.L", (0.20, 0.0, 0.90), (0.20, 0.0, 0.78)),
    "shoulder.R": ("chest", (-0.03, 0.0, 1.41), (-0.20, 0.0, 1.41)),
    "upperArm.R": ("shoulder.R", (-0.20, 0.0, 1.41), (-0.20, 0.0, 1.14)),
    "forearm.R": ("upperArm.R", (-0.20, 0.0, 1.14), (-0.20, 0.0, 0.90)),
    "hand.R": ("forearm.R", (-0.20, 0.0, 0.90), (-0.20, 0.0, 0.78)),
    "thigh.L": ("hips", (0.11, 0.0, 0.92), (0.11, 0.0, 0.52)),
    "shin.L": ("thigh.L", (0.11, 0.0, 0.52), (0.11, 0.0, 0.11)),
    "foot.L": ("shin.L", (0.11, 0.0, 0.11), (0.11, 0.17, 0.05)),
    "thigh.R": ("hips", (-0.11, 0.0, 0.92), (-0.11, 0.0, 0.52)),
    "shin.R": ("thigh.R", (-0.11, 0.0, 0.52), (-0.11, 0.0, 0.11)),
    "foot.R": ("shin.R", (-0.11, 0.0, 0.11), (-0.11, 0.17, 0.05)),
}

# Bones whose parent should not inherit a twist, so a spray or repair pose does
# not drag the whole torso with it.
DISCONNECTED = {"shoulder.L", "shoulder.R", "thigh.L", "thigh.R"}


def build_body(builder, *, bulk=1.0, seated_hint=False):
    """Shared body plan. `bulk` widens a passenger against the leaner crew."""
    skin, primary, secondary, accent = range(4)
    w = bulk
    builder.box("hips", (0.0, 0.0, 0.99), (0.34 * w, 0.23, 0.20), primary)
    builder.box("spine", (0.0, 0.0, 1.16), (0.36 * w, 0.24, 0.20), primary)
    builder.box("chest", (0.0, 0.0, 1.34), (0.42 * w, 0.26, 0.24), primary, taper=0.94)
    builder.box("neck", (0.0, 0.0, 1.49), (0.13, 0.13, 0.10), skin)
    builder.box("head", (0.0, 0.0, 1.63), (0.25, 0.25, 0.24), skin)
    builder.box("head", (0.0, 0.015, 1.745), (0.26, 0.26, 0.06), accent)
    builder.box("head", (0.0, -0.135, 1.63), (0.16, 0.02, 0.08), secondary)
    for side, sign in (("L", 1.0), ("R", -1.0)):
        builder.box(f"shoulder.{side}", (sign * 0.14, 0.0, 1.41), (0.14, 0.22, 0.16), primary)
        builder.box(f"upperArm.{side}", (sign * 0.20, 0.0, 1.28), (0.13, 0.15, 0.28), primary)
        builder.box(f"forearm.{side}", (sign * 0.20, 0.0, 1.02), (0.12, 0.13, 0.26), skin)
        builder.box(f"hand.{side}", (sign * 0.20, 0.0, 0.84), (0.13, 0.15, 0.14), skin)
        builder.box(f"thigh.{side}", (sign * 0.11, 0.0, 0.72), (0.17 * w, 0.19, 0.42), secondary)
        builder.box(f"shin.{side}", (sign * 0.11, 0.0, 0.32), (0.15, 0.16, 0.42), secondary)
        builder.box(f"foot.{side}", (sign * 0.11, 0.09, 0.05), (0.16, 0.28, 0.11), accent)
    if seated_hint:
        # A lap-strap plate reads as "belted in" without needing a second mesh.
        builder.box("hips", (0.0, -0.13, 0.99), (0.30 * w, 0.04, 0.07), accent)


# --- animation authoring -------------------------------------------------



def locomotion_clips():
    clips = []

    idle = Clip("idle", 60)
    for frame, lean in ((1, 0.0), (30, 1.6), (60, 0.0)):
        idle.keys_at(
            frame,
            {
                "spine": (lean, 0.0, 0.0),
                "chest": (lean * 0.5, 0.0, 0.0),
                "head": (-lean * 0.8, lean * 0.6, 0.0),
                "upperArm.L": (0.0, 0.0, -4.0 - lean),
                "upperArm.R": (0.0, 0.0, 4.0 + lean),
                "hips": {"t": (0.0, 0.0, -0.006 * lean)},
            },
        )
    clips.append(idle)

    walk = Clip("walk", 32)
    swing = [(1, 22.0), (8, 0.0), (16, -22.0), (24, 0.0), (32, 22.0)]
    for frame, angle in swing:
        lift = abs(math.sin(math.radians(angle * 2))) * 0.03
        walk.keys_at(
            frame,
            {
                "thigh.L": (angle, 0.0, 0.0),
                "thigh.R": (-angle, 0.0, 0.0),
                "shin.L": (max(0.0, -angle * 1.4), 0.0, 0.0),
                "shin.R": (max(0.0, angle * 1.4), 0.0, 0.0),
                "foot.L": (angle * 0.25, 0.0, 0.0),
                "foot.R": (-angle * 0.25, 0.0, 0.0),
                "upperArm.L": (-angle * 0.8, 0.0, -6.0),
                "upperArm.R": (angle * 0.8, 0.0, 6.0),
                "forearm.L": (-abs(angle) * 0.5, 0.0, 0.0),
                "forearm.R": (-abs(angle) * 0.5, 0.0, 0.0),
                "spine": (3.0, 0.0, -angle * 0.12),
                "chest": (0.0, 0.0, angle * 0.2),
                "head": (0.0, 0.0, -angle * 0.14),
                "hips": {"r": (0.0, angle * 0.1, 0.0), "t": (0.0, 0.0, lift)},
            },
        )
    clips.append(walk)

    sprint = Clip("sprint", 22)
    for frame, angle in [(1, 38.0), (6, 0.0), (11, -38.0), (17, 0.0), (22, 38.0)]:
        lift = abs(math.sin(math.radians(angle * 2))) * 0.05
        sprint.keys_at(
            frame,
            {
                "thigh.L": (angle, 0.0, 0.0),
                "thigh.R": (-angle, 0.0, 0.0),
                "shin.L": (max(0.0, -angle * 1.8), 0.0, 0.0),
                "shin.R": (max(0.0, angle * 1.8), 0.0, 0.0),
                "foot.L": (angle * 0.3, 0.0, 0.0),
                "foot.R": (-angle * 0.3, 0.0, 0.0),
                "upperArm.L": (-angle * 1.1, 0.0, -10.0),
                "upperArm.R": (angle * 1.1, 0.0, 10.0),
                "forearm.L": (-70.0, 0.0, 0.0),
                "forearm.R": (-70.0, 0.0, 0.0),
                "spine": (14.0, 0.0, -angle * 0.15),
                "chest": (4.0, 0.0, angle * 0.24),
                "head": (-10.0, 0.0, -angle * 0.16),
                "hips": {"r": (0.0, angle * 0.14, 0.0), "t": (0.0, 0.0, lift)},
            },
        )
    clips.append(sprint)

    crouch = Clip("crouch_idle", 48)
    for frame, breathe in ((1, 0.0), (24, 2.0), (48, 0.0)):
        crouch.keys_at(
            frame,
            {
                "thigh.L": (62.0, 0.0, 0.0),
                "thigh.R": (62.0, 0.0, 0.0),
                "shin.L": (-78.0, 0.0, 0.0),
                "shin.R": (-78.0, 0.0, 0.0),
                "foot.L": (18.0, 0.0, 0.0),
                "foot.R": (18.0, 0.0, 0.0),
                "spine": (24.0 + breathe, 0.0, 0.0),
                "chest": (6.0, 0.0, 0.0),
                "head": (-22.0, 0.0, 0.0),
                "upperArm.L": (-24.0, 0.0, -12.0),
                "upperArm.R": (-24.0, 0.0, 12.0),
                "forearm.L": (-48.0, 0.0, 0.0),
                "forearm.R": (-48.0, 0.0, 0.0),
                "hips": {"t": (0.0, 0.0, -0.34)},
            },
        )
    clips.append(crouch)

    return clips


def carry_clips():
    clips = []

    carry_arms = {
        "upperArm.L": (-58.0, 0.0, -16.0),
        "upperArm.R": (-58.0, 0.0, 16.0),
        "forearm.L": (-64.0, 0.0, 0.0),
        "forearm.R": (-64.0, 0.0, 0.0),
        "hand.L": (0.0, 0.0, -14.0),
        "hand.R": (0.0, 0.0, 14.0),
    }

    carry_idle = Clip("carry_idle", 54)
    for frame, sway in ((1, 0.0), (27, 2.2), (54, 0.0)):
        table = dict(carry_arms)
        table["spine"] = (-4.0 + sway, 0.0, 0.0)
        table["chest"] = (2.0, 0.0, 0.0)
        table["head"] = (6.0, sway * 0.8, 0.0)
        carry_idle.keys_at(frame, table)
    clips.append(carry_idle)

    carry_walk = Clip("carry_walk", 34)
    for frame, angle in [(1, 18.0), (9, 0.0), (17, -18.0), (26, 0.0), (34, 18.0)]:
        table = dict(carry_arms)
        table["thigh.L"] = (angle, 0.0, 0.0)
        table["thigh.R"] = (-angle, 0.0, 0.0)
        table["shin.L"] = (max(0.0, -angle * 1.3), 0.0, 0.0)
        table["shin.R"] = (max(0.0, angle * 1.3), 0.0, 0.0)
        table["spine"] = (-3.0, 0.0, -angle * 0.08)
        table["chest"] = (2.0, 0.0, angle * 0.1)
        table["hips"] = {
            "r": (0.0, angle * 0.08, 0.0),
            "t": (0.0, 0.0, abs(math.sin(math.radians(angle * 2))) * 0.02),
        }
        carry_walk.keys_at(frame, table)
    clips.append(carry_walk)

    push = Clip("push_cart", 40)
    for frame, lean in [(1, 0.0), (10, 3.0), (20, 0.0), (30, 3.0), (40, 0.0)]:
        push.keys_at(
            frame,
            {
                "spine": (16.0 + lean, 0.0, 0.0),
                "chest": (4.0, 0.0, 0.0),
                "head": (-14.0, 0.0, 0.0),
                "upperArm.L": (-74.0, 0.0, -8.0),
                "upperArm.R": (-74.0, 0.0, 8.0),
                "forearm.L": (-12.0, 0.0, 0.0),
                "forearm.R": (-12.0, 0.0, 0.0),
                "thigh.L": (14.0 - lean * 2, 0.0, 0.0),
                "thigh.R": (-10.0 + lean * 2, 0.0, 0.0),
                "shin.L": (-14.0, 0.0, 0.0),
                "shin.R": (-6.0, 0.0, 0.0),
            },
        )
    clips.append(push)

    return clips


def action_clips():
    clips = []

    serve = Clip("serve", 26, loop=False)
    serve.keys_at(
        1,
        {
            "upperArm.R": (-52.0, 0.0, 14.0),
            "forearm.R": (-62.0, 0.0, 0.0),
            "hand.R": (0.0, 0.0, 10.0),
            "spine": (0.0, 0.0, 0.0),
            "head": (0.0, 0.0, 0.0),
        },
    )
    serve.keys_at(
        9,
        {
            "upperArm.R": (-96.0, 0.0, 22.0),
            "forearm.R": (-24.0, 0.0, 0.0),
            "hand.R": (8.0, 0.0, 4.0),
            "spine": (8.0, 0.0, -10.0),
            "head": (4.0, -12.0, 0.0),
        },
    )
    serve.keys_at(
        16,
        {
            "upperArm.R": (-88.0, 0.0, 18.0),
            "forearm.R": (-16.0, 0.0, 0.0),
            "hand.R": (-16.0, 0.0, 0.0),
            "spine": (6.0, 0.0, -8.0),
            "head": (2.0, -10.0, 0.0),
        },
    )
    serve.keys_at(
        26,
        {
            "upperArm.R": (-54.0, 0.0, 14.0),
            "forearm.R": (-58.0, 0.0, 0.0),
            "hand.R": (0.0, 0.0, 8.0),
            "spine": (0.0, 0.0, 0.0),
            "head": (0.0, 0.0, 0.0),
        },
    )
    clips.append(serve)

    reject = Clip("recoil", 30, loop=False)
    reject.keys_at(
        1, {"upperArm.R": (-70.0, 0.0, 16.0), "spine": (0.0, 0.0, 0.0), "head": (0.0, 0.0, 0.0)}
    )
    reject.keys_at(
        7,
        {
            "upperArm.R": (-30.0, 0.0, 34.0),
            "forearm.R": (-84.0, 0.0, 0.0),
            "spine": (-14.0, 0.0, 12.0),
            "chest": (-6.0, 0.0, 8.0),
            "head": (-16.0, 18.0, 0.0),
        },
    )
    reject.keys_at(
        15,
        {
            "upperArm.R": (-56.0, 0.0, 20.0),
            "forearm.R": (-52.0, 0.0, 0.0),
            "spine": (4.0, 0.0, -6.0),
            "head": (6.0, -8.0, 0.0),
        },
    )
    reject.keys_at(
        30,
        {
            "upperArm.R": (-64.0, 0.0, 16.0),
            "forearm.R": (-60.0, 0.0, 0.0),
            "spine": (0.0, 0.0, 0.0),
            "head": (0.0, 0.0, 0.0),
        },
    )
    clips.append(reject)

    throw = Clip("throw", 24, loop=False)
    throw.keys_at(
        1,
        {
            "upperArm.R": (-46.0, 0.0, 16.0),
            "forearm.R": (-70.0, 0.0, 0.0),
            "spine": (0.0, 0.0, 0.0),
        },
    )
    throw.keys_at(
        8,
        {
            "upperArm.R": (44.0, 0.0, 24.0),
            "forearm.R": (-104.0, 0.0, 0.0),
            "spine": (-10.0, 0.0, 18.0),
            "chest": (-4.0, 0.0, 10.0),
            "head": (-6.0, 16.0, 0.0),
        },
    )
    throw.keys_at(
        13,
        {
            "upperArm.R": (-118.0, 0.0, 10.0),
            "forearm.R": (-12.0, 0.0, 0.0),
            "spine": (14.0, 0.0, -20.0),
            "chest": (6.0, 0.0, -12.0),
            "head": (8.0, -18.0, 0.0),
        },
    )
    throw.keys_at(
        24,
        {
            "upperArm.R": (-48.0, 0.0, 16.0),
            "forearm.R": (-66.0, 0.0, 0.0),
            "spine": (0.0, 0.0, 0.0),
            "chest": (0.0, 0.0, 0.0),
            "head": (0.0, 0.0, 0.0),
        },
    )
    clips.append(throw)

    spray = Clip("spray", 28)
    for frame, shake in [(1, 0.0), (5, 1.6), (11, -1.2), (17, 1.4), (23, -1.0), (28, 0.0)]:
        spray.keys_at(
            frame,
            {
                "upperArm.L": (-78.0 + shake, 0.0, -22.0),
                "upperArm.R": (-84.0 - shake, 0.0, 18.0),
                "forearm.L": (-46.0, 0.0, 0.0),
                "forearm.R": (-38.0 + shake * 2, 0.0, 0.0),
                "hand.L": (shake * 3, 0.0, 0.0),
                "hand.R": (shake * 3, 0.0, 0.0),
                "spine": (-8.0 - shake, 0.0, 0.0),
                "chest": (-4.0, 0.0, 0.0),
                "head": (10.0 + shake, 0.0, 0.0),
                "thigh.L": (10.0, 0.0, 0.0),
                "thigh.R": (-6.0, 0.0, 0.0),
                "shin.L": (-16.0, 0.0, 0.0),
            },
        )
    clips.append(spray)

    repair = Clip("repair", 36)
    for frame, twist in [(1, 0.0), (9, 26.0), (18, -8.0), (27, 26.0), (36, 0.0)]:
        repair.keys_at(
            frame,
            {
                "upperArm.R": (-104.0, 0.0, 12.0),
                "forearm.R": (-28.0, twist, 0.0),
                "hand.R": (0.0, twist * 1.4, 0.0),
                "upperArm.L": (-52.0, 0.0, -16.0),
                "forearm.L": (-70.0, 0.0, 0.0),
                "spine": (10.0, 0.0, -6.0),
                "chest": (2.0, 0.0, -4.0),
                "head": (-4.0, -8.0, 0.0),
                "thigh.L": (16.0, 0.0, 0.0),
                "shin.L": (-20.0, 0.0, 0.0),
            },
        )
    clips.append(repair)

    brace = Clip("brace", 40)
    for frame, tremor in [(1, 0.0), (10, 2.4), (20, -1.8), (30, 2.0), (40, 0.0)]:
        brace.keys_at(
            frame,
            {
                "spine": (26.0 + tremor, 0.0, 0.0),
                "chest": (10.0, 0.0, 0.0),
                "head": (-30.0 - tremor, 0.0, 0.0),
                "upperArm.L": (-116.0, 0.0, -26.0),
                "upperArm.R": (-116.0, 0.0, 26.0),
                "forearm.L": (-104.0, 0.0, 0.0),
                "forearm.R": (-104.0, 0.0, 0.0),
                "thigh.L": (34.0, 0.0, 0.0),
                "thigh.R": (34.0, 0.0, 0.0),
                "shin.L": (-44.0, 0.0, 0.0),
                "shin.R": (-44.0, 0.0, 0.0),
                "hips": {"t": (0.0, 0.0, -0.16)},
            },
        )
    clips.append(brace)

    stumble = Clip("stumble", 34, loop=False)
    stumble.keys_at(1, {"spine": (0.0, 0.0, 0.0), "hips": {"t": (0.0, 0.0, 0.0)}})
    stumble.keys_at(
        7,
        {
            "spine": (-24.0, 0.0, 16.0),
            "chest": (-8.0, 0.0, 10.0),
            "head": (-18.0, 0.0, 14.0),
            "upperArm.L": (-128.0, 0.0, -46.0),
            "upperArm.R": (-84.0, 0.0, 30.0),
            "forearm.L": (-40.0, 0.0, 0.0),
            "thigh.L": (44.0, 0.0, 0.0),
            "shin.L": (-58.0, 0.0, 0.0),
            "hips": {"r": (0.0, 0.0, -12.0), "t": (0.06, 0.0, -0.1)},
        },
    )
    stumble.keys_at(
        18,
        {
            "spine": (18.0, 0.0, -10.0),
            "chest": (6.0, 0.0, -6.0),
            "head": (12.0, 0.0, -8.0),
            "upperArm.L": (-60.0, 0.0, -20.0),
            "upperArm.R": (-116.0, 0.0, 40.0),
            "thigh.R": (40.0, 0.0, 0.0),
            "shin.R": (-52.0, 0.0, 0.0),
            "hips": {"r": (0.0, 0.0, 8.0), "t": (-0.04, 0.0, -0.06)},
        },
    )
    stumble.keys_at(
        34,
        {
            "spine": (0.0, 0.0, 0.0),
            "chest": (0.0, 0.0, 0.0),
            "head": (0.0, 0.0, 0.0),
            "upperArm.L": (0.0, 0.0, -4.0),
            "upperArm.R": (0.0, 0.0, 4.0),
            "thigh.L": (0.0, 0.0, 0.0),
            "thigh.R": (0.0, 0.0, 0.0),
            "shin.L": (0.0, 0.0, 0.0),
            "shin.R": (0.0, 0.0, 0.0),
            "hips": {"r": (0.0, 0.0, 0.0), "t": (0.0, 0.0, 0.0)},
        },
    )
    clips.append(stumble)

    celebrate = Clip("celebrate", 44, loop=False)
    for frame, lift in [(1, 0.0), (10, 1.0), (20, 0.72), (30, 1.0), (44, 0.0)]:
        celebrate.keys_at(
            frame,
            {
                "upperArm.L": (-14.0 - 150.0 * lift, 0.0, -12.0 - 22.0 * lift),
                "upperArm.R": (-14.0 - 150.0 * lift, 0.0, 12.0 + 22.0 * lift),
                "forearm.L": (-20.0 * lift, 0.0, 0.0),
                "forearm.R": (-20.0 * lift, 0.0, 0.0),
                "spine": (-12.0 * lift, 0.0, 0.0),
                "head": (-16.0 * lift, 0.0, 0.0),
                "thigh.L": (-6.0 * lift, 0.0, 0.0),
                "thigh.R": (-6.0 * lift, 0.0, 0.0),
                "hips": {"t": (0.0, 0.0, 0.07 * lift)},
            },
        )
    clips.append(celebrate)

    return clips


def seated_clips():
    """Passenger clips. The seated base pose is folded into every keyframe so a
    crossfade between two seated clips never straightens the legs."""
    seat = {
        "thigh.L": (86.0, 0.0, 2.0),
        "thigh.R": (86.0, 0.0, -2.0),
        "shin.L": (-84.0, 0.0, 0.0),
        "shin.R": (-84.0, 0.0, 0.0),
        "foot.L": (-4.0, 0.0, 0.0),
        "foot.R": (-4.0, 0.0, 0.0),
        "hips": {"t": (0.0, 0.0, -0.42)},
    }

    def seated(extra):
        table = dict(seat)
        table.update(extra)
        return table

    clips = []

    idle = Clip("seat_idle", 72)
    for frame, breathe in ((1, 0.0), (24, 1.8), (48, 0.6), (72, 0.0)):
        idle.keys_at(
            frame,
            seated(
                {
                    "spine": (-2.0 + breathe, 0.0, 0.0),
                    "chest": (breathe * 0.6, 0.0, 0.0),
                    "head": (breathe * 0.5, breathe * 2.0, 0.0),
                    "upperArm.L": (-72.0, 0.0, -10.0),
                    "upperArm.R": (-72.0, 0.0, 10.0),
                    "forearm.L": (-56.0, 0.0, 0.0),
                    "forearm.R": (-56.0, 0.0, 0.0),
                }
            ),
        )
    clips.append(idle)

    wave = Clip("seat_wave", 40)
    for frame, swing in [(1, 0.0), (8, 22.0), (16, -18.0), (24, 22.0), (32, -14.0), (40, 0.0)]:
        wave.keys_at(
            frame,
            seated(
                {
                    "upperArm.R": (-158.0, 0.0, 14.0),
                    "forearm.R": (-16.0, 0.0, swing),
                    "hand.R": (0.0, 0.0, swing * 0.8),
                    "upperArm.L": (-70.0, 0.0, -10.0),
                    "forearm.L": (-54.0, 0.0, 0.0),
                    "spine": (-4.0, 0.0, -3.0),
                    "head": (-6.0, -4.0, 0.0),
                }
            ),
        )
    clips.append(wave)

    impatient = Clip("seat_impatient", 26)
    for frame, tap in [(1, 0.0), (5, 16.0), (9, 0.0), (13, 16.0), (17, 0.0), (26, 0.0)]:
        impatient.keys_at(
            frame,
            seated(
                {
                    "upperArm.R": (-96.0, 0.0, 16.0),
                    "forearm.R": (-58.0, 0.0, 0.0),
                    "hand.R": (-tap, 0.0, 0.0),
                    "upperArm.L": (-68.0, 0.0, -10.0),
                    "forearm.L": (-60.0, 0.0, 0.0),
                    "spine": (4.0, 0.0, 0.0),
                    "chest": (2.0, 0.0, 0.0),
                    "head": (-8.0, tap * 0.4, 0.0),
                }
            ),
        )
    clips.append(impatient)

    frantic = Clip("seat_frantic", 20)
    for frame, swing in [(1, 0.0), (5, 34.0), (10, -26.0), (15, 34.0), (20, 0.0)]:
        frantic.keys_at(
            frame,
            seated(
                {
                    "upperArm.R": (-168.0, 0.0, 18.0),
                    "upperArm.L": (-150.0, 0.0, -18.0),
                    "forearm.R": (-24.0, 0.0, swing),
                    "forearm.L": (-24.0, 0.0, -swing),
                    "spine": (-6.0, 0.0, swing * 0.1),
                    "chest": (-2.0, 0.0, -swing * 0.08),
                    "head": (-10.0, swing * 0.2, 0.0),
                }
            ),
        )
    clips.append(frantic)

    receive = Clip("seat_receive", 30, loop=False)
    receive.keys_at(
        1,
        seated(
            {
                "upperArm.R": (-96.0, 0.0, 16.0),
                "forearm.R": (-56.0, 0.0, 0.0),
                "upperArm.L": (-70.0, 0.0, -10.0),
                "forearm.L": (-54.0, 0.0, 0.0),
            }
        ),
    )
    receive.keys_at(
        10,
        seated(
            {
                "upperArm.R": (-120.0, 0.0, 22.0),
                "forearm.R": (-20.0, 0.0, 0.0),
                "hand.R": (14.0, 0.0, 0.0),
                "spine": (8.0, 0.0, -8.0),
                "head": (6.0, -14.0, 0.0),
            }
        ),
    )
    receive.keys_at(
        30,
        seated(
            {
                "upperArm.R": (-88.0, 0.0, 16.0),
                "forearm.R": (-62.0, 0.0, 0.0),
                "hand.R": (0.0, 0.0, 0.0),
                "spine": (0.0, 0.0, 0.0),
                "head": (0.0, 0.0, 0.0),
            }
        ),
    )
    clips.append(receive)

    cheer = Clip("seat_celebrate", 42, loop=False)
    for frame, lift in [(1, 0.0), (9, 1.0), (19, 0.68), (28, 0.94), (42, 0.0)]:
        cheer.keys_at(
            frame,
            seated(
                {
                    "upperArm.L": (-72.0 - 96.0 * lift, 0.0, -10.0 - 20.0 * lift),
                    "upperArm.R": (-72.0 - 96.0 * lift, 0.0, 10.0 + 20.0 * lift),
                    "forearm.L": (-56.0 + 40.0 * lift, 0.0, 0.0),
                    "forearm.R": (-56.0 + 40.0 * lift, 0.0, 0.0),
                    "spine": (-10.0 * lift, 0.0, 0.0),
                    "head": (-14.0 * lift, 0.0, 0.0),
                    "hips": {"t": (0.0, 0.0, -0.42 + 0.05 * lift)},
                }
            ),
        )
    clips.append(cheer)

    slump = Clip("seat_slump", 46, loop=False)
    slump.keys_at(
        1,
        seated(
            {
                "spine": (0.0, 0.0, 0.0),
                "upperArm.L": (-70.0, 0.0, -10.0),
                "upperArm.R": (-70.0, 0.0, 10.0),
            }
        ),
    )
    slump.keys_at(
        16,
        seated(
            {
                "spine": (22.0, 0.0, 4.0),
                "chest": (10.0, 0.0, 0.0),
                "head": (-26.0, 8.0, 0.0),
                "upperArm.L": (-52.0, 0.0, -6.0),
                "upperArm.R": (-52.0, 0.0, 6.0),
                "forearm.L": (-30.0, 0.0, 0.0),
                "forearm.R": (-30.0, 0.0, 0.0),
            }
        ),
    )
    slump.keys_at(
        46,
        seated(
            {
                "spine": (18.0, 0.0, 3.0),
                "chest": (8.0, 0.0, 0.0),
                "head": (-22.0, 6.0, 0.0),
                "upperArm.L": (-54.0, 0.0, -6.0),
                "upperArm.R": (-54.0, 0.0, 6.0),
                "forearm.L": (-34.0, 0.0, 0.0),
                "forearm.R": (-34.0, 0.0, 0.0),
            }
        ),
    )
    clips.append(slump)

    panic = Clip("seat_panic", 18)
    for frame, shake in [(1, 0.0), (4, 3.4), (8, -3.0), (12, 3.2), (15, -2.6), (18, 0.0)]:
        panic.keys_at(
            frame,
            seated(
                {
                    "spine": (-8.0, 0.0, shake),
                    "chest": (-4.0, 0.0, -shake * 0.6),
                    "head": (-14.0, shake * 2.4, shake),
                    "upperArm.L": (-146.0, 0.0, -24.0 - shake),
                    "upperArm.R": (-146.0, 0.0, 24.0 + shake),
                    "forearm.L": (-64.0, 0.0, 0.0),
                    "forearm.R": (-64.0, 0.0, 0.0),
                    "hips": {"t": (shake * 0.004, 0.0, -0.42)},
                }
            ),
        )
    clips.append(panic)

    seat_brace = Clip("seat_brace", 36)
    for frame, tremor in [(1, 0.0), (9, 2.2), (18, -1.6), (27, 2.0), (36, 0.0)]:
        seat_brace.keys_at(
            frame,
            seated(
                {
                    "spine": (44.0 + tremor, 0.0, 0.0),
                    "chest": (14.0, 0.0, 0.0),
                    "head": (-34.0 - tremor, 0.0, 0.0),
                    "upperArm.L": (-128.0, 0.0, -18.0),
                    "upperArm.R": (-128.0, 0.0, 18.0),
                    "forearm.L": (-92.0, 0.0, 0.0),
                    "forearm.R": (-92.0, 0.0, 0.0),
                    "hips": {"t": (0.0, 0.0, -0.44)},
                }
            ),
        )
    clips.append(seat_brace)

    bounce = Clip("seat_turbulence", 24)
    for frame, jolt in [(1, 0.0), (5, 1.0), (10, -0.5), (15, 0.8), (20, -0.3), (24, 0.0)]:
        bounce.keys_at(
            frame,
            seated(
                {
                    "spine": (-6.0 * jolt, 0.0, 3.0 * jolt),
                    "chest": (-3.0 * jolt, 0.0, -2.0 * jolt),
                    "head": (-12.0 * jolt, 4.0 * jolt, 2.0 * jolt),
                    "upperArm.L": (-74.0 - 10.0 * jolt, 0.0, -12.0),
                    "upperArm.R": (-74.0 - 10.0 * jolt, 0.0, 12.0),
                    "forearm.L": (-58.0, 0.0, 0.0),
                    "forearm.R": (-58.0, 0.0, 0.0),
                    "hips": {"t": (0.0, 0.0, -0.42 + 0.045 * jolt)},
                }
            ),
        )
    clips.append(bounce)

    return clips


def build():
    reset_scene(FPS)
    armature = build_armature("CM_HUMANOID", BONES, DISCONNECTED)

    crew_materials = [
        material("cm_skin", (0.86, 0.66, 0.49)),
        material("cm_crew_uniform", (0.12, 0.16, 0.42)),
        material("cm_crew_trim", (0.09, 0.11, 0.30)),
        material("cm_crew_accent", (0.98, 0.36, 0.16), roughness=0.4),
    ]
    passenger_materials = [
        material("cm_pax_skin", (0.79, 0.58, 0.44)),
        material("cm_pax_shirt", (0.24, 0.68, 0.62)),
        material("cm_pax_trousers", (0.30, 0.28, 0.34)),
        material("cm_pax_accent", (0.98, 0.74, 0.22), roughness=0.45),
    ]

    crew = MeshBuilder()
    build_body(crew, bulk=0.98)
    crew.finish("CM_CREW", armature, crew_materials)

    passenger = MeshBuilder()
    build_body(passenger, bulk=1.12, seated_hint=True)
    passenger.finish("CM_PASSENGER", armature, passenger_materials)

    clips = locomotion_clips() + carry_clips() + action_clips() + seated_clips()
    for clip in clips:
        bake(armature, clip)

    root = bpy.data.objects.new("CM_CHARACTER_ROOT", None)
    bpy.context.collection.objects.link(root)
    armature.parent = root

    export(SOURCE_PATH, RUNTIME_PATH)
    print(f"Exported {len(clips)} clips to {RUNTIME_PATH}")


build()

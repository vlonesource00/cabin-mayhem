"""
Build 10 new seated passengers one-by-one (with QA), then T-pose versions of ALL 22.
Keeps existing A/B/C seated characters. Saves passengers.blend.
"""
import bpy
import os
from math import radians
from mathutils import Euler

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
BLEND_OUT = os.path.join(REPO, "assets-src", "blender", "passengers.blend")

# ---- load factory into globals ----
factory_path = os.path.join(HERE, "character_factory.py")
with open(factory_path, "r", encoding="utf-8") as f:
    factory_src = f.read()
# Execute factory in this module namespace
g = globals()
exec(compile(factory_src, factory_path, "exec"), g)

# Inject helpers into a shared namespace for hair modules
NS = {
    "sph": g["sph"],
    "cyl": g["cyl"],
    "box": g["box"],
    "apply_scale_local": g["apply_scale_local"],
    "M": g["M"],
    "radians": radians,
    "bpy": bpy,
}


def load_module(path):
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    local = dict(NS)
    exec(compile(src, path, "exec"), local)
    return local


existing = load_module(os.path.join(HERE, "chars", "hair_existing.py"))
d12 = load_module(os.path.join(HERE, "chars", "batch_D12.py"))
d34 = load_module(os.path.join(HERE, "chars", "batch_D34.py"))
d5e1 = load_module(os.path.join(HERE, "chars", "batch_D5E1.py"))
e23 = load_module(os.path.join(HERE, "chars", "batch_E23.py"))
e45 = load_module(os.path.join(HERE, "chars", "batch_E45.py"))

NEW_SEATED = [
    # (prefix, x, y, skin, spec)
    ("D_char1", 0, 9, *d12["SPECS_D12"][0][1:]),
    ("D_char2", 2, 9, *d12["SPECS_D12"][1][1:]),
    ("D_char3", 4, 9, *d34["SPECS_D34"][0][1:]),
    ("D_char4", 6, 9, *d34["SPECS_D34"][1][1:]),
    ("D_char5", 8, 9, *d5e1["SPECS_D5E1"][0][1:]),
    ("E_char1", 0, 12, *d5e1["SPECS_D5E1"][1][1:]),
    ("E_char2", 2, 12, *e23["SPECS_E23"][0][1:]),
    ("E_char3", 4, 12, *e23["SPECS_E23"][1][1:]),
    ("E_char4", 6, 12, *e45["SPECS_E45"][0][1:]),
    ("E_char5", 8, 12, *e45["SPECS_E45"][1][1:]),
]

# Fix SPECS unpacking — SPECS are (prefix, skin, dict)
NEW_SEATED = []
for (prefix, skin, spec), (x, y) in zip(
    [
        d12["SPECS_D12"][0],
        d12["SPECS_D12"][1],
        d34["SPECS_D34"][0],
        d34["SPECS_D34"][1],
        d5e1["SPECS_D5E1"][0],
        d5e1["SPECS_D5E1"][1],
        e23["SPECS_E23"][0],
        e23["SPECS_E23"][1],
        e45["SPECS_E45"][0],
        e45["SPECS_E45"][1],
    ],
    [
        (0, 9),
        (2, 9),
        (4, 9),
        (6, 9),
        (8, 9),
        (0, 12),
        (2, 12),
        (4, 12),
        (6, 12),
        (8, 12),
    ],
):
    NEW_SEATED.append((prefix, x, y, skin, spec))

EXISTING = []
for prefix, skin, spec in existing["EXISTING_SPECS"]:
    # seated positions from original grid
    row = {"A": 0, "B": 3, "C": 6}[prefix[0]]
    col = (int(prefix[-1]) - 1) * 2
    EXISTING.append((prefix, col, row, skin, spec))

build_character = g["build_character"]
qa_character = g["qa_character"]

results = []

print("=== BUILD 10 NEW SEATED (one by one) ===")
for prefix, x, y, skin, spec in NEW_SEATED:
    print(f"Building seated {prefix} ...")
    issues = build_character(prefix, x, y, skin, spec, pose="sit")
    status = "OK" if not issues else "FAIL"
    print(f"  {status}", issues)
    results.append((prefix, "sit", status, issues))
    if issues:
        raise RuntimeError(f"{prefix} failed QA: {issues}")
    bpy.ops.wm.save_mainfile()

print("=== BUILD T-POSE FOR ALL 22 ===")
# Remove old T_ characters if any
for o in list(bpy.data.objects):
    if o.name.startswith("T_"):
        bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections):
    if c.name.startswith("T_"):
        bpy.data.collections.remove(c)

ALL = EXISTING + NEW_SEATED
for prefix, x, y, skin, spec in ALL:
    tprefix = "T_" + prefix
    # T-pose grid to the right of seated cast
    tx, ty = x + 14, y
    print(f"Building T-pose {tprefix} ...")
    issues = build_character(tprefix, tx, ty, skin, spec, pose="tpose")
    status = "OK" if not issues else "FAIL"
    print(f"  {status}", issues)
    results.append((tprefix, "tpose", status, issues))
    if issues:
        raise RuntimeError(f"{tprefix} failed QA: {issues}")
    bpy.ops.wm.save_mainfile()

# Viewport polish
for window in bpy.context.window_manager.windows:
    for area in window.screen.areas:
        if area.type == "VIEW_3D":
            for space in area.spaces:
                if space.type == "VIEW_3D":
                    space.shading.type = "MATERIAL"
                    space.overlay.show_relationship_lines = False
                    space.overlay.show_extras = False
                    rv3d = space.region_3d
                    rv3d.view_location = (8.0, 6.0, 0.9)
                    rv3d.view_distance = 22.0
                    rv3d.view_rotation = Euler((radians(65), 0, radians(20)), "XYZ").to_quaternion()

bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)

print("=== SUMMARY ===")
for r in results:
    print(r)
seated = [n for n in bpy.data.objects if n.name.endswith("_root") and not n.name.startswith("T_")]
tpose = [n for n in bpy.data.objects if n.name.endswith("_root") and n.name.startswith("T_")]
print(f"seated roots: {len(seated)} tpose roots: {len(tpose)}")
print("DONE")

"""Dependency-free structural validation for authored invasion GLBs."""

from pathlib import Path
import json
import struct
import sys


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = {
    "characters/pirate-boarder.glb": {
        "nodes": ["Armature", "weapon_socket_r", "weapon_socket_l"],
        "actions": ["Idle", "Run", "Board", "Aim", "Fire", "Melee", "HitReact", "Fall", "Retreat"],
        "min_meshes": 20, "min_materials": 6, "min_joints": 18, "min_bytes": 80000,
    },
    "characters/saboteur-boarder.glb": {
        "nodes": ["Armature", "weapon_socket_r", "explosive_socket"],
        "actions": ["Idle", "Run", "Board", "Aim", "PlantExplosive", "ArmExplosive", "HitReact", "Fall", "Retreat"],
        "min_meshes": 24, "min_materials": 6, "min_joints": 18, "min_bytes": 80000,
    },
    "weapons/boarding-pistol.glb": {"nodes": ["root", "grip", "muzzle"], "actions": [], "min_meshes": 7, "min_materials": 3, "min_bytes": 10000},
    "weapons/boarding-cutlass.glb": {"nodes": ["root", "grip"], "actions": [], "min_meshes": 6, "min_materials": 3, "min_bytes": 10000},
    "explosives/satchel-charge.glb": {"nodes": ["root", "indicator", "interaction_anchor"], "actions": ["Idle", "Arm", "Disarm", "Detonate"], "min_meshes": 8, "min_materials": 4, "min_bytes": 15000},
    "boarding/boarding-board.glb": {"nodes": ["root", "ship_attach", "raider_attach", "interaction_anchor", "detach_hinge"], "actions": ["Approach", "Attach", "Detach", "Detached"], "min_meshes": 12, "min_materials": 3, "min_bytes": 18000},
    "boarding/pirate-gangway.glb": {"nodes": ["root", "ship_attach", "raider_attach", "interaction_anchor", "release_hinge"], "actions": ["Approach", "Attach", "Release", "Detached"], "min_meshes": 25, "min_materials": 3, "min_bytes": 25000},
    "props/pirate-gear-crate.glb": {"nodes": ["root", "interaction_anchor"], "actions": ["Closed", "Open"], "min_meshes": 6, "min_materials": 3, "min_bytes": 10000},
}

ASSET_IDS = [
    "pirate-boarder-character", "saboteur-boarder-character", "boarding-pistol",
    "boarding-cutlass", "satchel-charge", "boarding-board", "pirate-gangway",
    "pirate-gear-crate",
]


def glb_json(path):
    raw = path.read_bytes()
    if len(raw) < 20 or raw[:4] != b"glTF":
        raise ValueError("not a GLB 2 container")
    version, total = struct.unpack_from("<II", raw, 4)
    if version != 2 or total != len(raw):
        raise ValueError(f"bad GLB header version={version} length={total}/{len(raw)}")
    json_size, json_type = struct.unpack_from("<II", raw, 12)
    if json_type != 0x4E4F534A:
        raise ValueError("first GLB chunk is not JSON")
    return raw, json.loads(raw[20:20 + json_size].decode("utf8"))


def main():
    failures = []
    manifest = json.loads((ROOT / "public" / "assets" / "manifest.json").read_text(encoding="utf8"))
    entries = {entry["id"]: entry for entry in manifest.get("assets", [])}
    for asset_id, (relative, rules) in zip(ASSET_IDS, CONTRACT.items()):
        path = ROOT / "public" / "assets" / "invasions" / relative
        source = ROOT / "assets-src" / "blender" / "invasions" / (path.stem + ".blend")
        entry = entries.get(asset_id)
        if not entry:
            failures.append(f"{asset_id}: missing from public/assets/manifest.json")
        else:
            expected_runtime = path.relative_to(ROOT).as_posix()
            expected_source = source.relative_to(ROOT).as_posix()
            if entry.get("runtimeFile") != expected_runtime:
                failures.append(f"{asset_id}: manifest runtimeFile is {entry.get('runtimeFile')!r}, expected {expected_runtime!r}")
            if entry.get("sourceFile") != expected_source:
                failures.append(f"{asset_id}: manifest sourceFile is {entry.get('sourceFile')!r}, expected {expected_source!r}")
        if not source.is_file() or source.stat().st_size < 50000:
            failures.append(f"{relative}: missing/non-production Blender source {source.relative_to(ROOT)}")
        try:
            raw, gltf = glb_json(path)
        except Exception as error:
            failures.append(f"{relative}: {error}")
            continue
        names = {node.get("name", "") for node in gltf.get("nodes", [])}
        actions = {animation.get("name", "") for animation in gltf.get("animations", [])}
        joints = {joint for skin in gltf.get("skins", []) for joint in skin.get("joints", [])}
        for name in rules["nodes"]:
            if name not in names:
                failures.append(f"{relative}: missing node {name}")
        for name in rules["actions"]:
            if name not in actions:
                failures.append(f"{relative}: missing Action {name}")
        undeclared = actions - set(rules["actions"])
        if undeclared:
            failures.append(f"{relative}: undeclared Actions {sorted(undeclared)}")
        if len(gltf.get("meshes", [])) < rules["min_meshes"]:
            failures.append(f"{relative}: only {len(gltf.get('meshes', []))} meshes")
        if len(gltf.get("materials", [])) < rules["min_materials"]:
            failures.append(f"{relative}: only {len(gltf.get('materials', []))} materials")
        if len(joints) < rules.get("min_joints", 0):
            failures.append(f"{relative}: only {len(joints)} skeleton joints")
        if len(raw) < rules["min_bytes"]:
            failures.append(f"{relative}: only {len(raw)} bytes")
        print(f"PASS {relative}: {len(raw)} bytes, {len(gltf.get('meshes', []))} meshes, {len(gltf.get('materials', []))} materials, {len(joints)} joints, {len(actions)} Actions")
    if failures:
        print("\nInvasion asset contract violations:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1
    print(f"Invasion asset pack valid: {len(CONTRACT)} Blender sources and GLBs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

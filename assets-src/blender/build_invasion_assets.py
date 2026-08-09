"""Build Cabin Mayhem's project-owned pirate invasion GLB pack.

Blender 5.1 command, from repository root:

    blender --background --python assets-src/blender/build_invasion_assets.py

Every run recreates eight editable .blend sources and their runtime GLBs. Models
use only generated geometry/materials, named sockets, and authored Actions.
"""

from pathlib import Path
import math

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets-src" / "blender" / "invasions"
RUNTIME = ROOT / "public" / "assets" / "invasions"
PREVIEWS = ROOT / "test-results" / "invasion-assets"
FPS = 24


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.engine = "BLENDER_EEVEE"
    bpy.context.scene.render.resolution_x = 640
    bpy.context.scene.render.resolution_y = 640
    bpy.context.scene.render.resolution_percentage = 100
    bpy.context.scene.render.image_settings.file_format = "PNG"
    bpy.context.scene.render.film_transparent = False
    bpy.context.scene.render.fps = FPS


def mat(name, color, metallic=0.0, roughness=0.48, emission=None):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        socket = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
        if socket:
            socket.default_value = (*emission, 1.0)
        strength = shader.inputs.get("Emission Strength")
        if strength:
            strength.default_value = 5.0
    return material


def finish_mesh(obj, name, material, bevel=0.0):
    obj.name = name
    if material:
        obj.data.materials.append(material)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("crafted edge bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    return obj


def cube(name, size, location, material, bevel=0.0, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.dimensions = size
    return finish_mesh(obj, name, material, bevel)


def cylinder(name, radius, depth, location, material, vertices=16, rotation=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    return finish_mesh(bpy.context.object, name, material, bevel)


def sphere(name, radius, location, material, scale=(1, 1, 1), segments=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(8, segments // 2), radius=radius, location=location)
    obj = bpy.context.object
    obj.scale = scale
    return finish_mesh(obj, name, material)


def torus(name, major, minor, location, material, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=24, minor_segments=8, location=location, rotation=rotation)
    return finish_mesh(bpy.context.object, name, material)


def cone(name, r1, r2, depth, location, material, vertices=16, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=location, rotation=rotation)
    return finish_mesh(bpy.context.object, name, material)


def authored_mesh(name, vertices, faces, material, bevel=0.0):
    data = bpy.data.meshes.new(name + " mesh")
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    return finish_mesh(obj, name, material, bevel)


def curved_cutlass_blade(material):
    # Extruded swept profile: broad at heel, visibly forward-curved, clipped tip.
    sections = [(0.0, 0.075), (0.28, 0.080), (0.58, 0.075), (0.86, 0.064), (1.10, 0.045), (1.28, 0.0)]
    vertices = []
    for z, width in sections:
        curve = 0.20 * (z / 1.28) ** 1.7
        for y in (-0.022, 0.022):
            vertices.extend([(curve-width, y, 0.28+z), (curve+width, y, 0.28+z)])
    faces = []
    for i in range(len(sections)-1):
        a = i*4; b = (i+1)*4
        faces += [(a,b,b+1,a+1), (a+2,a+3,b+3,b+2), (a,a+2,b+2,b), (a+1,b+1,b+3,a+3)]
    faces += [(0,1,3,2), tuple(range((len(sections)-1)*4, len(sections)*4))]
    return authored_mesh("Swept broad cutlass blade", vertices, faces, material, 0.012)


def empty(name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "ARROWS"
    obj.empty_display_size = 0.14
    obj.location = location
    bpy.context.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def root(name="root"):
    obj = empty(name)
    obj["cm_asset_pack"] = "pirate-invasion-v1"
    obj["cm_units"] = "meters"
    return obj


def parent_all(objects, parent):
    for obj in objects:
        obj.parent = parent


def add_object_actions(obj, names, motion="rotate"):
    animation = obj.animation_data_create()
    for index, name in enumerate(names):
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        animation.action = action
        if hasattr(animation, "action_slot") and action.slots:
            animation.action_slot = action.slots[0]
        obj.rotation_mode = "XYZ"
        for frame, phase in ((1, -1.0), (13, 1.0), (25, -1.0)):
            obj.location = (0, 0, (0.018 + index * 0.001) * phase if motion == "lift" else 0)
            obj.rotation_euler = (0, (0.035 + index * 0.0015) * phase if motion == "rotate" else 0, 0)
            obj.keyframe_insert("location", frame=frame)
            obj.keyframe_insert("rotation_euler", frame=frame)
        track = animation.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, action)
        strip.name = name
        animation.action = None


def armature():
    data = bpy.data.armatures.new("Pirate Invasion Humanoid Skeleton")
    arm = bpy.data.objects.new("Armature", data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    specs = {
        "root": ((0, 0, 0), (0, 0, 0.22), None),
        "hips": ((0, 0, 0.82), (0, 0, 1.02), "root"),
        "spine": ((0, 0, 1.02), (0, 0, 1.32), "hips"),
        "chest": ((0, 0, 1.32), (0, 0, 1.55), "spine"),
        "neck": ((0, 0, 1.55), (0, 0, 1.69), "chest"),
        "head": ((0, 0, 1.69), (0, 0, 1.93), "neck"),
        "upper_arm.L": ((0, 0, 1.49), (0.38, 0, 1.45), "chest"),
        "forearm.L": ((0.38, 0, 1.45), (0.67, 0, 1.22), "upper_arm.L"),
        "hand.L": ((0.67, 0, 1.22), (0.78, 0, 1.14), "forearm.L"),
        "upper_arm.R": ((0, 0, 1.49), (-0.38, 0, 1.45), "chest"),
        "forearm.R": ((-0.38, 0, 1.45), (-0.67, 0, 1.22), "upper_arm.R"),
        "hand.R": ((-0.67, 0, 1.22), (-0.78, 0, 1.14), "forearm.R"),
        "thigh.L": ((0.17, 0, 0.88), (0.19, 0, 0.47), "hips"),
        "shin.L": ((0.19, 0, 0.47), (0.20, 0, 0.11), "thigh.L"),
        "foot.L": ((0.20, 0, 0.11), (0.20, -0.19, 0.05), "shin.L"),
        "thigh.R": ((-0.17, 0, 0.88), (-0.19, 0, 0.47), "hips"),
        "shin.R": ((-0.19, 0, 0.47), (-0.20, 0, 0.11), "thigh.R"),
        "foot.R": ((-0.20, 0, 0.11), (-0.20, -0.19, 0.05), "shin.R"),
    }
    bones = {}
    for name, (head, tail, parent_name) in specs.items():
        bone = data.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        if parent_name:
            bone.parent = bones[parent_name]
        bones[name] = bone
    bpy.ops.object.mode_set(mode="POSE")
    for bone in arm.pose.bones:
        bone.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.select_set(False)
    return arm


def skin_part(obj, arm, bone):
    group = obj.vertex_groups.new(name=bone)
    group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")
    modifier = obj.modifiers.new("Pirate Humanoid Skin", "ARMATURE")
    modifier.object = arm
    obj.parent = arm
    return obj


def socket(arm, name, bone, offset):
    obj = empty(name, offset)
    obj.parent = arm
    obj.parent_type = "BONE"
    obj.parent_bone = bone
    obj["cm_socket"] = True
    return obj


def add_character_actions(arm, names):
    animation = arm.animation_data_create()
    for index, name in enumerate(names):
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        animation.action = action
        if hasattr(animation, "action_slot") and action.slots:
            animation.action_slot = action.slots[0]
        swing = 0.10 + index * 0.012
        if name in {"Run", "Board", "Retreat"}:
            swing = 0.62
        elif name in {"Fire", "Melee", "PlantExplosive", "ArmExplosive"}:
            swing = 0.42
        elif name in {"HitReact", "Fall"}:
            swing = 0.78
        for frame, phase in ((1, -1.0), (9, 1.0), (17, -1.0), (25, 1.0)):
            for bone in arm.pose.bones:
                bone.rotation_euler = (0, 0, 0)
                bone.location = (0, 0, 0)
            arm.pose.bones["upper_arm.L"].rotation_euler.y = swing * phase
            arm.pose.bones["upper_arm.R"].rotation_euler.y = -swing * phase
            arm.pose.bones["thigh.L"].rotation_euler.x = swing * phase
            arm.pose.bones["thigh.R"].rotation_euler.x = -swing * phase
            arm.pose.bones["chest"].rotation_euler.z = swing * 0.12 * phase
            if name in {"Aim", "Fire", "PlantExplosive", "ArmExplosive"}:
                arm.pose.bones["upper_arm.R"].rotation_euler = (1.0, -0.65, -0.25)
                arm.pose.bones["forearm.R"].rotation_euler = (0.0, -0.55, 0.0)
            if name == "Fire":
                arm.pose.bones["chest"].rotation_euler.x = -0.09 if phase > 0 else 0.03
                arm.pose.bones["forearm.R"].location.y = 0.045 if phase > 0 else 0.0
            if name == "Melee":
                arm.pose.bones["upper_arm.R"].rotation_euler.x = -1.5 * phase
                arm.pose.bones["chest"].rotation_euler.z = 0.38 * phase
            if name in {"PlantExplosive", "ArmExplosive"}:
                arm.pose.bones["hips"].location.z = -0.18 if phase > 0 else -0.08
                arm.pose.bones["spine"].rotation_euler.x = 0.32
                arm.pose.bones["forearm.R"].rotation_euler.x = -0.72
            if name == "HitReact":
                arm.pose.bones["chest"].rotation_euler.x = -0.45 if phase > 0 else 0.15
            if name == "Fall":
                arm.pose.bones["root"].rotation_euler.x = max(0, (frame - 1) / 24) * 1.42
                arm.pose.bones["root"].location.z = -max(0, (frame - 1) / 24) * 0.35
            if name in {"Run", "Board", "Retreat"}:
                direction = -1 if name == "Retreat" else 1
                arm.pose.bones["root"].location.y = direction * (frame - 1) / 24 * 0.55
            for bone_name in ["root", "hips", "spine", "chest", "upper_arm.L", "upper_arm.R", "forearm.R", "thigh.L", "thigh.R"]:
                bone = arm.pose.bones[bone_name]
                bone.keyframe_insert("rotation_euler", frame=frame)
                bone.keyframe_insert("location", frame=frame)
        animation.action = None


def neutral_pose(arm):
    arm.data.pose_position = "POSE"
    for bone in arm.pose.bones:
        bone.rotation_euler = (0, 0, 0)
        bone.location = (0, 0, 0)


def character(slug, saboteur=False):
    reset()
    arm = armature()
    arm["cm_character_role"] = "hostile-saboteur" if saboteur else "pirate-boarder"
    skin = mat("Weathered Skin", (0.32, 0.135, 0.072), roughness=0.78)
    skin_highlight = mat("Face Highlight", (0.48, 0.235, 0.14), roughness=0.72)
    coat = mat("Saboteur Waxed Charcoal" if saboteur else "Pirate Oxblood Wool", (0.042, 0.052, 0.058) if saboteur else (0.22, 0.012, 0.025), roughness=0.67)
    coat_edge = mat("Saboteur Reinforcement" if saboteur else "Pirate Coat Piping", (0.11, 0.13, 0.14) if saboteur else (0.52, 0.18, 0.035), roughness=0.50)
    cloth = mat("Night Cloth", (0.012, 0.018, 0.024), roughness=0.88)
    shirt = mat("Salt Linen", (0.62, 0.55, 0.40), roughness=0.84)
    leather = mat("Salted Leather", (0.075, 0.027, 0.012), roughness=0.62)
    brass = mat("Raid Brass", (0.58, 0.29, 0.045), metallic=0.82, roughness=0.27)
    steel = mat("Raid Steel", (0.11, 0.14, 0.15), metallic=0.86, roughness=0.25)
    eye = mat("Eye White", (0.78, 0.70, 0.58), roughness=0.42)
    pupil = mat("Dark Eyes", (0.012, 0.009, 0.006), roughness=0.28)
    accent = mat("Saboteur Warning", (0.92, 0.18, 0.008), roughness=0.35, emission=(0.30, 0.012, 0.0)) if saboteur else mat("Pirate Teal Sash", (0.015, 0.22, 0.27), roughness=0.56)
    glass = mat("Goggle Glass", (0.03, 0.37, 0.44), metallic=0.38, roughness=0.12, emission=(0.0, 0.05, 0.07))
    parts = []
    parts += [(cone("Tailored coat torso", 0.34, 0.285, 0.62, (0, 0, 1.25), coat, 24), "spine")]
    parts += [(cube("Inset shirt front", (0.22, 0.055, 0.42), (0, -0.285, 1.34), shirt, 0.025), "spine")]
    parts += [(cube("Left lapel", (0.12, 0.055, 0.39), (0.095, -0.315, 1.42), coat_edge, 0.022, (0.10, 0.14, -0.22)), "chest")]
    parts += [(cube("Right lapel", (0.12, 0.055, 0.39), (-0.095, -0.315, 1.42), coat_edge, 0.022, (-0.10, -0.14, 0.22)), "chest")]
    parts += [(cube("Chest cross harness", (0.71, 0.075, 0.075), (0, -0.335, 1.36), leather, 0.025, (0, 0.28, -0.32)), "chest")]
    parts += [(cylinder("Utility belt", 0.32, 0.13, (0, 0, 0.92), leather, 20), "hips")]
    parts += [(cube("Belt buckle", (0.14, 0.055, 0.105), (0, -0.32, 0.92), brass, 0.018), "hips")]
    parts += [(cube("Coat tail L", (0.25, 0.24, 0.43), (0.17, 0.035, 0.78), coat, 0.045, (0.10, 0, -0.07)), "hips")]
    parts += [(cube("Coat tail R", (0.25, 0.24, 0.43), (-0.17, 0.035, 0.78), coat, 0.045, (-0.10, 0, 0.07)), "hips")]
    parts += [(sphere("Anatomical head", 0.205, (0, 0, 1.79), skin, scale=(0.82, 0.78, 1.14), segments=32), "head")]
    parts += [(cone("Modeled nose", 0.055, 0.018, 0.13, (0, -0.205, 1.80), skin_highlight, 16, (math.pi/2, 0, 0)), "head")]
    parts += [(cube("Mouth line", (0.105, 0.014, 0.020), (0, -0.205, 1.70), leather, 0.008), "head")]
    parts += [(sphere("Ear L", 0.052, (0.178, 0, 1.80), skin_highlight, scale=(0.50, 0.68, 1.0), segments=16), "head")]
    parts += [(sphere("Ear R", 0.052, (-0.178, 0, 1.80), skin_highlight, scale=(0.50, 0.68, 1.0), segments=16), "head")]
    if not saboteur:
        for x in (-0.072, 0.072):
            parts += [(sphere(f"Eye white {x}", 0.045, (x, -0.174, 1.84), eye, scale=(1.0, 0.38, 0.58), segments=16), "head")]
            parts += [(sphere(f"Eye pupil {x}", 0.018, (x, -0.193, 1.84), pupil, scale=(0.75, 0.32, 1.0), segments=12), "head")]
        parts += [(cone("Braided beard", 0.14, 0.045, 0.32, (0, -0.11, 1.58), leather, 18), "head")]
    for side, x in (("L", 1), ("R", -1)):
        parts += [(sphere(f"Shoulder cap {side}", 0.15, (0.30*x, 0, 1.48), coat_edge, scale=(1.05, 1.0, 0.85), segments=20), f"upper_arm.{side}")]
        parts += [(cylinder(f"Tailored upper sleeve {side}", 0.115, 0.42, (0.45*x, 0, 1.39), coat, 20, (0, math.pi/2.18, 0)), f"upper_arm.{side}")]
        parts += [(torus(f"Sleeve cuff {side}", 0.105, 0.022, (0.63*x, -0.01, 1.25), brass if not saboteur else coat_edge, (0, math.pi/2, 0)), f"forearm.{side}")]
        parts += [(cylinder(f"Leather forearm bracer {side}", 0.095, 0.36, (0.65*x, 0, 1.24), leather, 18, (0, math.pi/2.65, 0)), f"forearm.{side}")]
        parts += [(cube(f"Palm grip {side}", (0.16, 0.16, 0.15), (0.80*x, -0.005, 1.13), leather, 0.055), f"hand.{side}")]
        for finger in range(4):
            parts += [(cube(f"Glove {side} finger {finger+1}", (0.085, 0.055, 0.10), ((0.87+finger*0.016)*x, -0.065+finger*0.042, 1.10), leather, 0.022), f"hand.{side}")]
        parts += [(cube(f"Glove {side} thumb", (0.085, 0.065, 0.10), (0.78*x, -0.10, 1.09), leather, 0.025, (0, 0.25*x, 0)), f"hand.{side}")]
        parts += [(cylinder(f"Trouser thigh {side}", 0.145, 0.46, (0.18*x, 0, 0.68), cloth, 18), f"thigh.{side}")]
        parts += [(cylinder(f"Fitted boot shaft {side}", 0.135, 0.43, (0.19*x, 0, 0.27), leather, 18), f"shin.{side}")]
        parts += [(torus(f"Boot cuff {side}", 0.14, 0.025, (0.19*x, 0, 0.48), coat_edge, (0, 0, 0)), f"shin.{side}")]
        parts += [(cube(f"Boot toe {side}", (0.255, 0.39, 0.15), (0.19*x, -0.105, 0.07), leather, 0.065), f"foot.{side}")]
        parts += [(cube(f"Boot sole {side}", (0.27, 0.41, 0.045), (0.19*x, -0.11, -0.005), steel, 0.018), f"foot.{side}")]
        parts += [(cube(f"Boot heel {side}", (0.20, 0.13, 0.11), (0.19*x, 0.07, 0.03), leather, 0.025), f"foot.{side}")]
        parts += [(cube(f"Boot strap {side}", (0.29, 0.04, 0.06), (0.19*x, -0.145, 0.30), coat_edge, 0.012), f"shin.{side}")]
        parts += [(cube(f"Boot buckle {side}", (0.075, 0.025, 0.075), (0.19*x, -0.17, 0.30), brass, 0.012), f"shin.{side}")]
    for row, z in enumerate((1.46, 1.33, 1.20, 1.07)):
        parts += [(sphere(f"Coat button {row+1}", 0.027, (-0.13, -0.315, z), brass, scale=(1, 0.45, 1), segments=12), "spine")]
    parts += [(cube("Utility pouch L", (0.20, 0.11, 0.22), (0.25, -0.28, 0.82), leather, 0.035), "hips")]
    parts += [(cube("Utility pouch R", (0.20, 0.11, 0.22), (-0.25, -0.28, 0.82), leather, 0.035), "hips")]
    parts += [(cube("Pistol holster", (0.20, 0.12, 0.39), (-0.29, -0.15, 0.66), leather, 0.045, (0.08, 0, -0.08)), "thigh.R")]
    parts += [(cube("Holstered pistol grip", (0.11, 0.10, 0.25), (-0.30, -0.17, 0.86), steel, 0.025, (0.20, 0, -0.08)), "thigh.R")]
    if saboteur:
        parts += [(torus("Blast padded collar", 0.30, 0.065, (0, 0, 1.56), cloth), "chest")]
        parts += [(cube("Respirator armored mask", (0.33, 0.17, 0.22), (0, -0.19, 1.73), cloth, 0.065), "head")]
        parts += [(cube("Respirator center grille", (0.15, 0.035, 0.11), (0, -0.29, 1.68), steel, 0.012), "head")]
        for i in range(3):
            parts += [(cube(f"Respirator grille slot {i+1}", (0.10, 0.012, 0.008), (0, -0.311, 1.65+i*0.025), accent, 0.003), "head")]
        parts += [(sphere("Goggle L", 0.085, (0.09, -0.205, 1.84), glass, scale=(1.0, 0.38, 0.68), segments=24), "head")]
        parts += [(sphere("Goggle R", 0.085, (-0.09, -0.205, 1.84), glass, scale=(1.0, 0.38, 0.68), segments=24), "head")]
        parts += [(cube("Goggle bridge", (0.10, 0.025, 0.028), (0, -0.23, 1.84), steel, 0.008), "head")]
        parts += [(cube("Detonator chest module", (0.30, 0.11, 0.25), (0.20, -0.35, 1.24), steel, 0.045), "spine")]
        parts += [(sphere("Detonator status lamp", 0.04, (0.20, -0.42, 1.28), accent, scale=(1, 0.35, 1), segments=16), "spine")]
        parts += [(cylinder("Respirator filter L", 0.065, 0.11, (0.125, -0.30, 1.67), brass, 16, (math.pi/2, 0, 0)), "head")]
        parts += [(cylinder("Respirator filter R", 0.065, 0.11, (-0.125, -0.30, 1.67), brass, 16, (math.pi/2, 0, 0)), "head")]
        parts += [(cube("Back charge pack", (0.54, 0.24, 0.58), (0, 0.27, 1.23), cloth, 0.08), "spine")]
        for x in (-0.16, 0.16):
            parts += [(cylinder(f"Back charge canister {x}", 0.075, 0.44, (x, 0.41, 1.24), steel, 18), "spine")]
        parts += [(cube("Harness strap L", (0.075, 0.055, 0.62), (0.22, -0.32, 1.28), coat_edge, 0.02, (0, 0, -0.12)), "spine")]
        parts += [(cube("Harness strap R", (0.075, 0.055, 0.62), (-0.22, -0.32, 1.28), coat_edge, 0.02, (0, 0, 0.12)), "spine")]
        parts += [(cube("Cable run", (0.035, 0.035, 0.48), (0.31, -0.35, 1.18), accent, 0.012, (0, 0, -0.25)), "spine")]
    else:
        parts += [(torus("Tricorne rolled brim", 0.255, 0.045, (0, 0, 1.99), cloth), "head")]
        parts += [(cone("Tricorne felt crown", 0.22, 0.15, 0.22, (0, 0, 2.08), leather, 24), "head")]
        parts += [(cube("Tricorne front fold", (0.50, 0.10, 0.16), (0, -0.16, 2.02), cloth, 0.045), "head")]
        parts += [(cube("Hat gold braid", (0.39, 0.025, 0.025), (0, -0.22, 2.02), brass, 0.008), "head")]
        parts += [(cube("Sea blue sash", (0.74, 0.065, 0.115), (0, -0.35, 1.13), accent, 0.025, (0.0, 0.0, -0.22)), "spine")]
        parts += [(sphere("Leather eyepatch", 0.086, (-0.074, -0.205, 1.84), cloth, scale=(1.0, 0.32, 0.62), segments=18), "head")]
        parts += [(torus("Eyepatch strap", 0.185, 0.009, (0, -0.04, 1.84), leather, (math.pi/2, 0, 0)), "head")]
        parts += [(sphere("Engraved shoulder pauldron", 0.18, (-0.31, 0, 1.50), brass, scale=(1.0, 1.15, 0.52), segments=24), "upper_arm.R")]
        parts += [(cube("Pauldron ridge", (0.29, 0.07, 0.05), (-0.31, -0.12, 1.52), coat_edge, 0.015), "upper_arm.R")]
        parts += [(cube("Cutlass scabbard", (0.09, 0.11, 0.74), (0.34, 0.06, 0.66), leather, 0.035, (0, 0.18, -0.15)), "thigh.L")]
        parts += [(sphere("Scabbard chape", 0.075, (0.40, 0.08, 0.30), brass, scale=(0.7, 0.65, 1.0), segments=16), "thigh.L")]
        parts += [(cube("Map case", (0.22, 0.13, 0.29), (0.36, -0.12, 0.86), leather, 0.04), "hips")]
    for obj, bone in parts:
        skin_part(obj, arm, bone)
    socket(arm, "weapon_socket_r", "hand.R", (0, 0.12, 0.02))
    if saboteur:
        socket(arm, "explosive_socket", "hips", (0.27, -0.18, 0.0))
        actions = ["Idle", "Run", "Board", "Aim", "PlantExplosive", "ArmExplosive", "HitReact", "Fall", "Retreat"]
    else:
        socket(arm, "weapon_socket_l", "hand.L", (0, 0.12, 0.02))
        actions = ["Idle", "Run", "Board", "Aim", "Fire", "Melee", "HitReact", "Fall", "Retreat"]
    add_character_actions(arm, actions)
    neutral_pose(arm)
    export(slug, f"characters/{slug}.glb", target=arm)


def pistol():
    reset(); r = root()
    steel = mat("Blackened Gunmetal", (0.035, 0.045, 0.055), 0.88, 0.22)
    brass = mat("Pistol Brass", (0.62, 0.34, 0.06), 0.78, 0.25)
    wood = mat("Checkered Walnut", (0.18, 0.055, 0.018), 0.05, 0.5)
    dark = mat("Pistol Bore", (0.003, 0.004, 0.005), 0.72, 0.20)
    parts = [cube("Receiver", (0.34, 0.13, 0.18), (0, 0, 0.22), steel, 0.035),
             cylinder("Six chamber cylinder", 0.105, 0.17, (0.02, 0, 0.22), brass, 24, (math.pi/2, 0, 0), 0.006),
             cylinder("Rifled barrel", 0.058, 0.52, (0, -0.31, 0.25), steel, 24, (math.pi/2, 0, 0)),
             cylinder("Barrel shroud", 0.078, 0.18, (0, -0.11, 0.25), brass, 24, (math.pi/2, 0, 0), 0.008),
             cylinder("Dark muzzle bore", 0.043, 0.012, (0, -0.578, 0.25), dark, 20, (math.pi/2, 0, 0)),
             cube("Angled walnut grip", (0.17, 0.17, 0.38), (0, 0.09, 0.01), wood, 0.045, (0.28, 0, 0)),
             torus("Trigger guard", 0.10, 0.018, (0, -0.03, 0.10), brass, (math.pi/2, 0, 0)),
             cube("Curved trigger", (0.025, 0.035, 0.11), (0, -0.045, 0.11), steel, 0.008, (0.15, 0, 0)),
             cube("Cocking hammer", (0.065, 0.055, 0.11), (0, 0.10, 0.34), steel, 0.012, (0.22, 0, 0)),
             cube("Top sight rail", (0.04, 0.35, 0.025), (0, -0.25, 0.32), brass, 0.006),
             cube("Front sight", (0.025, 0.045, 0.055), (0, -0.56, 0.35), brass, 0.008),
             sphere("Grip rivet L", 0.022, (0.086, 0.055, 0.01), brass, scale=(0.38, 1, 1), segments=12),
             sphere("Grip rivet R", 0.022, (-0.086, 0.055, 0.01), brass, scale=(0.38, 1, 1), segments=12)]
    for index, angle in enumerate(range(0, 360, 60)):
        radians = math.radians(angle)
        parts.append(cylinder(f"Cylinder chamber recess {index+1}", 0.022, 0.012, (0.106*math.sin(radians), -0.09, 0.22+0.070*math.cos(radians)), dark, 12, (math.pi/2, 0, 0)))
    parent_all(parts, r); empty("grip", (0, 0.08, 0.04), r); empty("muzzle", (0, -0.59, 0.25), r)
    export("boarding-pistol", "weapons/boarding-pistol.glb", r)


def cutlass():
    reset(); r = root()
    steel = mat("Cutlass Steel", (0.36, 0.43, 0.47), 0.94, 0.18)
    brass = mat("Cutlass Brass", (0.62, 0.33, 0.05), 0.82, 0.24)
    leather = mat("Cutlass Grip Leather", (0.09, 0.025, 0.012), 0.02, 0.7)
    dark_steel = mat("Blade Fuller", (0.10, 0.14, 0.16), 0.90, 0.18)
    parts = [curved_cutlass_blade(steel),
             cube("Blade fuller groove", (0.028, 0.052, 0.88), (0.055, 0, 0.80), dark_steel, 0.008, (0, 0.02, -0.10)),
             cube("Reinforced ricasso", (0.17, 0.075, 0.16), (0, 0, 0.34), brass, 0.015),
             cylinder("Leather grip", 0.065, 0.34, (0, 0, 0.05), leather, 12),
             cylinder("Cross guard", 0.045, 0.50, (0, 0, 0.25), brass, 12, (0, math.pi/2, 0)),
             sphere("Quillon L", 0.065, (0.25, 0, 0.25), brass, scale=(1.2, 0.8, 0.8), segments=14),
             sphere("Quillon R", 0.065, (-0.25, 0, 0.25), brass, scale=(1.2, 0.8, 0.8), segments=14),
             torus("Knuckle bow", 0.19, 0.024, (0.12, 0, 0.08), brass, (math.pi/2, 0, 0)),
             sphere("Pommel", 0.085, (0, 0, -0.16), brass, segments=12)]
    for z in (-0.08, 0.0, 0.08, 0.16):
        parts.append(torus(f"Grip wire {z}", 0.068, 0.010, (0,0,z), brass))
    parent_all(parts, r); empty("grip", (0, 0, 0.04), r)
    export("boarding-cutlass", "weapons/boarding-cutlass.glb", r)


def satchel():
    reset(); r = root()
    canvas = mat("Explosive Canvas", (0.10, 0.13, 0.09), roughness=0.86)
    charge = mat("Wrapped Charges", (0.38, 0.17, 0.035), roughness=0.64)
    metal = mat("Charge Hardware", (0.17, 0.19, 0.18), 0.66, 0.35)
    glow = mat("Arming Indicator", (0.75, 0.025, 0.006), roughness=0.25, emission=(1.0, 0.0, 0.0))
    parts = [cube("Satchel body", (0.72, 0.28, 0.50), (0, 0, 0.35), canvas, 0.09),
             cube("Detonator plate", (0.34, 0.08, 0.23), (0, -0.18, 0.38), metal, 0.035),
             torus("Carry strap", 0.42, 0.028, (0, 0, 0.64), canvas, (math.pi/2, 0, 0))]
    for i in range(4):
        parts.append(cylinder(f"Charge stick {i+1}", 0.055, 0.42, (-0.24 + i*0.16, -0.18, 0.35), charge, 12))
    parent_all(parts, r)
    indicator = sphere("indicator", 0.045, (0, -0.235, 0.42), glow, scale=(1, 0.45, 1), segments=12); indicator.parent = r
    empty("interaction_anchor", (0, -0.28, 0.40), r)
    add_object_actions(r, ["Idle", "Arm", "Disarm", "Detonate"], "lift")
    export("satchel-charge", "explosives/satchel-charge.glb", r)


def board():
    reset(); r = root()
    wood = mat("Saltworn Oak", (0.22, 0.085, 0.025), roughness=0.82)
    edge = mat("Board Iron Edge", (0.09, 0.11, 0.12), 0.72, 0.38)
    rope = mat("Tarred Rope", (0.055, 0.035, 0.018), roughness=0.95)
    parts=[]
    for i in range(7):
        parts.append(cube(f"Individual oak plank {i+1}", (0.34, 3.35, 0.11), (-1.03+i*0.34, 0, 0), wood, 0.025))
    parts += [cube("Port iron rail", (0.08, 3.40, 0.16), (-1.12, 0, 0.07), edge, 0.02), cube("Starboard iron rail", (0.08, 3.40, 0.16), (1.12, 0, 0.07), edge, 0.02)]
    for y in (-1.35, -0.45, 0.45, 1.35):
        parts.append(cylinder(f"Cross lashing {y}", 0.035, 2.28, (0, y, 0.12), rope, 10, (0, math.pi/2, 0)))
    parent_all(parts, r)
    empty("ship_attach", (0, -1.72, 0), r); empty("raider_attach", (0, 1.72, 0), r); empty("interaction_anchor", (0, -1.18, 0.24), r)
    hinge = cylinder("detach_hinge", 0.105, 2.42, (0, -1.62, 0), edge, 16, (0, math.pi/2, 0)); hinge.parent=r
    add_object_actions(r, ["Approach", "Attach", "Detach", "Detached"])
    export("boarding-board", "boarding/boarding-board.glb", r)


def gangway():
    reset(); r = root()
    steel = mat("Gangway Black Steel", (0.045, 0.06, 0.07), 0.78, 0.36)
    tread = mat("Gangway Tread", (0.22, 0.25, 0.24), 0.62, 0.5)
    hazard = mat("Gangway Hazard", (0.95, 0.31, 0.015), 0.1, 0.42)
    parts=[]
    for i in range(11):
        y=-2.0+i*0.4
        parts.append(cube(f"Perforated tread {i+1}", (2.05, 0.31, 0.10), (0,y,0), tread, 0.018))
    for x in (-1.08,1.08):
        parts.append(cube(f"Main truss {x}", (0.10,4.45,0.18),(x,0,0.08),steel,0.025))
        parts.append(cylinder(f"Handrail {x}",0.035,4.45,(x,0,0.88),steel,10,(math.pi/2,0,0)))
        for y in (-1.8,-0.9,0,0.9,1.8):
            parts.append(cylinder(f"Rail stanchion {x} {y}",0.035,0.82,(x,y,0.47),steel,10))
    parts += [cube("Hazard nose",(2.18,0.18,0.14),(0,-2.22,0.05),hazard,0.025), cube("Hazard tail",(2.18,0.18,0.14),(0,2.22,0.05),hazard,0.025)]
    parent_all(parts,r)
    empty("ship_attach",(0,-2.30,0),r); empty("raider_attach",(0,2.30,0),r); empty("interaction_anchor",(0,-1.65,0.35),r)
    hinge=cylinder("release_hinge",0.14,2.30,(0,-2.18,0.05),steel,18,(0,math.pi/2,0)); hinge.parent=r
    add_object_actions(r,["Approach","Attach","Release","Detached"])
    export("pirate-gangway","boarding/pirate-gangway.glb",r)


def crate():
    reset(); r=root()
    wood=mat("Crate Dark Oak",(0.16,0.055,0.016),roughness=0.84)
    iron=mat("Crate Iron Bands",(0.055,0.065,0.07),0.72,0.40)
    cloth=mat("Crate Loot Cloth",(0.34,0.02,0.03),roughness=0.72)
    parts=[cube("Planked crate body",(1.15,0.78,0.72),(0,0,0.38),wood,0.045), cube("Reinforced lid",(1.20,0.82,0.14),(0,0,0.81),wood,0.035), cube("Iron band A",(0.10,0.84,0.87),(-0.40,0,0.43),iron,0.018), cube("Iron band B",(0.10,0.84,0.87),(0.40,0,0.43),iron,0.018), cube("Iron lock",(0.18,0.08,0.22),(0,-0.44,0.65),iron,0.025), cube("Painted pirate slash",(0.62,0.03,0.10),(0,-0.42,0.36),cloth,0.01,(0,0,-0.35))]
    parent_all(parts,r); empty("interaction_anchor",(0,-0.55,0.62),r)
    add_object_actions(r,["Closed","Open"],"lift")
    export("pirate-gear-crate","props/pirate-gear-crate.glb",r)


def preview(slug, target):
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    if target is not None and target.type == "ARMATURE":
        neutral_pose(target)
        target.data.pose_position = "REST"
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    corners = [obj.matrix_world @ Vector(corner) for obj in mesh_objects for corner in obj.bound_box]
    low = Vector((min(point.x for point in corners), min(point.y for point in corners), min(point.z for point in corners)))
    high = Vector((max(point.x for point in corners), max(point.y for point in corners), max(point.z for point in corners)))
    center = (low + high) * 0.5
    extent = max(high.x-low.x, high.y-low.y, high.z-low.z)
    distance = extent * 1.55 + 0.75
    bpy.ops.object.camera_add(location=(distance*0.65,-distance,center.z+distance*0.22))
    camera=bpy.context.object; camera.name="Preview Camera"; bpy.context.scene.camera=camera
    camera.data.lens = 62
    bpy.ops.object.light_add(type="AREA", location=(3,-4,6)); bpy.context.object.data.energy=950; bpy.context.object.data.shape="DISK"; bpy.context.object.data.size=5
    bpy.ops.object.light_add(type="AREA", location=(-4,-1,3)); bpy.context.object.data.energy=620; bpy.context.object.data.size=4
    bpy.ops.object.light_add(type="AREA", location=(0,4,4)); bpy.context.object.data.energy=480; bpy.context.object.data.size=3
    bpy.ops.mesh.primitive_plane_add(size=max(20,extent*5), location=(center.x,center.y,low.z-0.035)); plane=bpy.context.object; plane.name="Preview ground"; plane.data.materials.append(mat("Preview Ground",(0.025,0.035,0.05),roughness=0.9))
    world=bpy.context.scene.world or bpy.data.worlds.new("Preview World"); bpy.context.scene.world=world; world.color=(0.012,0.018,0.032)
    views = {
        "front": Vector((0,-distance,center.z+distance*0.12)),
        "three-quarter": Vector((distance*0.70,-distance*0.82,center.z+distance*0.17)),
        "back": Vector((0,distance,center.z+distance*0.12)),
    }
    for label, location in views.items():
        camera.location = Vector((center.x,center.y,0)) + location
        camera.rotation_euler=(center-camera.location).to_track_quat("-Z","Y").to_euler()
        bpy.context.scene.render.filepath=str(PREVIEWS/f"{slug}-{label}.png")
        bpy.ops.render.render(write_still=True)
        if label == "three-quarter":
            bpy.context.scene.render.filepath=str(PREVIEWS/f"{slug}.png")
            bpy.ops.render.render(write_still=True)
    if target is not None and target.type == "ARMATURE":
        target.data.pose_position = "POSE"
        action_names = ("Run", "PlantExplosive") if "saboteur" in slug else ("Run", "Melee")
        camera.location = Vector((center.x,center.y,0)) + views["three-quarter"]
        camera.rotation_euler=(center-camera.location).to_track_quat("-Z","Y").to_euler()
        for action_name in action_names:
            target.animation_data.action = bpy.data.actions[action_name]
            if hasattr(target.animation_data, "action_slot") and target.animation_data.action.slots:
                target.animation_data.action_slot = target.animation_data.action.slots[0]
            bpy.context.scene.frame_set(9)
            bpy.context.scene.render.filepath=str(PREVIEWS/f"{slug}-action-{action_name.lower()}.png")
            bpy.ops.render.render(write_still=True)
        target.animation_data.action = None
        neutral_pose(target)
    bpy.data.objects.remove(camera,do_unlink=True); bpy.data.objects.remove(plane,do_unlink=True)
    for obj in [o for o in list(bpy.data.objects) if o.type=="LIGHT"]: bpy.data.objects.remove(obj,do_unlink=True)


def export(source_slug, runtime_rel, target=None):
    SOURCE.mkdir(parents=True,exist_ok=True); (RUNTIME/Path(runtime_rel).parent).mkdir(parents=True,exist_ok=True)
    source=SOURCE/f"{source_slug}.blend"; runtime=RUNTIME/runtime_rel
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
    animation_mode = "ACTIONS" if target is not None and target.type == "ARMATURE" else "NLA_TRACKS"
    bpy.ops.export_scene.gltf(filepath=str(runtime),export_format="GLB",export_apply=False,export_yup=True,export_materials="EXPORT",export_cameras=False,export_lights=False,export_extras=True,export_animations=True,export_animation_mode=animation_mode,export_optimize_animation_size=False,export_skins=True)
    preview(source_slug,target)
    print(f"BUILT {source.relative_to(ROOT)} -> {runtime.relative_to(ROOT)}")


def main():
    character("pirate-boarder",False)
    character("saboteur-boarder",True)
    pistol(); cutlass(); satchel(); board(); gangway(); crate()
    print("Invasion asset pack complete: 8 sources, 8 GLBs, 8 previews")


if __name__ == "__main__":
    main()

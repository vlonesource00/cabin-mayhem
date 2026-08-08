"""Shared rig and clip authoring helpers for Cabin Mayhem's Blender pipeline.

Imported by `build_character_rig.py` and `build_first_person_arms.py`. Not a
standalone script: run one of those instead.
"""

import math

import bpy


def reset_scene(fps):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = fps
    scene.frame_start = 0
    scene.unit_settings.system = "METRIC"


def material(name, color, roughness=0.6, metallic=0.0):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1.0)
    result.use_nodes = True
    principled = result.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    return result


def build_armature(name, bones, disconnected=frozenset()):
    """`bones` maps bone name to (parent, head, tail) in Blender Z-up metres."""
    data = bpy.data.armatures.new(name)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    for bone_name, (parent, head, tail) in bones.items():
        bone = data.edit_bones.new(bone_name)
        bone.head = head
        bone.tail = tail
        if parent:
            bone.parent = data.edit_bones[parent]
            bone.use_connect = bone_name not in disconnected
    bpy.ops.object.mode_set(mode="OBJECT")
    for pose_bone in obj.pose.bones:
        pose_bone.rotation_mode = "XYZ"
    return obj


class MeshBuilder:
    """Accumulates rigid box parts into one skinned mesh.

    Rigid one-bone-per-part weighting is deliberate: it keeps the chunky
    low-poly silhouette crisp and makes the export byte-for-byte repeatable.
    """

    def __init__(self):
        self.verts = []
        self.faces = []
        self.groups = {}
        self.face_materials = []

    def box(self, bone, center, size, material_index, taper=1.0):
        cx, cy, cz = center
        sx, sy, sz = (size[0] / 2.0, size[1] / 2.0, size[2] / 2.0)
        base = len(self.verts)
        corners = [
            (-1, -1, -1),
            (1, -1, -1),
            (1, 1, -1),
            (-1, 1, -1),
            (-1, -1, 1),
            (1, -1, 1),
            (1, 1, 1),
            (-1, 1, 1),
        ]
        for dx, dy, dz in corners:
            scale = taper if dz > 0 else 1.0
            self.verts.append((cx + dx * sx * scale, cy + dy * sy * scale, cz + dz * sz))
        quads = [
            (0, 1, 2, 3),
            (4, 7, 6, 5),
            (0, 4, 5, 1),
            (1, 5, 6, 2),
            (2, 6, 7, 3),
            (3, 7, 4, 0),
        ]
        for quad in quads:
            self.faces.append(tuple(base + i for i in quad))
            self.face_materials.append(material_index)
        self.groups.setdefault(bone, []).extend(range(base, base + 8))

    def finish(self, name, armature, materials):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.verts, [], self.faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        for mat in materials:
            obj.data.materials.append(mat)
        for polygon, index in zip(mesh.polygons, self.face_materials):
            polygon.material_index = index
            polygon.use_smooth = False
        for bone, indices in self.groups.items():
            group = obj.vertex_groups.new(name=bone)
            group.add(indices, 1.0, "REPLACE")
        obj.parent = armature
        modifier = obj.modifiers.new("Armature", "ARMATURE")
        modifier.object = armature
        return obj


def radians(degrees):
    return tuple(math.radians(value) for value in degrees)


class Clip:
    """One named action. Poses are authored as euler degrees per bone.

    A pose table value is either a 3-tuple of degrees or a dict with `r`
    (rotation degrees) and `t` (bone-space translation).
    """

    def __init__(self, name, frames, loop=True):
        self.name = name
        self.frames = frames
        self.loop = loop
        self.keys = {}

    def key(self, frame, bone, rotation=None, location=None):
        entry = self.keys.setdefault((frame, bone), {})
        if rotation is not None:
            entry["rotation_euler"] = radians(rotation)
        if location is not None:
            entry["location"] = location
        return self

    def keys_at(self, frame, table):
        for bone, value in table.items():
            if isinstance(value, dict):
                self.key(frame, bone, value.get("r"), value.get("t"))
            else:
                self.key(frame, bone, value)
        return self


def action_fcurves(action):
    """Blender 4.4+ moved fcurves behind layers/strips/channelbags."""
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for bag in getattr(strip, "channelbags", []):
                curves.extend(bag.fcurves)
    return curves


def _fallback(clip, bone, frame, field):
    """Loop clips wrap to their first pose; one-shots hold their last pose."""
    ordered = sorted(f for (f, b) in clip.keys if b == bone)
    if not ordered:
        return (0.0, 0.0, 0.0)
    if clip.loop:
        source = ordered[0]
    else:
        source = ordered[0] if frame <= ordered[0] else ordered[-1]
    return clip.keys[(source, bone)].get(field, (0.0, 0.0, 0.0))


def bake(armature, clip):
    action = bpy.data.actions.new(clip.name)
    action.use_fake_user = True
    animation = armature.animation_data or armature.animation_data_create()
    animation.action = action
    if hasattr(animation, "action_slot") and action.slots:
        animation.action_slot = action.slots[0]

    touched = {bone for (_, bone) in clip.keys}
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_euler = (0.0, 0.0, 0.0)
        pose_bone.location = (0.0, 0.0, 0.0)

    # Every touched bone is keyed on the first and last frame as well, so a clip
    # never inherits a pose from whichever clip happened to play before it.
    #
    # Clips are authored from frame 1 but baked from frame 0: the glTF exporter
    # emits a key's time as frame/fps without rebasing to the action's start, so
    # authoring from 1 would leave every clip with a one-frame dead zone before
    # its first pose and a duration one frame longer than authored.
    boundary = {1, clip.frames}
    for frame in sorted({f for (f, _) in clip.keys} | boundary):
        for bone in touched:
            entry = clip.keys.get((frame, bone))
            explicit = entry is not None
            if not explicit and frame not in boundary:
                continue
            pose_bone = armature.pose.bones[bone]
            if explicit and "rotation_euler" in entry:
                pose_bone.rotation_euler = entry["rotation_euler"]
            elif not explicit:
                pose_bone.rotation_euler = _fallback(clip, bone, frame, "rotation_euler")
            if explicit and "location" in entry:
                pose_bone.location = entry["location"]
            elif not explicit:
                pose_bone.location = _fallback(clip, bone, frame, "location")
            pose_bone.keyframe_insert("rotation_euler", frame=frame - 1)
            pose_bone.keyframe_insert("location", frame=frame - 1)

    for fcurve in action_fcurves(action):
        for keyframe in fcurve.keyframe_points:
            keyframe.interpolation = "BEZIER"
            keyframe.easing = "EASE_IN_OUT"
    animation.action = None
    return action


def export(source_path, runtime_path):
    source_path.parent.mkdir(parents=True, exist_ok=True)
    runtime_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(source_path))
    bpy.ops.export_scene.gltf(
        filepath=str(runtime_path),
        export_format="GLB",
        export_apply=False,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_optimize_animation_size=False,
        export_skins=True,
    )

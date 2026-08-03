"""Open a Cabin Mayhem rig in Blender's Animation workspace for visual review.

Not part of the build. Run it against an authored .blend so the clips are ready
to scrub instead of hidden behind the Action editor's browse dropdown:

  blender assets-src/blender/cabin-mayhem-characters.blend \
    --python tools/blender/open_animation_review.py

The build scripts leave `animation_data.action` empty on purpose, so a freshly
opened file shows a rest pose and an empty dope sheet. This assigns the first
action, sets the scene range to that clip's length and starts playback.
"""

import bpy


def armature():
    for obj in bpy.data.objects:
        if obj.type == "ARMATURE":
            return obj
    return None


def assign(rig, action):
    animation = rig.animation_data or rig.animation_data_create()
    animation.action = action
    if hasattr(animation, "action_slot") and action.slots:
        animation.action_slot = action.slots[0]
    start, end = action.frame_range
    bpy.context.scene.frame_start = int(start)
    bpy.context.scene.frame_end = int(end)
    bpy.context.scene.frame_set(int(start))


def review():
    rig = armature()
    actions = sorted(bpy.data.actions, key=lambda a: a.name)
    if rig is None or not actions:
        print("No armature or no actions in this file.")
        return

    for workspace in ("Animation", "Layout"):
        if workspace in bpy.data.workspaces:
            bpy.context.window.workspace = bpy.data.workspaces[workspace]
            break

    assign(rig, actions[0])

    print(f"\n{len(actions)} clips on {rig.name}. Switch clips in the Action editor:")
    for action in actions:
        start, end = action.frame_range
        print(f"  {action.name:<22} {int(end - start) + 1:>3} frames")
    print("\nShowing:", actions[0].name)

    bpy.ops.screen.animation_play()


review()

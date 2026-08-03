"""Build Cabin Mayhem's project-owned cabin scenario.

Run with Blender 5.x:
  blender --background --python tools/blender/build_cabin_scenario.py
"""

from pathlib import Path
import math

import bpy


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = PROJECT_ROOT / "assets-src" / "blender" / "cabin-mayhem-scenario.blend"
RUNTIME_PATH = PROJECT_ROOT / "public" / "assets" / "scenarios" / "cabin-mayhem-scenario.glb"


def material(name, color, metallic=0.0, roughness=0.55, emission=None, emission_strength=0.0):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1.0)
    result.use_nodes = True
    principled = result.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    if emission:
        principled.inputs["Emission Color"].default_value = (*emission, 1.0)
        principled.inputs["Emission Strength"].default_value = emission_strength
    return result


def world_location(x, y, z):
    # Blender is Z-up. glTF exports X, Z, -Y into Three.js X, Y, Z.
    return (x, -z, y)


def cube(name, size, position, mat, bevel=0.04, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=world_location(*position), rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("Soft indie edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.materials.append(mat)
    return obj


def cylinder(name, radius, depth, position, mat, vertices=16, rotation=(math.pi / 2, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=world_location(*position),
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("Soft indie edges", "BEVEL")
    bevel.width = min(radius * 0.18, 0.035)
    bevel.segments = 1
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj


def add_seat(x, z, index, mats):
    shell = mats["seat_teal"] if index % 2 == 0 else mats["seat_blue"]
    cube(f"Seat base {index}", (0.82, 0.24, 0.78), (x, 0.46, z), shell, 0.09)
    back = cube(f"Seat back {index}", (0.84, 1.22, 0.20), (x, 1.05, z + 0.31), shell, 0.09)
    back.rotation_euler[0] = math.radians(-8)
    cube(f"Headrest {index}", (0.66, 0.34, 0.16), (x, 1.68, z + 0.40), mats["headrest"], 0.07)
    for side in (-1, 1):
        cube(
            f"Seat arm {index} {side}",
            (0.10, 0.12, 0.74),
            (x + side * 0.43, 0.72, z),
            mats["metal"],
            0.025,
        )
        cylinder(
            f"Seat leg {index} {side}",
            0.035,
            0.42,
            (x + side * 0.27, 0.22, z + 0.08),
            mats["metal"],
            8,
            (0.0, 0.0, 0.0),
        )


def join_by_material(root):
    buckets = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or not obj.data.materials:
            continue
        buckets.setdefault(obj.data.materials[0].name, []).append(obj)
    for material_name, objects in buckets.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        joined = bpy.context.object
        joined.name = f"CM_{material_name.upper().replace(' ', '_')}"
        joined.parent = root
        joined["cm_material_group"] = material_name


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0

    mats = {
        "carpet": material("Carpet", (0.018, 0.070, 0.125), roughness=0.95),
        "shell": material(
            "Warm shell",
            (0.68, 0.76, 0.78),
            metallic=0.05,
            roughness=0.62,
            emission=(0.26, 0.31, 0.34),
            emission_strength=0.42,
        ),
        "trim": material("Metal trim", (0.22, 0.29, 0.35), metallic=0.72, roughness=0.28),
        "seat_teal": material("Seat teal", (0.018, 0.22, 0.31), roughness=0.78),
        "seat_blue": material("Seat blue", (0.025, 0.12, 0.28), roughness=0.76),
        "headrest": material("Headrest violet", (0.30, 0.12, 0.52), roughness=0.7),
        "metal": material("Seat metal", (0.32, 0.38, 0.42), metallic=0.82, roughness=0.27),
        "cyan": material(
            "Neon cyan", (0.02, 0.42, 0.48), metallic=0.12, roughness=0.3, emission=(0.03, 0.88, 0.78), emission_strength=2.2
        ),
        "pink": material(
            "Neon pink", (0.52, 0.03, 0.24), metallic=0.08, roughness=0.34, emission=(1.0, 0.06, 0.42), emission_strength=1.8
        ),
        "yellow": material(
            "Warning yellow", (0.70, 0.55, 0.03), metallic=0.05, roughness=0.42, emission=(1.0, 0.76, 0.03), emission_strength=1.0
        ),
        "dark": material("Galley dark", (0.025, 0.035, 0.075), metallic=0.46, roughness=0.38),
        "glass": material(
            "Window glow", (0.02, 0.17, 0.28), metallic=0.18, roughness=0.2, emission=(0.04, 0.42, 0.72), emission_strength=1.0
        ),
    }

    root = bpy.data.objects.new("CM_SCENARIO_ROOT", None)
    root["cm_asset_version"] = 1
    root["cm_coordinate_system"] = "Three.js Y-up cabin-local"
    scene.collection.objects.link(root)

    cube("Floor", (8.4, 0.16, 20.5), (0, -0.08, 7.25), mats["carpet"], 0.02)
    for x in (-4.08, 4.08):
        cube(f"Lower wall {x}", (0.16, 2.30, 20.5), (x, 1.15, 7.25), mats["shell"], 0.04)
    cube("Ceiling spine", (3.7, 0.14, 20.5), (0, 3.05, 7.25), mats["shell"], 0.05)
    cube(
        "Left roof shell",
        (2.2, 0.14, 20.5),
        (-3.0, 2.82, 7.25),
        mats["shell"],
        0.05,
    )
    cube(
        "Right roof shell",
        (2.2, 0.14, 20.5),
        (3.0, 2.82, 7.25),
        mats["shell"],
        0.05,
    )
    for x in (-2.7, -1.35, 1.35, 2.7):
        cube(f"Ceiling contour {x}", (1.18, 0.12, 20.5), (x, 2.84 - abs(x) * 0.08, 7.25), mats["shell"], 0.045)

    for z in [0.9 + step * 2.25 for step in range(8)]:
        for x in (-4.0, 4.0):
            cube(f"Window {x} {z}", (0.08, 0.62, 0.78), (x, 1.72, z), mats["glass"], 0.09)
        cube(f"Floor rib {z}", (8.16, 0.025, 0.055), (0, 0.02, z), mats["cyan"], 0.012)

    seat_xs = (-2.85, -1.65, 1.65, 2.85)
    seat_index = 0
    for row in range(8):
        z = 2.1 + row * 1.38
        for x in seat_xs:
            add_seat(x, z, seat_index, mats)
            seat_index += 1
        for x in (-3.18, 3.18):
            cube(f"Overhead bin {x} {row}", (1.25, 0.62, 1.12), (x, 2.48, z), mats["shell"], 0.12)
            cube(f"Bin accent {x} {row}", (0.035, 0.14, 0.78), (x - (0.61 if x > 0 else -0.61), 2.45, z), mats["pink"], 0.02)

    # ------------------------------------------------------------------
    # Flight deck. The fuselage continues forward of the cabin floor into a
    # real nose section: windscreen, glareshield, panel, pedestal, yokes.
    # Everything here sits forward of the walkable volume, so it stays a
    # purely visual set dressed behind the bulkhead doorway.
    # ------------------------------------------------------------------
    cube("Cockpit floor", (7.4, 0.16, 2.6), (0, -0.08, -4.3), mats["carpet"], 0.02)
    for x in (-3.62, 3.62):
        cube(f"Cockpit wall {x}", (0.16, 2.60, 2.6), (x, 1.30, -4.3), mats["shell"], 0.04)
    cube("Cockpit ceiling", (7.4, 0.14, 2.6), (0, 2.90, -4.3), mats["shell"], 0.05)
    for x in (-3.85, 3.85):
        cube(f"Nose fairing {x}", (0.62, 2.60, 0.24), (x, 1.30, -3.02), mats["shell"], 0.05)
    cube("Nose cap", (7.0, 2.70, 0.30), (0, 1.35, -5.62), mats["shell"], 0.10)
    cylinder("Radome", 1.35, 0.85, (0, 1.15, -6.05), mats["shell"], 20)

    cube("Windscreen frame", (6.2, 1.30, 0.24), (0, 2.05, -5.34), mats["dark"], 0.05)
    for index, x in enumerate((-2.15, -0.72, 0.72, 2.15)):
        pane = cube(f"Windscreen pane {index}", (1.26, 0.92, 0.06), (x, 2.06, -5.26), mats["glass"], 0.04)
        pane.rotation_euler[0] = math.radians(-12)
    for x in (-3.55, 3.55):
        cube(f"Cockpit side window {x}", (0.08, 0.60, 1.00), (x, 1.95, -4.75), mats["glass"], 0.05)

    glareshield = cube("Glareshield", (5.8, 0.26, 0.62), (0, 1.72, -4.98), mats["dark"], 0.05)
    glareshield.rotation_euler[0] = math.radians(-16)
    panel = cube("Instrument panel", (5.8, 1.00, 0.42), (0, 1.16, -4.86), mats["trim"], 0.04)
    panel.rotation_euler[0] = math.radians(-14)
    display_keys = ("cyan", "pink", "cyan", "cyan", "yellow", "cyan")
    for index, x in enumerate((-2.28, -1.52, -0.76, 0.76, 1.52, 2.28)):
        display = cube(
            f"Flight display {index}", (0.62, 0.44, 0.05), (x, 1.34, -4.68), mats[display_keys[index]], 0.02
        )
        display.rotation_euler[0] = math.radians(-14)
    for index in range(10):
        switch = cube(
            f"Panel switch {index}",
            (0.32, 0.09, 0.04),
            (-2.25 + index * 0.5, 0.84, -4.72),
            mats["yellow"] if index % 3 else mats["cyan"],
            0.015,
        )
        switch.rotation_euler[0] = math.radians(-14)

    cube("Overhead panel", (2.9, 0.28, 1.60), (0, 2.62, -4.55), mats["dark"], 0.05)
    for index in range(6):
        cube(
            f"Overhead switch row {index}",
            (2.5, 0.05, 0.10),
            (0, 2.45, -5.15 + index * 0.28),
            mats["cyan"] if index % 2 == 0 else mats["yellow"],
            0.02,
        )

    cube("Centre pedestal", (0.86, 0.66, 1.70), (0, 0.42, -4.10), mats["dark"], 0.05)
    cube("Pedestal top", (0.94, 0.10, 1.70), (0, 0.78, -4.10), mats["trim"], 0.03)
    cube("Throttle quadrant", (0.80, 0.16, 0.52), (0, 0.90, -4.55), mats["trim"], 0.04)
    for index, x in enumerate((-0.17, 0.17)):
        cylinder(f"Throttle lever {index}", 0.035, 0.34, (x, 1.10, -4.55), mats["metal"], 8, (0.0, 0.0, 0.0))
        cube(f"Throttle knob {index}", (0.13, 0.11, 0.13), (x, 1.28, -4.55), mats["pink"], 0.03)
    cube("Radio stack", (0.62, 0.30, 0.46), (0, 0.98, -3.95), mats["trim"], 0.03)
    cube("Radio readout", (0.48, 0.13, 0.05), (0, 1.02, -3.71), mats["cyan"], 0.02)
    cube("Flap lever base", (0.30, 0.10, 0.34), (0, 0.86, -3.45), mats["trim"], 0.03)
    cylinder("Flap lever", 0.03, 0.30, (0, 1.02, -3.45), mats["metal"], 8, (0.0, 0.0, 0.0))
    cube("Flap knob", (0.12, 0.10, 0.12), (0, 1.18, -3.45), mats["yellow"], 0.03)

    for index, x in enumerate((-1.28, 1.28)):
        add_seat(x, -3.72, 200 + index, mats)
        cylinder(f"Yoke column {index}", 0.055, 0.60, (x, 0.92, -4.42), mats["metal"], 10, (0.0, 0.0, 0.0))
        cube(f"Yoke bar {index}", (0.50, 0.07, 0.09), (x, 1.24, -4.42), mats["dark"], 0.02)
        for grip in (-0.22, 0.22):
            cube(f"Yoke grip {index} {grip}", (0.10, 0.16, 0.09), (x + grip, 1.31, -4.42), mats["dark"], 0.03)
        cube(f"Rudder pedal {index}", (0.44, 0.10, 0.26), (x, 0.24, -4.74), mats["metal"], 0.02)

    for x in (-3.48, 3.48):
        cube(f"Breaker panel {x}", (0.14, 1.05, 1.00), (x, 1.15, -3.45), mats["dark"], 0.03)
        for row in range(4):
            cube(
                f"Breaker row {x} {row}",
                (0.05, 0.07, 0.86),
                (x + (0.09 if x > 0 else -0.09), 0.80 + row * 0.22, -3.45),
                mats["yellow"],
                0.015,
            )

    # Cockpit bulkhead is authored as two panels plus a header so the doorway
    # is an actual hole the cabin can see the flight deck through.
    for side in (-1, 1):
        cube(f"Cockpit bulkhead {side}", (3.45, 2.95, 0.18), (side * 2.42, 1.47, -1.45), mats["dark"], 0.03)
    cube("Cockpit bulkhead header", (1.40, 0.72, 0.18), (0, 2.59, -1.45), mats["dark"], 0.03)
    cube("Cockpit door frame", (1.52, 2.30, 0.10), (0, 1.15, -1.53), mats["trim"], 0.04)
    cube("Cockpit door", (0.09, 2.04, 1.02), (-1.18, 1.02, -1.05), mats["shell"], 0.05)
    cube("Cockpit door keypad", (0.05, 0.24, 0.16), (-1.11, 1.38, -1.05), mats["cyan"], 0.02)
    cube("Flight deck placard", (1.30, 0.20, 0.05), (0, 2.42, -1.34), mats["cyan"], 0.02)
    cube("Observer jumpseat back", (0.60, 0.88, 0.12), (1.55, 1.18, -1.32), mats["seat_blue"], 0.04)
    cube("Observer jumpseat pan", (0.58, 0.14, 0.28), (1.55, 0.72, -1.24), mats["seat_teal"], 0.04)

    # ------------------------------------------------------------------
    # Forward galley. Sized to the simulation's front fixtures so the
    # cabinets line up with the volume the host already blocks off.
    # ------------------------------------------------------------------
    for side in (-1, 1):
        cx = side * 2.02
        cube(f"Front galley carcass {side}", (2.72, 1.72, 0.72), (cx, 0.86, -0.75), mats["dark"], 0.06)
        cube(f"Front galley worktop {side}", (2.86, 0.12, 0.82), (cx, 1.78, -0.75), mats["metal"], 0.04)
        cube(f"Front galley upper {side}", (2.72, 0.80, 0.60), (cx, 2.42, -0.84), mats["shell"], 0.08)
        for index in range(3):
            dx = cx - 0.88 + index * 0.88
            cube(f"Front galley door {side} {index}", (0.80, 1.28, 0.06), (dx, 0.86, -0.41), mats["shell"], 0.03)
            cylinder(
                f"Front galley handle {side} {index}",
                0.026,
                0.44,
                (dx + 0.32, 0.86, -0.37),
                mats["metal"],
                8,
                (0.0, 0.0, 0.0),
            )
            cube(f"Front galley latch {side} {index}", (0.10, 0.09, 0.05), (dx - 0.30, 1.40, -0.38), mats["yellow"], 0.02)
            cube(f"Front galley upper door {side} {index}", (0.80, 0.70, 0.05), (dx, 2.42, -0.53), mats["trim"], 0.03)
        cube(f"Front galley strip {side}", (2.60, 0.05, 0.06), (cx, 1.92, -0.40), mats["cyan"], 0.02)
        cube(f"Front galley placard {side}", (0.70, 0.16, 0.05), (cx, 2.04, -0.39), mats["pink"], 0.02)

    cube("Boarding door", (0.10, 2.05, 1.02), (-3.98, 1.03, 0.60), mats["shell"], 0.05)
    cube("Boarding door frame", (0.08, 2.24, 1.20), (-4.02, 1.12, 0.60), mats["trim"], 0.04)
    cylinder("Boarding door handle", 0.03, 0.30, (-3.90, 1.10, 0.94), mats["metal"], 8, (0.0, 0.0, 0.0))
    cube("Door armed sign", (0.05, 0.22, 0.46), (-3.90, 1.96, 0.60), mats["pink"], 0.02)
    cube("Service door", (0.10, 2.05, 1.02), (3.98, 1.03, 0.60), mats["shell"], 0.05)
    cube("Service door frame", (0.08, 2.24, 1.20), (4.02, 1.12, 0.60), mats["trim"], 0.04)
    cube("Service door sign", (0.05, 0.22, 0.46), (3.90, 1.96, 0.60), mats["yellow"], 0.02)

    # ------------------------------------------------------------------
    # Rear service area: a full galley wall built into the aft bulkhead,
    # plus cabinet stacks down both side walls. Depths stay under 0.75m so
    # the props never intrude into the host's walkable volume.
    # ------------------------------------------------------------------
    for side in (-1, 1):
        cube(f"Cargo bulkhead {side}", (3.30, 2.90, 0.16), (side * 2.45, 1.45, 13.32), mats["dark"], 0.03)
    cube("Cargo bulkhead header", (1.70, 0.60, 0.16), (0, 2.60, 13.32), mats["dark"], 0.03)
    cube("Cargo doorway frame", (1.86, 2.34, 0.10), (0, 1.17, 13.40), mats["trim"], 0.05)

    for side in (-1, 1):
        cx = side * 2.25
        cube(f"Rear galley carcass {side}", (2.60, 2.45, 0.34), (cx, 1.22, 13.24), mats["dark"], 0.05)
        cube(f"Rear galley worktop {side}", (2.72, 0.12, 0.36), (cx, 1.02, 13.23), mats["metal"], 0.04)
        for index in range(3):
            dx = cx - 0.84 + index * 0.84
            appliance = (side == -1 and index == 0) or (side == 1 and index == 2)
            if not appliance:
                cube(f"Rear upper door {side} {index}", (0.76, 0.84, 0.06), (dx, 1.72, 13.04), mats["shell"], 0.03)
                cylinder(
                    f"Rear upper handle {side} {index}",
                    0.026,
                    0.38,
                    (dx + 0.30, 1.72, 13.00),
                    mats["metal"],
                    8,
                    (0.0, 0.0, 0.0),
                )
            cube(f"Rear lower door {side} {index}", (0.76, 0.72, 0.06), (dx, 0.56, 13.04), mats["shell"], 0.03)
            cylinder(
                f"Rear lower handle {side} {index}",
                0.026,
                0.34,
                (dx + 0.30, 0.56, 13.00),
                mats["metal"],
                8,
                (0.0, 0.0, 0.0),
            )
            cube(f"Rear latch {side} {index}", (0.10, 0.08, 0.05), (dx - 0.28, 2.18, 13.03), mats["yellow"], 0.02)
        cube(f"Rear galley strip {side}", (2.50, 0.05, 0.06), (cx, 1.12, 13.02), mats["cyan"], 0.02)
        cube(f"Rear galley placard {side}", (0.80, 0.18, 0.05), (cx, 2.32, 13.03), mats["pink"], 0.02)

    cube("Oven stack", (0.78, 0.84, 0.30), (-3.09, 1.74, 13.22), mats["trim"], 0.04)
    for index, oven_y in enumerate((1.52, 1.94)):
        cube(f"Oven door {index}", (0.62, 0.34, 0.06), (-3.09, oven_y, 13.04), mats["glass"], 0.03)
        cube(f"Oven handle {index}", (0.56, 0.06, 0.06), (-3.09, oven_y - 0.21, 13.01), mats["metal"], 0.02)

    # The coffee machine is the repair gag prop: it gets an angry little face.
    cube("Coffee machine", (0.78, 0.86, 0.32), (3.09, 1.74, 13.21), mats["trim"], 0.06)
    cube("Coffee screen", (0.50, 0.30, 0.05), (3.09, 1.90, 13.03), mats["pink"], 0.03)
    for eye_x in (2.94, 3.24):
        cube(f"Coffee eye {eye_x}", (0.10, 0.07, 0.04), (eye_x, 1.94, 13.00), mats["yellow"], 0.02)
    cube("Coffee mouth", (0.34, 0.05, 0.04), (3.09, 1.81, 13.00), mats["pink"], 0.02)
    cube("Coffee spout", (0.16, 0.10, 0.10), (3.09, 1.52, 13.01), mats["metal"], 0.03)
    cube("Coffee pot", (0.24, 0.22, 0.20), (3.09, 1.19, 13.02), mats["dark"], 0.05)

    cube("Crew jumpseat back", (0.60, 0.88, 0.10), (-1.35, 1.56, 13.02), mats["seat_blue"], 0.04)
    cube("Crew jumpseat pan", (0.58, 0.14, 0.26), (-1.35, 1.08, 12.96), mats["seat_teal"], 0.04)
    cube("Crew harness", (0.10, 0.70, 0.05), (-1.35, 1.58, 12.96), mats["yellow"], 0.02)

    for side in (-1, 1):
        x = side * 3.66
        cube(f"Galley tower {side}", (0.72, 2.50, 3.50), (x, 1.25, 11.15), mats["dark"], 0.06)
        cube(f"Galley worktop {side}", (0.80, 0.12, 3.50), (x, 1.02, 11.15), mats["metal"], 0.04)
        for index in range(4):
            z = 9.75 + index * 0.90
            cube(f"Galley upper door {side} {index}", (0.06, 0.80, 0.80), (side * 3.31, 1.72, z), mats["shell"], 0.03)
            cylinder(
                f"Galley upper handle {side} {index}",
                0.026,
                0.36,
                (side * 3.27, 1.72, z + 0.30),
                mats["metal"],
                8,
                (0.0, 0.0, 0.0),
            )
            cube(f"Galley lower door {side} {index}", (0.06, 0.70, 0.80), (side * 3.31, 0.54, z), mats["shell"], 0.03)
            cube(f"Galley latch {side} {index}", (0.05, 0.08, 0.10), (side * 3.29, 2.14, z), mats["yellow"], 0.02)
        cube(f"Galley strip {side}", (0.06, 0.05, 3.30), (side * 3.30, 1.12, 11.15), mats["cyan"], 0.02)

    cube("Trolley bay", (0.66, 0.92, 1.00), (-3.62, 0.50, 12.20), mats["trim"], 0.04)
    cube("Stowed trolley", (0.54, 0.80, 0.86), (-3.58, 0.50, 12.20), mats["metal"], 0.05)
    cube("Trolley stripe", (0.06, 0.14, 0.82), (-3.30, 0.66, 12.20), mats["cyan"], 0.02)
    for wheel_z in (11.88, 12.52):
        cylinder(
            f"Trolley wheel {wheel_z}",
            0.07,
            0.06,
            (-3.58, 0.08, wheel_z),
            mats["dark"],
            8,
            (math.pi / 2, 0.0, math.pi / 2),
        )

    cube("Fire station frame", (0.14, 1.20, 1.05), (3.95, 1.50, 8.95), mats["yellow"], 0.04)
    cylinder("Extinguisher body", 0.13, 0.62, (3.80, 1.42, 8.95), mats["pink"], 12, (0.0, 0.0, 0.0))
    cube("Extinguisher head", (0.16, 0.14, 0.16), (3.80, 1.80, 8.95), mats["metal"], 0.03)
    cube("Lavatory door", (0.10, 2.02, 0.92), (-3.98, 1.01, 8.95), mats["shell"], 0.05)
    cube("Lavatory frame", (0.08, 2.20, 1.10), (-4.02, 1.10, 8.95), mats["trim"], 0.04)
    cube("Lavatory sign", (0.05, 0.20, 0.42), (-3.90, 1.92, 8.95), mats["cyan"], 0.02)
    cylinder("Lavatory handle", 0.028, 0.26, (-3.90, 1.05, 9.26), mats["metal"], 8, (0.0, 0.0, 0.0))

    # ------------------------------------------------------------------
    # Cargo hold aft of the rear bulkhead.
    # ------------------------------------------------------------------
    cube("Aft pressure dome", (8.2, 3.05, 0.20), (0, 1.50, 17.45), mats["shell"], 0.06)
    for side in (-1, 1):
        x = side * 3.55
        for shelf_y in (0.52, 1.46, 2.40):
            cube(f"Cargo shelf {side} {shelf_y}", (0.90, 0.10, 3.30), (x, shelf_y, 15.40), mats["metal"], 0.03)
        for upright_z in (13.85, 16.95):
            cube(f"Cargo upright {side} {upright_z}", (0.12, 2.90, 0.12), (x, 1.45, upright_z), mats["trim"], 0.02)
        cube(f"Cargo rail {side}", (0.10, 0.10, 4.00), (side * 2.40, 2.86, 15.45), mats["trim"], 0.02)
    crate_specs = (
        (-3.55, 0.86, 14.35, (0.80, 0.58, 0.90), "trim"),
        (-3.55, 1.82, 15.60, (0.78, 0.62, 1.10), "yellow"),
        (-3.55, 2.72, 16.40, (0.76, 0.56, 0.95), "dark"),
        (3.55, 0.88, 14.60, (0.80, 0.62, 1.00), "dark"),
        (3.55, 1.84, 16.10, (0.78, 0.64, 1.05), "trim"),
        (3.55, 2.72, 15.10, (0.76, 0.56, 0.92), "pink"),
        (0.00, 0.42, 16.90, (1.30, 0.80, 1.20), "trim"),
        (0.00, 1.32, 16.90, (1.05, 0.68, 0.95), "yellow"),
    )
    for index, (cx, cy, cz, size, key) in enumerate(crate_specs):
        cube(f"Cargo crate {index}", size, (cx, cy, cz), mats[key], 0.05)
        cube(f"Crate strap {index}", (size[0] * 0.18, size[1] * 0.94, size[2] * 1.02), (cx, cy, cz), mats["dark"], 0.02)
    cube("Cargo door", (0.12, 1.95, 2.20), (4.01, 1.20, 16.00), mats["trim"], 0.05)
    cube("Cargo door seal", (0.06, 2.15, 2.40), (4.05, 1.20, 16.00), mats["yellow"], 0.03)
    cube("Cargo door light", (0.05, 0.18, 0.55), (3.93, 2.10, 16.00), mats["pink"], 0.02)

    for z in (-4.4, 3.0, 7.0, 11.0, 15.4):
        cube(f"Aisle light {z}", (0.18, 0.025, 2.2), (0, 2.96 if z > 0 else 2.82, z), mats["cyan"], 0.015)
    for z in (1.05, 12.6):
        cube(f"Exit slash {z}", (1.1, 0.20, 0.05), (0, 2.63, z), mats["pink"], 0.02)

    join_by_material(root)
    for obj in root.children:
        if obj.type == "MESH":
            obj["cm_static_visual"] = True

    SOURCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    RUNTIME_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_PATH))
    bpy.ops.export_scene.gltf(
        filepath=str(RUNTIME_PATH),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )
    print(f"Built {SOURCE_PATH}")
    print(f"Built {RUNTIME_PATH}")


if __name__ == "__main__":
    build()

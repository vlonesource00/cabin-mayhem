"""Hair/accessories for the original 12 — signature (prefix, skin, top, head_z)."""
# Helpers sph/cyl/box/apply_scale_local/M/radians injected at runtime.


def hair_gym(prefix, skin, top, head_z):
    h = sph(prefix + "_hair", (0, 0.04, head_z + 0.12), 0.22, M["hair_br"], 16)
    h.scale = (1.15, 1.05, 0.7)
    apply_scale_local(h)
    q = box(prefix + "_quiff", (0, -0.14, head_z + 0.24), (0.2, 0.16, 0.14), M["hair_br"], 0.04)
    q.rotation_euler = (radians(-30), 0, 0)
    box(prefix + "_strapL", (-0.1, 0, 0.78 if head_z < 1.3 else 1.27), (0.05, 0.08, 0.12), M["black"], 0.01)
    box(prefix + "_strapR", (0.1, 0, 0.78 if head_z < 1.3 else 1.27), (0.05, 0.08, 0.12), M["black"], 0.01)


def hair_old(prefix, skin, top, head_z):
    for name, loc, sc in [
        ("_hairL", (-0.2, 0.02, head_z + 0.02), (0.12, 0.2, 0.22)),
        ("_hairR", (0.2, 0.02, head_z + 0.02), (0.12, 0.2, 0.22)),
        ("_hairB", (0.0, 0.16, head_z + 0.02), (0.22, 0.12, 0.2)),
        ("_fringe", (0.0, -0.16, head_z + 0.10), (1.4, 0.6, 0.55)),
    ]:
        h = sph(prefix + name, loc, 0.14 if name != "_fringe" else 0.13, M["hair_gy"], 14)
        h.scale = sc
        apply_scale_local(h)


def hair_beanie(prefix, skin, top, head_z):
    hat = sph(prefix + "_beanie", (0, 0, head_z + 0.18), 0.27, M["green"], 18)
    hat.scale = (1.08, 1.05, 0.72)
    apply_scale_local(hat)
    sph(prefix + "_bumpL", (-0.07, 0, head_z + 0.34), 0.055, M["green"], 10)
    sph(prefix + "_bumpR", (0.07, 0, head_z + 0.34), 0.055, M["green"], 10)
    tz = 0.55 if head_z < 1.3 else 1.04
    box(prefix + "_seam", (0, -0.16, tz), (0.012, 0.02, 0.36), M["navy"], 0.002)
    box(prefix + "_tee", (0, -0.15, tz + 0.07), (0.09, 0.02, 0.14), M["white"], 0.01)
    sph(prefix + "_sideL", (-0.22, 0, head_z - 0.01), 0.07, M["hair_br"], 10)
    sph(prefix + "_sideR", (0.22, 0, head_z - 0.01), 0.07, M["hair_br"], 10)


def hair_hoodie(prefix, skin, top, head_z):
    for i, (ox, oy, oz, r) in enumerate([
        (0, 0.02, head_z + 0.16, 0.2),
        (-0.12, 0, head_z + 0.12, 0.12),
        (0.12, 0, head_z + 0.12, 0.12),
        (0, 0.1, head_z + 0.14, 0.12),
        (-0.08, -0.05, head_z + 0.14, 0.1),
        (0.08, -0.05, head_z + 0.14, 0.1),
    ]):
        sph(prefix + f"_hair{i}", (ox, oy, oz), r, M["hair_br"], 12)
    hz = 0.95 if head_z < 1.3 else 1.44
    sph(prefix + "_hoodL", (-0.12, 0.14, hz), 0.12, M["grey"], 12)
    sph(prefix + "_hoodR", (0.12, 0.14, hz), 0.12, M["grey"], 12)
    sph(prefix + "_hoodB", (0, 0.18, hz + 0.10), 0.14, M["grey"], 12)


def hair_suit(prefix, skin, top, head_z):
    h = sph(prefix + "_hair", (0, 0.02, head_z + 0.16), 0.24, M["hair_bk"], 16)
    h.scale = (1.1, 1.05, 0.6)
    apply_scale_local(h)
    cz = 0.68 if head_z < 1.3 else 1.17
    for side, sx in (("L", -1), ("R", 1)):
        lap = box(prefix + f"_lapel{side}", (sx * 0.07, -0.15, cz), (0.06, 0.025, 0.2), M["navy"], 0.01)
        lap.rotation_euler = (0, 0, radians(sx * 22))
    box(prefix + "_shirt", (0, -0.16, cz + 0.04), (0.07, 0.02, 0.16), M["white"], 0.008)
    box(prefix + "_tie", (0, -0.17, cz - 0.08), (0.035, 0.02, 0.24), M["red"], 0.008)


def hair_afro(prefix, skin, top, head_z):
    sph(prefix + "_afro", (0, 0.02, head_z + 0.14), 0.30, M["hair_af"], 18)
    for i, (ox, oy, oz) in enumerate([
        (-0.2, 0, head_z + 0.09),
        (0.2, 0, head_z + 0.09),
        (0, 0.18, head_z + 0.16),
        (-0.12, 0.12, head_z + 0.26),
        (0.12, -0.08, head_z + 0.24),
    ]):
        sph(prefix + f"_afro{i}", (ox, oy, oz), 0.11, M["hair_af"], 10)
    sph(prefix + "_earL", (-0.28, -0.04, head_z - 0.01), 0.035, M["gold"], 8)
    sph(prefix + "_earR", (0.28, -0.04, head_z - 0.01), 0.035, M["gold"], 8)


def hair_tourist(prefix, skin, top, head_z):
    dome = sph(prefix + "_hat", (0, 0, head_z + 0.18), 0.26, M["straw"], 16)
    dome.scale = (1.12, 1.08, 0.7)
    apply_scale_local(dome)
    box(prefix + "_shades", (0, -0.34, head_z + 0.03), (0.28, 0.04, 0.08), M["black"], 0.01)
    sph(prefix + "_sideL", (-0.22, 0, head_z + 0.02), 0.08, M["hair_br"], 10)
    sph(prefix + "_sideR", (0.22, 0, head_z + 0.02), 0.08, M["hair_br"], 10)


def hair_teen(prefix, skin, top, head_z):
    cap = sph(prefix + "_cap", (0, 0.02, head_z + 0.16), 0.24, M["cap_red"], 16)
    cap.scale = (1.1, 1.05, 0.58)
    apply_scale_local(cap)
    brim = box(prefix + "_brim", (0, 0.20, head_z + 0.06), (0.18, 0.12, 0.025), M["cap_red"], 0.01)
    brim.rotation_euler = (radians(12), 0, 0)
    sph(prefix + "_tuft", (0, -0.14, head_z + 0.10), 0.09, M["hair_br"], 10)


def hair_attendant(prefix, skin, top, head_z):
    h = sph(prefix + "_hair", (0, 0.02, head_z + 0.14), 0.24, M["hair_bk"], 16)
    h.scale = (1.1, 1.05, 0.58)
    apply_scale_local(h)
    sph(prefix + "_bun", (0, 0.18, head_z + 0.10), 0.1, M["hair_bk"], 12)
    neck_z = 0.86 if head_z < 1.3 else 1.35
    cyl(prefix + "_scarf", (0, -0.02, neck_z), 0.085, 0.04, M["red"], 14)
    cz = 0.62 if head_z < 1.3 else 1.11
    box(prefix + "_tag", (0.09, -0.17, cz), (0.05, 0.012, 0.03), M["gold"], 0.004)


def hair_grandma(prefix, skin, top, head_z):
    h = sph(prefix + "_hair", (0, 0.02, head_z + 0.14), 0.24, M["hair_gy"], 16)
    h.scale = (1.1, 1.05, 0.58)
    apply_scale_local(h)
    sph(prefix + "_bun", (0, 0, head_z + 0.28), 0.11, M["hair_gy"], 12)
    for side, sx in (("L", -0.115), ("R", 0.115)):
        box(prefix + f"_glass{side}", (sx, -0.30, head_z + 0.03), (0.12, 0.02, 0.1), M["black"], 0.004)
    box(prefix + "_bridge", (0, -0.30, head_z + 0.03), (0.05, 0.015, 0.02), M["black"], 0.002)
    # skirt only meaningful when seated hips are low; still ok in tpose as short skirt volume
    skirt_z = 0.22 if head_z < 1.3 else 0.72
    skirt = sph(prefix + "_skirt", (0, -0.05, skirt_z), 0.24, M["dkgrey"], 16)
    skirt.scale = (1.25, 1.35, 0.7)
    apply_scale_local(skirt)
    bz = 0.70 if head_z < 1.3 else 1.19
    for i, z in enumerate([bz, bz - 0.12, bz - 0.24]):
        sph(prefix + f"_btn{i}", (0, -0.17, z), 0.018, M["white"], 8)


def hair_headphones(prefix, skin, top, head_z):
    for i, (ox, oz) in enumerate([
        (-0.07, head_z + 0.18),
        (0.07, head_z + 0.20),
        (0, head_z + 0.26),
        (-0.05, head_z + 0.22),
        (0.06, head_z + 0.16),
    ]):
        sp = sph(prefix + f"_spike{i}", (ox, 0, oz), 0.05, M["hair_bk"], 8)
        sp.scale = (0.7, 0.7, 1.7)
        apply_scale_local(sp)
    for side, sx in (("L", -1), ("R", 1)):
        cup = cyl(prefix + f"_cup{side}", (sx * 0.26, 0, head_z + 0.02), 0.09, 0.07, M["black"], 12)
        cup.rotation_euler = (0, radians(90), 0)
    box(prefix + "_band", (0, 0, head_z + 0.22), (0.48, 0.04, 0.04), M["black"], 0.01)


def hair_punk(prefix, skin, top, head_z):
    for i, oy in enumerate([-0.14, -0.07, 0.0, 0.07, 0.14]):
        spike = sph(prefix + f"_mohawk{i}", (0, oy, head_z + 0.26), 0.055, M["hair_rd"], 8)
        spike.scale = (0.45, 0.55, 2.0)
        apply_scale_local(spike)
    cz = 0.68 if head_z < 1.3 else 1.17
    for side, sx in (("L", -1), ("R", 1)):
        lap = box(prefix + f"_lapel{side}", (sx * 0.07, -0.15, cz), (0.06, 0.025, 0.2), M["black"], 0.01)
        lap.rotation_euler = (0, 0, radians(sx * 22))
    box(prefix + "_tee", (0, -0.16, cz - 0.03), (0.09, 0.02, 0.2), M["white"], 0.01)


EXISTING_SPECS = [
    ("A_char1", "tan", dict(top="black", pants="grey", shoes="grey", short=True, brow="hair_br", brow_ang=5, hair=hair_gym)),
    ("A_char2", "pale", dict(top="cardigan", pants="grey", shoes="shoe_br", brow="hair_gy", brow_ang=-10, hair=hair_old)),
    ("A_char3", "tan", dict(top="denim", pants="navy", shoes="shoe_br", brow="hair_br", hair=hair_beanie)),
    ("A_char4", "dark", dict(top="grey", pants="navy", shoes="white", brow="hair_br", hair=hair_hoodie)),
    ("B_char1", "pale", dict(top="navy", pants="grey", shoes="black", brow="hair_bk", brow_ang=14, hair=hair_suit)),
    ("B_char2", "dark", dict(top="red", pants="navy", shoes="red", brow="hair_af", hair=hair_afro)),
    ("B_char3", "brown", dict(top="teal", pants="beige", shoes="shoe_br", short=True, shades=True, hair=hair_tourist)),
    ("B_char4", "dark", dict(top="yellow", pants="black", shoes="red", short=True, brow="hair_br", brow_ang=8, hair=hair_teen)),
    ("C_char1", "pale", dict(top="navy", pants="navy", shoes="black", brow="hair_bk", smile=True, hair=hair_attendant)),
    ("C_char2", "tan", dict(top="lavender", pants="dkgrey", shoes="black", brow="hair_gy", brow_ang=-6, stock="dkgrey", hair=hair_grandma)),
    ("C_char3", "brown", dict(top="green", pants="black", shoes="white", short=True, brow="hair_bk", hair=hair_headphones)),
    ("C_char4", "dark", dict(top="black", pants="black", shoes="black", brow="hair_bk", brow_ang=18, hair=hair_punk)),
]

"""Batch D_char5 + E_char1 — cowboy + gamer accessories (head_z-relative, local only)."""


def hair_cowboy(prefix, skin, top, head_z):
    # Brown cowboy hat — wide brim + domed crown
    cyl(prefix + "_hatBrim", (0, 0.02, head_z + 0.04), 0.34, 0.025, M["hair_br"], 20)
    dome = sph(prefix + "_hatDome", (0, 0, head_z + 0.18), 0.26, M["hair_br"], 16)
    dome.scale = (1.15, 1.1, 0.55)
    apply_scale_local(dome)
    cyl(prefix + "_hatBand", (0, -0.12, head_z + 0.10), 0.27, 0.018, M["beige"], 16)

    # Brown hair peeking at sides
    sph(prefix + "_hairL", (-0.22, 0.02, head_z + 0.02), 0.08, M["hair_br"], 10)
    sph(prefix + "_hairR", (0.22, 0.02, head_z + 0.02), 0.08, M["hair_br"], 10)
    sideL = sph(prefix + "_sideL", (-0.24, 0.06, head_z - 0.02), 0.06, M["hair_br"], 10)
    sideL.scale = (0.8, 1.0, 1.2)
    apply_scale_local(sideL)

    # Red bandana at neck
    cyl(prefix + "_bandana", (0, -0.04, head_z - 0.20), 0.09, 0.035, M["red"], 14)
    knot = sph(prefix + "_bandanaKnot", (0, -0.18, head_z - 0.22), 0.035, M["red"], 8)
    knot.scale = (1.2, 0.8, 0.8)
    apply_scale_local(knot)
    tail = box(prefix + "_bandanaTail", (0, 0.08, head_z - 0.28), (0.07, 0.16, 0.018), M["red"], 0.006)
    tail.rotation_euler = (radians(8), 0, 0)


def hair_gamer(prefix, skin, top, head_z):
    # Blue spiky hair tufts
    for i, (ox, oy, oz_off, sc) in enumerate([
        (0, -0.14, 0.26, (0.55, 0.65, 2.0)),
        (-0.08, 0.0, 0.24, (0.6, 0.6, 1.8)),
        (0.08, 0.0, 0.24, (0.6, 0.6, 1.8)),
        (-0.05, 0.10, 0.28, (0.5, 0.55, 1.9)),
        (0.06, -0.06, 0.22, (0.55, 0.6, 1.7)),
    ]):
        sp = sph(prefix + f"_spike{i}", (ox, oy, head_z + oz_off), 0.055, M["denim"], 8)
        sp.scale = sc
        apply_scale_local(sp)

    # Black gaming headset — cups + band
    for side, sx in (("L", -1), ("R", 1)):
        cup = cyl(prefix + f"_cup{side}", (sx * 0.30, 0, head_z + 0.02), 0.09, 0.06, M["black"], 12)
        cup.rotation_euler = (0, radians(90), 0)
    box(prefix + "_band", (0, 0, head_z + 0.24), (0.55, 0.04, 0.035), M["black"], 0.01)
    band_top = sph(prefix + "_bandTop", (0, 0, head_z + 0.26), 0.08, M["black"], 10)
    band_top.scale = (2.2, 0.5, 0.5)
    apply_scale_local(band_top)

    # RGB-ish chest badge — purple / teal boxes
    cz = 0.62 if head_z < 1.3 else 1.11
    box(prefix + "_badgeP", (-0.04, -0.17, cz), (0.028, 0.012, 0.028), M["purple"], 0.003)
    box(prefix + "_badgeT", (0.0, -0.17, cz), (0.028, 0.012, 0.028), M["teal"], 0.003)
    box(prefix + "_badgeM", (0.04, -0.17, cz), (0.028, 0.012, 0.028), M["mint"], 0.003)


SPECS_D5E1 = [
    (
        "D_char5",
        "tan",
        dict(
            top="denim",
            pants="beige",
            shoes="shoe_br",
            brow="hair_br",
            brow_ang=6,
            hair=hair_cowboy,
        ),
    ),
    (
        "E_char1",
        "pale",
        dict(
            top="black",
            pants="dkgrey",
            shoes="white",
            short=True,
            brow="hair_bk",
            brow_ang=10,
            hair=hair_gamer,
        ),
    ),
]

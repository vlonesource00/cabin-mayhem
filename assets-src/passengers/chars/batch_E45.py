"""Batch E45 — hipster + kid passenger accessories (local coords, head_z-relative)."""


def hair_hipster(prefix, skin, top, head_z):
    """Thick brown beard, purple beanie, round black glasses."""
    beard = sph(prefix + "_beard", (0, -0.20, head_z - 0.16), 0.11, M["hair_br"], 14)
    beard.scale = (1.45, 1.05, 1.15)
    apply_scale_local(beard)

    for side, sx in (("L", -0.11), ("R", 0.11)):
        side_b = sph(prefix + f"_beard{side}", (sx, -0.16, head_z - 0.12), 0.07, M["hair_br"], 12)
        side_b.scale = (0.85, 1.15, 1.05)
        apply_scale_local(side_b)

    beanie = sph(prefix + "_beanie", (0, 0.01, head_z + 0.20), 0.26, M["purple"], 18)
    beanie.scale = (1.06, 1.04, 0.68)
    apply_scale_local(beanie)

    box(prefix + "_beanieFold", (0, -0.04, head_z + 0.12), (0.24, 0.14, 0.035), M["purple"], 0.008)

    for side, sx in (("L", -0.115), ("R", 0.115)):
        box(
            prefix + f"_glass{side}",
            (sx, -0.30, head_z + 0.03),
            (0.11, 0.022, 0.095),
            M["black"],
            0.004,
        )
    box(prefix + "_bridge", (0, -0.30, head_z + 0.03), (0.048, 0.014, 0.018), M["black"], 0.002)

    for side, sx in (("L", -0.20), ("R", 0.20)):
        peek = sph(prefix + f"_side{side}", (sx, 0.01, head_z + 0.06), 0.06, M["hair_br"], 10)
        peek.scale = (0.9, 1.1, 1.0)
        apply_scale_local(peek)


def hair_kid(prefix, skin, top, head_z):
    """Messy brown hair, red baseball cap, backpack straps (child via accessories)."""
    for i, (ox, oy, oz, r, sc) in enumerate([
        (0, -0.10, 0.16, 0.10, (1.05, 0.75, 1.1)),
        (-0.12, 0.02, 0.15, 0.08, (1.0, 0.9, 1.05)),
        (0.12, 0.04, 0.14, 0.075, (1.0, 0.85, 1.0)),
    ]):
        tuft = sph(prefix + f"_tuft{i}", (ox, oy, head_z + oz), r, M["hair_br"], 12)
        tuft.scale = sc
        apply_scale_local(tuft)

    cap = sph(prefix + "_cap", (0, 0.02, head_z + 0.19), 0.22, M["cap_red"], 16)
    cap.scale = (1.10, 1.05, 0.55)
    apply_scale_local(cap)

    brim = box(prefix + "_brim", (0, 0.19, head_z + 0.12), (0.17, 0.11, 0.022), M["cap_red"], 0.008)
    brim.rotation_euler = (radians(10), 0, 0)

    tz = 0.72 if head_z < 1.3 else 1.21
    for side, sx in (("L", -0.09), ("R", 0.09)):
        box(prefix + f"_strap{side}", (sx, -0.04, tz), (0.045, 0.06, 0.22), M["navy"], 0.008)

    box(prefix + "_pack", (0, 0.12, tz - 0.04), (0.16, 0.10, 0.18), M["denim"], 0.01)


SPECS_E45 = [
    (
        "E_char4",
        "tan",
        dict(
            top="cardigan",
            pants="grey",
            shoes="shoe_br",
            brow="hair_br",
            brow_ang=4,
            hair=hair_hipster,
        ),
    ),
    (
        "E_char5",
        "pale",
        dict(
            top="yellow",
            pants="denim",
            shoes="white",
            brow="hair_br",
            short=True,
            smile=True,
            hair=hair_kid,
        ),
    ),
]

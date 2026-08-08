"""Batch D34 — skater + nurse passenger accessories (local coords, head_z-relative)."""


def hair_skater(prefix, skin, top, head_z):
    """Messy blond tufts, backwards mint cap, hoodie drawstrings."""
    for i, (ox, oy, oz, r, sc) in enumerate([
        (0, -0.05, 0.16, 0.11, None),
        (-0.13, 0.02, 0.14, 0.09, (1.0, 0.85, 1.05)),
        (0.13, 0.02, 0.14, 0.09, (1.0, 0.85, 1.05)),
        (0, -0.13, 0.20, 0.08, (0.95, 0.65, 1.15)),
    ]):
        tuft = sph(prefix + f"_tuft{i}", (ox, oy, head_z + oz), r, M["hair_bl"], 12)
        if sc:
            tuft.scale = sc
            apply_scale_local(tuft)

    cap = sph(prefix + "_cap", (0, 0.03, head_z + 0.20), 0.23, M["mint"], 16)
    cap.scale = (1.12, 1.06, 0.54)
    apply_scale_local(cap)

    brim = box(prefix + "_brim", (0, 0.17, head_z + 0.14), (0.17, 0.10, 0.022), M["mint"], 0.008)
    brim.rotation_euler = (radians(-14), 0, 0)

    for side, sx in (("L", -0.05), ("R", 0.05)):
        string = cyl(prefix + f"_string{side}", (sx, -0.13, head_z - 0.18), 0.011, 0.15, M["white"], 8)
        string.rotation_euler = (radians(6), 0, radians(sx * 12))


def hair_nurse(prefix, skin, top, head_z):
    """Neat brown bun, white nurse hat with red cross, stethoscope (3 parts)."""
    hair = sph(prefix + "_hair", (0, 0.01, head_z + 0.14), 0.23, M["hair_br"], 16)
    hair.scale = (1.08, 1.02, 0.54)
    apply_scale_local(hair)

    sph(prefix + "_bun", (0, 0.14, head_z + 0.22), 0.095, M["hair_br"], 12)

    hat = box(prefix + "_nhat", (0, -0.03, head_z + 0.26), (0.22, 0.17, 0.075), M["white"], 0.01)
    hat.rotation_euler = (radians(-10), 0, 0)

    box(prefix + "_crossH", (0, -0.12, head_z + 0.265), (0.055, 0.012, 0.022), M["red"], 0.003)
    box(prefix + "_crossV", (0, -0.12, head_z + 0.265), (0.016, 0.012, 0.048), M["red"], 0.003)

    sph(prefix + "_stethL", (-0.07, 0.04, head_z - 0.08), 0.028, M["black"], 10)
    sph(prefix + "_stethR", (0.07, 0.04, head_z - 0.08), 0.028, M["black"], 10)
    tube = cyl(prefix + "_stethTube", (0, -0.05, head_z - 0.22), 0.013, 0.30, M["black"], 10)
    tube.rotation_euler = (radians(72), 0, 0)


SPECS_D34 = [
    (
        "D_char3",
        "tan",
        dict(
            top="grey",
            pants="black",
            shoes="white",
            brow="hair_bl",
            brow_ang=6,
            short=True,
            hair=hair_skater,
        ),
    ),
    (
        "D_char4",
        "pale",
        dict(
            top="white",
            pants="teal",
            shoes="white",
            brow="hair_br",
            smile=True,
            hair=hair_nurse,
        ),
    ),
]

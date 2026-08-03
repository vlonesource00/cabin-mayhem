"""Batch E23 — bride + airport security accessories (local coords, head_z-relative)."""


def hair_bride(prefix, skin, top, head_z):
    """White veil, blond updo bun, small gold necklace."""
    bl = M["hair_bl"]
    white = M["white"]
    gold = M["gold"]

    cap = sph(prefix + "_hairCap", (0, 0.02, head_z + 0.14), 0.22, bl, 16)
    cap.scale = (1.05, 1.0, 0.52)
    apply_scale_local(cap)

    sph(prefix + "_bun", (0, 0.17, head_z + 0.20), 0.11, bl, 12)

    for side, sx in (("L", -1), ("R", 1)):
        tuft = sph(prefix + f"_side{side}", (sx * 0.19, 0.0, head_z + 0.12), 0.075, bl, 10)
        tuft.scale = (0.85, 0.75, 1.05)
        apply_scale_local(tuft)

    curl = sph(prefix + "_curl", (0, -0.12, head_z + 0.16), 0.055, bl, 8)
    curl.scale = (0.7, 0.9, 1.2)
    apply_scale_local(curl)

    veil = box(prefix + "_veil", (0, 0.22, head_z + 0.06), (0.44, 0.016, 0.58), white, 0.004)
    veil.rotation_euler = (radians(6), 0, 0)

    box(prefix + "_veilTop", (0, 0.19, head_z + 0.26), (0.38, 0.012, 0.07), white, 0.003)

    box(prefix + "_tiara", (0, -0.08, head_z + 0.22), (0.17, 0.014, 0.028), gold, 0.003)

    nz = 0.84 if head_z < 1.3 else 1.33
    box(prefix + "_necklace", (0, -0.14, nz), (0.15, 0.012, 0.018), gold, 0.003)
    sph(prefix + "_pendant", (0, -0.15, nz - 0.04), 0.016, gold, 8)


def hair_security(prefix, skin, top, head_z):
    """Buzz-cut black hair, dark sunglasses, earpiece, chest badge."""
    bk = M["hair_bk"]
    black = M["black"]
    gold = M["gold"]
    yellow = M["yellow"]

    buzz = sph(prefix + "_hair", (0, 0.02, head_z + 0.12), 0.24, bk, 16)
    buzz.scale = (1.08, 1.05, 0.40)
    apply_scale_local(buzz)

    sph(prefix + "_hairTop", (0, -0.02, head_z + 0.18), 0.075, bk, 10)

    for side, sx in (("L", -1), ("R", 1)):
        sph(prefix + f"_side{side}", (sx * 0.24, 0.0, head_z + 0.06), 0.058, bk, 10)

    box(prefix + "_shades", (0, -0.30, head_z + 0.03), (0.32, 0.045, 0.09), black, 0.012)
    box(prefix + "_shadesBridge", (0, -0.30, head_z + 0.05), (0.06, 0.018, 0.025), black, 0.004)

    ear = cyl(prefix + "_earpiece", (0.28, -0.04, head_z + 0.02), 0.012, 0.055, black, 8)
    ear.rotation_euler = (radians(90), 0, radians(18))

    cz = 0.62 if head_z < 1.3 else 1.11
    badge = box(prefix + "_badge", (0.08, -0.17, cz), (0.065, 0.012, 0.085), gold, 0.004)
    box(prefix + "_badgeTxt", (0.08, -0.175, cz + 0.025), (0.042, 0.008, 0.028), yellow, 0.002)
    box(prefix + "_clip", (-0.06, -0.16, cz - 0.04), (0.032, 0.01, 0.042), black, 0.003)


SPECS_E23 = [
    (
        "E_char2",
        "pale",
        dict(
            top="white",
            pants="white",
            shoes="white",
            brow="hair_bl",
            smile=True,
            hair=hair_bride,
        ),
    ),
    (
        "E_char3",
        "dark",
        dict(
            top="navy",
            pants="black",
            shoes="black",
            shades=True,
            hair=hair_security,
        ),
    ),
]

"""Batch D12 — airline pilot + chef passenger accessories."""


def hair_pilot(prefix, skin, top, head_z):
    # Black side-part hair cap
    h = sph(prefix + "_hair", (0, 0.02, head_z + 0.16), 0.22, M["hair_bk"], 16)
    h.scale = (1.12, 1.05, 0.62)
    apply_scale_local(h)
    part = sph(prefix + "_part", (0.10, -0.05, head_z + 0.17), 0.07, M["hair_bk"], 10)
    part.scale = (0.85, 1.15, 0.45)
    apply_scale_local(part)

    # Peaked pilot hat — navy crown + gold band + forward peak
    crown = sph(prefix + "_hat", (0, 0.0, head_z + 0.20), 0.24, M["navy"], 16)
    crown.scale = (1.06, 1.02, 0.52)
    apply_scale_local(crown)
    cyl(prefix + "_band", (0, 0, head_z + 0.14), 0.255, 0.028, M["gold"], 18)
    peak = box(prefix + "_peak", (0, -0.24, head_z + 0.12), (0.24, 0.15, 0.025), M["navy"], 0.008)
    peak.rotation_euler = (radians(16), 0, 0)

    # Small gold wings badge on chest
    cz = 0.64 if head_z < 1.3 else 1.13
    for side, sx in (("L", -1), ("R", 1)):
        wing = box(prefix + f"_wing{side}", (sx * 0.06, -0.17, cz), (0.055, 0.012, 0.028), M["gold"], 0.004)
        wing.rotation_euler = (0, 0, radians(sx * 20))
    box(prefix + "_badge", (0, -0.17, cz), (0.028, 0.012, 0.018), M["gold"], 0.003)


def hair_chef(prefix, skin, top, head_z):
    # Optional white-grey hair at temples
    sph(prefix + "_hairL", (-0.20, 0.02, head_z + 0.06), 0.07, M["hair_gy"], 10)
    sph(prefix + "_hairR", (0.20, 0.02, head_z + 0.06), 0.07, M["hair_gy"], 10)

    # Tall white toque
    cyl(prefix + "_toque", (0, 0, head_z + 0.22), 0.20, 0.22, M["white"], 14)
    puff = sph(prefix + "_toqueTop", (0, 0, head_z + 0.28), 0.11, M["white"], 12)
    puff.scale = (0.95, 0.95, 0.75)
    apply_scale_local(puff)

    # Dark mustache
    stache = box(prefix + "_stache", (0, -0.28, head_z - 0.10), (0.14, 0.025, 0.032), M["hair_bk"], 0.006)
    stache.rotation_euler = (radians(-4), 0, 0)

    # White coat buttons (double-breasted)
    bz = 0.68 if head_z < 1.3 else 1.17
    for i, z in enumerate([bz, bz - 0.12, bz - 0.24]):
        sph(prefix + f"_btn{i}", (0, -0.17, z), 0.018, M["white"], 8)
    for side, sx in (("L", -1), ("R", 1)):
        sph(prefix + f"_btn{side}", (sx * 0.045, -0.17, bz - 0.06 - sx * 0.04), 0.016, M["white"], 8)


SPECS_D12 = [
    ("D_char1", "pale", dict(top="navy", pants="navy", shoes="black", brow="hair_bk", brow_ang=8, hair=hair_pilot)),
    ("D_char2", "tan", dict(top="white", pants="black", shoes="black", brow="hair_gy", smile=True, hair=hair_chef)),
]

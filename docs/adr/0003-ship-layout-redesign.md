# ADR 0003 — The ship is one hull, and the exterior owns it

**Status:** Accepted
**Supersedes:** the 25-compartment layout sketched in `SHIP_LAYOUT.md` before this
**Related:** [ADR 0001](0001-cruise-ship-pivot.md), [ADR 0004](0004-stair-tower-traversal.md)

## Context

The first layout was written before anything was authored. It listed twenty-five
compartments across decks 0–5 and described each as a room to be built. Building
against it surfaced two problems that no amount of adding rooms would fix.

**The rooms did not add up to a ship.** A stack of interiors on six decks, each
authored about its own origin, produces a building. What makes a cruise ship read
as a cruise ship is almost entirely outside the rooms: the sheer of the hull, the
superstructure block, tier on tier of balconies, the funnels, the boats hanging
in their davits, the fact that it is 290 metres long and you can see all of it.
None of that belonged to any compartment in the list.

**Ownership was undefined.** With no rule about what belongs to a room and what
belongs to the vessel, a rail at the promenade's deck edge is authored by
whoever gets there first — and then again by the other one, half a metre off,
z-fighting for the rest of the project's life.

## Decision

**One always-resident exterior asset owns the vessel; compartments own their own
floors.** Precisely:

- The **exterior** owns the shell, plating, sheer, superstructure, balconies,
  windows as seen from outside, funnels, masts, lifeboats, and every rail or
  fitting permanently outboard of or above the compartment volumes. It is never
  occupied, never a portal target, never evicted.
- A **compartment** owns whatever stands on its own deck, and nothing else.

Everything else follows from having one hull to agree about:

- **One ship space.** Origin amidships on the centreline at the waterline, +X
  starboard, +Y up, +Z bow. LOA 290, beam 38, draught 8.4, air draught 45.
- **One deck formula.** `deckFloorY(deck) = deck × 3.2 − 7.2`, validated against
  every compartment's anchor.
- **One beam curve.** `halfBeamAt(z)` — parallel midbody, fining to a stem and a
  transom — read by the exterior builder, the deck-edge geometry and the deck
  plan, so all three agree by construction.
- **Ten numbered decks, eight of them occupied**, reaching from the tank top at
  deck 0 to the bridge at deck 9. Fourteen compartments, not twenty-five: bigger
  and denser rooms rather than more of them.
- **Compartments may be taller than one deck.** The atrium is four decks with
  the well punched through it; the open decks carry funnel casings and rigging
  in their extent.

## Consequences

- The vessel reads as a vessel from any open deck and through every window, at
  the cost of one asset that is resident from the first frame. That cost is
  managed by the X0/X1/X2 tiers in [`PERFORMANCE.md`](../PERFORMANCE.md) §5, not
  by making the exterior smaller.
- No geometry is authored twice, so there is no class of z-fighting bug at the
  seam between a room and the hull.
- Rooms got large. The promenade is 260 m; the atrium is 24 × 12.8 × 46. Large
  rooms need real interior design — placement that answers to a service route, a
  sightline, a queue — because scattered props read as scattered props at any
  scale, and at this scale they read as scattered props for a very long time.
- Per-compartment asset budgets stopped being design constraints and became
  rails set well above a fully dressed room. Density is the goal; the rail exists
  to catch a broken export.
- The deck plan (**N**) became possible: with one ship space and one beam curve,
  a section and a plan can be drawn from the layout data alone, at true scale,
  without loading anything.

## Alternatives rejected

**Twenty-five smaller compartments.** More rooms, each too small to design, and
the same missing vessel around them. The list was a content wish, not a layout.

**Exterior geometry inside each compartment.** Every room ships the slice of hull
it can see. Rejected: it multiplies the hull by fourteen, guarantees seams, and
makes changing the sheer a fourteen-file edit.

**Procedural exterior at runtime.** Cheap in bytes, and it looks it. The ship is
the game's whole first impression; it is authored.

import { z } from 'zod';

/**
 * MS Cabin Mayhem, declared in ship space.
 *
 * This is the only place compartment geometry, placement and connectivity are
 * declared, and every number in it is hull-referenced. Ship space has its origin
 * amidships on the centreline at the waterline, +X to starboard, +Y up and +Z
 * towards the bow, so a compartment's anchor says where in the actual vessel it
 * sits. Nothing floats: `scripts/validate-data.ts` rejects a compartment outside
 * the hull envelope, a floor off the deck pitch, or a pair of portals whose two
 * doorways do not land on the same point in the ship.
 *
 * Geometry is presentation. Nothing here is derived from a GLB, and a missing
 * GLB changes nothing in this file: the streamer builds greybox from these same
 * numbers and the voyage continues. See `docs/SHIP_LAYOUT.md`.
 */

/** Length overall, metres. The hull spans z in [-145, +145]. */
export const LOA = 290;
/** Moulded beam, metres. The hull spans x in [-19, +19]. */
export const BEAM = 38;
/** Draught, metres. The keel sits at y = -8.4 and the waterline at y = 0. */
export const DRAUGHT = 8.4;
/** Air draught, metres. Mast trucks reach y = +45. */
export const AIR_DRAUGHT = 45;
/** Deck-to-deck pitch, metres: 2.8 m clear plus 0.4 m of deckhead. */
export const DECK_PITCH = 3.2;
/** Deck 0 is the tank top, 1.2 m above the keel over the double bottom. */
export const DECK_ZERO_Y = -7.2;
/** The topmost numbered deck. Funnels and masts above it are exterior dressing. */
export const TOP_DECK = 9;

/** Height of a deck's floor in ship space. Deck 2, the main deck, is at -0.8 m. */
export function deckFloorY(deck: number): number {
  return deck * DECK_PITCH + DECK_ZERO_Y;
}

/**
 * Moulded half-beam at a longitudinal station, metres.
 *
 * The hull is not a box: it holds full beam through the parallel midbody, fines
 * away to a stem forward and narrows to a transom aft. The exterior builder and
 * the deck-edge geometry both read this curve, so the promenade rail follows the
 * same sheer the hull plating does.
 */
export function halfBeamAt(z: number): number {
  const t = Math.max(-1, Math.min(1, z / (LOA / 2)));
  const parallel = 0.45;
  const full = BEAM / 2;
  if (Math.abs(t) <= parallel) return full;
  const fraction = (Math.abs(t) - parallel) / (1 - parallel);
  if (t > 0) return full - (full - 2.2) * Math.pow(fraction, 1.6);
  return full - (full - 9.5) * Math.pow(fraction, 1.4);
}

const vec3Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

export const portalSchema = z.object({
  /** The compartment on the other side. Must resolve, and must be symmetric. */
  target: z.string().regex(/^[a-z0-9-]+$/),
  /**
   * Compartment-local position of the doorway centre, in metres, measured from
   * the anchor. A stair tower carries several portals at the same x/z and
   * different y: that is one door per landing, which is how the crew climbs.
   */
  position: vec3Schema,
});

export const compartmentSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string().min(1),
  /** Numbered playable deck, 0 (tank top) through 9 (sun deck and bridge). */
  deck: z.number().int().min(0).max(TOP_DECK),
  /**
   * Whether the compartment is open to the weather. Exterior compartments see
   * the ocean, the sky and the rest of the ship at once, which is a different
   * streaming and lighting case from a sealed room. See `docs/PERFORMANCE.md`.
   */
  exposure: z.enum(['interior', 'exterior']),
  /**
   * Whether the crew standing here can see the ship's exterior — through
   * windows, a balcony door or the open sky. It decides the exterior's LOD tier
   * in `exteriorTier`: an unglazed room is the one case where the hull can stop
   * drawing entirely, because nothing in it can look at the hull.
   */
  glazed: z.boolean(),
  /**
   * Whether that glazing looks *along* the ship rather than only abeam of it.
   *
   * A cabin window frames the sea and a few metres of the ship's side, which is
   * the case X1 is built for: hide the deck furniture nobody in there can see.
   * A wheelhouse looks down the whole foredeck, so the same trick strips the
   * masts and winches out of the one view the room exists to have. Rooms like
   * that stay at X0 and pay for the ship in full.
   */
  panoramic: z.boolean().optional(),
  /**
   * How many decks the compartment occupies. One for an ordinary room, more for
   * an atrium void or a stair tower. `size.y` must agree with it.
   */
  decksTall: z.number().int().positive().max(11),
  /** Streaming extent in metres: width, height, length. Not a collision hull. */
  size: vec3Schema,
  /**
   * Where the compartment's floor centre sits in ship space. The hull never
   * translates, so these are fixed for the life of the ship: the streamer
   * offsets every resident compartment by its delta from the occupied one.
   * `anchor.y` is always `deckFloorY(deck)`.
   */
  anchor: vec3Schema,
  portals: z.array(portalSchema).min(1),
  /**
   * Per-compartment ceiling from docs/PERFORMANCE.md.
   *
   * These are sanity rails, not a design constraint. A room the crew stands in
   * has to look furnished, and the streamer only ever holds a handful of them
   * resident at once, so the ceiling is set where a genuinely broken export
   * trips it rather than where a well-dressed room does. Detail is bought with
   * geometry; the frame is bought back by the LOD tiers and the eviction radius.
   */
  budget: z.object({
    maxDrawMeshes: z.number().int().positive().max(320),
    maxBytes: z.number().int().positive().max(25_165_824),
  }),
});

/**
 * The hull, superstructure and everything bolted to them. Not a compartment: it
 * is never occupied, never evicted, and never a portal target. It is resident
 * from the first frame because it is what the crew sees from every open deck and
 * through every window, so it carries a larger budget than a room does.
 */
export const exteriorSchema = z.object({
  id: z.literal('ship-exterior'),
  label: z.string().min(1),
  budget: z.object({
    maxDrawMeshes: z.number().int().positive().max(640),
    maxBytes: z.number().int().positive().max(50_331_648),
  }),
});

export const shipLayoutSchema = z.object({
  id: z.literal('ms-cabin-mayhem'),
  /** Deck-to-deck pitch in metres, fixed by docs/SHIP_LAYOUT.md. */
  deckPitch: z.literal(3.2),
  hull: z.object({
    loa: z.literal(290),
    beam: z.literal(38),
    draught: z.literal(8.4),
    airDraught: z.literal(45),
    deckZeroY: z.literal(-7.2),
  }),
  exterior: exteriorSchema,
  compartments: z.array(compartmentSchema).min(4),
});

export type PortalDefinition = z.infer<typeof portalSchema>;
export type CompartmentDefinition = z.infer<typeof compartmentSchema>;
export type ExteriorDefinition = z.infer<typeof exteriorSchema>;
export type ShipLayout = z.infer<typeof shipLayoutSchema>;

const budget = { maxDrawMeshes: 320, maxBytes: 25_165_824 };

/*
 * Longitudinal stations the layout is built around, so the stack is legible:
 *
 *   z = -95 .. -21   aft machinery, galley, aft cabins, sun deck
 *   z = -21 ..  -9   aft stair tower, decks 0 to 9
 *   z =  -9 .. +37   the atrium void, with the crew corridor beneath it
 *   z = +37 .. +49   midship stair tower, decks 1 to 9
 *   z = +49 .. +93   dining room below, forward cabins above
 *   z = +78 .. +90   forward stair tower, decks 5 to 9
 *   z = +90 .. +102  the bridge
 *
 * Every portal below is stated twice, once from each side, and both statements
 * resolve to the same point in ship space. `pnpm validate:data` proves it.
 */

export const shipLayout = {
  id: 'ms-cabin-mayhem',
  deckPitch: 3.2,
  hull: {
    loa: 290,
    beam: 38,
    draught: 8.4,
    airDraught: 45,
    deckZeroY: -7.2,
  },
  exterior: {
    id: 'ship-exterior',
    label: 'MS Cabin Mayhem',
    budget: { maxDrawMeshes: 640, maxBytes: 50_331_648 },
  },
  compartments: [
    {
      id: 'engine-room',
      label: 'Engine room',
      deck: 0,
      exposure: 'interior',
      // Below the waterline. There is nothing to glaze and nothing to see.
      glazed: false,
      decksTall: 2,
      size: { x: 26, y: 6.4, z: 44 },
      anchor: { x: 0, y: -7.2, z: -43 },
      portals: [{ target: 'stairwell-aft', position: { x: 0, y: 0, z: 22 } }],
      budget,
    },
    {
      id: 'crew-corridor',
      label: 'Crew corridor',
      deck: 1,
      exposure: 'interior',
      glazed: false,
      decksTall: 1,
      // Runs the length of the atrium void, one deck beneath its floor. Nothing
      // in the ship overlaps: the corridor's deckhead is the atrium's deck.
      size: { x: 5, y: 2.8, z: 46 },
      anchor: { x: 0, y: -4, z: 14 },
      portals: [
        { target: 'stairwell-aft', position: { x: 0, y: 0, z: -23 } },
        { target: 'stairwell-mid', position: { x: 0, y: 0, z: 23 } },
      ],
      budget,
    },
    {
      id: 'main-galley',
      label: 'Main galley',
      deck: 2,
      exposure: 'interior',
      // A working galley in the middle of the ship, blank plate both sides.
      glazed: false,
      decksTall: 1,
      size: { x: 24, y: 2.8, z: 32 },
      anchor: { x: 0, y: -0.8, z: -37 },
      portals: [{ target: 'stairwell-aft', position: { x: 0, y: 0, z: 16 } }],
      budget,
    },
    {
      id: 'atrium',
      label: 'Grand atrium',
      deck: 2,
      exposure: 'interior',
      // The galleries around the void reach the ship's side on decks 2 and 3,
      // where the exterior carries its lower window bands.
      glazed: true,
      // Four decks of void. The footprint is deliberately the simulation's
      // playfield: 24 x 46 authored units at CABIN_SCALE 1 is 24 m x 46 m, so
      // guests keep their places and loose props keep their floor.
      decksTall: 4,
      size: { x: 24, y: 12.8, z: 46 },
      anchor: { x: 0, y: -0.8, z: 14 },
      portals: [
        { target: 'stairwell-aft', position: { x: 0, y: 0, z: -23 } },
        { target: 'stairwell-mid', position: { x: 0, y: 0, z: 23 } },
      ],
      budget,
    },
    {
      id: 'dining-room',
      label: 'Main dining room',
      deck: 2,
      exposure: 'interior',
      glazed: true,
      decksTall: 1,
      // Forward of the midship tower, where the hull is still 32 m abeam, so it
      // carries a full band of glazing down both sides.
      size: { x: 28, y: 2.8, z: 44 },
      anchor: { x: 0, y: -0.8, z: 71 },
      portals: [{ target: 'stairwell-mid', position: { x: 0, y: 0, z: -22 } }],
      budget,
    },
    {
      id: 'cabin-deck-four',
      label: 'Cabin deck four',
      deck: 4,
      exposure: 'interior',
      glazed: true,
      decksTall: 1,
      // A centreline corridor with cabins outboard of it both sides, each one
      // opening through a glazed door onto its own balcony recessed into the
      // ship's side. The balconies are inside the streaming extent.
      size: { x: 34, y: 2.8, z: 60 },
      anchor: { x: 0, y: 5.6, z: -51 },
      portals: [{ target: 'stairwell-aft', position: { x: 0, y: 0, z: 30 } }],
      budget,
    },
    {
      id: 'promenade',
      label: 'Promenade deck',
      deck: 5,
      exposure: 'exterior',
      glazed: true,
      decksTall: 1,
      // The freeboard deck: a teak walk that wraps the whole ship, 260 m of it,
      // outboard of the deckhouse. The extent is the full deck because the
      // walk is the deck edge; the deckhouse in the middle of it is not walked.
      size: { x: 38, y: 3.2, z: 260 },
      anchor: { x: 0, y: 8.8, z: 0 },
      portals: [
        { target: 'stairwell-aft', position: { x: -5.5, y: 0, z: -15 } },
        { target: 'stairwell-mid', position: { x: -5.5, y: 0, z: 43 } },
        { target: 'stairwell-fwd', position: { x: -5.5, y: 0, z: 84 } },
      ],
      budget,
    },
    {
      id: 'cabin-deck-seven',
      label: 'Cabin deck seven',
      deck: 7,
      exposure: 'interior',
      // Suites with balcony doors, so the sea is in the room.
      glazed: true,
      decksTall: 1,
      size: { x: 30, y: 2.8, z: 29 },
      anchor: { x: 0, y: 15.2, z: 63.5 },
      portals: [
        { target: 'stairwell-mid', position: { x: 0, y: 0, z: -14.5 } },
        { target: 'stairwell-fwd', position: { x: 0, y: 0, z: 14.5 } },
      ],
      budget,
    },
    {
      id: 'pool-deck',
      label: 'Lido pool deck',
      deck: 8,
      exposure: 'exterior',
      glazed: true,
      decksTall: 1,
      // Open to the sky, so the extent is taller than a deck: it has to contain
      // the bar canopy, the slide and the funnel casings that rise through it.
      size: { x: 34, y: 6, z: 119 },
      anchor: { x: 0, y: 18.4, z: -10.5 },
      portals: [
        { target: 'stairwell-aft', position: { x: 5.5, y: 0, z: -4.5 } },
        { target: 'stairwell-mid', position: { x: 5.5, y: 0, z: 53.5 } },
      ],
      budget,
    },
    {
      id: 'sun-deck',
      label: 'Sun deck',
      deck: 9,
      exposure: 'exterior',
      glazed: true,
      decksTall: 1,
      size: { x: 30, y: 6, z: 74 },
      anchor: { x: 0, y: 21.6, z: -58 },
      portals: [{ target: 'stairwell-aft', position: { x: 0, y: 0, z: 37 } }],
      budget,
    },
    {
      id: 'bridge',
      label: 'Navigating bridge',
      deck: 9,
      exposure: 'interior',
      // Glass on three sides — the one interior room built to be looked out of.
      glazed: true,
      // And looked out of forward, over 190 m of the ship's own foredeck, so it
      // is the room that cannot afford X1's dressing cull.
      panoramic: true,
      decksTall: 1,
      // The declared extent is the wheelhouse. The bridge wings that overhang
      // the ship's side are exterior geometry hung off it, as they are aboard.
      size: { x: 26, y: 3.4, z: 12 },
      anchor: { x: 0, y: 21.6, z: 96 },
      portals: [{ target: 'stairwell-fwd', position: { x: 0, y: 0, z: -6 } }],
      budget,
    },
    {
      id: 'stairwell-aft',
      label: 'Aft stair tower',
      deck: 0,
      exposure: 'interior',
      // A stair shaft is a blind trunk through the middle of the ship. The crew
      // sees the sea again the moment they step out of it.
      glazed: false,
      // Keel to sky: ten decks in one compartment, which is what lets the crew
      // walk from the engine room to the sun deck without leaving the hull.
      decksTall: 10,
      size: { x: 11, y: 32, z: 12 },
      anchor: { x: 0, y: -7.2, z: -15 },
      portals: [
        { target: 'engine-room', position: { x: 0, y: 0, z: -6 } },
        { target: 'crew-corridor', position: { x: 0, y: 3.2, z: 6 } },
        { target: 'main-galley', position: { x: 0, y: 6.4, z: -6 } },
        { target: 'atrium', position: { x: 0, y: 6.4, z: 6 } },
        { target: 'cabin-deck-four', position: { x: 0, y: 12.8, z: -6 } },
        { target: 'promenade', position: { x: -5.5, y: 16, z: 0 } },
        { target: 'pool-deck', position: { x: 5.5, y: 25.6, z: 0 } },
        { target: 'sun-deck', position: { x: 0, y: 28.8, z: -6 } },
      ],
      budget,
    },
    {
      id: 'stairwell-mid',
      label: 'Midship stair tower',
      deck: 1,
      exposure: 'interior',
      glazed: false,
      decksTall: 9,
      size: { x: 11, y: 28.8, z: 12 },
      anchor: { x: 0, y: -4, z: 43 },
      portals: [
        { target: 'crew-corridor', position: { x: 0, y: 0, z: -6 } },
        { target: 'atrium', position: { x: 0, y: 3.2, z: -6 } },
        { target: 'dining-room', position: { x: 0, y: 3.2, z: 6 } },
        { target: 'promenade', position: { x: -5.5, y: 12.8, z: 0 } },
        { target: 'cabin-deck-seven', position: { x: 0, y: 19.2, z: 6 } },
        { target: 'pool-deck', position: { x: 5.5, y: 22.4, z: 0 } },
      ],
      budget,
    },
    {
      id: 'stairwell-fwd',
      label: 'Forward stair tower',
      deck: 5,
      exposure: 'interior',
      glazed: false,
      decksTall: 5,
      size: { x: 11, y: 16, z: 12 },
      anchor: { x: 0, y: 8.8, z: 84 },
      portals: [
        { target: 'promenade', position: { x: -5.5, y: 0, z: 0 } },
        { target: 'cabin-deck-seven', position: { x: 0, y: 6.4, z: -6 } },
        { target: 'bridge', position: { x: 0, y: 12.8, z: 6 } },
      ],
      budget,
    },
  ],
} as const satisfies ShipLayout;

/** The compartment the crew wakes up in. */
export const defaultCompartmentId = 'atrium';

export function compartmentById(id: string): CompartmentDefinition | undefined {
  return shipLayout.compartments.find((compartment) => compartment.id === id);
}

/** A portal's doorway centre in ship space, which both sides must agree on. */
export function portalWorldPosition(
  compartment: CompartmentDefinition,
  portal: PortalDefinition,
): { x: number; y: number; z: number } {
  return {
    x: compartment.anchor.x + portal.position.x,
    y: compartment.anchor.y + portal.position.y,
    z: compartment.anchor.z + portal.position.z,
  };
}

/**
 * The portal linking two compartments, from `origin`'s side. Traversal needs it
 * to place a crew member on the far side of a door they just walked through.
 */
export function portalBetween(origin: string, target: string): PortalDefinition | undefined {
  return compartmentById(origin)?.portals.find((portal) => portal.target === target);
}

/**
 * Breadth-first portal distance from `origin`. Doors, not metres: the streaming
 * residency rule in docs/SHIP_LAYOUT.md is expressed in portal hops because a
 * closed door culls a compartment regardless of how near it is.
 */
export function portalDistances(origin: string): Map<string, number> {
  const distances = new Map<string, number>();
  if (!compartmentById(origin)) return distances;
  distances.set(origin, 0);
  const queue: string[] = [origin];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const depth = distances.get(current) as number;
    for (const portal of compartmentById(current)?.portals ?? []) {
      if (distances.has(portal.target)) continue;
      if (!compartmentById(portal.target)) continue;
      distances.set(portal.target, depth + 1);
      queue.push(portal.target);
    }
  }
  return distances;
}

export type ResidencyDetail = 'full' | 'reduced';

/**
 * The resident set for an occupied compartment: itself and its direct
 * neighbours at full detail, two hops away reduced, nothing beyond.
 *
 * A stair tower is a hub with up to eight doors, so standing in one makes eight
 * rooms full-detail residents. That is the cost of a ship you can climb, and it
 * is why the towers themselves are the leanest compartments aboard.
 */
export function residency(origin: string): Map<string, ResidencyDetail> {
  const resident = new Map<string, ResidencyDetail>();
  for (const [id, hops] of portalDistances(origin)) {
    if (hops <= 1) resident.set(id, 'full');
    else if (hops === 2) resident.set(id, 'reduced');
  }
  return resident;
}

/** Exterior LOD tiers from docs/PERFORMANCE.md section 5. */
export type ExteriorTier = 'X0' | 'X1' | 'X2';

/**
 * How much of the ship's exterior is worth drawing from inside `origin`.
 *
 * The exterior is loaded once and never evicted, so this is the only lever on
 * what it costs: on an open deck it is the view (X0); through a window it is a
 * silhouette and the crew cannot see the deck furniture anyway (X1); in a
 * sealed room nothing can see it at all (X2). An unknown compartment gets X0,
 * because failing to draw the ship is worse than drawing it too well — and so
 * does a `panoramic` room, whose glazing is pointed down the ship at the very
 * dressing X1 would take away.
 */
export function exteriorTier(origin: string): ExteriorTier {
  const compartment = compartmentById(origin);
  if (!compartment) return 'X0';
  if (compartment.exposure === 'exterior') return 'X0';
  if (!compartment.glazed) return 'X2';
  return compartment.panoramic ? 'X0' : 'X1';
}

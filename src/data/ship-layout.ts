import { z } from 'zod';

/**
 * The authored compartment graph, and the only place compartment geometry,
 * placement and connectivity are declared.
 *
 * Geometry is presentation. Nothing here is derived from a GLB, and a missing
 * GLB changes nothing in this file: the streamer builds greybox from these same
 * numbers and the voyage continues. See `docs/SHIP_LAYOUT.md`.
 */

const vec3Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

export const portalSchema = z.object({
  /** The compartment on the other side. Must resolve, and must be symmetric. */
  target: z.string().regex(/^[a-z0-9-]+$/),
  /** Compartment-local position of the doorway centre, in metres. */
  position: vec3Schema,
});

export const compartmentSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string().min(1),
  /** Numbered playable deck, 0 (machinery) through 12 (sun deck). */
  deck: z.number().int().min(0).max(12),
  /** Interior clear extent in metres: width, height, length. */
  size: vec3Schema,
  /**
   * Where the compartment's floor centre sits in ship space. The hull never
   * translates, so these are fixed for the life of the ship: the streamer
   * offsets every resident compartment by its delta from the occupied one.
   */
  anchor: vec3Schema,
  portals: z.array(portalSchema).min(1),
  /** Per-compartment ceiling from docs/PERFORMANCE.md. */
  budget: z.object({
    maxDrawMeshes: z.number().int().positive().max(40),
    maxBytes: z.number().int().positive().max(3_145_728),
  }),
});

export const shipLayoutSchema = z.object({
  id: z.literal('ms-cabin-mayhem'),
  /** Deck-to-deck pitch in metres, fixed by docs/SHIP_LAYOUT.md. */
  deckPitch: z.literal(3.2),
  compartments: z.array(compartmentSchema).min(4),
});

export type PortalDefinition = z.infer<typeof portalSchema>;
export type CompartmentDefinition = z.infer<typeof compartmentSchema>;
export type ShipLayout = z.infer<typeof shipLayoutSchema>;

const budget = { maxDrawMeshes: 40, maxBytes: 3_145_728 };

export const shipLayout = {
  id: 'ms-cabin-mayhem',
  deckPitch: 3.2,
  compartments: [
    {
      id: 'atrium',
      label: 'Atrium',
      deck: 2,
      // The atrium footprint is deliberately the simulation's cabin volume:
      // 24 x 46 authored units at CABIN_SCALE 1 is 24 m x 46 m, centred on the
      // anchor. Guests keep their seats and loose props keep their floor when
      // the shell changes. Four decks of void overhead make it read as tall.
      size: { x: 24, y: 12.8, z: 46 },
      anchor: { x: 0, y: 6.4, z: 0 },
      portals: [
        { target: 'cabin-corridor-a', position: { x: 0, y: 0, z: -23 } },
        { target: 'bridge', position: { x: 0, y: 0, z: 23 } },
      ],
      budget,
    },
    {
      id: 'cabin-corridor-a',
      label: 'Cabin corridor A',
      deck: 1,
      size: { x: 4, y: 2.8, z: 40 },
      anchor: { x: 0, y: 3.2, z: -44 },
      portals: [
        { target: 'atrium', position: { x: 0, y: 0, z: 20 } },
        { target: 'engine-room', position: { x: 0, y: 0, z: -20 } },
      ],
      budget,
    },
    {
      id: 'bridge',
      label: 'Bridge',
      // Deck 6, directly over the 12.8 m-tall atrium that starts on deck 2.
      deck: 6,
      size: { x: 26, y: 3.4, z: 10 },
      anchor: { x: 0, y: 19.2, z: 96 },
      portals: [{ target: 'atrium', position: { x: 0, y: 0, z: -5 } }],
      budget,
    },
    {
      id: 'engine-room',
      label: 'Engine room',
      deck: 0,
      size: { x: 22, y: 8, z: 26 },
      anchor: { x: 0, y: 0, z: -88 },
      portals: [{ target: 'cabin-corridor-a', position: { x: 0, y: 0, z: 13 } }],
      budget,
    },
  ],
} as const satisfies ShipLayout;

/** The compartment the crew wakes up in. */
export const defaultCompartmentId = 'atrium';

export function compartmentById(id: string): CompartmentDefinition | undefined {
  return shipLayout.compartments.find((compartment) => compartment.id === id);
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
 */
export function residency(origin: string): Map<string, ResidencyDetail> {
  const resident = new Map<string, ResidencyDetail>();
  for (const [id, hops] of portalDistances(origin)) {
    if (hops <= 1) resident.set(id, 'full');
    else if (hops === 2) resident.set(id, 'reduced');
  }
  return resident;
}

import { z } from 'zod';
import { TOP_DECK, compartmentById } from './ship-layout';

const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const waypointKindSchema = z.enum(['destination', 'elevator']);

export const waypointSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string().min(1),
  compartmentId: z.string().regex(/^[a-z0-9-]+$/),
  deck: z.number().int().min(0).max(TOP_DECK),
  position: pointSchema,
  kind: waypointKindSchema,
});

export const elevatorStopSchema = z.object({
  deck: z.number().int().min(0).max(TOP_DECK),
  label: z.string().min(1),
  position: pointSchema,
});

export const elevatorSchema = z.object({
  id: z.literal('grand-atrium-elevator'),
  label: z.string().min(1),
  compartmentId: z.literal('atrium'),
  servicedDecks: z.array(z.number().int().min(0).max(TOP_DECK)).min(2).max(11),
  stops: z.array(elevatorStopSchema).min(2).max(11),
});

export const waypointMapSchema = z.object({
  waypoints: z.array(waypointSchema).min(8),
  elevators: z.array(elevatorSchema).length(1),
});

export type WaypointDefinition = z.infer<typeof waypointSchema>;
export type ElevatorStop = z.infer<typeof elevatorStopSchema>;
export type ElevatorDefinition = z.infer<typeof elevatorSchema>;
export type WaypointMap = z.infer<typeof waypointMapSchema>;
export type WaypointId = WaypointDefinition['id'];

type WaypointMapInput = z.input<typeof waypointMapSchema>;

const waypointMapInput = {
  waypoints: [
    {
      id: 'engine-room-relay',
      label: 'Engine Room / Steering Relay',
      compartmentId: 'engine-room',
      deck: 0,
      position: { x: 13, y: 32 },
      kind: 'destination',
    },
    {
      id: 'crew-corridor',
      label: 'Crew Corridor',
      compartmentId: 'crew-corridor',
      deck: 1,
      position: { x: 2.5, y: 23 },
      kind: 'destination',
    },
    {
      id: 'main-galley',
      label: 'Main Galley',
      compartmentId: 'main-galley',
      deck: 2,
      position: { x: 12, y: 18 },
      kind: 'destination',
    },
    {
      id: 'grand-atrium',
      label: 'Grand Atrium / Main Gallery',
      compartmentId: 'atrium',
      deck: 2,
      position: { x: 12, y: 31 },
      kind: 'destination',
    },
    {
      id: 'atrium-gallery-deck-3',
      label: 'Grand Atrium / Gallery Deck 3',
      compartmentId: 'atrium',
      deck: 3,
      position: { x: 12, y: 31 },
      kind: 'destination',
    },
    {
      id: 'atrium-gallery-deck-4',
      label: 'Grand Atrium / Gallery Deck 4',
      compartmentId: 'atrium',
      deck: 4,
      position: { x: 12, y: 31 },
      kind: 'destination',
    },
    {
      id: 'dining-room',
      label: 'Main Dining Room',
      compartmentId: 'dining-room',
      deck: 2,
      position: { x: 14, y: 22 },
      kind: 'destination',
    },
    {
      id: 'cabin-deck-four',
      label: 'Cabin Deck Four',
      compartmentId: 'cabin-deck-four',
      deck: 4,
      position: { x: 17, y: 30 },
      kind: 'destination',
    },
    {
      id: 'promenade',
      label: 'Promenade Deck',
      compartmentId: 'promenade',
      deck: 5,
      position: { x: 19, y: 130 },
      kind: 'destination',
    },
    {
      id: 'cabin-deck-seven',
      label: 'Cabin Deck Seven',
      compartmentId: 'cabin-deck-seven',
      deck: 7,
      position: { x: 15, y: 14.5 },
      kind: 'destination',
    },
    {
      id: 'pool-deck',
      label: 'Lido Pool Deck',
      compartmentId: 'pool-deck',
      deck: 8,
      position: { x: 17, y: 70 },
      kind: 'destination',
    },
    {
      id: 'sun-deck',
      label: 'Sun Deck',
      compartmentId: 'sun-deck',
      deck: 9,
      position: { x: 15, y: 37 },
      kind: 'destination',
    },
    {
      id: 'bridge',
      label: 'Navigating Bridge',
      compartmentId: 'bridge',
      deck: 9,
      position: { x: 13, y: 6 },
      kind: 'destination',
    },
    {
      id: 'grand-atrium-elevator',
      label: 'Grand Atrium Elevator / Main Lobby',
      compartmentId: 'atrium',
      deck: 2,
      position: { x: 12, y: 31 },
      kind: 'elevator',
    },
  ],
  elevators: [
    {
      id: 'grand-atrium-elevator',
      label: 'Grand Atrium Elevator',
      compartmentId: 'atrium',
      servicedDecks: [2, 3, 4, 5],
      stops: [
        { deck: 2, label: 'Main Lobby / Deck 2', position: { x: 12, y: 31 } },
        { deck: 3, label: 'Gallery / Deck 3', position: { x: 12, y: 31 } },
        { deck: 4, label: 'Gallery / Deck 4', position: { x: 12, y: 31 } },
        { deck: 5, label: 'Gallery / Deck 5', position: { x: 12, y: 31 } },
      ],
    },
  ],
} as const satisfies WaypointMapInput;

/**
 * Parse plus cross-check waypoint data against the authored ship. Keeping this
 * check here makes a bad destination fail at module load, before a host can
 * accept a route to a missing room or an impossible deck.
 */
export function validateWaypointMap(input: unknown): WaypointMap {
  const parsed = waypointMapSchema.parse(input);
  const ids = new Set<string>();

  for (const waypoint of parsed.waypoints) {
    if (ids.has(waypoint.id)) throw new Error(`Duplicate waypoint ID: ${waypoint.id}`);
    ids.add(waypoint.id);
    const compartment = compartmentById(waypoint.compartmentId);
    if (!compartment) throw new Error(`Waypoint ${waypoint.id} names unknown compartment`);
    if (
      waypoint.deck < compartment.deck ||
      waypoint.deck >= compartment.deck + compartment.decksTall
    ) {
      throw new Error(`Waypoint ${waypoint.id} is outside ${compartment.id}'s deck range`);
    }
    assertInsidePlayfield(waypoint.id, waypoint.position, compartment.size.x, compartment.size.z);
  }

  const elevator = parsed.elevators[0];
  if (!elevator) throw new Error('Grand Atrium elevator is missing');
  if (new Set(elevator.servicedDecks).size !== elevator.servicedDecks.length)
    throw new Error('Grand Atrium elevator serviced decks must be unique');
  if (elevator.servicedDecks.length !== elevator.stops.length)
    throw new Error('Grand Atrium elevator needs one stop per serviced deck');
  for (const stop of elevator.stops) {
    if (!elevator.servicedDecks.includes(stop.deck))
      throw new Error(`Grand Atrium elevator stop ${stop.deck} is not serviced`);
    assertInsidePlayfield('grand-atrium-elevator', stop.position, 24, 46);
  }

  return parsed;
}

function assertInsidePlayfield(
  id: string,
  position: { x: number; y: number },
  width: number,
  length: number,
): void {
  const wallClearance = 1.38;
  if (
    position.x < wallClearance ||
    position.x > width - wallClearance ||
    position.y < wallClearance ||
    position.y > length - wallClearance
  ) {
    throw new Error(`Waypoint ${id} is outside its walkable playfield`);
  }
}

export const waypointMap = validateWaypointMap(waypointMapInput);
export const waypoints = waypointMap.waypoints;
export const grandAtriumElevator = waypointMap.elevators[0]!;

export function waypointById(id: string): WaypointDefinition | undefined {
  return waypointMap.waypoints.find((waypoint) => waypoint.id === id);
}

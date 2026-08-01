import { phaseOneCabinDefinition, type PhaseOneObjectDefinition } from '../data/phase-one';
import { add, clamp, distance, length, normalized, scale } from './math';
import type {
  CabinObject,
  CabinState,
  FlightState,
  PlayerCommand,
  PlayerState,
  Vec2,
} from './types';

const playerRadius = 0.58;

export function createCabinState(): CabinState {
  const objects = phaseOneCabinDefinition.objects.map(objectFromDefinition);
  return {
    width: phaseOneCabinDefinition.width,
    length: phaseOneCabinDefinition.length,
    players: {
      'crew-alpha': player('crew-alpha', 'Crew Alpha / host', '#f7be62', { x: 8, y: 5 }),
      'crew-bravo': player('crew-bravo', 'Crew Bravo / client', '#73d5e8', { x: 8, y: 29 }),
    },
    objects: Object.fromEntries(objects.map((entry) => [entry.id, entry])),
    collisionCount: 0,
    lastImpulse: 0,
  };
}

function objectFromDefinition(definition: PhaseOneObjectDefinition): CabinObject {
  return object(
    definition.id,
    definition.name,
    definition.kind,
    definition.material,
    definition.position,
    definition.radius,
    definition.mass,
    definition.friction,
    definition.impactTolerance,
    definition.secured,
  );
}

export function stepCabin(
  current: CabinState,
  flight: FlightState,
  commands: Record<string, PlayerCommand>,
  deltaSeconds: number,
): CabinState {
  const dt = clamp(deltaSeconds, 0, 0.05);
  const players = Object.fromEntries(
    Object.entries(current.players).map(([id, player]) => [
      id,
      stepPlayer(player, commands[id], flight, current, dt),
    ]),
  ) as CabinState['players'];
  const objects = Object.fromEntries(
    Object.entries(current.objects).map(([id, entry]) => [
      id,
      { ...entry, position: { ...entry.position }, velocity: { ...entry.velocity } },
    ]),
  ) as CabinState['objects'];
  let collisionCount = 0;
  let lastImpulse = 0;

  for (const object of Object.values(objects)) {
    if (object.secured && object.anchor) {
      object.position = { ...object.anchor };
      object.velocity = { x: 0, y: 0 };
      continue;
    }
    const holder = object.ownerId ? players[object.ownerId] : undefined;
    if (holder) {
      const reach = scale(holder.facing, 0.9);
      object.position = clampPosition(add(holder.position, reach), object.radius, current);
      object.velocity = { ...holder.velocity };
      continue;
    }

    const turbulence = turbulenceVector(flight, object.id);
    const inertiaScale = 1 / Math.max(1, Math.sqrt(object.mass) * 0.3);
    object.velocity.x += (flight.cabinAcceleration.x * inertiaScale + turbulence.x) * dt;
    object.velocity.y += (flight.cabinAcceleration.y * inertiaScale + turbulence.y) * dt;
    const damping = Math.exp(-object.friction * 7 * dt);
    object.velocity.x *= damping;
    object.velocity.y *= damping;
    const before = { ...object.position };
    const intended = add(object.position, scale(object.velocity, dt));
    object.position = resolveCabinFixtures(
      clampPosition(intended, object.radius, current),
      before,
      object.radius,
    );
    if (distance(intended, object.position) > 0.001) {
      const impulse = length(object.velocity) * object.mass * 0.025;
      object.velocity.x *= -0.38;
      object.velocity.y *= -0.38;
      object.damage = clamp(
        object.damage + Math.max(0, impulse - object.impactTolerance) * 0.02,
        0,
        1,
      );
      collisionCount += 1;
      lastImpulse = Math.max(lastImpulse, impulse);
    }
  }

  const freeObjects = Object.values(objects).filter((entry) => !entry.secured && !entry.ownerId);
  for (let index = 0; index < freeObjects.length; index += 1) {
    const first = freeObjects[index];
    if (!first) continue;
    for (let otherIndex = index + 1; otherIndex < freeObjects.length; otherIndex += 1) {
      const second = freeObjects[otherIndex];
      if (!second) continue;
      const impulse = resolveObjectCollision(first, second);
      if (impulse > 0) {
        collisionCount += 1;
        lastImpulse = Math.max(lastImpulse, impulse);
      }
    }
  }

  return { ...current, players, objects, collisionCount, lastImpulse };
}

export function closestInteractable(
  cabin: CabinState,
  player: PlayerState,
  requestedId?: string | null,
): CabinObject | undefined {
  const candidates = Object.values(cabin.objects)
    .filter((entry) => !entry.ownerId || entry.ownerId === player.id)
    .filter((entry) => distance(entry.position, player.position) <= 1.8);

  if (requestedId === null) return undefined;
  if (requestedId !== undefined) {
    const requested = candidates.find((entry) => entry.id === requestedId);
    if (!requested) return undefined;
    const towardTarget = normalized({
      x: requested.position.x - player.position.x,
      y: requested.position.y - player.position.y,
    });
    const facingScore = towardTarget.x * player.facing.x + towardTarget.y * player.facing.y;
    return facingScore >= 0.2 ? requested : undefined;
  }

  return candidates.sort(
    (a, b) => distance(a.position, player.position) - distance(b.position, player.position),
  )[0];
}

export function setObjectSecured(object: CabinObject, secured: boolean): CabinObject {
  return {
    ...object,
    secured,
    ownerId: undefined,
    anchor: secured ? { ...object.position } : undefined,
    velocity: { x: 0, y: 0 },
  };
}

export function makeSpawnObject(index: number): CabinObject {
  const id = `case-spawn-${index}`;
  return object(
    id,
    'Spawned light case',
    'light-case',
    'plastic',
    { x: 8, y: 20 },
    0.48,
    5,
    0.38,
    1.5,
  );
}

function player(id: string, name: string, color: string, position: Vec2): PlayerState {
  return {
    id,
    name,
    color,
    position,
    velocity: { x: 0, y: 0 },
    facing: { x: 0, y: -1 },
    crouched: false,
    braced: false,
    knockdown: 0,
    lastAction: 'Ready',
  };
}

function object(
  id: string,
  name: string,
  kind: CabinObject['kind'],
  material: CabinObject['material'],
  position: Vec2,
  radius: number,
  mass: number,
  friction: number,
  impactTolerance: number,
  secured = false,
): CabinObject {
  return {
    id,
    name,
    kind,
    material,
    position,
    velocity: { x: 0, y: 0 },
    radius,
    mass,
    friction,
    impactTolerance,
    secured,
    anchor: secured ? { ...position } : undefined,
    damage: 0,
  };
}

function stepPlayer(
  player: PlayerState,
  command: PlayerCommand | undefined,
  flight: FlightState,
  cabin: CabinState,
  dt: number,
): PlayerState {
  const input = command ?? {
    move: { x: 0, y: 0 },
    look: player.facing,
    sprint: false,
    crouch: false,
    brace: false,
  };
  const direction = normalized(input.move);
  const look = normalized(input.look);
  const facing = length(look) > 0.01 ? look : length(direction) > 0.01 ? direction : player.facing;
  const speed = input.crouch ? 2.1 : input.sprint ? 5.4 : 3.55;
  const targetVelocity = scale(direction, speed);
  const braceFactor = input.brace ? 0.08 : 0.34;
  const inertia = scale(flight.cabinAcceleration, braceFactor);
  const velocity = {
    x:
      player.velocity.x +
      (targetVelocity.x - player.velocity.x) * Math.min(1, dt * 12) +
      inertia.x * dt,
    y:
      player.velocity.y +
      (targetVelocity.y - player.velocity.y) * Math.min(1, dt * 12) +
      inertia.y * dt,
  };
  const force = length(flight.cabinAcceleration);
  const knockdown = input.brace
    ? Math.max(0, player.knockdown - dt * 2)
    : Math.max(0, player.knockdown - dt);
  const forcedKnockdown = force > 11 && !input.brace ? Math.max(knockdown, 0.8) : knockdown;
  return {
    ...player,
    position: resolveCabinFixtures(
      clampPosition(add(player.position, scale(velocity, dt)), playerRadius, cabin),
      player.position,
      playerRadius,
    ),
    velocity,
    facing,
    crouched: input.crouch,
    braced: input.brace,
    knockdown: forcedKnockdown,
    lastAction: input.brace ? 'Braced' : forcedKnockdown > 0 ? 'Recovering' : player.lastAction,
  };
}

function clampPosition(position: Vec2, radius: number, cabin: CabinState): Vec2 {
  return {
    x: clamp(position.x, 0.8 + radius, cabin.width - 0.8 - radius),
    y: clamp(position.y, 0.8 + radius, cabin.length - 0.8 - radius),
  };
}

interface CabinFixture {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const cabinFixtures: CabinFixture[] = [
  { minX: 1.2, maxX: 6.7, minY: 0.75, maxY: 2.25 },
  { minX: 9.3, maxX: 14.8, minY: 0.75, maxY: 2.25 },
  ...Array.from({ length: 8 }, (_, row) => {
    const center = 7.2 + row * 2.76;
    return [
      { minX: 1.1, maxX: 5.9, minY: center - 0.9, maxY: center + 0.9 },
      { minX: 10.1, maxX: 14.9, minY: center - 0.9, maxY: center + 0.9 },
    ];
  }).flat(),
  { minX: 0.8, maxX: 6.2, minY: 29.15, maxY: 29.8 },
  { minX: 9.8, maxX: 15.2, minY: 29.15, maxY: 29.8 },
];

function resolveCabinFixtures(position: Vec2, previous: Vec2, radius: number): Vec2 {
  let resolved = { ...position };
  for (const fixture of cabinFixtures) {
    const expanded = {
      minX: fixture.minX - radius,
      maxX: fixture.maxX + radius,
      minY: fixture.minY - radius,
      maxY: fixture.maxY + radius,
    };
    if (!inside(resolved, expanded)) continue;
    const xOnly = { x: previous.x, y: resolved.y };
    const yOnly = { x: resolved.x, y: previous.y };
    if (!inside(xOnly, expanded)) resolved = xOnly;
    else if (!inside(yOnly, expanded)) resolved = yOnly;
    else resolved = pushToNearestEdge(resolved, expanded);
  }
  return resolved;
}

function inside(position: Vec2, fixture: CabinFixture): boolean {
  return (
    position.x > fixture.minX &&
    position.x < fixture.maxX &&
    position.y > fixture.minY &&
    position.y < fixture.maxY
  );
}

function pushToNearestEdge(position: Vec2, fixture: CabinFixture): Vec2 {
  const edges = [
    { distance: Math.abs(position.x - fixture.minX), position: { ...position, x: fixture.minX } },
    { distance: Math.abs(fixture.maxX - position.x), position: { ...position, x: fixture.maxX } },
    { distance: Math.abs(position.y - fixture.minY), position: { ...position, y: fixture.minY } },
    { distance: Math.abs(fixture.maxY - position.y), position: { ...position, y: fixture.maxY } },
  ];
  edges.sort((first, second) => first.distance - second.distance);
  return edges[0]?.position ?? position;
}

function turbulenceVector(flight: FlightState, objectId: string): Vec2 {
  const hash = [...objectId].reduce((value, char) => value + char.charCodeAt(0), 0);
  const oscillation = Math.sin(flight.clock * 6.8 + hash) * flight.turbulence;
  const secondary = Math.cos(flight.clock * 9.2 + hash * 0.3) * flight.turbulence;
  return { x: oscillation * 3.1, y: secondary * 2.6 };
}

function resolveObjectCollision(first: CabinObject, second: CabinObject): number {
  const delta = {
    x: second.position.x - first.position.x,
    y: second.position.y - first.position.y,
  };
  const separation = length(delta);
  const minimum = first.radius + second.radius;
  if (separation >= minimum || separation < 0.0001) return 0;
  const normal = normalized(delta);
  const overlap = minimum - separation;
  const totalMass = first.mass + second.mass;
  first.position = add(first.position, scale(normal, -overlap * (second.mass / totalMass)));
  second.position = add(second.position, scale(normal, overlap * (first.mass / totalMass)));
  const relativeVelocity = {
    x: second.velocity.x - first.velocity.x,
    y: second.velocity.y - first.velocity.y,
  };
  const closing = relativeVelocity.x * normal.x + relativeVelocity.y * normal.y;
  if (closing >= 0) return 0;
  const impulse = (-1.15 * closing) / (1 / first.mass + 1 / second.mass);
  first.velocity = add(first.velocity, scale(normal, -impulse / first.mass));
  second.velocity = add(second.velocity, scale(normal, impulse / second.mass));
  return Math.abs(impulse);
}

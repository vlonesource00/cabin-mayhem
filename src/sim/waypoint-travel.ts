import {
  grandAtriumElevator,
  waypointById,
  type ElevatorDefinition,
  type WaypointDefinition,
} from '../data/waypoints';
import {
  DECK_PITCH,
  DECK_ZERO_Y,
  compartmentById,
  type CompartmentDefinition,
} from '../data/ship-layout';
import {
  FLIGHT_RUN,
  LANDING_DEPTH,
  arrivalHeading,
  arrivalPosition,
  playfieldFor,
  portalSimPosition,
  stairLandings,
} from './compartment-space';
import type { PlayerCommand, PlayerState, Vec2 } from './types';

const WALK_SPEED = 3.4;
const DOOR_TRANSITION_SECONDS = 0.45;
const ELEVATOR_BASE_SECONDS = 0.75;
const ELEVATOR_DECK_SECONDS = 0.65;

type WaypointCommand = PlayerCommand & { waypointId?: string };
type WaypointPlayer = PlayerState & {
  waypointDeck?: number;
  waypointTravel?: WaypointTravelState;
};

export type WaypointAuthority = 'host' | 'client';
export type WaypointTravelStatus = 'walking' | 'door' | 'elevator' | 'arrived' | 'blocked';

export interface WalkTravelLeg {
  kind: 'walk';
  compartmentId: string;
  from: Vec2;
  to: Vec2;
  fromDeck: number;
  toDeck: number;
  duration: number;
}

export interface DoorTravelLeg {
  kind: 'door';
  fromCompartmentId: string;
  toCompartmentId: string;
  from: Vec2;
  to: Vec2;
  fromDeck: number;
  toDeck: number;
  duration: number;
}

export interface ElevatorTravelLeg {
  kind: 'elevator';
  elevatorId: string;
  compartmentId: string;
  from: Vec2;
  to: Vec2;
  fromDeck: number;
  toDeck: number;
  duration: number;
}

export type WaypointTravelLeg = WalkTravelLeg | DoorTravelLeg | ElevatorTravelLeg;

export interface WaypointTravelState {
  targetId: string;
  targetLabel: string;
  status: WaypointTravelStatus;
  legIndex: number;
  legElapsed: number;
  elapsed: number;
  totalDuration: number;
  currentDeck: number;
  route: string[];
  legs: WaypointTravelLeg[];
  reason?: string;
}

export interface WaypointRoute {
  target: WaypointDefinition;
  startDeck: number;
  route: string[];
  legs: WaypointTravelLeg[];
  totalDuration: number;
}

export type WaypointRouteResult =
  { ok: true; route: WaypointRoute } | { ok: false; reason: string };

export interface WaypointTravelOptions {
  authority: WaypointAuthority;
  canWalk?: (compartmentId: string, from: Vec2, to: Vec2) => boolean;
  blockedPortalKeys?: readonly string[];
}

export interface WaypointStepResult {
  handled: boolean;
  player: PlayerState;
}

/** Add one host-routed destination request to an otherwise normal command. */
export function setWaypointRequest(command: PlayerCommand, waypointId: string): void {
  (command as WaypointCommand).waypointId = waypointId;
}

export function waypointTravelFor(player: PlayerState): WaypointTravelState | undefined {
  return (player as WaypointPlayer).waypointTravel;
}

export function waypointDeckFor(player: PlayerState): number | undefined {
  return (player as WaypointPlayer).waypointDeck;
}

export function waypointProgress(travel: WaypointTravelState | undefined): number {
  if (!travel || travel.totalDuration <= 0) return 0;
  return Math.min(1, travel.elapsed / travel.totalDuration);
}

export function waypointPrompt(player: PlayerState): string | undefined {
  const travel = waypointTravelFor(player);
  if (!travel) return undefined;
  if (travel.status === 'blocked') return `ROUTE BLOCKED / ${travel.reason ?? 'NO ROUTE'}`;
  if (travel.status === 'arrived') return `ARRIVED / ${travel.targetLabel.toUpperCase()}`;
  return `${travel.status.toUpperCase()} / ${travel.targetLabel.toUpperCase()} / ${Math.round(waypointProgress(travel) * 100)}%`;
}

export function waypointStatusText(player: PlayerState): string {
  const travel = waypointTravelFor(player);
  if (travel?.status === 'blocked') return `ROUTE BLOCKED: ${travel.reason ?? 'NO ROUTE'}`;
  if (travel?.status === 'arrived') return `ARRIVED: ${travel.targetLabel}`;
  if (travel) {
    return `${travel.status.toUpperCase()} TO ${travel.targetLabel} / ${Math.round(waypointProgress(travel) * 100)}%`;
  }
  const compartment = compartmentById(player.compartmentId);
  const deck = waypointDeckFor(player) ?? compartment?.deck;
  return `${compartment?.label ?? player.compartmentId} / DECK ${deck ?? '?'}`;
}

/**
 * Host-only route admission and bounded travel state machine.
 *
 * Client commands carry only a destination string. This function is called from
 * `stepCabin`, which runs inside HostSession, so route choice, door admission,
 * collision checks and every transition are snapshot-owned by the host.
 */
export function stepWaypointTravel(
  player: PlayerState,
  command: PlayerCommand | undefined,
  deltaSeconds: number,
  options: WaypointTravelOptions,
): WaypointStepResult {
  const current = waypointTravelFor(player);
  if (current?.status === 'arrived' || current?.status === 'blocked') {
    return { handled: false, player: withoutTravelState(player) };
  }

  if (current) {
    if (!isAtExpectedTravelPosition(player, current)) {
      // Debug/test stations intentionally mutate host state directly. Do not let
      // an old route resume after one of those compatible teleports.
      return { handled: false, player: withoutTravelState(player) };
    }
    return { handled: true, player: advanceTravel(player, current, deltaSeconds) };
  }

  const targetId = (command as WaypointCommand | undefined)?.waypointId;
  if (!targetId) return { handled: false, player };

  const started = startWaypointTravel(player, targetId, options);
  if (!started.ok) {
    return { handled: true, player: blockedPlayer(player, targetId, started.reason) };
  }
  return { handled: true, player: started.player };
}

export function startWaypointTravel(
  player: PlayerState,
  targetId: string,
  options: WaypointTravelOptions,
): { ok: true; player: PlayerState; route: WaypointRoute } | { ok: false; reason: string } {
  if (options.authority !== 'host') return { ok: false, reason: 'HOST AUTHORITY REQUIRED' };
  const routeResult = buildWaypointRoute(player, targetId, options);
  if (!routeResult.ok) return routeResult;
  if (player.portalCooldown > 0 && routeResult.route.legs.some((leg) => leg.kind === 'door')) {
    return { ok: false, reason: 'DOOR TRANSITION BUSY' };
  }

  const firstLeg = routeResult.route.legs[0];
  if (!firstLeg) return { ok: false, reason: 'EMPTY ROUTE' };
  const travel: WaypointTravelState = {
    targetId: routeResult.route.target.id,
    targetLabel: routeResult.route.target.label,
    status: statusForLeg(firstLeg),
    legIndex: 0,
    legElapsed: 0,
    elapsed: 0,
    totalDuration: routeResult.route.totalDuration,
    currentDeck: routeResult.route.startDeck,
    route: routeResult.route.route,
    legs: routeResult.route.legs,
  };
  const next = {
    ...(player as WaypointPlayer),
    pendingDoor: undefined,
    velocity: { x: 0, y: 0 },
    lastAction: `Route accepted: ${routeResult.route.target.label}`,
    waypointTravel: travel,
  };
  return { ok: true, player: next, route: routeResult.route };
}

/** Build deterministic compartment/deck route, then materialize walk/door/lift legs. */
export function buildWaypointRoute(
  player: PlayerState,
  targetId: string,
  options: WaypointTravelOptions,
): WaypointRouteResult {
  const target = waypointById(targetId);
  if (!target) return { ok: false, reason: 'UNKNOWN WAYPOINT' };
  const origin = compartmentById(player.compartmentId);
  const destination = compartmentById(target.compartmentId);
  if (!origin || !destination) return { ok: false, reason: 'COMPARTMENT DATA MISSING' };

  const startDeck = currentDeck(player, origin);
  const statePath = findStatePath(
    { compartmentId: origin.id, deck: startDeck },
    { compartmentId: destination.id, deck: target.deck },
    new Set(options.blockedPortalKeys ?? []),
  );
  if (!statePath) return { ok: false, reason: 'NO UNBLOCKED ROUTE' };

  const legs: WaypointTravelLeg[] = [];
  let compartmentId = origin.id;
  let deck = startDeck;
  let position = { ...player.position };
  const canWalk = options.canWalk ?? (() => true);

  for (const edge of statePath.edges) {
    if (edge.fromCompartmentId !== compartmentId) return { ok: false, reason: 'ROUTE STATE DRIFT' };
    if (!appendWalkWithDetour(legs, compartmentId, deck, position, edge.from, deck, canWalk)) {
      return { ok: false, reason: `BLOCKED WALK IN ${compartmentId.toUpperCase()}` };
    }

    if (edge.kind === 'door') {
      legs.push({
        kind: 'door',
        fromCompartmentId: edge.fromCompartmentId,
        toCompartmentId: edge.toCompartmentId,
        from: { ...edge.from },
        to: { ...edge.to },
        fromDeck: edge.fromDeck,
        toDeck: edge.toDeck,
        duration: DOOR_TRANSITION_SECONDS,
      });
      compartmentId = edge.toCompartmentId;
      deck = edge.toDeck;
      position = { ...edge.to };
    } else if (edge.kind === 'stairs') {
      if (
        !appendWalkWithDetour(legs, compartmentId, deck, edge.from, edge.to, edge.toDeck, canWalk)
      ) {
        return { ok: false, reason: `BLOCKED STAIRS IN ${compartmentId.toUpperCase()}` };
      }
      deck = edge.toDeck;
      position = { ...edge.to };
    } else {
      legs.push({ ...edge });
      deck = edge.toDeck;
      position = { ...edge.to };
    }
  }

  if (
    !appendWalkWithDetour(
      legs,
      compartmentId,
      deck,
      position,
      target.position,
      target.deck,
      canWalk,
    )
  ) {
    return { ok: false, reason: `BLOCKED WALK IN ${compartmentId.toUpperCase()}` };
  }
  if (legs.length === 0) {
    legs.push({
      kind: 'walk',
      compartmentId: target.compartmentId,
      from: { ...player.position },
      to: { ...target.position },
      fromDeck: startDeck,
      toDeck: target.deck,
      duration: 0.18,
    });
  }

  return {
    ok: true,
    route: {
      target,
      startDeck,
      route: [
        `${origin.label} / DECK ${startDeck}`,
        ...statePath.states.slice(1).map((state) => {
          const compartment = compartmentById(state.compartmentId);
          return `${compartment?.label ?? state.compartmentId} / DECK ${state.deck}`;
        }),
        `${target.label} / DECK ${target.deck}`,
      ],
      legs,
      totalDuration: legs.reduce((total, leg) => total + leg.duration, 0),
    },
  };
}

interface RouteState {
  compartmentId: string;
  deck: number;
}

interface RoutePath {
  states: RouteState[];
  edges: RouteEdge[];
}

type RouteEdge =
  | {
      kind: 'door';
      fromCompartmentId: string;
      toCompartmentId: string;
      fromDeck: number;
      toDeck: number;
      from: Vec2;
      to: Vec2;
    }
  | {
      kind: 'stairs';
      fromCompartmentId: string;
      toCompartmentId: string;
      fromDeck: number;
      toDeck: number;
      from: Vec2;
      to: Vec2;
    }
  | {
      kind: 'elevator';
      elevatorId: string;
      compartmentId: string;
      fromCompartmentId: string;
      toCompartmentId: string;
      fromDeck: number;
      toDeck: number;
      from: Vec2;
      to: Vec2;
      duration: number;
    };

function findStatePath(
  start: RouteState,
  goal: RouteState,
  blockedPortalKeys: Set<string>,
): RoutePath | undefined {
  const startKey = stateKey(start);
  const queue: RouteState[] = [start];
  const visited = new Set([startKey]);
  const previous = new Map<string, { state: RouteState; edge: RouteEdge }>();
  let goalKey: string | undefined;

  while (queue.length > 0) {
    const state = queue.shift()!;
    const key = stateKey(state);
    if (state.compartmentId === goal.compartmentId && state.deck === goal.deck) {
      goalKey = key;
      break;
    }
    for (const edge of routeEdges(state, blockedPortalKeys)) {
      const next = { compartmentId: edge.toCompartmentId, deck: edge.toDeck };
      const nextKey = stateKey(next);
      if (visited.has(nextKey)) continue;
      visited.add(nextKey);
      previous.set(nextKey, { state, edge });
      queue.push(next);
    }
  }

  if (!goalKey) return undefined;
  const states: RouteState[] = [];
  const edges: RouteEdge[] = [];
  let cursor = goalKey;
  const goalState = parseStateKey(cursor);
  states.unshift(goalState);
  while (cursor !== startKey) {
    const step = previous.get(cursor);
    if (!step) return undefined;
    edges.unshift(step.edge);
    cursor = stateKey(step.state);
    states.unshift(step.state);
  }
  return { states, edges };
}

function routeEdges(state: RouteState, blockedPortalKeys: Set<string>): RouteEdge[] {
  const compartment = compartmentById(state.compartmentId);
  if (!compartment) return [];
  const edges: RouteEdge[] = [];

  for (const portal of compartment.portals) {
    const fromDeck = portalDeck(compartment, portal);
    if (fromDeck !== state.deck) continue;
    if (blockedPortalKeys.has(portalKey(compartment.id, portal.target))) continue;
    const destination = compartmentById(portal.target);
    const reciprocal = destination?.portals.find((entry) => entry.target === compartment.id);
    if (!destination || !reciprocal) continue;
    edges.push({
      kind: 'door',
      fromCompartmentId: compartment.id,
      toCompartmentId: destination.id,
      fromDeck,
      toDeck: portalDeck(destination, reciprocal),
      from: standablePortalPosition(compartment, portal),
      to: arrivalPosition(destination, compartment.id),
    });
  }

  const landings = stairLandings(compartment);
  if (landings) {
    const supportedDecks = landings.map((_, index) => compartment.deck + index);
    for (const toDeck of supportedDecks) {
      if (toDeck === state.deck) continue;
      edges.push({
        kind: 'stairs',
        fromCompartmentId: compartment.id,
        toCompartmentId: compartment.id,
        fromDeck: state.deck,
        toDeck,
        from: stairLandingPosition(compartment, state.deck),
        to: stairLandingPosition(compartment, toDeck),
      });
    }
  }

  if (compartment.id === grandAtriumElevator.compartmentId) {
    const fromStop = grandAtriumElevator.stops.find((stop) => stop.deck === state.deck);
    if (fromStop) {
      for (const toStop of grandAtriumElevator.stops) {
        if (toStop.deck === state.deck) continue;
        edges.push({
          kind: 'elevator',
          elevatorId: grandAtriumElevator.id,
          compartmentId: compartment.id,
          fromCompartmentId: compartment.id,
          toCompartmentId: compartment.id,
          fromDeck: state.deck,
          toDeck: toStop.deck,
          from: { ...fromStop.position },
          to: { ...toStop.position },
          duration:
            ELEVATOR_BASE_SECONDS + Math.abs(toStop.deck - state.deck) * ELEVATOR_DECK_SECONDS,
        });
      }
    }
  }

  return edges;
}

export function portalKey(from: string, to: string): string {
  return `${from}->${to}`;
}

function appendWalk(
  legs: WaypointTravelLeg[],
  compartmentId: string,
  fromDeck: number,
  from: Vec2,
  to: Vec2,
  toDeck: number,
  canWalk: (compartmentId: string, from: Vec2, to: Vec2) => boolean,
): boolean {
  const distanceMetres = Math.hypot(to.x - from.x, to.y - from.y);
  if (distanceMetres < 0.05) return true;
  if (!canWalk(compartmentId, from, to)) return false;
  legs.push({
    kind: 'walk',
    compartmentId,
    from: { ...from },
    to: { ...to },
    fromDeck,
    toDeck,
    duration: Math.max(0.18, distanceMetres / WALK_SPEED),
  });
  return true;
}

/**
 * Try the direct segment first, then route around a known room obstruction with
 * real walk legs. The host's collision predicate still approves every segment;
 * a detour is rejected when no collision-free corridor exists.
 */
function appendWalkWithDetour(
  legs: WaypointTravelLeg[],
  compartmentId: string,
  fromDeck: number,
  from: Vec2,
  to: Vec2,
  toDeck: number,
  canWalk: (compartmentId: string, from: Vec2, to: Vec2) => boolean,
): boolean {
  if (appendWalk(legs, compartmentId, fromDeck, from, to, toDeck, canWalk)) return true;

  const field = playfieldFor(compartmentId);
  const margin = 2.2;
  const left = Math.max(margin, Math.min(field.width - margin, margin));
  const right = Math.max(margin, field.width - margin);
  const top = Math.max(margin, Math.min(field.length - margin, margin));
  const bottom = Math.max(margin, field.length - margin);
  const routes: Vec2[][] = [
    [
      { x: left, y: from.y },
      { x: left, y: to.y },
    ],
    [
      { x: right, y: from.y },
      { x: right, y: to.y },
    ],
    [
      { x: from.x, y: top },
      { x: to.x, y: top },
    ],
    [
      { x: from.x, y: bottom },
      { x: to.x, y: bottom },
    ],
  ];

  let best: WaypointTravelLeg[] | undefined;
  let bestDuration = Number.POSITIVE_INFINITY;
  for (const route of routes) {
    const trial: WaypointTravelLeg[] = [];
    let cursor = { ...from };
    let cursorDeck = fromDeck;
    let valid = true;
    const points = [...route, to];
    for (const [index, point] of points.entries()) {
      const segmentToDeck = index === points.length - 1 ? toDeck : fromDeck;
      if (!appendWalk(trial, compartmentId, cursorDeck, cursor, point, segmentToDeck, canWalk)) {
        valid = false;
        break;
      }
      cursor = { ...point };
      cursorDeck = segmentToDeck;
    }
    if (!valid) continue;
    const duration = trial.reduce((total, leg) => total + leg.duration, 0);
    if (duration < bestDuration) {
      bestDuration = duration;
      best = trial;
    }
  }
  if (!best) return false;
  legs.push(...best);
  return true;
}

function currentDeck(player: PlayerState, compartment: CompartmentDefinition): number {
  const explicit = waypointDeckFor(player);
  if (explicit !== undefined && !player.lastAction.startsWith('Teleported:')) return explicit;
  const landings = stairLandings(compartment);
  if (!landings) return compartment.deck;
  const level = Math.min(
    landings.length - 1,
    Math.max(0, Math.floor(player.position.y / FLIGHT_RUN)),
  );
  return compartment.deck + level;
}

function portalDeck(compartment: CompartmentDefinition, portal: { position: Vec3 }): number {
  return Math.round((compartment.anchor.y + portal.position.y - DECK_ZERO_Y) / DECK_PITCH);
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function standablePortalPosition(
  compartment: CompartmentDefinition,
  portal: { position: Vec3; target: string },
): Vec2 {
  const position = portalSimPosition(compartment, portal);
  const field = playfieldFor(compartment.id);
  const wallClearance = 1.38;
  return {
    x: Math.min(field.width - wallClearance, Math.max(wallClearance, position.x)),
    y: Math.min(field.length - wallClearance, Math.max(wallClearance, position.y)),
  };
}

function stairLandingPosition(compartment: CompartmentDefinition, deck: number): Vec2 {
  const landings = stairLandings(compartment) ?? [0];
  const index = Math.min(landings.length - 1, Math.max(0, deck - compartment.deck));
  const field = playfieldFor(compartment.id);
  return { x: field.width / 2, y: index * FLIGHT_RUN + LANDING_DEPTH / 2 };
}

function stateKey(state: RouteState): string {
  return `${state.compartmentId}@${state.deck}`;
}

function parseStateKey(key: string): RouteState {
  const split = key.lastIndexOf('@');
  return { compartmentId: key.slice(0, split), deck: Number(key.slice(split + 1)) };
}

function statusForLeg(leg: WaypointTravelLeg): WaypointTravelStatus {
  return leg.kind === 'walk' ? 'walking' : leg.kind;
}

function advanceTravel(
  player: PlayerState,
  current: WaypointTravelState,
  deltaSeconds: number,
): PlayerState {
  const next = { ...(player as WaypointPlayer), pendingDoor: undefined, velocity: { x: 0, y: 0 } };
  const travel = { ...current, legs: current.legs.map((leg) => ({ ...leg })) };
  let remaining = Math.max(0, Math.min(deltaSeconds, 0.05));

  while (remaining > 1e-8 && travel.legIndex < travel.legs.length) {
    const leg = travel.legs[travel.legIndex]!;
    const available = Math.max(0, leg.duration - travel.legElapsed);
    const consumed = Math.min(remaining, available);
    travel.legElapsed += consumed;
    travel.elapsed += consumed;
    remaining -= consumed;
    applyLegProgress(next, leg, leg.duration <= 0 ? 1 : travel.legElapsed / leg.duration);

    if (travel.legElapsed + 1e-8 < leg.duration) break;
    completeLeg(next, leg);
    travel.legIndex += 1;
    travel.legElapsed = 0;
    travel.currentDeck = leg.toDeck;
  }

  if (travel.legIndex >= travel.legs.length) {
    const target = waypointById(travel.targetId);
    if (target) {
      next.compartmentId = target.compartmentId;
      next.position = { ...target.position };
      next.waypointDeck = target.deck;
    }
    next.velocity = { x: 0, y: 0 };
    next.lastAction = `Arrived at ${travel.targetLabel}`;
    next.waypointTravel = { ...travel, status: 'arrived', elapsed: travel.totalDuration };
    return next;
  }

  const activeLeg = travel.legs[travel.legIndex]!;
  travel.status = statusForLeg(activeLeg);
  next.lastAction = `${travel.status === 'door' ? 'Using door' : travel.status === 'elevator' ? 'Riding elevator' : 'Walking'} to ${travel.targetLabel}`;
  next.waypointTravel = travel;
  return next;
}

function applyLegProgress(next: WaypointPlayer, leg: WaypointTravelLeg, progress: number): void {
  const t = Math.min(1, Math.max(0, progress));
  if (leg.kind === 'walk') {
    next.compartmentId = leg.compartmentId;
    next.position = interpolate(leg.from, leg.to, t);
    next.waypointDeck = t >= 1 ? leg.toDeck : leg.fromDeck;
    next.velocity = {
      x: (leg.to.x - leg.from.x) / Math.max(leg.duration, 0.001),
      y: (leg.to.y - leg.from.y) / Math.max(leg.duration, 0.001),
    };
  } else {
    next.velocity = { x: 0, y: 0 };
  }
}

function completeLeg(next: WaypointPlayer, leg: WaypointTravelLeg): void {
  if (leg.kind === 'walk') {
    next.position = { ...leg.to };
    next.waypointDeck = leg.toDeck;
    return;
  }
  next.position = { ...leg.to };
  next.waypointDeck = leg.toDeck;
  if (leg.kind === 'door') {
    next.compartmentId = leg.toCompartmentId;
    const destination = compartmentById(leg.toCompartmentId);
    if (destination) next.arrivalYaw = arrivalHeading(destination, leg.fromCompartmentId);
  }
}

function interpolate(from: Vec2, to: Vec2, progress: number): Vec2 {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

function isAtExpectedTravelPosition(player: PlayerState, travel: WaypointTravelState): boolean {
  const leg = travel.legs[travel.legIndex];
  if (!leg) return true;
  const expectedCompartment =
    leg.kind === 'walk'
      ? leg.compartmentId
      : leg.kind === 'door'
        ? leg.fromCompartmentId
        : leg.compartmentId;
  if (player.compartmentId !== expectedCompartment) return false;
  const progress = leg.duration <= 0 ? 1 : travel.legElapsed / leg.duration;
  const expected = leg.kind === 'walk' ? interpolate(leg.from, leg.to, progress) : leg.from;
  return Math.hypot(player.position.x - expected.x, player.position.y - expected.y) <= 2.5;
}

function blockedPlayer(player: PlayerState, targetId: string, reason: string): PlayerState {
  const target = waypointById(targetId);
  const next = {
    ...(player as WaypointPlayer),
    lastAction: `Route blocked: ${reason}`,
    waypointTravel: {
      targetId,
      targetLabel: target?.label ?? targetId,
      status: 'blocked' as const,
      legIndex: 0,
      legElapsed: 0,
      elapsed: 0,
      totalDuration: 0,
      currentDeck: waypointDeckFor(player) ?? compartmentById(player.compartmentId)?.deck ?? 0,
      route: [],
      legs: [],
      reason,
    },
  };
  return next;
}

function withoutTravelState(player: PlayerState): PlayerState {
  const next = { ...(player as WaypointPlayer) };
  delete next.waypointTravel;
  return next;
}

// Keep imports used by the route contract visible to type-checkers when the
// elevator data shape grows; runtime route admission still reads parsed data.
export type { ElevatorDefinition };

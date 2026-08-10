import { grandAtriumElevator } from '../data/waypoints';
import {
  DECK_PITCH,
  DECK_ZERO_Y,
  compartmentById,
  type CompartmentDefinition,
  type PortalDefinition,
} from '../data/ship-layout';
import {
  arrivalHeading,
  arrivalPosition,
  playfieldHeading,
  portalSimPosition,
  stairLandings,
} from './compartment-space';
import { distance } from './math';
import type { DoorPrompt, PlayerCommand, PlayerState, PortalPadOption, Vec2 } from './types';

export const PORTAL_PAD_REACH = 2.2;

export interface PortalPadDefinition {
  id: string;
  kind: 'door' | 'elevator';
  compartmentId: string;
  label: string;
  deck: number;
  position: Vec2;
  options: PortalPadOption[];
}

/** Stable physical pads derived only from authored portals and the atrium lift. */
export function portalPadDefinitionsFor(compartmentId: string): PortalPadDefinition[] {
  const compartment = compartmentById(compartmentId);
  if (!compartment) return [];

  const pads: PortalPadDefinition[] = compartment.portals.map((portal, index) => {
    const position = portalSimPosition(compartment, portal);
    const destination = compartmentById(portal.target);
    const reciprocalPortal = destination?.portals.find((entry) => entry.target === compartment.id);
    const fromDeck = portalDeck(compartment, portal);
    const toDeck = destination ? portalDeck(destination, reciprocalPortal) : fromDeck;
    const options: PortalPadOption[] =
      destination && stairLandings(destination)
        ? destination.portals.reduce<PortalPadOption[]>((options, stairPortal, stairIndex) => {
            const realDestination = compartmentById(stairPortal.target);
            if (!realDestination || realDestination.id === compartment.id) return options;
            const realReciprocal = realDestination.portals.find(
              (entry) => entry.target === destination.id,
            );
            const realDeck = portalDeck(realDestination, realReciprocal);
            options.push({
              id: `door-option:${compartment.id}:stairwell:${destination.id}:${index}:${stairIndex}`,
              target: realDestination.id,
              label: realDestination.label,
              deck: realDeck,
              direction: directionFor(fromDeck, realDeck),
              kind: 'door' as const,
              position: arrivalPosition(realDestination, destination.id),
            });
            return options;
          }, [])
        : [
            {
              id: `door-option:${compartment.id}:${portal.target}:${index}`,
              target: portal.target,
              label: destination?.label ?? portal.target,
              deck: toDeck,
              direction: directionFor(fromDeck, toDeck),
              kind: 'door' as const,
              position: destination
                ? arrivalPosition(destination, compartment.id)
                : { x: position.x, y: position.y },
            },
          ];
    return {
      id: `door-pad:${compartment.id}:${portal.target}:${index}`,
      kind: 'door' as const,
      compartmentId: compartment.id,
      label: destination?.label ?? portal.target,
      deck: fromDeck,
      position,
      options,
    };
  });

  if (compartment.id === grandAtriumElevator.compartmentId) {
    const currentDeck = compartment.deck;
    pads.push({
      id: 'elevator-pad:grand-atrium',
      kind: 'elevator',
      compartmentId: compartment.id,
      label: grandAtriumElevator.label,
      deck: currentDeck,
      position: { ...grandAtriumElevator.stops[0]!.position },
      options: grandAtriumElevator.stops.map((stop) => ({
        id: `elevator-option:grand-atrium:deck-${stop.deck}`,
        target: compartment.id,
        label: stop.label,
        deck: stop.deck,
        direction: directionFor(currentDeck, stop.deck),
        kind: 'elevator' as const,
        position: { ...stop.position },
      })),
    });
  }

  return pads;
}

export function nearbyPortalPad(
  player: PlayerState,
  reach = PORTAL_PAD_REACH,
): PortalPadDefinition | undefined {
  return portalPadDefinitionsFor(player.compartmentId)
    .filter((pad) => pad.kind === 'elevator' || pad.deck === waypointDeckFor(player))
    .filter(
      (pad) =>
        pad.kind !== 'elevator' ||
        (player.position.y <= pad.position.y + 0.35 && player.facing.y >= 0.5),
    )
    .map((pad) => ({ pad, range: distance(player.position, pad.position) }))
    .filter((entry) => entry.range <= reach)
    .sort((a, b) => a.range - b.range || a.pad.id.localeCompare(b.pad.id))[0]?.pad;
}

export function doorPromptFor(player: PlayerState): DoorPrompt | undefined {
  const pad = nearbyPortalPad(player);
  if (!pad || pad.options.length === 0) return undefined;
  const defaultOption = pad.options[0]!;
  return {
    padId: pad.id,
    padPosition: { ...pad.position },
    options: pad.options.map((option) => ({ ...option, position: { ...option.position } })),
    defaultOptionId: defaultOption.id,
    selectedOptionId: defaultOption.id,
    target: defaultOption.target,
    label: defaultOption.label,
    deck: defaultOption.deck,
    direction: defaultOption.direction,
  };
}

export function selectedDoorOption(
  prompt: DoorPrompt | undefined,
  optionId: string | null | undefined,
): PortalPadOption | undefined {
  if (!prompt || !optionId) return undefined;
  return prompt.options.find((option) => option.id === optionId);
}

export function waypointDeckFor(player: PlayerState): number {
  if (player.waypointDeck !== undefined && Number.isFinite(player.waypointDeck))
    return player.waypointDeck;
  const compartment = compartmentById(player.compartmentId);
  if (!compartment) return 0;
  const landings = stairLandings(compartment);
  if (!landings) return compartment.deck;
  return compartment.deck + Math.max(0, Math.floor(player.position.y / 6));
}

/** Vertical render offset for a logical deck inside one multi-deck compartment. */
export function waypointDeckRenderOffset(player: PlayerState): number {
  const compartment = compartmentById(player.compartmentId);
  if (!compartment) return 0;
  const deck = waypointDeckFor(player);
  return Number.isFinite(deck) ? (deck - compartment.deck) * DECK_PITCH : 0;
}

/** Host-only physical pad resolver. There is no route state or travel timer. */
export function stepPortalPad(
  player: PlayerState,
  command: PlayerCommand | undefined,
): PlayerState {
  const prompt = doorPromptFor(player);
  if (!prompt) return player.pendingDoor ? { ...player, pendingDoor: undefined } : player;

  const targetId = command?.interactionTargetId;
  const option = selectedDoorOption(prompt, targetId);
  if (command?.interact === true && option && player.portalCooldown <= 0) {
    const compartment = compartmentById(player.compartmentId);
    const destination = compartmentById(option.target);
    if (!compartment || !destination) return { ...player, pendingDoor: prompt };

    const isElevator = option.kind === 'elevator' && option.target === compartment.id;
    const arrivalFrom = arrivalSourceFor(option, compartment.id);
    const position = { ...option.position };
    const arrivalYaw = isElevator
      ? playfieldHeading(destination, position)
      : arrivalHeading(destination, arrivalFrom);
    return {
      ...player,
      compartmentId: destination.id,
      waypointDeck: option.deck,
      position,
      arrivalYaw,
      velocity: { x: 0, y: 0 },
      portalCooldown: 0.6,
      pendingDoor: undefined,
      lastAction: isElevator ? `Elevator: ${option.label}` : `Entered ${destination.label}`,
    };
  }

  // Invalid or stale interaction ids never authorize a transfer. Recomputing
  // the prompt keeps the host authoritative and gives the client fresh options.
  return { ...player, pendingDoor: prompt };
}

function directionFor(from: number, to: number): 'up' | 'down' | 'level' {
  return to > from ? 'up' : to < from ? 'down' : 'level';
}

function arrivalSourceFor(option: PortalPadOption, currentCompartmentId: string): string {
  const parts = option.id.split(':');
  return parts[2] === 'stairwell' && parts[3] ? parts[3] : currentCompartmentId;
}

function portalDeck(
  compartment: CompartmentDefinition,
  portal: PortalDefinition | undefined,
): number {
  if (!portal) return compartment.deck;
  return Math.round((compartment.anchor.y + portal.position.y - DECK_ZERO_Y) / DECK_PITCH);
}

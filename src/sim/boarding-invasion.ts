import {
  boardingDefenseActionKindSchema,
  boardingEventCatalog,
  boardingEventIdSchema,
  boardingEventTriggerModeSchema,
  boardingInvasionDefinition,
  type BoardingEnemyKind,
  type BoardingInvasionDefinition,
  type BoardingEventId,
  type BoardingEventTriggerMode,
} from '../data/invasions';
import { distance } from './math';
import type {
  BoardingDefenseActionIntent,
  BoardingInvasionState,
  BoardingLinkState,
  PlayerState,
} from './types';
import { z } from 'zod';

const boardingDefenseActionIntentSchema = z
  .object({
    kind: boardingDefenseActionKindSchema,
    targetId: z.enum(['port-boarding-board', 'starboard-gangway']),
  })
  .strict();

const boardingEventTriggerRequestSchema = z
  .object({
    eventId: boardingEventIdSchema.optional(),
    mode: boardingEventTriggerModeSchema,
    warningSeconds: z.number().finite().optional(),
    approachSeconds: z.number().finite().optional(),
    maxRaidSeconds: z.number().finite().optional(),
  })
  .strict();

export interface BoardingActivationOptions {
  eventId?: BoardingEventId;
  enemyKind?: BoardingEnemyKind;
  warningSeconds?: number;
  approachSeconds?: number;
  maxRaidSeconds?: number;
}

export interface BoardingActivationResult {
  invasion: BoardingInvasionState;
  accepted: boolean;
  message: string;
  eventId?: BoardingEventId;
}

export interface BoardingEventTriggerRequest {
  eventId?: BoardingEventId;
  mode: BoardingEventTriggerMode;
  /** Timing overrides are debug-only and still bounded by activation. */
  warningSeconds?: number;
  approachSeconds?: number;
  maxRaidSeconds?: number;
}

export interface BoardingEventTriggerContext {
  voyagePhase: string;
  /** Elapsed seconds in the current open-sea voyage phase. */
  cruiseSeconds: number;
  serviceActive: boolean;
  navigationClear: boolean;
  /** Must be true for explicit debug actions; scheduled triggers should leave it false. */
  explicit: boolean;
}

export interface BoardingEventTriggerResult extends BoardingActivationResult {
  mode?: BoardingEventTriggerMode;
}

export interface BoardingStepResult {
  invasion: BoardingInvasionState;
  scoreDelta: number;
  structureDamage: number;
  passengerInjuries: number;
  message: string;
}

export interface BoardingActionResult {
  invasion: BoardingInvasionState;
  accepted: boolean;
  resolved: boolean;
  scoreDelta: number;
  message: string;
}

export function createBoardingInvasionState(
  definition: BoardingInvasionDefinition = boardingInvasionDefinition,
): BoardingInvasionState {
  return {
    id: definition.id,
    name: definition.name,
    enemyKind: definition.defaultEnemyKind,
    phase: 'idle',
    elapsed: 0,
    phaseElapsed: 0,
    countdown: 0,
    warningSeconds: definition.warningSeconds,
    approachSeconds: definition.approachSeconds,
    maxRaidSeconds: definition.maxRaidSeconds,
    pressureInterval: definition.pressureInterval,
    nextPressureAt: definition.pressureInterval,
    hostileCount: 0,
    links: Object.fromEntries(
      definition.links.map((link) => [
        link.id,
        {
          ...link,
          position: { ...link.position },
          status: 'approaching',
        } satisfies BoardingLinkState,
      ]),
    ),
    passengerProtection: {
      total: definition.passengerCount,
      protected: definition.passengerCount,
      endangered: 0,
      injured: 0,
    },
    infrastructure: { integrity: 100, damageEvents: 0 },
    scoreDelta: 0,
    lastOutcome: 'No hostile boarding contact.',
  };
}

export function activateBoardingInvasion(
  current: BoardingInvasionState,
  options: BoardingActivationOptions = {},
  definition: BoardingInvasionDefinition = boardingInvasionDefinition,
): BoardingActivationResult {
  if (current.phase !== 'idle') {
    return { invasion: current, accepted: false, message: 'Boarding invasion already active' };
  }
  const selectedEvent = options.eventId
    ? boardingEventCatalog.find((event) => event.id === options.eventId)
    : options.enemyKind
      ? boardingEventCatalog.find((event) => event.enemyKind === options.enemyKind)
      : undefined;
  if (options.eventId && !selectedEvent)
    return { invasion: current, accepted: false, message: 'Rejected unknown boarding event' };
  if (selectedEvent && options.enemyKind && selectedEvent.enemyKind !== options.enemyKind)
    return {
      invasion: current,
      accepted: false,
      message: 'Rejected mismatched boarding event variant',
    };
  const enemyKind = options.enemyKind ?? selectedEvent?.enemyKind ?? current.enemyKind;
  if (!currentEnemyKindSupported(enemyKind, definition))
    return {
      invasion: current,
      accepted: false,
      message: `Rejected unsupported enemy kind ${enemyKind}`,
    };
  const warningSeconds = boundedDuration(options.warningSeconds, current.warningSeconds);
  const approachSeconds = boundedDuration(options.approachSeconds, current.approachSeconds);
  const maxRaidSeconds = boundedDuration(options.maxRaidSeconds, current.maxRaidSeconds);
  return {
    invasion: {
      ...current,
      name: selectedEvent?.name ?? current.name,
      enemyKind,
      phase: 'warning',
      elapsed: 0,
      phaseElapsed: 0,
      countdown: warningSeconds,
      warningSeconds,
      approachSeconds,
      maxRaidSeconds,
      lastOutcome: `${selectedEvent?.label ?? eventLabelForEnemyKind(enemyKind)} incoming. Protect passengers and reach the promenade.`,
    },
    accepted: true,
    message: `${selectedEvent?.label ?? eventLabelForEnemyKind(enemyKind)} WARNING: UNKNOWN FAST CRAFT CLOSING`,
    eventId: selectedEvent?.id,
  };
}

/**
 * Safe host-callable trigger contract. Scheduled events require open sea,
 * cruise time, active service, and clear navigation. Debug events require an
 * explicit caller flag, so a fresh moored state cannot auto-fire by accident.
 * This function only activates the existing invasion state; HostSession still
 * owns scheduling, snapshots, consequences, and defense authority.
 */
export function triggerBoardingEvent(
  current: BoardingInvasionState,
  request: BoardingEventTriggerRequest | unknown,
  context: BoardingEventTriggerContext,
  definition: BoardingInvasionDefinition = boardingInvasionDefinition,
): BoardingEventTriggerResult {
  const parsed = boardingEventTriggerRequestSchema.safeParse(request);
  if (!parsed.success) return rejectedTrigger(current, 'Rejected invalid boarding event trigger');
  if (current.phase !== 'idle')
    return rejectedTrigger(current, 'Rejected boarding event while another event is active');
  if (!isTriggerContext(context))
    return rejectedTrigger(current, 'Rejected invalid boarding trigger context');

  const eventId = parsed.data.eventId ?? boardingEventCatalog[0]!.id;
  const event = boardingEventCatalog.find((candidate) => candidate.id === eventId);
  if (!event) return rejectedTrigger(current, 'Rejected unknown boarding event');
  if (!definition.supportedEnemyKinds.includes(event.enemyKind))
    return rejectedTrigger(current, `Rejected unsupported enemy kind ${event.enemyKind}`);

  if (parsed.data.mode === 'debug') {
    if (!context.explicit)
      return rejectedTrigger(current, 'Rejected non-explicit boarding debug trigger');
  } else {
    if (
      parsed.data.warningSeconds !== undefined ||
      parsed.data.approachSeconds !== undefined ||
      parsed.data.maxRaidSeconds !== undefined
    )
      return rejectedTrigger(current, 'Rejected timing override for scheduled boarding event');
    if (context.voyagePhase !== event.schedule.voyagePhase)
      return rejectedTrigger(
        current,
        `Rejected boarding event outside ${event.schedule.voyagePhase}`,
      );
    if (context.cruiseSeconds < event.schedule.triggerAfterCruiseSeconds)
      return rejectedTrigger(current, 'Rejected boarding event before authored cruise condition');
    if (event.schedule.requiresActiveService && !context.serviceActive)
      return rejectedTrigger(current, 'Rejected boarding event without active service mission');
    if (event.schedule.requiresClearNavigation && !context.navigationClear)
      return rejectedTrigger(
        current,
        'Rejected boarding event while navigation incident is active',
      );
  }

  const activation = activateBoardingInvasion(
    current,
    {
      eventId: event.id,
      enemyKind: event.enemyKind,
      warningSeconds: parsed.data.warningSeconds,
      approachSeconds: parsed.data.approachSeconds,
      maxRaidSeconds: parsed.data.maxRaidSeconds,
    },
    definition,
  );
  return { ...activation, eventId: event.id, mode: parsed.data.mode };
}

export const requestBoardingEvent = triggerBoardingEvent;

export function stepBoardingInvasion(
  current: BoardingInvasionState,
  deltaSeconds: number,
  definition: BoardingInvasionDefinition = boardingInvasionDefinition,
): BoardingStepResult {
  if (current.phase === 'idle' || current.phase === 'repelled' || current.phase === 'failed')
    return noBoardingStep(current);
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 1)) : 0;
  if (dt <= 0) return noBoardingStep(current);

  let invasion: BoardingInvasionState = {
    ...current,
    elapsed: current.elapsed + dt,
    phaseElapsed: current.phaseElapsed + dt,
  };
  let message = '';

  // At most two authored phase boundaries can be crossed in one bounded step.
  if (invasion.phase === 'warning') {
    invasion = {
      ...invasion,
      countdown: Math.max(0, invasion.warningSeconds - invasion.phaseElapsed),
    };
    if (invasion.phaseElapsed >= invasion.warningSeconds) {
      invasion = {
        ...invasion,
        phase: 'approach',
        phaseElapsed: 0,
        countdown: invasion.approachSeconds,
        lastOutcome: 'Pirate craft alongside. Boarding gear incoming.',
      };
      message = `${eventLabelForEnemyKind(invasion.enemyKind)} APPROACH: BOARDING GEAR INCOMING`;
    }
  } else if (invasion.phase === 'approach') {
    invasion = {
      ...invasion,
      countdown: Math.max(0, invasion.approachSeconds - invasion.phaseElapsed),
    };
    if (invasion.phaseElapsed >= invasion.approachSeconds) {
      invasion = boardersAboard(invasion, definition);
      message = `${eventLabelForEnemyKind(invasion.enemyKind)} ABOARD: DETACH BOTH BOARDING LINKS`;
    }
  }

  if (invasion.phase !== 'boarders-aboard')
    return { invasion, scoreDelta: 0, structureDamage: 0, passengerInjuries: 0, message };

  invasion = {
    ...invasion,
    countdown: Math.max(0, invasion.maxRaidSeconds - invasion.phaseElapsed),
  };
  const pulseDue = invasion.phaseElapsed >= invasion.nextPressureAt;
  let scoreDelta = 0;
  let structureDamage = 0;
  let passengerInjuries = 0;
  if (pulseDue) {
    const protection = { ...invasion.passengerProtection };
    if (protection.protected > 0) {
      protection.protected -= 1;
      protection.endangered += 1;
    }
    if (invasion.infrastructure.damageEvents % 2 === 1 && protection.endangered > 0) {
      protection.endangered -= 1;
      protection.injured += 1;
      passengerInjuries = 1;
    }
    scoreDelta = definition.scorePerPressurePulse;
    structureDamage = definition.infrastructureDamagePerPulse / 100;
    invasion = {
      ...invasion,
      nextPressureAt: invasion.nextPressureAt + invasion.pressureInterval,
      passengerProtection: protection,
      infrastructure: {
        integrity: Math.max(
          0,
          invasion.infrastructure.integrity - definition.infrastructureDamagePerPulse,
        ),
        damageEvents: invasion.infrastructure.damageEvents + 1,
      },
      scoreDelta: invasion.scoreDelta + scoreDelta,
      lastOutcome: `${hostileLabel(invasion.enemyKind)} damaged ship systems and endangered passengers.`,
    };
    message = `${eventLabelForEnemyKind(invasion.enemyKind)} PRESSURE: PASSENGERS AND SHIP SYSTEMS AT RISK`;
  }

  if (
    invasion.phaseElapsed >= invasion.maxRaidSeconds ||
    invasion.infrastructure.integrity <= 0 ||
    invasion.passengerProtection.injured >= definition.passengerFailureThreshold
  ) {
    scoreDelta += definition.failureScore;
    invasion = {
      ...invasion,
      phase: 'failed',
      countdown: 0,
      scoreDelta: invasion.scoreDelta + definition.failureScore,
      lastOutcome: `${hostileLabel(invasion.enemyKind)} overwhelmed the defense. Passengers evacuated from the breached deck.`,
    };
    message = `BOARDING FAILED: ${hostileLabel(invasion.enemyKind).toUpperCase()} OVERRAN THE PROMENADE`;
  }

  return { invasion, scoreDelta, structureDamage, passengerInjuries, message };
}

export function resolveBoardingDefenseAction(
  current: BoardingInvasionState,
  intent: BoardingDefenseActionIntent | unknown,
  actor: PlayerState | undefined,
  definition: BoardingInvasionDefinition = boardingInvasionDefinition,
): BoardingActionResult {
  const parsed = boardingDefenseActionIntentSchema.safeParse(intent);
  if (!parsed.success) return rejectedAction(current, 'Rejected invalid boarding action');
  if (current.phase !== 'boarders-aboard')
    return rejectedAction(current, `Rejected boarding action during ${current.phase}`);
  if (!actor) return rejectedAction(current, 'Rejected boarding action from unknown player');
  const link = current.links[parsed.data.targetId];
  const authored = definition.links.find((entry) => entry.id === parsed.data.targetId);
  if (!link || !authored) return rejectedAction(current, 'Rejected unknown boarding link');
  if (parsed.data.kind !== authored.detachAction)
    return rejectedAction(current, `Rejected wrong action for ${authored.name}`);
  if (link.status !== 'attached')
    return rejectedAction(current, `${authored.name} is not attached`);
  if (actor.compartmentId !== authored.compartmentId)
    return rejectedAction(current, `Rejected action outside ${authored.compartmentId}`);
  if (distance(actor.position, authored.position) > authored.interactionRadius)
    return rejectedAction(current, `Rejected out-of-range action on ${authored.name}`);

  const links = {
    ...current.links,
    [authored.id]: { ...link, status: 'detached' as const },
  };
  const allDetached = definition.links.every((entry) => links[entry.id]?.status === 'detached');
  const scoreDelta = definition.detachScore + (allDetached ? definition.resolutionScore : 0);
  const invasion: BoardingInvasionState = {
    ...current,
    links,
    hostileCount: allDetached ? 0 : Math.max(0, current.hostileCount - 2),
    phase: allDetached ? 'repelled' : current.phase,
    countdown: allDetached ? 0 : current.countdown,
    scoreDelta: current.scoreDelta + scoreDelta,
    lastOutcome: allDetached
      ? `Both boarding links detached. ${hostileLabel(current.enemyKind)} forced back to their craft.`
      : `${authored.name} detached. One breach remains.`,
  };
  return {
    invasion,
    accepted: true,
    resolved: allDetached,
    scoreDelta,
    message: invasion.lastOutcome,
  };
}

function boardersAboard(
  current: BoardingInvasionState,
  definition: BoardingInvasionDefinition,
): BoardingInvasionState {
  return {
    ...current,
    phase: 'boarders-aboard',
    phaseElapsed: 0,
    countdown: current.maxRaidSeconds,
    hostileCount: definition.initialHostileCount,
    links: Object.fromEntries(
      Object.entries(current.links).map(([id, link]) => [id, { ...link, status: 'attached' }]),
    ),
    lastOutcome: `${hostileLabel(current.enemyKind)} reached the promenade through two boarding links.`,
  };
}

function noBoardingStep(invasion: BoardingInvasionState): BoardingStepResult {
  return { invasion, scoreDelta: 0, structureDamage: 0, passengerInjuries: 0, message: '' };
}

function rejectedAction(invasion: BoardingInvasionState, message: string): BoardingActionResult {
  return { invasion, accepted: false, resolved: false, scoreDelta: 0, message };
}

function rejectedTrigger(
  invasion: BoardingInvasionState,
  message: string,
): BoardingEventTriggerResult {
  return { invasion, accepted: false, eventId: undefined, mode: undefined, message };
}

function isTriggerContext(value: unknown): value is BoardingEventTriggerContext {
  if (!value || typeof value !== 'object') return false;
  const context = value as Partial<BoardingEventTriggerContext>;
  return (
    typeof context.voyagePhase === 'string' &&
    typeof context.cruiseSeconds === 'number' &&
    Number.isFinite(context.cruiseSeconds) &&
    context.cruiseSeconds >= 0 &&
    typeof context.serviceActive === 'boolean' &&
    typeof context.navigationClear === 'boolean' &&
    typeof context.explicit === 'boolean'
  );
}

function currentEnemyKindSupported(
  enemyKind: BoardingEnemyKind,
  definition: BoardingInvasionDefinition,
): boolean {
  return definition.supportedEnemyKinds.includes(enemyKind);
}

function eventLabelForEnemyKind(enemyKind: BoardingEnemyKind): string {
  return boardingEventCatalog.find((event) => event.enemyKind === enemyKind)?.label ?? 'BOARDING';
}

function hostileLabel(enemyKind: BoardingEnemyKind): string {
  return enemyKind === 'bomber' ? 'Saboteurs' : 'Pirates';
}

function boundedDuration(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0.05, Math.min(value as number, 120)) : fallback;
}

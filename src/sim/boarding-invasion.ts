import {
  boardingDefenseActionKindSchema,
  boardingInvasionDefinition,
  type BoardingInvasionDefinition,
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

export interface BoardingActivationOptions {
  warningSeconds?: number;
  approachSeconds?: number;
  maxRaidSeconds?: number;
}

export interface BoardingActivationResult {
  invasion: BoardingInvasionState;
  accepted: boolean;
  message: string;
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
): BoardingActivationResult {
  if (current.phase !== 'idle') {
    return { invasion: current, accepted: false, message: 'Boarding invasion already active' };
  }
  const warningSeconds = boundedDuration(options.warningSeconds, current.warningSeconds);
  const approachSeconds = boundedDuration(options.approachSeconds, current.approachSeconds);
  const maxRaidSeconds = boundedDuration(options.maxRaidSeconds, current.maxRaidSeconds);
  return {
    invasion: {
      ...current,
      phase: 'warning',
      elapsed: 0,
      phaseElapsed: 0,
      countdown: warningSeconds,
      warningSeconds,
      approachSeconds,
      maxRaidSeconds,
      lastOutcome: 'Unknown fast craft closing. Protect passengers and reach the promenade.',
    },
    accepted: true,
    message: 'BOARDING WARNING: UNKNOWN FAST CRAFT CLOSING',
  };
}

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
      message = 'PIRATE APPROACH: BOARDING GEAR INCOMING';
    }
  } else if (invasion.phase === 'approach') {
    invasion = {
      ...invasion,
      countdown: Math.max(0, invasion.approachSeconds - invasion.phaseElapsed),
    };
    if (invasion.phaseElapsed >= invasion.approachSeconds) {
      invasion = boardersAboard(invasion, definition);
      message = 'BOARDERS ABOARD: DETACH BOTH BOARDING LINKS';
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
      lastOutcome: 'Boarders damaged ship systems and endangered passengers.',
    };
    message = 'BOARDING PRESSURE: PASSENGERS AND SHIP SYSTEMS AT RISK';
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
      lastOutcome: 'Pirates overwhelmed the defense. Passengers evacuated from the breached deck.',
    };
    message = 'BOARDING FAILED: PIRATES OVERRAN THE PROMENADE';
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
      ? 'Both boarding links detached. Pirates forced back to their craft.'
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
    lastOutcome: 'Pirates reached the promenade through two boarding links.',
  };
}

function noBoardingStep(invasion: BoardingInvasionState): BoardingStepResult {
  return { invasion, scoreDelta: 0, structureDamage: 0, passengerInjuries: 0, message: '' };
}

function rejectedAction(invasion: BoardingInvasionState, message: string): BoardingActionResult {
  return { invasion, accepted: false, resolved: false, scoreDelta: 0, message };
}

function boundedDuration(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0.05, Math.min(value as number, 120)) : fallback;
}

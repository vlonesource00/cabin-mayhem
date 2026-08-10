import { z } from 'zod';
import { navigationIncidentDefinition } from '../data/emergencies';
import { clamp, distance } from './math';
import { createNavigationRepairState } from './repair-response';
import type { NavigationIncidentState, PlayerCommand, PlayerState, Vec2 } from './types';

const boundedPointSchema = z
  .object({
    x: z.number().finite().min(-1000).max(1000),
    y: z.number().finite().min(-1000).max(1000),
  })
  .strict();

const navigationObstacleStateSchema = z
  .object({
    id: z.literal('north-shoal-contact'),
    name: z.string().min(1).max(128),
    kind: z.enum(['drifting-container', 'reef', 'derelict', 'vessel']),
    startPosition: z
      .object({
        x: z.number().finite().min(-12).max(12),
        y: z.number().finite().min(-8).max(58),
      })
      .strict(),
    relativePosition: z
      .object({
        x: z.number().finite().min(-12).max(12),
        y: z.number().finite().min(-8).max(58),
      })
      .strict(),
    relativeVelocity: z
      .object({
        x: z.number().finite().min(-60).max(60),
        y: z.number().finite().min(-60).max(60),
      })
      .strict(),
    radius: z.number().finite().positive().max(12),
    contactDistance: z.number().finite().positive().max(12),
  })
  .strict();

const navigationRepairStateSchema = z
  .object({
    id: z.enum(['repair-galley-breaker', 'repair-steering-relay']),
    name: z.string().min(1).max(128),
    compartmentId: z.string().min(1).max(128),
    position: boundedPointSchema,
    radius: z.number().finite().positive().max(3),
    status: z.enum(['dormant', 'active', 'repairing', 'fixed']),
    progress: z.number().finite().min(0).max(1),
    pressure: z.number().finite().min(0).max(1),
    penaltyElapsed: z.number().finite().min(0).max(120),
    repairDuration: z.number().finite().positive().max(12),
    pressureInterval: z.number().finite().positive().max(30),
    pressureStep: z.number().finite().positive().max(1),
    completionCaption: z.string().max(256),
    activeCaption: z.string().max(256),
  })
  .strict()
  .superRefine((repair, context) => {
    const expectedCompartment = repair.id === 'repair-steering-relay' ? 'engine-room' : 'atrium';
    if (repair.compartmentId !== expectedCompartment)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Repair ${repair.id} must remain in ${expectedCompartment}`,
        path: ['compartmentId'],
      });
  });

export const navigationIncidentStateSchema = z
  .object({
    id: z.literal('collision-course-reef'),
    name: z.string().min(1).max(128),
    phase: z.enum(['idle', 'warning', 'avoided', 'impact', 'repair', 'repaired']),
    warningSeconds: z.number().finite().min(3).max(60),
    elapsed: z.number().finite().min(0).max(60),
    countdown: z.number().finite().min(0).max(60),
    helmProgress: z.number().finite().min(0).max(1),
    avoidanceMargin: z.number().finite().positive().max(12),
    obstacle: navigationObstacleStateSchema,
    damageSystem: z.literal('hydraulics'),
    damageBeforeImpact: z.number().finite().min(0).max(1).optional(),
    repair: navigationRepairStateSchema,
    lastOutcome: z.string().max(256),
  })
  .strict()
  .superRefine((navigation, context) => {
    if (navigation.elapsed > navigation.warningSeconds)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Navigation elapsed time exceeds its warning window',
        path: ['elapsed'],
      });
    if (navigation.countdown > navigation.warningSeconds)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Navigation countdown exceeds its warning window',
        path: ['countdown'],
      });
  });

export interface NavigationActivationResult {
  navigation: NavigationIncidentState;
  accepted: boolean;
  message: string;
}

export interface NavigationStepResult {
  navigation: NavigationIncidentState;
  outcome: 'none' | 'avoided' | 'impact';
  helmPlayerId?: string;
}

export function createNavigationIncidentState(): NavigationIncidentState {
  return {
    id: navigationIncidentDefinition.id,
    name: navigationIncidentDefinition.name,
    phase: 'idle',
    warningSeconds: navigationIncidentDefinition.warningSeconds,
    elapsed: 0,
    countdown: 0,
    helmProgress: 0,
    avoidanceMargin: navigationIncidentDefinition.bridge.avoidanceMargin,
    obstacle: {
      ...navigationIncidentDefinition.obstacle,
      relativePosition: { ...navigationIncidentDefinition.obstacle.startPosition },
      relativeVelocity: { ...navigationIncidentDefinition.obstacle.relativeVelocity },
    },
    damageSystem: navigationIncidentDefinition.damageSystem,
    repair: createNavigationRepairState(),
    lastOutcome: '',
  };
}

export function activateNavigationIncident(
  current: NavigationIncidentState,
  warningSeconds: number = navigationIncidentDefinition.warningSeconds,
): NavigationActivationResult {
  if (current.phase !== 'idle')
    return {
      navigation: current,
      accepted: false,
      message: 'Collision-course incident already resolved or active',
    };
  const boundedWarningSeconds = clamp(warningSeconds, 3, 60);
  const obstacle = navigationIncidentDefinition.obstacle;
  const travelDistance = Math.max(0, obstacle.startPosition.y - obstacle.contactDistance);
  const baseTravelSeconds = travelDistance / Math.max(Math.abs(obstacle.relativeVelocity.y), 0.001);
  const velocityScale = baseTravelSeconds / boundedWarningSeconds;
  const navigation = createNavigationIncidentState();
  navigation.obstacle.relativeVelocity = {
    x: obstacle.relativeVelocity.x * velocityScale,
    y: obstacle.relativeVelocity.y * velocityScale,
  };
  navigation.phase = 'warning';
  navigation.warningSeconds = boundedWarningSeconds;
  navigation.countdown = boundedWarningSeconds;
  navigation.lastOutcome = 'Collision course warning issued';
  return {
    navigation,
    accepted: true,
    message: `COLLISION COURSE - ${obstacle.name}; reach the bridge helm (${Math.round(boundedWarningSeconds)}s)`,
  };
}

export function isAtBridgeHelm(player: PlayerState): boolean {
  return (
    player.compartmentId === navigationIncidentDefinition.bridge.compartmentId &&
    distance(player.position, navigationIncidentDefinition.bridge.position) <=
      navigationIncidentDefinition.bridge.radius
  );
}

export function bridgeHelmCandidate(
  players: Record<string, PlayerState>,
  commands: Record<string, PlayerCommand>,
): { playerId: string; player: PlayerState; command: PlayerCommand } | undefined {
  for (const playerId of Object.keys(players).sort()) {
    const player = players[playerId];
    const command = commands[playerId];
    if (!player || !command || !isAtBridgeHelm(player)) continue;
    if (
      Math.abs(command.helm.rudder) <= 0.01 &&
      Math.abs(command.helm.telegraph) <= 0.01 &&
      !command.helm.emergencyStop
    )
      continue;
    return { playerId, player, command };
  }
  return undefined;
}

export function stepNavigation(
  current: NavigationIncidentState,
  players: Record<string, PlayerState>,
  commands: Record<string, PlayerCommand>,
  deltaSeconds: number,
): NavigationStepResult {
  if (current.phase !== 'warning') return { navigation: current, outcome: 'none' };

  const dt = clamp(deltaSeconds, 0, 0.05);
  const candidate = bridgeHelmCandidate(players, commands);
  const rudder = candidate ? clamp(candidate.command.helm.rudder, -1, 1) : 0;
  const relativePosition: Vec2 = {
    x: clamp(
      current.obstacle.relativePosition.x +
        rudder * navigationIncidentDefinition.bridge.lateralRate * dt,
      -12,
      12,
    ),
    y: Math.max(
      -current.obstacle.contactDistance * 2,
      current.obstacle.relativePosition.y + current.obstacle.relativeVelocity.y * dt,
    ),
  };
  const elapsed = clamp(current.elapsed + dt, 0, current.warningSeconds);
  const countdown = clamp(current.warningSeconds - elapsed, 0, current.warningSeconds);
  const helmMagnitude = candidate
    ? Math.max(
        Math.abs(candidate.command.helm.rudder),
        Math.abs(candidate.command.helm.telegraph),
        candidate.command.helm.emergencyStop ? 1 : 0,
      )
    : 0;
  const helmProgress = clamp(current.helmProgress + helmMagnitude * dt * 2.2, 0, 1);
  const base = {
    ...current,
    elapsed,
    countdown,
    helmProgress,
    obstacle: { ...current.obstacle, relativePosition },
  };

  if (
    Math.abs(relativePosition.x) >= navigationIncidentDefinition.bridge.avoidanceMargin &&
    relativePosition.y > current.obstacle.contactDistance
  )
    return {
      navigation: {
        ...base,
        phase: 'avoided',
        countdown: 0,
        lastOutcome: `Avoided ${current.obstacle.name} from the bridge`,
      },
      outcome: 'avoided',
      helmPlayerId: candidate?.playerId,
    };

  if (relativePosition.y <= current.obstacle.contactDistance)
    return {
      navigation: {
        ...base,
        phase: 'impact',
        countdown: 0,
        lastOutcome: `${current.obstacle.name} struck the ship`,
      },
      outcome: 'impact',
      helmPlayerId: candidate?.playerId,
    };

  return { navigation: base, outcome: 'none', helmPlayerId: candidate?.playerId };
}

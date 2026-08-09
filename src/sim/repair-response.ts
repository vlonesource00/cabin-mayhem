import { galleyRepairDefinition, steeringRepairDefinition } from '../data/emergencies';
import { clamp, distance } from './math';
import type { CabinObject, FireStatus, VoyagePhase, RepairState, Vec2 } from './types';

export interface RepairActionResult {
  repair: RepairState;
  accepted: boolean;
  completed: boolean;
  pressurePulse: boolean;
  message: string;
}

export interface RepairAttempt {
  holding: boolean;
  targetId?: string | null;
  playerPosition?: Vec2;
  playerId?: string;
  playerCompartmentId?: string;
  heldObject?: CabinObject;
  fireStatus: FireStatus;
}

export function createRepairState(): RepairState {
  return {
    ...galleyRepairDefinition,
    compartmentId: 'atrium',
    position: { ...galleyRepairDefinition.position },
    status: 'dormant',
    progress: 0,
    pressure: 0,
    penaltyElapsed: 0,
    repairDuration: galleyRepairDefinition.repairDuration,
    pressureInterval: galleyRepairDefinition.pressureInterval,
    pressureStep: galleyRepairDefinition.pressureStep,
    completionCaption: 'COFFEE MACHINE LOST THE ELECTION. CABIN LIGHTS STEADY.',
    activeCaption: '',
  };
}

export function createNavigationRepairState(): RepairState {
  return {
    ...steeringRepairDefinition,
    position: { ...steeringRepairDefinition.position },
    status: 'dormant',
    progress: 0,
    pressure: 0,
    penaltyElapsed: 0,
    completionCaption: 'STEERING RELAY BACK ONLINE. THE SHIP CAN DODGE AGAIN.',
    activeCaption: '',
  };
}

export function activateRepair(
  current: RepairState,
  phase: VoyagePhase,
  fireStatus: FireStatus,
): RepairActionResult {
  if (current.status !== 'dormant')
    return {
      repair: current,
      accepted: false,
      completed: false,
      pressurePulse: false,
      message: 'Coffee machine incident already resolved',
    };
  if (phase !== 'open-sea')
    return {
      repair: current,
      accepted: false,
      completed: false,
      pressurePulse: false,
      message: 'Coffee machine saves its revolt for cruise',
    };
  if (fireStatus === 'active')
    return {
      repair: current,
      accepted: false,
      completed: false,
      pressurePulse: false,
      message: 'Galley fire takes priority over the coffee machine',
    };
  return {
    repair: {
      ...current,
      status: 'active',
      pressure: 0.2,
      penaltyElapsed: 0,
      activeCaption: 'THE COFFEE MACHINE HAS DECLARED ITSELF CAPTAIN.',
    },
    accepted: true,
    completed: false,
    pressurePulse: false,
    message: 'COFFEE MACHINE MUTINY - grab the red toolbox',
  };
}

export function activateNavigationRepair(current: RepairState): RepairActionResult {
  if (current.status !== 'dormant')
    return {
      repair: current,
      accepted: false,
      completed: false,
      pressurePulse: false,
      message: 'Steering relay repair already active',
    };
  return {
    repair: {
      ...current,
      status: 'active',
      pressure: 0.24,
      penaltyElapsed: 0,
      activeCaption: 'STEERING RELAY DAMAGE. FIND THE ENGINE ROOM TOOL PANEL.',
    },
    accepted: true,
    completed: false,
    pressurePulse: false,
    message: 'STEERING RELAY DAMAGED - carry the red toolbox to the engine room',
  };
}

export function stepRepair(
  current: RepairState,
  attempt: RepairAttempt,
  deltaSeconds: number,
): RepairActionResult {
  if (current.status === 'dormant' || current.status === 'fixed')
    return {
      repair: current,
      accepted: false,
      completed: false,
      pressurePulse: false,
      message: '',
    };

  const dt = clamp(deltaSeconds, 0, 0.05);
  if (attempt.fireStatus === 'active') {
    const interrupted = current.status === 'repairing';
    return {
      repair: {
        ...current,
        status: 'active',
        progress: 0,
        activeCaption: interrupted
          ? 'REPAIR PAUSED. GALLEY FIRE TAKES PRIORITY.'
          : current.activeCaption,
      },
      accepted: false,
      completed: false,
      pressurePulse: false,
      message: interrupted ? 'Repair paused - galley fire takes priority' : '',
    };
  }

  const valid =
    attempt.holding &&
    attempt.targetId === current.id &&
    attempt.heldObject?.kind === 'toolbox' &&
    attempt.heldObject?.ownerId === attempt.playerId &&
    (attempt.playerCompartmentId === undefined ||
      attempt.playerCompartmentId === current.compartmentId) &&
    Boolean(attempt.playerPosition) &&
    distance(attempt.playerPosition!, current.position) <= current.radius + 1.8;

  if (valid) {
    const progress = clamp(current.progress + dt / current.repairDuration, 0, 1);
    if (progress >= 1)
      return {
        repair: {
          ...current,
          status: 'fixed',
          progress: 1,
          pressure: 0,
          penaltyElapsed: 0,
          activeCaption: current.completionCaption,
        },
        accepted: true,
        completed: true,
        pressurePulse: false,
        message: current.completionCaption,
      };
    return {
      repair: {
        ...current,
        status: 'repairing',
        progress,
        activeCaption:
          current.id === 'repair-steering-relay'
            ? 'RELAY WORK CONTINUES. HOLD E. KEEP THE SHIP MOVING.'
            : 'NEGOTIATIONS CONTINUE. HOLD E. DO NOT BLINK.',
      },
      accepted: true,
      completed: false,
      pressurePulse: false,
      message:
        current.status === 'repairing'
          ? ''
          : current.id === 'repair-steering-relay'
            ? 'Hold E - bring the steering relay back online'
            : 'Hold E - convince the coffee machine to stand down',
    };
  }

  const penaltyElapsed = current.penaltyElapsed + dt;
  const pressurePulse = penaltyElapsed >= current.pressureInterval;
  return {
    repair: {
      ...current,
      status: 'active',
      progress: 0,
      penaltyElapsed: pressurePulse ? penaltyElapsed - current.pressureInterval : penaltyElapsed,
      pressure: pressurePulse
        ? clamp(current.pressure + current.pressureStep, 0, 1)
        : current.pressure,
      activeCaption: pressurePulse
        ? current.id === 'repair-steering-relay'
          ? 'STEERING RELAY PRESSURE RISING. ENGINE ROOM RESPONSE REQUIRED.'
          : 'COFFEE MACHINE FILES ANOTHER COMPLAINT. PRESSURE RISING.'
        : current.activeCaption,
    },
    accepted: false,
    completed: false,
    pressurePulse,
    message:
      current.status === 'repairing'
        ? current.id === 'repair-steering-relay'
          ? 'Repair interrupted - hold E on the relay with the toolbox'
          : 'Repair interrupted - hold E on the breaker with the toolbox'
        : pressurePulse
          ? current.id === 'repair-steering-relay'
            ? 'Steering relay pressure rising. Get back to the engine room panel.'
            : 'Coffee machine files another complaint. Cabin pressure rising.'
          : '',
  };
}

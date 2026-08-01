export type FlightPhase =
  'ground' | 'taxi' | 'takeoff' | 'cruise' | 'approach' | 'landed' | 'crashed';

export type ObjectKind = 'cart' | 'light-case' | 'heavy-crate' | 'toolbox' | 'supply-bin';
export type DamageSystem = 'electrical' | 'hydraulics' | 'structure';

export interface Vec2 {
  x: number;
  y: number;
}

export interface PilotInput {
  pitch: number;
  roll: number;
  yaw: number;
  throttle: number;
  brake: boolean;
}

export interface PlayerCommand {
  move: Vec2;
  look: Vec2;
  sprint: boolean;
  crouch: boolean;
  brace: boolean;
  interact: boolean;
  interactionTargetId?: string | null;
  throwItem: boolean;
  pilot: PilotInput;
}

export interface PlayerState {
  id: string;
  name: string;
  color: string;
  position: Vec2;
  velocity: Vec2;
  facing: Vec2;
  crouched: boolean;
  braced: boolean;
  knockdown: number;
  heldObjectId?: string;
  lastAction: string;
}

export interface CabinObject {
  id: string;
  name: string;
  kind: ObjectKind;
  material: 'metal' | 'plastic' | 'cargo';
  position: Vec2;
  velocity: Vec2;
  radius: number;
  mass: number;
  friction: number;
  impactTolerance: number;
  secured: boolean;
  anchor?: Vec2;
  ownerId?: string;
  damage: number;
}

export interface CabinState {
  width: number;
  length: number;
  players: Record<string, PlayerState>;
  objects: Record<string, CabinObject>;
  collisionCount: number;
  lastImpulse: number;
}

export interface FlightState {
  phase: FlightPhase;
  phaseElapsed: number;
  clock: number;
  airspeed: number;
  altitude: number;
  verticalSpeed: number;
  heading: number;
  pitch: number;
  roll: number;
  yawRate: number;
  throttle: number;
  turbulence: number;
  airPocket: number;
  turnImpulse: number;
  collisionImpulse: number;
  electrical: number;
  hydraulics: number;
  structure: number;
  cabinAcceleration: Vec2;
  warning?: string;
}

export interface NetworkSettings {
  enabled: boolean;
  latencyMs: number;
  jitterMs: number;
  packetLoss: number;
}

export interface NetworkMetrics {
  sent: number;
  received: number;
  dropped: number;
  queued: number;
  bytes: number;
}

export interface MissionEvent {
  id: number;
  at: number;
  type: 'system' | 'physics' | 'network' | 'interaction' | 'flight';
  message: string;
}

export interface MissionState {
  seed: number;
  tick: number;
  hostId: string;
  flight: FlightState;
  cabin: CabinState;
  network: NetworkSettings;
  networkMetrics: NetworkMetrics;
  events: MissionEvent[];
}

export const emptyCommand = (): PlayerCommand => ({
  move: { x: 0, y: 0 },
  look: { x: 0, y: -1 },
  sprint: false,
  crouch: false,
  brace: false,
  interact: false,
  throwItem: false,
  pilot: { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: false },
});

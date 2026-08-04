export type VoyagePhase =
  'ground' | 'taxi' | 'takeoff' | 'cruise' | 'approach' | 'landed' | 'crashed';

export type ServiceNeed = 'drink' | 'meal' | 'medical';
export type FireStatus = 'dormant' | 'active' | 'suppressed';
export type RepairStatus = 'dormant' | 'active' | 'repairing' | 'fixed';
export type ObjectKind =
  | 'cart'
  | 'light-case'
  | 'heavy-crate'
  | 'toolbox'
  | 'supply-bin'
  | 'drink'
  | 'meal-tray'
  | 'medkit'
  | 'extinguisher';
export type DamageSystem = 'electrical' | 'hydraulics' | 'structure';

export interface Vec2 {
  x: number;
  y: number;
}

export interface HelmInput {
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
  repair: boolean;
  interactionTargetId?: string | null;
  selectServiceNeed?: ServiceNeed;
  throwItem: boolean;
  helm: HelmInput;
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
  selectedServiceNeed: ServiceNeed;
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
  serviceNeed?: ServiceNeed;
}

export type PassengerRequestStatus = 'pending' | 'active' | 'served' | 'missed';

export interface PassengerState {
  id: string;
  name: string;
  seatPosition: Vec2;
  servicePosition: Vec2;
  color: string;
  need: ServiceNeed;
  requestAt: number;
  requestStatus: PassengerRequestStatus;
  patience: number;
  panic: number;
  injury: number;
  satisfaction: number;
}

export interface ServiceMissionState {
  elapsed: number;
  duration: number;
  score: number;
  served: number;
  missed: number;
  outcome: 'active' | 'success' | 'failed';
  cart: ServiceCartState;
  passengers: Record<string, PassengerState>;
}

export interface ServiceCartState {
  stock: Record<ServiceNeed, number>;
  capacity: Record<ServiceNeed, number>;
  nextItemSerial: number;
}

export interface CabinState {
  width: number;
  length: number;
  players: Record<string, PlayerState>;
  objects: Record<string, CabinObject>;
  collisionCount: number;
  lastImpulse: number;
}

/**
 * The ocean under a hull that never translates.
 *
 * `drift` is how far the water has slid beneath the ship, in metres on the
 * world XZ plane, and `swell` scales the whole wave table for the sea state.
 */
export interface SeaState {
  drift: Vec2;
  swell: number;
}

/** Hull attitude fitted to the sea surface. Angles in radians, heave in metres. */
export interface HullMotion {
  pitch: number;
  roll: number;
  heave: number;
}

export interface VoyageState {
  phase: VoyagePhase;
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
  /** The water the ship is on. Kept separate from the attitude fields above. */
  sea: SeaState;
  /**
   * Hull attitude derived from `sea`. Distinct from `pitch`/`roll`, which are
   * still the commanded attitude the helm asks for.
   */
  hull: HullMotion;
  warning?: string;
}

export interface FireState {
  id: 'fire-galley';
  name: string;
  position: Vec2;
  radius: number;
  status: FireStatus;
  intensity: number;
}

export interface RepairState {
  id: 'repair-galley-breaker';
  name: string;
  position: Vec2;
  radius: number;
  status: RepairStatus;
  progress: number;
  pressure: number;
  penaltyElapsed: number;
  activeCaption: string;
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
  type: 'system' | 'physics' | 'network' | 'interaction' | 'voyage' | 'service' | 'emergency';
  message: string;
}

export interface MissionState {
  seed: number;
  tick: number;
  hostId: string;
  voyage: VoyageState;
  cabin: CabinState;
  service: ServiceMissionState;
  fire: FireState;
  repair: RepairState;
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
  repair: false,
  throwItem: false,
  helm: { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: false },
});

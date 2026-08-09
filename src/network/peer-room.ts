import { Peer, type DataConnection, type PeerOptions } from 'peerjs';
import { z } from 'zod';
import { ambientActivitySchema } from '../data/ambient-crowd';
import { navigationIncidentStateSchema } from '../sim/navigation-incident';
import { emptyCommand, type MissionState, type PlayerCommand } from '../sim/types';

export const protocolVersion = 3 as const;
const roomPrefix = 'cabin-mayhem-';
const snapshotIntervalMs = 1000 / 15;
const commandIntervalMs = 1000 / 30;
const staleCommandMs = 300;
const reconnectDelayMs = 750;
const roomCodeSchema = z.string().regex(/^[A-Z2-9]{8}$/);
const epochSchema = z.number().int().positive();

const finite = z.number().finite();
const unit = finite.min(-1).max(1);
const vec2Schema = z.object({ x: unit, y: unit }).strict();
const snapshotPointSchema = z
  .object({
    x: finite.min(-1000).max(1000),
    y: finite.min(-1000).max(1000),
  })
  .strict();
const cabinObjectSchema = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(128),
    kind: z.enum([
      'cart',
      'light-case',
      'heavy-crate',
      'toolbox',
      'supply-bin',
      'drink',
      'meal-tray',
      'medkit',
      'extinguisher',
    ]),
    material: z.enum(['metal', 'plastic', 'cargo']),
    compartmentId: z.string().min(1).max(128),
    position: snapshotPointSchema,
    velocity: snapshotPointSchema,
    radius: finite.positive().max(3),
    mass: finite.positive().max(250),
    friction: finite.min(0).max(1),
    impactTolerance: finite.positive().max(1000),
    secured: z.boolean(),
    anchor: snapshotPointSchema.optional(),
    ownerId: z.string().min(1).max(128).optional(),
    damage: finite.min(0).max(1),
    serviceNeed: z.enum(['drink', 'meal', 'medical']).optional(),
  })
  .strict();

const ambientResidentSchema = z
  .object({
    id: z.string().regex(/^guest-\d{3}$/),
    name: z.string().min(1).max(64),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    compartmentId: z.enum([
      'atrium',
      'main-galley',
      'dining-room',
      'cabin-deck-four',
      'promenade',
      'cabin-deck-seven',
      'pool-deck',
      'sun-deck',
    ]),
    activity: ambientActivitySchema,
    homeActivity: ambientActivitySchema.exclude(['evacuating']),
    position: snapshotPointSchema,
    route: z.tuple([snapshotPointSchema, snapshotPointSchema]),
    routeIndex: z.union([z.literal(0), z.literal(1)]),
    facing: vec2Schema,
    moving: z.boolean(),
    phase: finite.min(0).max(1),
  })
  .strict();

const ambientCrowdStateSchema = z
  .object({
    elapsed: finite.nonnegative(),
    residents: z.record(ambientResidentSchema),
    evacuating: z.boolean(),
  })
  .strict();

const missionStateSchema = z
  .object({
    seed: finite,
    tick: z.number().int().nonnegative(),
    hostId: z.string().min(1).max(128),
    voyage: z.object({}).passthrough(),
    cabin: z
      .object({
        players: z.record(z.object({}).passthrough()),
        objects: z.record(cabinObjectSchema),
      })
      .passthrough(),
    service: z.object({}).passthrough(),
    fire: z.object({}).passthrough(),
    repair: z.object({}).passthrough(),
    navigation: navigationIncidentStateSchema,
    invasion: z.object({}).passthrough(),
    crowd: ambientCrowdStateSchema,
    network: z.object({}).passthrough(),
    networkMetrics: z.object({}).passthrough(),
    events: z.array(z.object({}).passthrough()),
  })
  .passthrough();
const commandSchema = z
  .object({
    move: vec2Schema,
    look: vec2Schema,
    sprint: z.boolean(),
    crouch: z.boolean(),
    brace: z.boolean(),
    interact: z.boolean(),
    repair: z.boolean(),
    interactionTargetId: z.string().max(128).nullable().optional(),
    selectServiceNeed: z.enum(['drink', 'meal', 'medical']).optional(),
    throwItem: z.boolean(),
    helm: z
      .object({
        rudder: unit,
        telegraph: unit,
        emergencyStop: z.boolean(),
      })
      .strict(),
    boardingAction: z
      .object({
        kind: z.enum(['detach-boarding-board', 'release-gangway']),
        targetId: z.enum(['port-boarding-board', 'starboard-gangway']),
      })
      .strict()
      .optional(),
  })
  .strict();

const commandPacketSchema = z
  .object({
    version: z.literal(protocolVersion),
    type: z.literal('command'),
    roomCode: roomCodeSchema,
    epoch: epochSchema,
    clientId: z.literal('crew-bravo'),
    sequence: z.number().int().nonnegative(),
    sentAt: finite,
    command: commandSchema,
  })
  .strict();

const snapshotPacketSchema = z
  .object({
    version: z.literal(protocolVersion),
    type: z.literal('snapshot'),
    roomCode: roomCodeSchema,
    epoch: epochSchema,
    sequence: z.number().int().nonnegative(),
    sentAt: finite,
    acknowledgedCommand: z.number().int().min(-1),
    stateHash: z.string().regex(/^[0-9a-f]{8}$/),
    state: z.custom<MissionState>(isMissionState),
  })
  .strict()
  .superRefine((packet, context) => {
    if (missionStateHash(packet.state) !== packet.stateHash)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stateHash'],
        message: 'does not match authoritative state',
      });
  });

const welcomePacketSchema = z
  .object({
    version: z.literal(protocolVersion),
    type: z.literal('welcome'),
    roomCode: roomCodeSchema,
    epoch: epochSchema,
    clientId: z.literal('crew-bravo'),
    hostId: z.literal('crew-alpha'),
  })
  .strict();

export type CommandPacket = z.infer<typeof commandPacketSchema>;
export type SnapshotPacket = z.infer<typeof snapshotPacketSchema>;
export type WelcomePacket = z.infer<typeof welcomePacketSchema>;
export type RoomRole = 'solo' | 'host' | 'guest';
export type RoomPhase =
  'idle' | 'opening' | 'waiting' | 'connecting' | 'connected' | 'closed' | 'error';

export interface RoomStatus {
  role: RoomRole;
  phase: RoomPhase;
  roomCode: string;
  message: string;
  latencyMs: number;
  bytesSent: number;
  bytesReceived: number;
  remoteTick: number;
  stateHash: string;
}

type StatusListener = (status: RoomStatus) => void;

export type PacketParseErrorKind = 'invalid' | 'incompatible-version';

export interface PacketParseError {
  kind: PacketParseErrorKind;
  message: string;
  expectedVersion: number;
  receivedVersion?: unknown;
  issues?: string[];
}

export interface PacketParseResult<T> {
  packet?: T;
  error?: PacketParseError;
}

function parsePacket<T>(
  schema: z.ZodType<T>,
  value: unknown,
  label: 'command' | 'snapshot' | 'welcome',
): PacketParseResult<T> {
  const receivedVersion =
    value !== null && typeof value === 'object' && 'version' in value
      ? (value as { version?: unknown }).version
      : undefined;
  if (receivedVersion !== undefined && receivedVersion !== protocolVersion)
    return {
      error: {
        kind: 'incompatible-version',
        message: `Incompatible protocol version for ${label}: expected ${protocolVersion}, received ${String(receivedVersion)}`,
        expectedVersion: protocolVersion,
        receivedVersion,
      },
    };
  const result = schema.safeParse(value);
  return result.success
    ? { packet: result.data }
    : {
        error: {
          kind: 'invalid',
          message: `Invalid ${label} packet`,
          expectedVersion: protocolVersion,
          receivedVersion,
          issues: result.error.issues.map((issue) =>
            `${issue.path.join('.')} ${issue.message}`.trim(),
          ),
        },
      };
}

export function parseCommandPacketResult(value: unknown): PacketParseResult<CommandPacket> {
  return parsePacket(commandPacketSchema, value, 'command');
}

export function parseSnapshotPacketResult(value: unknown): PacketParseResult<SnapshotPacket> {
  return parsePacket(snapshotPacketSchema, value, 'snapshot');
}

export function parseWelcomePacketResult(value: unknown): PacketParseResult<WelcomePacket> {
  return parsePacket(welcomePacketSchema, value, 'welcome');
}

export function parseCommandPacket(value: unknown): CommandPacket | undefined {
  return parseCommandPacketResult(value).packet;
}

export function parseSnapshotPacket(value: unknown): SnapshotPacket | undefined {
  return parseSnapshotPacketResult(value).packet;
}

export function parseWelcomePacket(value: unknown): WelcomePacket | undefined {
  return parseWelcomePacketResult(value).packet;
}

export function normalizeRoomCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

export function createRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const random = new Uint8Array(8);
  crypto.getRandomValues(random);
  return Array.from(random, (value) => alphabet[value % alphabet.length]).join('');
}

function createEpoch(): number {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return Math.max(1, random[0] ?? 1);
}

export function missionStateHash(state: MissionState): string {
  const serialized = JSON.stringify(state);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export class PeerRoom {
  private peer?: Peer;
  private connection?: DataConnection;
  private listener?: StatusListener;
  private latestState?: MissionState;
  private latestRemote = emptyCommand();
  private lastRemoteAt = 0;
  private lastCommandSentAt = -Infinity;
  private lastSnapshotSentAt = -Infinity;
  private commandSequence = 0;
  private snapshotSequence = 0;
  private receivedCommandSequence = -1;
  private receivedSnapshotSequence = -1;
  private roomEpoch = 0;
  private guestRoomCode = '';
  private guestWasConnected = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private statusValue: RoomStatus = {
    role: 'solo',
    phase: 'idle',
    roomCode: '',
    message: 'Solo cabin',
    latencyMs: 0,
    bytesSent: 0,
    bytesReceived: 0,
    remoteTick: 0,
    stateHash: '',
  };

  public status(): RoomStatus {
    return { ...this.statusValue };
  }

  public onStatus(listener: StatusListener): () => void {
    this.listener = listener;
    listener(this.status());
    return () => {
      if (this.listener === listener) this.listener = undefined;
    };
  }

  public host(): Promise<string> {
    this.close();
    const roomCode = createRoomCode();
    this.roomEpoch = createEpoch();
    this.setStatus({
      role: 'host',
      phase: 'opening',
      roomCode,
      message: 'Opening room...',
    });
    const peer = new Peer(`${roomPrefix}${roomCode.toLowerCase()}`, peerOptions());
    this.peer = peer;

    return new Promise((resolve, reject) => {
      let settled = false;
      peer.on('open', () => {
        settled = true;
        this.setStatus({ phase: 'waiting', message: 'Room open. Share code.' });
        resolve(roomCode);
      });
      peer.on('connection', (connection) => this.acceptGuest(connection));
      peer.on('disconnected', () => this.handleSignalingDisconnect(peer));
      peer.on('error', (error) => {
        this.fail(friendlyPeerError(error));
        if (!settled) reject(error);
      });
    });
  }

  public join(roomCodeInput: string): Promise<void> {
    this.close();
    const roomCode = normalizeRoomCode(roomCodeInput);
    if (roomCode.length !== 8)
      return Promise.reject(new Error('Room code must contain 8 characters.'));
    this.guestRoomCode = roomCode;
    this.setStatus({
      role: 'guest',
      phase: 'opening',
      roomCode,
      message: 'Contacting flight host...',
    });
    const peer = new Peer(peerOptions());
    this.peer = peer;

    return new Promise((resolve, reject) => {
      let settled = false;
      peer.on('open', () => {
        this.connectToHost(
          peer,
          roomCode,
          () => {
            if (settled) return;
            settled = true;
            resolve();
          },
          (error) => {
            if (settled) return;
            settled = true;
            reject(error);
          },
        );
      });
      peer.on('disconnected', () => this.handleSignalingDisconnect(peer));
      peer.on('error', (error) => {
        this.fail(friendlyPeerError(error));
        if (!settled) reject(error);
      });
    });
  }

  public sendCommand(command: PlayerCommand, nowMs: number): void {
    if (
      this.statusValue.role !== 'guest' ||
      this.statusValue.phase !== 'connected' ||
      !this.connection?.open ||
      nowMs - this.lastCommandSentAt < commandIntervalMs
    )
      return;
    this.lastCommandSentAt = nowMs;
    const packet: CommandPacket = {
      version: protocolVersion,
      type: 'command',
      roomCode: this.statusValue.roomCode,
      epoch: this.roomEpoch,
      clientId: 'crew-bravo',
      sequence: this.commandSequence,
      sentAt: Date.now(),
      command: structuredClone(command),
    };
    this.commandSequence += 1;
    this.sendPacket(packet);
    this.addBytes('sent', packet);
  }

  public sendSnapshot(state: MissionState, nowMs: number): void {
    if (
      this.statusValue.role !== 'host' ||
      this.statusValue.phase !== 'connected' ||
      !this.connection?.open ||
      nowMs - this.lastSnapshotSentAt < snapshotIntervalMs
    )
      return;
    this.lastSnapshotSentAt = nowMs;
    const stateHash = missionStateHash(state);
    const packet: SnapshotPacket = {
      version: protocolVersion,
      type: 'snapshot',
      roomCode: this.statusValue.roomCode,
      epoch: this.roomEpoch,
      sequence: this.snapshotSequence,
      sentAt: Date.now(),
      acknowledgedCommand: this.receivedCommandSequence,
      stateHash,
      state,
    };
    this.snapshotSequence += 1;
    this.sendPacket(packet);
    this.addBytes('sent', packet);
    this.setStatus({ remoteTick: state.tick, stateHash });
  }

  public remoteCommand(nowMs = Date.now()): PlayerCommand {
    if (nowMs - this.lastRemoteAt > staleCommandMs) return emptyCommand();
    return structuredClone(this.latestRemote);
  }

  public snapshot(): MissionState | undefined {
    return this.latestState;
  }

  public close(): void {
    const connection = this.connection;
    const peer = this.peer;
    this.guestRoomCode = '';
    this.guestWasConnected = false;
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.connection = undefined;
    this.peer = undefined;
    connection?.close();
    peer?.destroy();
    this.latestState = undefined;
    this.latestRemote = emptyCommand();
    this.lastRemoteAt = 0;
    this.lastCommandSentAt = -Infinity;
    this.lastSnapshotSentAt = -Infinity;
    this.commandSequence = 0;
    this.snapshotSequence = 0;
    this.receivedCommandSequence = -1;
    this.receivedSnapshotSequence = -1;
    this.roomEpoch = 0;
    this.statusValue = {
      role: 'solo',
      phase: 'idle',
      roomCode: '',
      message: 'Solo cabin',
      latencyMs: 0,
      bytesSent: 0,
      bytesReceived: 0,
      remoteTick: 0,
      stateHash: '',
    };
    this.listener?.(this.status());
  }

  private acceptGuest(connection: DataConnection): void {
    const metadata = connection.metadata as
      { protocol?: unknown; role?: unknown; roomCode?: unknown } | undefined;
    if (
      metadata?.protocol !== protocolVersion ||
      metadata.role !== 'crew-bravo' ||
      metadata.roomCode !== this.statusValue.roomCode ||
      this.connection !== undefined
    ) {
      connection.close();
      return;
    }
    this.connection = connection;
    connection.on('open', () => {
      if (this.connection !== connection) return;
      const welcome: WelcomePacket = {
        version: protocolVersion,
        type: 'welcome',
        roomCode: this.statusValue.roomCode,
        epoch: this.roomEpoch,
        clientId: 'crew-bravo',
        hostId: 'crew-alpha',
      };
      this.sendPacket(welcome);
      this.addBytes('sent', welcome);
      this.setStatus({ phase: 'connected', message: 'Crew Bravo aboard.' });
    });
    connection.on('data', (data) => this.receiveCommand(data));
    connection.on('close', () => {
      if (this.connection !== connection) return;
      this.connection = undefined;
      this.latestRemote = emptyCommand();
      this.receivedCommandSequence = -1;
      this.lastRemoteAt = 0;
      this.setStatus({ phase: 'waiting', message: 'Guest left. Room still open.' });
    });
    connection.on('error', (error) => this.fail(`Guest connection failed: ${error.message}`));
  }

  private connectToHost(
    peer: Peer,
    roomCode: string,
    onWelcome?: () => void,
    onInitialFailure?: (error: Error) => void,
  ): void {
    if (this.peer !== peer || peer.destroyed || this.guestRoomCode !== roomCode) return;
    this.setStatus({
      phase: 'connecting',
      message: this.guestWasConnected ? 'Rejoining cabin...' : 'Joining cabin...',
    });
    const connection = peer.connect(`${roomPrefix}${roomCode.toLowerCase()}`, {
      label: 'cabin-mayhem-v2',
      metadata: { protocol: protocolVersion, role: 'crew-bravo', roomCode },
      reliable: true,
      serialization: 'json',
    });
    this.connection = connection;
    connection.on('open', () => {
      if (this.connection === connection)
        this.setStatus({ phase: 'connecting', message: 'Waiting for host handshake...' });
    });
    connection.on('data', (data) => {
      if (this.connection !== connection || !this.receiveHostPacket(data)) return;
      if (this.statusValue.phase === 'connected') {
        this.guestWasConnected = true;
        onWelcome?.();
      }
    });
    connection.on('close', () => {
      if (this.connection !== connection) return;
      this.connection = undefined;
      if (this.guestWasConnected && this.guestRoomCode === roomCode && this.peer === peer) {
        this.scheduleGuestReconnect(peer, roomCode);
        return;
      }
      this.setStatus({ phase: 'closed', message: 'Host left room.' });
      onInitialFailure?.(new Error('Host closed before handshake.'));
    });
    connection.on('error', (error) => {
      if (!this.guestWasConnected) {
        this.fail(`Connection failed: ${error.message}`);
        onInitialFailure?.(error);
      }
    });
  }

  private scheduleGuestReconnect(peer: Peer, roomCode: string): void {
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.setStatus({ phase: 'connecting', message: 'Connection lost. Rejoining...' });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.peer !== peer || peer.destroyed || this.guestRoomCode !== roomCode) return;
      if (peer.disconnected) {
        try {
          peer.reconnect();
        } catch (error) {
          this.fail(error instanceof Error ? error.message : 'Signaling reconnect failed.');
          return;
        }
      }
      this.connectToHost(peer, roomCode);
    }, reconnectDelayMs);
  }

  private handleSignalingDisconnect(peer: Peer): void {
    if (this.peer !== peer || peer.destroyed) return;
    try {
      peer.reconnect();
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Signaling reconnect failed.');
      return;
    }
    if (this.connection?.open)
      this.setStatus({ phase: 'connected', message: 'Crew linked. Restoring signaling...' });
    else this.setStatus({ phase: 'connecting', message: 'Restoring signaling...' });
  }

  private receiveCommand(value: unknown): void {
    const parsed = parseCommandPacketResult(value);
    if (parsed.error?.kind === 'incompatible-version') {
      this.fail(parsed.error.message);
      return;
    }
    const packet = parsed.packet;
    if (
      !packet ||
      packet.roomCode !== this.statusValue.roomCode ||
      packet.epoch !== this.roomEpoch ||
      packet.clientId !== 'crew-bravo' ||
      packet.sequence <= this.receivedCommandSequence
    )
      return;
    this.receivedCommandSequence = packet.sequence;
    this.latestRemote = packet.command;
    this.lastRemoteAt = Date.now();
    this.setStatus({ latencyMs: Math.max(0, Date.now() - packet.sentAt) });
    this.addBytes('received', packet);
  }

  private receiveHostPacket(value: unknown): boolean {
    const packetType =
      value !== null && typeof value === 'object' && 'type' in value
        ? (value as { type?: unknown }).type
        : undefined;
    if (packetType === 'welcome') {
      const welcomeResult = parseWelcomePacketResult(value);
      if (welcomeResult.error?.kind === 'incompatible-version') {
        this.fail(welcomeResult.error.message);
        return false;
      }
      const welcome = welcomeResult.packet;
      if (!welcome) return false;
      if (welcome.roomCode !== this.statusValue.roomCode) return false;
      this.roomEpoch = welcome.epoch;
      this.setStatus({ phase: 'connected', message: 'Joined as Crew Bravo.' });
      this.addBytes('received', welcome);
      return true;
    }
    if (packetType !== 'snapshot') return false;
    const snapshotResult = parseSnapshotPacketResult(value);
    if (snapshotResult.error?.kind === 'incompatible-version') {
      this.fail(snapshotResult.error.message);
      return false;
    }
    const packet = snapshotResult.packet;
    if (
      !packet ||
      packet.roomCode !== this.statusValue.roomCode ||
      packet.epoch !== this.roomEpoch ||
      packet.sequence <= this.receivedSnapshotSequence
    )
      return false;
    this.receivedSnapshotSequence = packet.sequence;
    this.latestState = packet.state;
    this.setStatus({
      latencyMs: Math.max(0, Date.now() - packet.sentAt),
      remoteTick: packet.state.tick,
      stateHash: packet.stateHash,
    });
    this.addBytes('received', packet);
    return true;
  }

  private sendPacket(value: CommandPacket | SnapshotPacket | WelcomePacket): void {
    if (!this.connection?.open) return;
    try {
      const result = this.connection.send(value);
      if (result instanceof Promise)
        void result.catch((error: unknown) =>
          this.fail(error instanceof Error ? error.message : 'Data channel send failed.'),
        );
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Data channel send failed.');
    }
  }

  private addBytes(direction: 'sent' | 'received', value: unknown): void {
    const bytes = JSON.stringify(value).length;
    this.setStatus(
      direction === 'sent'
        ? { bytesSent: this.statusValue.bytesSent + bytes }
        : { bytesReceived: this.statusValue.bytesReceived + bytes },
    );
  }

  private fail(message: string): void {
    this.setStatus({ phase: 'error', message });
  }

  private setStatus(next: Partial<RoomStatus>): void {
    this.statusValue = { ...this.statusValue, ...next };
    this.listener?.(this.status());
  }
}

function isMissionState(value: unknown): value is MissionState {
  return missionStateSchema.safeParse(value).success;
}

export function missionStateValidationIssues(value: unknown): string[] {
  const result = missionStateSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`.trim());
}

function peerOptions(): PeerOptions {
  const env = import.meta.env as Record<string, string | undefined>;
  const iceServers: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];
  if (env.VITE_TURN_URL && env.VITE_TURN_USERNAME && env.VITE_TURN_CREDENTIAL)
    iceServers.push({
      urls: env.VITE_TURN_URL,
      username: env.VITE_TURN_USERNAME,
      credential: env.VITE_TURN_CREDENTIAL,
    });
  const options: PeerOptions = { config: { iceServers }, debug: 1 };
  if (env.VITE_PEER_HOST) options.host = env.VITE_PEER_HOST;
  if (env.VITE_PEER_PORT) options.port = Number(env.VITE_PEER_PORT);
  if (env.VITE_PEER_PATH) options.path = env.VITE_PEER_PATH;
  if (env.VITE_PEER_SECURE) options.secure = env.VITE_PEER_SECURE !== 'false';
  return options;
}

function friendlyPeerError(error: Error & { type?: string }): string {
  if (error.type === 'peer-unavailable') return 'Room not found. Check code.';
  if (error.type === 'unavailable-id') return 'Room code collision. Try hosting again.';
  if (error.type === 'network') return 'Signaling unavailable. Check internet.';
  return `Multiplayer error: ${error.message}`;
}

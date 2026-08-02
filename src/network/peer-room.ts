import { Peer, type DataConnection, type PeerOptions } from 'peerjs';
import { z } from 'zod';
import { emptyCommand, type MissionState, type PlayerCommand } from '../sim/types';

const protocolVersion = 1 as const;
const roomPrefix = 'cabin-mayhem-';
const snapshotIntervalMs = 1000 / 15;
const commandIntervalMs = 1000 / 30;
const staleCommandMs = 300;
const roomCodeSchema = z.string().regex(/^[A-Z2-9]{8}$/);
const epochSchema = z.number().int().positive();

const finite = z.number().finite();
const unit = finite.min(-1).max(1);
const vec2Schema = z.object({ x: unit, y: unit }).strict();
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
    pilot: z
      .object({
        pitch: unit,
        roll: unit,
        yaw: unit,
        throttle: finite.min(0).max(1),
        brake: z.boolean(),
      })
      .strict(),
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
    stateHash: z.string().length(8),
    state: z.custom<MissionState>(isMissionState),
  })
  .strict();

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

export function parseCommandPacket(value: unknown): CommandPacket | undefined {
  const result = commandPacketSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function parseSnapshotPacket(value: unknown): SnapshotPacket | undefined {
  const result = snapshotPacketSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function parseWelcomePacket(value: unknown): WelcomePacket | undefined {
  const result = welcomePacketSchema.safeParse(value);
  return result.success ? result.data : undefined;
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
      peer.on('disconnected', () => this.setStatus({ phase: 'error', message: 'Signaling lost.' }));
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
        this.setStatus({ phase: 'connecting', message: 'Joining cabin...' });
        const connection = peer.connect(`${roomPrefix}${roomCode.toLowerCase()}`, {
          label: 'cabin-mayhem-v1',
          metadata: { protocol: protocolVersion, role: 'crew-bravo', roomCode },
          reliable: true,
          serialization: 'json',
        });
        this.connection = connection;
        connection.on('open', () => {
          this.setStatus({ phase: 'connecting', message: 'Waiting for host handshake...' });
        });
        connection.on('data', (data) => {
          if (!this.receiveHostPacket(data) || settled) return;
          settled = true;
          resolve();
        });
        connection.on('close', () => {
          if (this.connection !== connection) return;
          this.connection = undefined;
          this.setStatus({ phase: 'closed', message: 'Host left room.' });
          if (!settled) reject(new Error('Host closed before handshake.'));
        });
        connection.on('error', (error) => {
          this.fail(`Connection failed: ${error.message}`);
          if (!settled) reject(error);
        });
      });
      peer.on('disconnected', () => this.setStatus({ phase: 'error', message: 'Signaling lost.' }));
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
      (this.connection && this.connection.open)
    ) {
      connection.close();
      return;
    }
    this.connection = connection;
    connection.on('open', () => {
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

  private receiveCommand(value: unknown): void {
    const packet = parseCommandPacket(value);
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
    const welcome = parseWelcomePacket(value);
    if (welcome) {
      if (welcome.roomCode !== this.statusValue.roomCode) return false;
      this.roomEpoch = welcome.epoch;
      this.setStatus({ phase: 'connected', message: 'Joined as Crew Bravo.' });
      this.addBytes('received', welcome);
      return true;
    }
    const packet = parseSnapshotPacket(value);
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
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<MissionState>;
  return (
    Number.isInteger(state.tick) &&
    typeof state.hostId === 'string' &&
    typeof state.flight === 'object' &&
    typeof state.cabin === 'object' &&
    typeof state.service === 'object' &&
    typeof state.fire === 'object' &&
    typeof state.repair === 'object' &&
    Array.isArray(state.events)
  );
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

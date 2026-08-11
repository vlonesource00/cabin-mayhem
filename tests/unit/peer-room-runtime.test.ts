import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeConnectionShape {
  metadata?: unknown;
  open: boolean;
  sent: unknown[];
  closed: boolean;
  sendBehavior?: (value: unknown) => void | Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  send(value: unknown): void | Promise<void>;
  close(): void;
}

interface FakePeerShape {
  destroyed: boolean;
  disconnected: boolean;
  connections: FakeConnectionShape[];
  reconnectCalls: number;
  on(event: string, listener: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  connect(id: string, options: { metadata?: unknown }): FakeConnectionShape;
}

const peerInstances = vi.hoisted(() => [] as FakePeerShape[]);

vi.mock('peerjs', () => {
  class FakeConnection implements FakeConnectionShape {
    public metadata?: unknown;
    public open = false;
    public sent: unknown[] = [];
    public closed = false;
    public sendBehavior?: (value: unknown) => void | Promise<void>;
    private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

    public constructor(metadata?: unknown) {
      this.metadata = metadata;
    }

    public on(event: string, listener: (...args: unknown[]) => void): void {
      const current = this.listeners.get(event) ?? [];
      current.push(listener);
      this.listeners.set(event, current);
    }

    public emit(event: string, ...args: unknown[]): void {
      for (const listener of this.listeners.get(event) ?? []) listener(...args);
    }

    public send(value: unknown): void | Promise<void> {
      if (this.sendBehavior) return this.sendBehavior(value);
      this.sent.push(structuredClone(value));
    }

    public close(): void {
      this.open = false;
      this.closed = true;
      this.emit('close');
    }
  }

  class FakePeer implements FakePeerShape {
    public destroyed = false;
    public disconnected = false;
    public connections: FakeConnection[] = [];
    public reconnectCalls = 0;
    private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

    public constructor(_idOrOptions?: unknown, _options?: unknown) {
      void _idOrOptions;
      void _options;
      peerInstances.push(this);
    }

    public on(event: string, listener: (...args: unknown[]) => void): void {
      const current = this.listeners.get(event) ?? [];
      current.push(listener);
      this.listeners.set(event, current);
    }

    public emit(event: string, ...args: unknown[]): void {
      for (const listener of this.listeners.get(event) ?? []) listener(...args);
    }

    public connect(_id: string, options: { metadata?: unknown }): FakeConnection {
      const connection = new FakeConnection(options.metadata);
      this.connections.push(connection);
      return connection;
    }

    public reconnect(): void {
      this.reconnectCalls += 1;
      this.disconnected = false;
    }

    public destroy(): void {
      this.destroyed = true;
    }
  }

  return { Peer: FakePeer };
});

import {
  createSnapshotDeltaState,
  missionStateHash,
  parseCommandPacketResult,
  PeerRoom,
  protocolVersion,
  type WelcomePacket,
} from '../../src/network/peer-room';
import { HostSession } from '../../src/sim/host-session';
import { emptyCommand } from '../../src/sim/types';

function welcome(roomCode: string, epoch = 41): WelcomePacket {
  return {
    version: protocolVersion,
    type: 'welcome',
    roomCode,
    epoch,
    clientId: 'crew-bravo',
    hostId: 'crew-alpha',
  };
}

describe('PeerRoom connection lifecycle', () => {
  beforeEach(() => {
    peerInstances.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('automatically rejoins after a guest data channel drops and keeps command sequences fresh', async () => {
    const room = new PeerRoom();
    const joined = room.join('ABCD2345');
    const peer = peerInstances[0]!;
    peer.emit('open', 'guest-peer');
    const first = peer.connections[0]!;
    first.open = true;
    first.emit('open');
    first.emit('data', welcome('ABCD2345'));
    await joined;

    room.sendCommand(emptyCommand(), 0);
    expect((first.sent[0] as { sequence: number }).sequence).toBe(0);
    first.open = false;
    first.emit('close');
    expect(room.status()).toMatchObject({
      phase: 'connecting',
      message: 'Connection lost. Rejoining...',
    });

    await vi.advanceTimersByTimeAsync(750);
    const second = peer.connections[1]!;
    second.open = true;
    second.emit('open');
    second.emit('data', welcome('ABCD2345'));
    expect(room.status()).toMatchObject({ phase: 'connected', message: 'Joined as Crew Bravo.' });

    room.sendCommand(emptyCommand(), 100);
    expect((second.sent[0] as { sequence: number }).sequence).toBe(1);
  });

  it('keeps an established data channel usable while PeerJS restores signaling', async () => {
    const room = new PeerRoom();
    const joined = room.join('ABCD2345');
    const peer = peerInstances[0]!;
    peer.emit('open', 'guest-peer');
    const connection = peer.connections[0]!;
    connection.open = true;
    connection.emit('open');
    connection.emit('data', welcome('ABCD2345'));
    await joined;

    peer.disconnected = true;
    peer.emit('disconnected', 'guest-peer');
    expect(peer.reconnectCalls).toBe(1);
    expect(room.status()).toMatchObject({ phase: 'connected' });
    room.sendCommand(emptyCommand(), 0);
    expect(connection.sent).toHaveLength(1);
  });

  it('does not count a command packet when queueing throws', async () => {
    const room = new PeerRoom();
    const joined = room.join('ABCD2345');
    const peer = peerInstances[0]!;
    peer.emit('open', 'guest-peer');
    const connection = peer.connections[0]!;
    connection.open = true;
    connection.emit('open');
    connection.emit('data', welcome('ABCD2345'));
    await joined;
    connection.sendBehavior = () => {
      throw new Error('command queue failed');
    };

    room.sendCommand(emptyCommand(), 0);

    expect(room.status()).toMatchObject({ phase: 'error', bytesSent: 0 });
    expect(connection.sent).toHaveLength(0);
  });

  it('reserves a host slot while the first valid guest is still handshaking', async () => {
    const room = new PeerRoom();
    const hosting = room.host();
    const peer = peerInstances[0]!;
    peer.emit('open', 'cabin-mayhem-abcd2345');
    const roomCode = await hosting;
    const metadata = { protocol: protocolVersion, role: 'crew-bravo', roomCode };
    // Obtain mock connections from the public factory so the test stays aligned with PeerJS options.
    const accepted = peer.connect('ignored', { metadata });
    const rejected = peer.connect('ignored', { metadata });
    peer.emit('connection', accepted);
    peer.emit('connection', rejected);
    expect(rejected.closed).toBe(true);

    accepted.open = true;
    accepted.emit('open');
    expect((accepted.sent[0] as { type: string }).type).toBe('welcome');
    expect(room.status().phase).toBe('connected');
  });

  it('does not connect or count bytes when the welcome send throws synchronously', async () => {
    const room = new PeerRoom();
    const hosting = room.host();
    const peer = peerInstances[0]!;
    peer.emit('open', 'cabin-mayhem-abcd2345');
    const roomCode = await hosting;
    const connection = peer.connect('ignored', {
      metadata: { protocol: protocolVersion, role: 'crew-bravo', roomCode },
    });
    connection.sendBehavior = () => {
      throw new Error('welcome queue failed');
    };

    peer.emit('connection', connection);
    connection.open = true;
    connection.emit('open');

    expect(connection.closed).toBe(true);
    expect(room.status()).toMatchObject({ phase: 'error', bytesSent: 0 });
  });

  it('retries a full baseline without false telemetry after an async snapshot rejection', async () => {
    const room = new PeerRoom();
    const hosting = room.host();
    const peer = peerInstances[0]!;
    peer.emit('open', 'cabin-mayhem-abcd2345');
    const roomCode = await hosting;
    const connection = peer.connect('ignored', {
      metadata: { protocol: protocolVersion, role: 'crew-bravo', roomCode },
    });
    peer.emit('connection', connection);
    connection.open = true;
    connection.emit('open');
    const welcomeBytes = room.status().bytesSent;

    connection.sendBehavior = () => Promise.reject(new Error('snapshot delivery failed'));
    room.sendSnapshot(new HostSession(99).snapshot(), 0);
    await Promise.resolve();
    await Promise.resolve();

    expect(room.status()).toMatchObject({
      phase: 'connected',
      bytesSent: welcomeBytes,
      snapshotPacketsSent: 0,
      snapshotBytesSent: 0,
      snapshotMode: 'none',
    });

    connection.sendBehavior = undefined;
    room.sendSnapshot(new HostSession(100).snapshot(), 101);

    expect(connection.sent).toHaveLength(2);
    expect(connection.sent[1]).toMatchObject({ type: 'snapshot', sequence: 1 });
    expect(room.status().snapshotPacketsSent).toBe(1);
    expect(room.status().snapshotBytesSent).toBeGreaterThan(0);
  });

  it('applies one full snapshot then reduced deltas with sequence telemetry', async () => {
    const room = new PeerRoom();
    const joined = room.join('ABCD2345');
    const peer = peerInstances[0]!;
    peer.emit('open', 'guest-peer');
    const connection = peer.connections[0]!;
    connection.open = true;
    connection.emit('open');
    connection.emit('data', welcome('ABCD2345'));
    await joined;

    const session = new HostSession(98);
    const baseline = session.snapshot();
    connection.emit('data', {
      version: protocolVersion,
      type: 'snapshot',
      roomCode: 'ABCD2345',
      epoch: 41,
      sequence: 0,
      sentAt: Date.now(),
      acknowledgedCommand: -1,
      stateHash: missionStateHash(baseline),
      state: baseline,
    });

    session.step(1 / 60);
    const next = session.snapshot();
    const delta = {
      version: protocolVersion,
      type: 'snapshot-delta',
      roomCode: 'ABCD2345',
      epoch: 41,
      sequence: 2,
      sentAt: Date.now(),
      acknowledgedCommand: -1,
      stateHash: missionStateHash(next),
      state: createSnapshotDeltaState(next),
    } as const;
    connection.emit('data', delta);

    expect(room.snapshot()?.tick).toBe(next.tick);
    expect(room.status()).toMatchObject({
      snapshotDrops: 1,
      snapshotRejected: 0,
      snapshotPacketsReceived: 2,
      snapshotMode: 'delta',
    });
    expect(room.status().deltaSnapshotBytes).toBeLessThan(room.status().fullSnapshotBytes);

    connection.emit('data', { ...delta, sequence: 1 });
    expect(room.snapshot()?.tick).toBe(next.tick);
    expect(room.status().snapshotRejected).toBe(1);
  });

  it('fails cleanly on a v3 welcome before gameplay starts', () => {
    const room = new PeerRoom();
    void room.join('ABCD2345');
    const peer = peerInstances[0]!;
    peer.emit('open', 'guest-peer');
    const connection = peer.connections[0]!;
    connection.open = true;
    connection.emit('open');
    connection.emit('data', {
      version: 3,
      type: 'welcome',
      roomCode: 'ABCD2345',
      epoch: 41,
      clientId: 'crew-bravo',
      // Deliberately omit hostId: version rejection must happen before shape
      // validation and must not dereference v3-only/missing options.
    });

    expect(room.status()).toMatchObject({
      phase: 'error',
      message: 'Incompatible protocol version for welcome: expected 5, received 3',
    });
    room.close();
  });

  it('carries a guest waypoint option to the host seam for authoritative validation', async () => {
    const room = new PeerRoom();
    const joined = room.join('ABCD2345');
    const peer = peerInstances[0]!;
    peer.emit('open', 'guest-peer');
    const connection = peer.connections[0]!;
    connection.open = true;
    connection.emit('open');
    connection.emit('data', welcome('ABCD2345'));
    await joined;

    const host = new HostSession(97);
    host.setNetwork({ enabled: false });
    host.teleport('crew-bravo', 'cabin');
    for (let tick = 0; tick < 100; tick += 1) {
      const player = host.snapshot().cabin.players['crew-bravo']!;
      if (player.position.y <= 5.1 && player.position.y >= 3.5) break;
      const approach = emptyCommand();
      approach.move.y = -1;
      approach.look = { x: 0, y: 1 };
      host.submitCommand('crew-bravo', approach);
      host.step(0.05);
    }

    const guestCommand = emptyCommand();
    guestCommand.look = { x: 0, y: 1 };
    guestCommand.interact = true;
    guestCommand.interactionTargetId = 'elevator-option:grand-atrium:deck-4';
    room.sendCommand(guestCommand, 0);
    const packet = connection.sent[0];
    const parsed = parseCommandPacketResult(packet);
    expect(parsed.packet?.version).toBe(5);
    expect(parsed.packet?.command.interactionTargetId).toBe('elevator-option:grand-atrium:deck-4');
    if (!parsed.packet) throw new Error('Guest command packet failed to parse');
    host.submitCommand('crew-bravo', parsed.packet.command);
    host.step(0.05);
    expect(host.snapshot().cabin.players['crew-bravo']).toMatchObject({
      compartmentId: 'atrium',
      waypointDeck: 4,
      lastAction: 'Elevator: Gallery / Deck 4',
    });

    host.teleport('crew-bravo', 'cabin');
    host.submitCommand('crew-bravo', parsed.packet.command);
    host.step(0.05);
    expect(host.snapshot().cabin.players['crew-bravo']).toMatchObject({
      compartmentId: 'atrium',
      waypointDeck: 2,
    });
    room.close();
  });
});

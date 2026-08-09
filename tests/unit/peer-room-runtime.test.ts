import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeConnectionShape {
  metadata?: unknown;
  open: boolean;
  sent: unknown[];
  closed: boolean;
  on(event: string, listener: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  send(value: unknown): void;
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

    public send(value: unknown): void {
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

import { PeerRoom, protocolVersion, type WelcomePacket } from '../../src/network/peer-room';
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
});

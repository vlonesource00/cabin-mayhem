import { describe, expect, it } from 'vitest';
import {
  createRoomCode,
  createSnapshotDeltaState,
  missionStateHash,
  mergeSnapshotPacketResult,
  normalizeRoomCode,
  parseCommandPacketResult,
  parseCommandPacket,
  parseSnapshotPacketResult,
  parseSnapshotPacket,
  parseWelcomePacketResult,
  protocolVersion,
} from '../../src/network/peer-room';
import { HostSession } from '../../src/sim/host-session';
import { emptyCommand } from '../../src/sim/types';

describe('peer room protocol', () => {
  it('creates compact unambiguous room codes', () => {
    expect(createRoomCode()).toMatch(/^[A-Z2-9]{8}$/);
    expect(normalizeRoomCode(' ab-cd 23_45 ')).toBe('ABCD2345');
  });

  it('accepts bounded crew intent and rejects forged or invalid payloads', () => {
    const valid = {
      version: protocolVersion,
      type: 'command',
      roomCode: 'ABCD2345',
      epoch: 42,
      clientId: 'crew-bravo',
      sequence: 7,
      sentAt: 100,
      command: emptyCommand(),
    } as const;

    expect(parseCommandPacket(valid)?.sequence).toBe(7);
    expect(
      parseCommandPacket({
        ...valid,
        command: {
          ...valid.command,
          boardingAction: {
            kind: 'detach-boarding-board',
            targetId: 'port-boarding-board',
          },
        },
      })?.sequence,
    ).toBe(7);
    expect(parseCommandPacket({ ...valid, clientId: 'crew-alpha' })).toBeUndefined();
    expect(
      parseCommandPacket({
        ...valid,
        command: { ...valid.command, move: { x: Number.NaN, y: 0 } },
      }),
    ).toBeUndefined();
    expect(
      parseCommandPacket({ ...valid, command: { ...valid.command, move: { x: 9, y: 0 } } }),
    ).toBeUndefined();
    expect(parseCommandPacket({ ...valid, admin: true })).toBeUndefined();
    expect(
      parseCommandPacket({
        ...valid,
        command: {
          ...valid.command,
          boardingAction: {
            kind: 'detach-boarding-board',
            targetId: 'port-boarding-board',
            force: true,
          },
        },
      }),
    ).toBeUndefined();
  });

  it('parses the v5 waypoint option command without client-side authority', () => {
    const command = {
      version: protocolVersion,
      type: 'command',
      roomCode: 'ABCD2345',
      epoch: 42,
      clientId: 'crew-bravo',
      sequence: 8,
      sentAt: 100,
      command: {
        ...emptyCommand(),
        interact: true,
        interactionTargetId: 'elevator-option:grand-atrium:deck-4',
      },
    } as const;
    const parsed = parseCommandPacketResult(command);
    expect(parsed.error).toBeUndefined();
    expect(parsed.packet?.version).toBe(5);
    expect(parsed.packet?.command.interactionTargetId).toBe('elevator-option:grand-atrium:deck-4');
  });

  it('hashes identical authoritative snapshots equally and changed ticks differently', () => {
    const session = new HostSession(91);
    const first = session.snapshot();
    expect(missionStateHash(first)).toBe(missionStateHash(structuredClone(first)));
    session.step(1 / 60);
    expect(missionStateHash(session.snapshot())).not.toBe(missionStateHash(first));
  });

  it('validates and delivers host navigation and crowd state in a snapshot packet', () => {
    const session = new HostSession(92);
    session.trigger('collision-course');
    const state = session.snapshot();
    const packet = {
      version: protocolVersion,
      type: 'snapshot',
      roomCode: 'ABCD2345',
      epoch: 1,
      sequence: 1,
      sentAt: 100,
      acknowledgedCommand: -1,
      stateHash: missionStateHash(state),
      state,
    } as const;

    expect(parseSnapshotPacket(packet)?.state.navigation.phase).toBe('warning');
    expect(Object.keys(parseSnapshotPacket(packet)!.state.crowd.residents)).toHaveLength(78);
    expect(
      parseSnapshotPacket({ ...packet, state: { ...state, navigation: undefined } }),
    ).toBeUndefined();
    expect(
      parseSnapshotPacket({
        ...packet,
        state: {
          ...state,
          crowd: { ...state.crowd, residents: { ...state.crowd.residents, forged: {} } },
        },
      }),
    ).toBeUndefined();
  });

  it('parses, merges, hashes, and rejects malformed snapshot deltas', () => {
    const session = new HostSession(95);
    const baseline = session.snapshot();
    session.step(1 / 60);
    const next = session.snapshot();
    const fullPacket = {
      version: protocolVersion,
      type: 'snapshot',
      roomCode: 'ABCD2345',
      epoch: 1,
      sequence: 0,
      sentAt: 100,
      acknowledgedCommand: -1,
      stateHash: missionStateHash(baseline),
      state: baseline,
    } as const;
    const deltaPacket = {
      version: protocolVersion,
      type: 'snapshot-delta',
      roomCode: 'ABCD2345',
      epoch: 1,
      sequence: 1,
      sentAt: 200,
      acknowledgedCommand: -1,
      stateHash: missionStateHash(next),
      state: createSnapshotDeltaState(next),
    } as const;

    const parsed = parseSnapshotPacketResult(deltaPacket);
    expect(parsed.error).toBeUndefined();
    expect(JSON.stringify(deltaPacket).length).toBeLessThan(JSON.stringify(fullPacket).length);
    expect(mergeSnapshotPacketResult(undefined, deltaPacket).error?.message).toContain(
      'before full snapshot',
    );
    const merged = mergeSnapshotPacketResult(baseline, parsed.packet!);
    expect(merged.error).toBeUndefined();
    expect(JSON.parse(JSON.stringify(merged.packet))).toEqual(JSON.parse(JSON.stringify(next)));
    expect(missionStateHash(merged.packet!)).toBe(deltaPacket.stateHash);

    const firstResident = deltaPacket.state.crowd.residents['guest-001'];
    const forged = {
      ...deltaPacket,
      state: {
        ...deltaPacket.state,
        crowd: {
          ...deltaPacket.state.crowd,
          residents: {
            ...deltaPacket.state.crowd.residents,
            'guest-001': { ...firstResident, name: 'forged' },
          },
        },
      },
    };
    expect(parseSnapshotPacket(forged)).toBeUndefined();
    expect(
      mergeSnapshotPacketResult(baseline, {
        ...deltaPacket,
        state: createSnapshotDeltaState(next),
        stateHash: '00000000',
      }),
    ).toMatchObject({ error: { kind: 'invalid' } });
  });

  it('rejects incompatible command, welcome, and snapshot versions explicitly', () => {
    const legacyProtocolVersion = 3;
    const command = {
      version: legacyProtocolVersion,
      type: 'command',
      roomCode: 'ABCD2345',
      epoch: 1,
      clientId: 'crew-bravo',
      sequence: 0,
      sentAt: 0,
      command: emptyCommand(),
    } as const;
    const welcome = {
      version: legacyProtocolVersion,
      type: 'welcome',
      roomCode: 'ABCD2345',
      epoch: 1,
      clientId: 'crew-bravo',
      hostId: 'crew-alpha',
    } as const;
    expect(parseCommandPacketResult(command).error).toMatchObject({
      kind: 'incompatible-version',
      expectedVersion: protocolVersion,
      receivedVersion: legacyProtocolVersion,
    });
    expect(parseWelcomePacketResult(welcome).error?.message).toContain(
      'Incompatible protocol version',
    );

    const state = new HostSession(93).snapshot();
    const snapshot = {
      version: legacyProtocolVersion,
      type: 'snapshot',
      roomCode: 'ABCD2345',
      epoch: 1,
      sequence: 0,
      sentAt: 0,
      acknowledgedCommand: -1,
      stateHash: missionStateHash(state),
      state,
    } as const;
    expect(parseSnapshotPacketResult(snapshot).error?.kind).toBe('incompatible-version');
  });

  it('strictly rejects malformed navigation subtrees and out-of-bounds state', () => {
    const state = new HostSession(94).snapshot();
    const packet = {
      version: protocolVersion,
      type: 'snapshot',
      roomCode: 'ABCD2345',
      epoch: 1,
      sequence: 0,
      sentAt: 0,
      acknowledgedCommand: -1,
      stateHash: missionStateHash(state),
      state,
    } as const;
    const invalidStates = [
      { ...state, navigation: null },
      { ...state, navigation: { ...state.navigation, phase: 'bogus' } },
      { ...state, navigation: { ...state.navigation, countdown: Number.NaN } },
      {
        ...state,
        navigation: {
          ...state.navigation,
          obstacle: { ...state.navigation.obstacle, relativePosition: { x: 99, y: 0 } },
        },
      },
      {
        ...state,
        navigation: {
          ...state.navigation,
          repair: { ...state.navigation.repair, compartmentId: 'bridge' },
        },
      },
      { ...state, navigation: { ...state.navigation, extra: true } },
    ];
    for (const invalid of invalidStates)
      expect(parseSnapshotPacket({ ...packet, state: invalid })).toBeUndefined();
    expect(parseSnapshotPacket(packet)?.state.navigation.warningSeconds).toBeGreaterThanOrEqual(3);
  });
});

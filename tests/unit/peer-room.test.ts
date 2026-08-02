import { describe, expect, it } from 'vitest';
import {
  createRoomCode,
  missionStateHash,
  normalizeRoomCode,
  parseCommandPacket,
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
      version: 1,
      type: 'command',
      roomCode: 'ABCD2345',
      epoch: 42,
      clientId: 'crew-bravo',
      sequence: 7,
      sentAt: 100,
      command: emptyCommand(),
    } as const;

    expect(parseCommandPacket(valid)?.sequence).toBe(7);
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
  });

  it('hashes identical authoritative snapshots equally and changed ticks differently', () => {
    const session = new HostSession(91);
    const first = session.snapshot();
    expect(missionStateHash(first)).toBe(missionStateHash(structuredClone(first)));
    session.step(1 / 60);
    expect(missionStateHash(session.snapshot())).not.toBe(missionStateHash(first));
  });
});

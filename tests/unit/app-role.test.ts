import { describe, expect, it } from 'vitest';
import { crewIdForRoomRole } from '../../src/app/cabin-mayhem-app';

describe('room-role local player identity', () => {
  it('routes guest presentation, commands, and authored-room residency to Crew Bravo', () => {
    expect(crewIdForRoomRole('guest')).toBe('crew-bravo');
    expect(crewIdForRoomRole('host')).toBe('crew-alpha');
    expect(crewIdForRoomRole('solo')).toBe('crew-alpha');
  });
});

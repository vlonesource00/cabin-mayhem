import type { MissionState } from '../sim/types';
import type { RoomRole, RoomStatus } from '../network/peer-room';

declare global {
  interface Window {
    __CABIN_MAYHEM_TEST__?: {
      start(): void;
      startMultiplayer(role: RoomRole, roomCode?: string): void;
      state(): MissionState | undefined;
      roomStatus(): RoomStatus | undefined;
      step(seconds: number): void;
      advancePhase(): void;
      trigger(
        kind: 'turbulence' | 'air-pocket' | 'sharp-turn' | 'collision' | 'fire' | 'repair',
      ): void;
      completeRepair(): void;
      reset(): void;
    };
  }
}

export {};

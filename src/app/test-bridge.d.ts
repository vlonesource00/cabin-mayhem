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
        kind:
          | 'turbulence'
          | 'air-pocket'
          | 'sharp-turn'
          | 'collision'
          | 'collision-course'
          | 'collision-course-debug'
          | 'navigation'
          | 'boarding-invasion'
          | 'boarding-invasion-debug'
          | 'invasion'
          | 'fire'
          | 'repair',
      ): void;
      boardInvasion(): void;
      showCrowd(): void;
      helmNavigation(): void;
      avoidNavigation(): void;
      beginNavigationRepair(): void;
      completeNavigationRepair(): void;
      completeRepair(): void;
      completeShift(outcome: 'success' | 'failed'): void;
      reset(): void;
    };
  }
}

export {};

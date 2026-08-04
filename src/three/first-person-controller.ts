import * as THREE from 'three';
import type { VoyageState, PlayerCommand, PlayerState, Vec2 } from '../sim/types';
import { cabinToWorld } from './coordinates';

export function cameraRelativeMovement(move: Vec2, yaw: number): { move: Vec2; look: Vec2 } {
  // Three cameras look down local -Z. Rotating that vector around +Y means
  // the world-space X component is -sin(yaw), not +sin(yaw).
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const forwardAmount = -move.y;
  const sideAmount = move.x;

  return {
    move: {
      x: rightX * sideAmount + forwardX * forwardAmount,
      y: rightZ * sideAmount + forwardZ * forwardAmount,
    },
    look: { x: forwardX, y: forwardZ },
  };
}

export class FirstPersonController {
  private yaw = Math.PI;
  private pitch = 0;
  private locked = false;
  private dragging = false;
  private readonly onLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.locked && !this.dragging) return;
    this.yaw -= event.movementX * 0.0022;
    this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * 0.0019, -1.35, 1.35);
  };

  private readonly onCanvasClick = (): void => {
    this.canvas.focus();
    if (this.locked) return;
    try {
      const lockRequest = this.canvas.requestPointerLock();
      if (lockRequest instanceof Promise)
        void lockRequest.catch(() => {
          this.locked = false;
        });
    } catch {
      this.locked = false;
    }
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button === 0) this.dragging = true;
  };

  private readonly onPointerUp = (): void => {
    this.dragging = false;
  };

  private readonly onContextMenu = (event: MouseEvent): void => event.preventDefault();

  public constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.tabIndex = -1;
    canvas.setAttribute('aria-label', '3D game view');
    canvas.addEventListener('click', this.onCanvasClick);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('pointerup', this.onPointerUp);
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('mousemove', this.onMouseMove);
  }

  public transform(command: PlayerCommand): PlayerCommand {
    const relative = cameraRelativeMovement(command.move, this.yaw);
    command.move = relative.move;
    command.look = relative.look;
    return command;
  }

  public updateCamera(
    camera: THREE.PerspectiveCamera,
    player: PlayerState,
    voyage: VoyageState,
    elapsed: number,
  ): void {
    const position = cabinToWorld(player.position);
    const speed = Math.hypot(player.velocity.x, player.velocity.y);
    const bob = speed > 0.2 ? Math.sin(elapsed * (player.crouched ? 7 : 10)) * 0.025 : 0;
    const turbulence = voyage.turbulence * 0.025;
    const shakeX = Math.sin(elapsed * 28) * turbulence;
    const shakeY = Math.cos(elapsed * 23) * turbulence + voyage.airPocket * -0.035;

    camera.position.set(
      position.x + shakeX,
      player.crouched ? 1.12 : 1.68 + bob + shakeY,
      position.z,
    );
    camera.rotation.order = 'YXZ';
    camera.rotation.y = this.yaw;
    // Steering trim/heel are degrees; the sea's contribution is already radians.
    camera.rotation.x =
      this.pitch + THREE.MathUtils.degToRad(voyage.pitch) * 0.018 + voyage.hull.pitch * 0.35;
    camera.rotation.z =
      THREE.MathUtils.degToRad(-voyage.roll) * 0.012 - voyage.hull.roll * 0.35 + shakeX * 0.6;
  }

  public isLocked(): boolean {
    return this.locked;
  }

  public destroy(): void {
    this.canvas.removeEventListener('click', this.onCanvasClick);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointerup', this.onPointerUp);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('mousemove', this.onMouseMove);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
}

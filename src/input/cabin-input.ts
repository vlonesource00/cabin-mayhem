import { emptyCommand, type PlayerCommand } from '../sim/types';

const blockedTargets = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'];

export class CabinInputController {
  private readonly pressed = new Set<string>();
  private readonly triggered = new Set<string>();
  private active = false;

  public constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
  }

  public setActive(active: boolean): void {
    this.active = active;
    if (!active) this.clear();
  }

  public read(): PlayerCommand {
    if (!this.active) return emptyCommand();
    const pad = navigator.getGamepads().find((entry) => entry?.connected);
    const keyboard = this.keyboardCommand();
    if (!pad) return keyboard;
    const axisX = deadZone(pad.axes[0] ?? 0);
    const axisY = deadZone(pad.axes[1] ?? 0);
    return {
      ...keyboard,
      move: Math.abs(axisX) + Math.abs(axisY) > 0 ? { x: axisX, y: axisY } : keyboard.move,
      sprint: keyboard.sprint || Boolean(pad.buttons[4]?.pressed),
      crouch: keyboard.crouch || Boolean(pad.buttons[1]?.pressed),
      brace: keyboard.brace || Boolean(pad.buttons[2]?.pressed),
      interact: keyboard.interact || this.consumePad(pad.buttons[0]?.pressed),
      repair: keyboard.repair || Boolean(pad.buttons[0]?.pressed),
      throwItem: keyboard.throwItem || this.consumePad(pad.buttons[3]?.pressed),
      helm: {
        rudder: keyboard.helm.rudder || deadZone(pad.axes[2] ?? 0),
        telegraph:
          keyboard.helm.telegraph ||
          Number(Boolean(pad.buttons[7]?.pressed)) - Number(Boolean(pad.buttons[6]?.pressed)),
        emergencyStop: keyboard.helm.emergencyStop || Boolean(pad.buttons[5]?.pressed),
      },
    };
  }

  public destroy(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
  }

  private keyboardCommand(): PlayerCommand {
    const command = emptyCommand();
    command.move = {
      x: Number(this.pressed.has('KeyD')) - Number(this.pressed.has('KeyA')),
      y: Number(this.pressed.has('KeyS')) - Number(this.pressed.has('KeyW')),
    };
    command.sprint = this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight');
    command.crouch = this.pressed.has('ControlLeft') || this.pressed.has('ControlRight');
    command.brace = this.pressed.has('KeyC');
    command.interact = this.consume('KeyE');
    command.repair = this.pressed.has('KeyE');
    command.selectServiceNeed = this.consume('Digit1')
      ? 'drink'
      : this.consume('Digit2')
        ? 'meal'
        : this.consume('Digit3')
          ? 'medical'
          : undefined;
    command.throwItem = this.consume('KeyQ');
    command.helm = {
      rudder: Number(this.pressed.has('ArrowRight')) - Number(this.pressed.has('ArrowLeft')),
      telegraph:
        Number(this.pressed.has('KeyR') || this.pressed.has('ArrowUp')) -
        Number(this.pressed.has('KeyF') || this.pressed.has('ArrowDown')),
      emergencyStop: this.pressed.has('KeyB'),
    };
    return command;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.active || isTypingTarget(event.target)) return;
    if (!isGameKey(event.code)) return;
    this.pressed.add(event.code);
    if (!event.repeat) this.triggered.add(event.code);
    event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  private consume(code: string): boolean {
    const result = this.triggered.has(code);
    this.triggered.delete(code);
    return result;
  }

  private consumePad(pressed: boolean | undefined): boolean {
    if (!pressed) return false;
    const key = `pad-${pressed}`;
    if (this.triggered.has(key)) return false;
    this.triggered.add(key);
    queueMicrotask(() => this.triggered.delete(key));
    return true;
  }

  private clear(): void {
    this.pressed.clear();
    this.triggered.clear();
  }
}

function deadZone(value: number): number {
  return Math.abs(value) < 0.2 ? 0 : value;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && blockedTargets.includes(target.tagName);
}

function isGameKey(code: string): boolean {
  return /^(Digit[123]|Key[ABCDEFGHIJLQRSW]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Control(Left|Right))$/.test(
    code,
  );
}

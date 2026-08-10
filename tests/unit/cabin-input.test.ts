import { describe, expect, it, vi } from 'vitest';
import { CabinInputController } from '../../src/input/cabin-input';

describe('cabin portal wheel input', () => {
  it('accumulates local wheel selection only for an active multi-option prompt', () => {
    vi.stubGlobal('HTMLElement', class FakeHTMLElement {});
    const listeners = new Map<string, EventListener>();
    const target = {
      addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    } as unknown as Window;
    const input = new CabinInputController(target);

    input.setActive(true);
    const idle = dispatchWheel(listeners, 100);
    expect(idle.preventDefault).not.toHaveBeenCalled();
    expect(input.consumeWheelDelta()).toBe(0);

    input.setPortalPromptActive(true);
    const down = dispatchWheel(listeners, 100);
    expect(down.preventDefault).toHaveBeenCalledOnce();
    expect(input.consumeWheelDelta()).toBe(1);
    const up = dispatchWheel(listeners, -100);
    expect(up.preventDefault).toHaveBeenCalledOnce();
    expect(input.consumeWheelDelta()).toBe(-1);

    input.setPortalPromptActive(false);
    const inactive = dispatchWheel(listeners, 100);
    expect(inactive.preventDefault).not.toHaveBeenCalled();
    expect(input.consumeWheelDelta()).toBe(0);
    input.destroy();
    expect(listeners.has('wheel')).toBe(false);
  });

  it('never captures page scrolling from a typing target', () => {
    class FakeHTMLElement extends EventTarget {
      public readonly tagName = 'INPUT';
    }
    vi.stubGlobal('HTMLElement', FakeHTMLElement);
    const listeners = new Map<string, EventListener>();
    const target = {
      addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    } as unknown as Window;
    const input = new CabinInputController(target);
    input.setActive(true);
    input.setPortalPromptActive(true);

    const event = dispatchWheel(listeners, 100, new FakeHTMLElement());
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(input.consumeWheelDelta()).toBe(0);
    input.destroy();
  });
});

function dispatchWheel(
  listeners: Map<string, EventListener>,
  deltaY: number,
  target: EventTarget | null = null,
): { preventDefault: ReturnType<typeof vi.fn> } {
  const preventDefault = vi.fn();
  listeners.get('wheel')?.({
    deltaY,
    target,
    preventDefault,
  } as unknown as WheelEvent);
  return { preventDefault };
}

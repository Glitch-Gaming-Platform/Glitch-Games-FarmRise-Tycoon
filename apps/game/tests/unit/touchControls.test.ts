import { describe, expect, it, vi } from 'vitest';
import { TouchControls } from '../../src/ui/hud/TouchControls.js';

function pointer(type: string, pointerId: number, clientX = 50, clientY = 50): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: clientX },
    clientY: { value: clientY },
  });
  return event;
}

describe('TouchControls', () => {
  it('supports a held joystick and an independent edge action', () => {
    const setAction = vi.fn();
    const setActionValue = vi.fn();
    const controls = new TouchControls({ setAction, setActionValue });
    document.body.append(controls.root);
    controls.setMode('gameplay');

    const joystick = controls.root.querySelector<HTMLElement>('[data-testid="touch-joystick"]')!;
    joystick.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }) as DOMRect;
    const work = controls.root.querySelector<HTMLButtonElement>('[data-testid="touch-interact"]')!;
    joystick.dispatchEvent(pointer('pointerdown', 1, 50, 10));
    work.dispatchEvent(pointer('pointerdown', 2));
    expect(setAction.mock.calls).toEqual([
      ['interact', true],
      ['interact', false],
    ]);
    work.dispatchEvent(pointer('pointercancel', 2));
    joystick.dispatchEvent(pointer('pointerup', 1, 50, 10));

    expect(setActionValue).toHaveBeenCalledWith('moveForward', 1);
    expect(setActionValue.mock.calls.slice(-4)).toEqual([
      ['moveLeft', 0],
      ['moveRight', 0],
      ['moveForward', 0],
      ['moveBack', 0],
    ]);
  });

  it('shows only cancellation while placing', () => {
    const controls = new TouchControls({ setAction: vi.fn(), setActionValue: vi.fn() });
    controls.setMode('placement');

    expect(controls.root.hidden).toBe(false);
    expect(controls.root.querySelector<HTMLElement>('.fr-touch-gameplay')?.hidden).toBe(true);
    expect(controls.root.querySelector<HTMLElement>('.fr-touch-placement')?.hidden).toBe(false);
  });
});

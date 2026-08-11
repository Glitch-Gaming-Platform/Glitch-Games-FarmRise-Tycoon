/**
 * Input buffering. The behaviour that matters is edge detection: a key pressed
 * and released between two ticks must still register.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InputSystem } from '@engine/input/InputSystem.js';
import { ServiceContainer } from '@engine/core/ServiceContainer.js';

type Action = 'left' | 'right' | 'jump';

const bindings = {
  left: { keys: ['KeyA'] },
  right: { keys: ['KeyD'] },
  jump: { keys: ['Space'], mouseButtons: [0] },
} as const;

let target: HTMLElement;
let input: InputSystem<Action>;

function key(type: 'keydown' | 'keyup', code: string): void {
  globalThis.dispatchEvent(new KeyboardEvent(type, { code }));
}

function pointer(
  type: 'pointerdown' | 'pointerup',
  pointerId = 1,
  clientX = 20,
  clientY = 30,
  pointerType = 'mouse',
): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerId: { value: pointerId },
    pointerType: { value: pointerType },
  });
  return event;
}

beforeEach(() => {
  target = document.createElement('div');
  document.body.append(target);
  input = new InputSystem<Action>({ target, bindings });
  input.init({ services: new ServiceContainer() });
});

describe('InputSystem', () => {
  it('reports a held key as down', () => {
    key('keydown', 'KeyA');
    input.fixedUpdate();
    expect(input.isDown('left')).toBe(true);
  });

  it('reports a press edge only on the tick it happened', () => {
    key('keydown', 'KeyA');
    input.fixedUpdate();
    expect(input.wasPressed('left')).toBe(true);
    input.fixedUpdate();
    expect(input.wasPressed('left')).toBe(false);
    expect(input.isDown('left')).toBe(true);
  });

  it('catches a press and release inside a single tick', () => {
    // The whole reason input is buffered rather than polled.
    key('keydown', 'Space');
    key('keyup', 'Space');
    input.fixedUpdate();
    expect(input.wasPressed('jump')).toBe(true);
    expect(input.wasReleased('jump')).toBe(true);
    expect(input.isDown('jump')).toBe(false);
  });

  it('computes an axis from opposing actions', () => {
    key('keydown', 'KeyD');
    input.fixedUpdate();
    expect(input.axis({ negative: 'left', positive: 'right' })).toBe(1);
    key('keydown', 'KeyA');
    input.fixedUpdate();
    expect(input.axis({ negative: 'left', positive: 'right' })).toBe(0);
  });

  it('buffers semantic touch actions through the same fixed-tick path', () => {
    input.setActionState('jump', true);
    input.setActionState('jump', false);
    input.fixedUpdate();

    expect(input.wasPressed('jump')).toBe(true);
    expect(input.wasReleased('jump')).toBe(true);
    expect(input.isDown('jump')).toBe(false);
  });

  it('allows independent virtual actions for multi-touch movement', () => {
    input.setActionState('left', true);
    input.setActionState('jump', true);
    input.fixedUpdate();

    expect(input.isDown('left')).toBe(true);
    expect(input.isDown('jump')).toBe(true);
    expect(input.axis({ negative: 'left', positive: 'right' })).toBe(-1);

    input.setActionState('jump', false);
    input.fixedUpdate();
    expect(input.isDown('left')).toBe(true);
    expect(input.isDown('jump')).toBe(false);
  });

  it('preserves fractional virtual axes for an analog joystick', () => {
    input.setActionValue('right', 0.75);
    input.setActionValue('left', 0.2);
    input.fixedUpdate();

    expect(input.axis({ negative: 'left', positive: 'right' })).toBeCloseTo(0.55);
  });

  it('releases everything on blur', () => {
    key('keydown', 'KeyA');
    input.setActionState('jump', true);
    input.fixedUpdate();
    globalThis.dispatchEvent(new Event('blur'));
    input.fixedUpdate();
    expect(input.isDown('left')).toBe(false);
    expect(input.isDown('jump')).toBe(false);
  });

  it('ignores auto-repeat so a held key is one press', () => {
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', repeat: true }));
    input.fixedUpdate();
    expect(input.wasPressed('left')).toBe(true);
  });

  it('stops sampling when disabled', () => {
    input.setEnabled(false);
    key('keydown', 'KeyA');
    input.fixedUpdate();
    expect(input.isDown('left')).toBe(false);
  });

  it('does not capture or sample pointer events from DOM interfaces', () => {
    const capture = vi.fn();
    target.setPointerCapture = capture;
    const interfaceLayer = document.createElement('div');
    interfaceLayer.dataset['engineInputIgnore'] = 'true';
    const button = document.createElement('button');
    interfaceLayer.append(button);
    target.append(interfaceLayer);

    button.dispatchEvent(pointer('pointerdown'));
    button.dispatchEvent(pointer('pointerup'));
    input.fixedUpdate();

    expect(capture).not.toHaveBeenCalled();
    expect(input.wasPressed('jump')).toBe(false);
    expect(input.pointer.pointerCount).toBe(0);
  });

  it('uses pointerdown coordinates for touch taps that have no hover move', () => {
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });

    target.dispatchEvent(pointer('pointerdown', 7, 75, 25, 'touch'));
    input.fixedUpdate();

    expect(input.pointer.type).toBe('touch');
    expect(input.pointer.x).toBe(75);
    expect(input.pointer.y).toBe(25);
    expect(input.pointer.ndcX).toBeCloseTo(0.5);
    expect(input.pointer.ndcY).toBeCloseTo(0.5);
    expect(input.wasPressed('jump')).toBe(true);
  });

  it('does not prevent interface scrolling or turn it into camera input', () => {
    const interfaceLayer = document.createElement('div');
    interfaceLayer.dataset['engineInputIgnore'] = 'true';
    target.append(interfaceLayer);
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 });

    interfaceLayer.dispatchEvent(wheel);
    input.fixedUpdate();

    expect(wheel.defaultPrevented).toBe(false);
    expect(input.pointer.wheelDelta).toBe(0);
  });

  it('does not treat typing in an interface field as game input', () => {
    const interfaceLayer = document.createElement('div');
    interfaceLayer.dataset['engineInputIgnore'] = 'true';
    const field = document.createElement('input');
    interfaceLayer.append(field);
    target.append(interfaceLayer);

    field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'KeyA' }));
    input.fixedUpdate();

    expect(input.isDown('left')).toBe(false);
    expect(input.wasPressed('left')).toBe(false);
  });
});

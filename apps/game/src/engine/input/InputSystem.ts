/**
 * Samples raw DOM input into a per-tick snapshot.
 *
 * The important design decision here is buffering. DOM events arrive whenever
 * the browser feels like it, but the simulation runs on fixed ticks and may run
 * zero or several times per frame. If gameplay read the live event stream it
 * would miss a tap that started and ended inside one frame. So events are
 * queued and drained at the top of each fixed step, which makes "was interact
 * pressed this tick?" a well-defined question.
 *
 * Runs at SystemPriority.Input, i.e. before anything that reads it.
 */
import { SystemPriority, type EngineSystem, type SystemInitContext } from '../core/System.js';
import { createServiceToken } from '../core/ServiceContainer.js';
import type { Disposable } from '../core/types.js';
import type { ActionMap, AxisDefinition } from './ActionMap.js';
import { EMPTY_POINTER, type PointerSnapshot } from './PointerState.js';

type QueuedEvent =
  | { kind: 'key'; code: string; down: boolean }
  | { kind: 'mouse'; button: number; down: boolean }
  | { kind: 'blur' };

export interface InputSystemOptions<TAction extends string> {
  readonly target: HTMLElement;
  readonly bindings: ActionMap<TAction>;
  /** Swallows browser defaults (scroll, context menu) over the canvas. */
  readonly preventDefault?: boolean;
}

export class InputSystem<TAction extends string> implements EngineSystem, Disposable {
  readonly id = 'input';
  readonly priority = SystemPriority.Input;

  #bindings: ActionMap<TAction>;
  readonly #target: HTMLElement;
  readonly #preventDefault: boolean;

  readonly #down = new Set<string>();
  readonly #pressed = new Set<string>();
  readonly #released = new Set<string>();
  #queue: QueuedEvent[] = [];

  #pointer: PointerSnapshot = EMPTY_POINTER;
  readonly #activePointers = new Map<number, { x: number; y: number }>();
  #rawX = 0;
  #rawY = 0;
  #accumDeltaX = 0;
  #accumDeltaY = 0;
  #accumWheel = 0;
  #lastPinch = 0;
  #pointerType: PointerSnapshot['type'] = 'none';
  #enabled = true;

  constructor(options: InputSystemOptions<TAction>) {
    this.#target = options.target;
    this.#bindings = options.bindings;
    this.#preventDefault = options.preventDefault ?? true;
  }

  init(context: SystemInitContext): void {
    context.services.provide(createInputToken<TAction>(), this as unknown as InputSystem<string>);
    this.#attach();
  }

  /** Disables sampling without tearing down listeners, e.g. while a menu is open. */
  setEnabled(enabled: boolean): void {
    if (this.#enabled === enabled) return;
    this.#enabled = enabled;
    if (!enabled) this.#queue.push({ kind: 'blur' });
  }

  setBindings(bindings: ActionMap<TAction>): void {
    this.#bindings = bindings;
  }

  /** Drains the event queue. Must run before any system that reads input. */
  fixedUpdate(): void {
    this.#pressed.clear();
    this.#released.clear();

    const queue = this.#queue;
    this.#queue = [];
    for (const event of queue) {
      if (event.kind === 'blur') {
        // Releasing everything on blur prevents the classic "held W while
        // alt-tabbing, came back walking forever" bug.
        for (const code of this.#down) this.#released.add(code);
        this.#down.clear();
        continue;
      }
      const code = event.kind === 'key' ? event.code : `Mouse${event.button}`;
      if (event.down) {
        if (!this.#down.has(code)) this.#pressed.add(code);
        this.#down.add(code);
      } else {
        if (this.#down.has(code)) this.#released.add(code);
        this.#down.delete(code);
      }
    }

    this.#pointer = this.#snapshotPointer();
    this.#accumDeltaX = 0;
    this.#accumDeltaY = 0;
    this.#accumWheel = 0;
  }

  isDown(action: TAction): boolean {
    return this.#anyCode(action, (code) => this.#down.has(code));
  }

  wasPressed(action: TAction): boolean {
    return this.#anyCode(action, (code) => this.#pressed.has(code));
  }

  wasReleased(action: TAction): boolean {
    return this.#anyCode(action, (code) => this.#released.has(code));
  }

  /** -1, 0 or 1 from a pair of opposing actions. */
  axis(definition: AxisDefinition<TAction>): number {
    return (this.isDown(definition.positive) ? 1 : 0) - (this.isDown(definition.negative) ? 1 : 0);
  }

  get pointer(): PointerSnapshot {
    return this.#pointer;
  }

  dispose(): void {
    this.#detach();
    this.#down.clear();
    this.#pressed.clear();
    this.#released.clear();
    this.#queue = [];
  }

  #anyCode(action: TAction, predicate: (code: string) => boolean): boolean {
    const binding = this.#bindings[action];
    if (!binding) return false;
    return (
      (binding.keys?.some(predicate) ?? false) ||
      (binding.mouseButtons?.some((button) => predicate(`Mouse${button}`)) ?? false)
    );
  }

  #snapshotPointer(): PointerSnapshot {
    const rect = this.#target.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const x = this.#rawX - rect.left;
    const y = this.#rawY - rect.top;

    const pinch = this.#currentPinchDistance();
    const pinchDelta = this.#lastPinch === 0 || pinch === 0 ? 0 : pinch - this.#lastPinch;
    this.#lastPinch = pinch;

    return {
      x,
      y,
      ndcX: (x / width) * 2 - 1,
      ndcY: -((y / height) * 2 - 1),
      deltaX: this.#accumDeltaX,
      deltaY: this.#accumDeltaY,
      wheelDelta: this.#accumWheel,
      primaryDown: this.#down.has('Mouse0') || this.#activePointers.size > 0,
      pointerCount: this.#activePointers.size,
      pinchDistance: pinch,
      pinchDelta,
      type: this.#pointerType,
    };
  }

  #currentPinchDistance(): number {
    if (this.#activePointers.size < 2) return 0;
    const [first, second] = [...this.#activePointers.values()];
    if (!first || !second) return 0;
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  #onKeyDown = (event: KeyboardEvent): void => {
    if (!this.#enabled || event.repeat || this.#isIgnoredTarget(event.target)) return;
    this.#queue.push({ kind: 'key', code: event.code, down: true });
  };

  #onKeyUp = (event: KeyboardEvent): void => {
    if (!this.#enabled) return;
    this.#queue.push({ kind: 'key', code: event.code, down: false });
  };

  #onPointerDown = (event: PointerEvent): void => {
    if (!this.#enabled || this.#isIgnoredTarget(event.target)) return;
    this.#pointerType = event.pointerType as PointerSnapshot['type'];
    this.#activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.#target.setPointerCapture?.(event.pointerId);
    this.#queue.push({ kind: 'mouse', button: event.button, down: true });
  };

  #onPointerMove = (event: PointerEvent): void => {
    if (!this.#enabled || this.#isIgnoredTarget(event.target)) return;
    this.#pointerType = event.pointerType as PointerSnapshot['type'];
    this.#accumDeltaX += event.clientX - this.#rawX;
    this.#accumDeltaY += event.clientY - this.#rawY;
    this.#rawX = event.clientX;
    this.#rawY = event.clientY;
    if (this.#activePointers.has(event.pointerId)) {
      this.#activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
  };

  #onPointerUp = (event: PointerEvent): void => {
    if (!this.#enabled || this.#isIgnoredTarget(event.target)) return;
    this.#activePointers.delete(event.pointerId);
    if (this.#activePointers.size < 2) this.#lastPinch = 0;
    this.#queue.push({ kind: 'mouse', button: event.button, down: false });
  };

  #onWheel = (event: WheelEvent): void => {
    if (!this.#enabled || this.#isIgnoredTarget(event.target)) return;
    if (this.#preventDefault) event.preventDefault();
    this.#accumWheel += event.deltaY;
  };

  #onBlur = (): void => {
    this.#queue.push({ kind: 'blur' });
    this.#activePointers.clear();
  };

  #onContextMenu = (event: Event): void => {
    if (this.#isIgnoredTarget(event.target)) return;
    if (this.#preventDefault) event.preventDefault();
  };

  #isIgnoredTarget(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest('[data-engine-input-ignore]') !== null;
  }

  #attach(): void {
    // Keyboard listens on window: the canvas would need focus, and a canvas
    // that steals focus breaks keyboard navigation of the surrounding UI.
    globalThis.addEventListener('keydown', this.#onKeyDown);
    globalThis.addEventListener('keyup', this.#onKeyUp);
    globalThis.addEventListener('blur', this.#onBlur);
    this.#target.addEventListener('pointerdown', this.#onPointerDown);
    this.#target.addEventListener('pointermove', this.#onPointerMove);
    this.#target.addEventListener('pointerup', this.#onPointerUp);
    this.#target.addEventListener('pointercancel', this.#onPointerUp);
    this.#target.addEventListener('wheel', this.#onWheel, { passive: false });
    this.#target.addEventListener('contextmenu', this.#onContextMenu);
  }

  #detach(): void {
    globalThis.removeEventListener('keydown', this.#onKeyDown);
    globalThis.removeEventListener('keyup', this.#onKeyUp);
    globalThis.removeEventListener('blur', this.#onBlur);
    this.#target.removeEventListener('pointerdown', this.#onPointerDown);
    this.#target.removeEventListener('pointermove', this.#onPointerMove);
    this.#target.removeEventListener('pointerup', this.#onPointerUp);
    this.#target.removeEventListener('pointercancel', this.#onPointerUp);
    this.#target.removeEventListener('wheel', this.#onWheel);
    this.#target.removeEventListener('contextmenu', this.#onContextMenu);
  }
}

/**
 * One shared token. The action type is erased at the boundary because the
 * container cannot be generic; callers cast back to their own action union.
 */
const INPUT_TOKEN = createServiceToken<InputSystem<string>>('InputSystem');
export function createInputToken<TAction extends string>() {
  return INPUT_TOKEN as unknown as ReturnType<typeof createServiceToken<InputSystem<TAction>>>;
}
export const InputToken = INPUT_TOKEN;

/**
 * Pointer state, unified across mouse, pen and touch.
 *
 * Pointer Events are used rather than separate mouse/touch handlers because
 * they normalise all three, which is the only sane way to hit the "all devices"
 * target without three parallel code paths.
 */
export interface PointerSnapshot {
  /** Position in CSS pixels relative to the target element. */
  readonly x: number;
  readonly y: number;
  /** Normalised device coordinates, -1..1, ready for raycasting. */
  readonly ndcX: number;
  readonly ndcY: number;
  /** Movement since the previous tick, in CSS pixels. */
  readonly deltaX: number;
  readonly deltaY: number;
  /** Accumulated wheel movement since the previous tick. */
  readonly wheelDelta: number;
  readonly primaryDown: boolean;
  readonly pointerCount: number;
  /** Distance between the first two touches, for pinch-zoom. 0 when not pinching. */
  readonly pinchDistance: number;
  readonly pinchDelta: number;
  readonly type: 'mouse' | 'pen' | 'touch' | 'none';
}

export const EMPTY_POINTER: PointerSnapshot = {
  x: 0,
  y: 0,
  ndcX: 0,
  ndcY: 0,
  deltaX: 0,
  deltaY: 0,
  wheelDelta: 0,
  primaryDown: false,
  pointerCount: 0,
  pinchDistance: 0,
  pinchDelta: 0,
  type: 'none',
};

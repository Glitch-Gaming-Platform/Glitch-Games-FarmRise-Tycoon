/**
 * Typed publish/subscribe bus.
 *
 * This is the seam that lets the UI observe the simulation without the
 * simulation ever importing the UI (see docs/ARCHITECTURE.md dependency rules).
 * A throwing listener is logged and skipped rather than allowed to abort the
 * frame - one broken HUD widget must not stop the game loop.
 */
import type { Unsubscribe } from './types.js';

export type EventMap = Record<string, unknown>;
export type Listener<T> = (payload: T) => void;

export class EventBus<M extends EventMap> {
  readonly #listeners = new Map<keyof M, Set<Listener<never>>>();

  on<K extends keyof M>(type: K, listener: Listener<M[K]>): Unsubscribe {
    let set = this.#listeners.get(type);
    if (!set) {
      set = new Set();
      this.#listeners.set(type, set);
    }
    set.add(listener as Listener<never>);
    return () => this.off(type, listener);
  }

  once<K extends keyof M>(type: K, listener: Listener<M[K]>): Unsubscribe {
    const unsubscribe = this.on(type, (payload) => {
      unsubscribe();
      listener(payload);
    });
    return unsubscribe;
  }

  off<K extends keyof M>(type: K, listener: Listener<M[K]>): void {
    this.#listeners.get(type)?.delete(listener as Listener<never>);
  }

  emit<K extends keyof M>(type: K, payload: M[K]): void {
    const set = this.#listeners.get(type);
    if (!set) return;
    // Copy first: a listener is allowed to unsubscribe itself during dispatch.
    for (const listener of [...set]) {
      try {
        (listener as Listener<M[K]>)(payload);
      } catch (error) {
        console.error(`[EventBus] listener for "${String(type)}" threw`, error);
      }
    }
  }

  listenerCount<K extends keyof M>(type: K): number {
    return this.#listeners.get(type)?.size ?? 0;
  }

  clear(): void {
    this.#listeners.clear();
  }
}

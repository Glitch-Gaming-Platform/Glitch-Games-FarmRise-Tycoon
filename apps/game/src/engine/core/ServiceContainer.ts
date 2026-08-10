/**
 * Minimal typed service locator.
 *
 * Systems need to find each other (the camera system needs the renderer; the
 * HUD needs the simulation's read model). The alternatives are a global
 * singleton - which is the "one global manager" this architecture forbids - or
 * threading every dependency through constructors, which gets unwieldy fast.
 *
 * This container is a compromise with two hard rules:
 *   1. Tokens are typed, so `resolve` never returns `any`.
 *   2. Resolution happens in `init()`, never inside the frame loop, so a
 *      missing dependency fails at startup instead of at 60Hz.
 */
export interface ServiceToken<T> {
  readonly key: symbol;
  readonly name: string;
  /** Phantom field: carries T through the type system, never read at runtime. */
  readonly __type?: T;
}

export function createServiceToken<T>(name: string): ServiceToken<T> {
  return { key: Symbol(name), name };
}

export class ServiceContainer {
  readonly #values = new Map<symbol, unknown>();

  provide<T>(token: ServiceToken<T>, value: T): this {
    if (this.#values.has(token.key)) {
      throw new Error(`Service "${token.name}" is already registered.`);
    }
    this.#values.set(token.key, value);
    return this;
  }

  /** Replaces an existing registration. Intended for tests and hot reload. */
  override<T>(token: ServiceToken<T>, value: T): this {
    this.#values.set(token.key, value);
    return this;
  }

  resolve<T>(token: ServiceToken<T>): T {
    if (!this.#values.has(token.key)) {
      throw new Error(
        `Service "${token.name}" was not provided. Register it in the composition root (src/main.ts) before the system that needs it.`,
      );
    }
    return this.#values.get(token.key) as T;
  }

  tryResolve<T>(token: ServiceToken<T>): T | undefined {
    return this.#values.get(token.key) as T | undefined;
  }

  has<T>(token: ServiceToken<T>): boolean {
    return this.#values.has(token.key);
  }

  clear(): void {
    this.#values.clear();
  }
}

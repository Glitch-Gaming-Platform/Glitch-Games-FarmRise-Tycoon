/**
 * Engine, EventBus and ServiceContainer: the small pieces everything else is
 * built on, so their failure modes matter more than their happy paths.
 */
import { describe, expect, it, vi } from 'vitest';
import { Engine } from '@engine/core/Engine.js';
import { EventBus } from '@engine/core/EventBus.js';
import { ServiceContainer, createServiceToken } from '@engine/core/ServiceContainer.js';
import { createManualScheduler } from '@engine/core/Scheduler.js';
import type { EngineSystem } from '@engine/core/System.js';

describe('EventBus', () => {
  it('delivers payloads to subscribers', () => {
    const bus = new EventBus<{ ping: number }>();
    const listener = vi.fn();
    bus.on('ping', listener);
    bus.emit('ping', 42);
    expect(listener).toHaveBeenCalledWith(42);
  });

  it('stops delivering after unsubscribe', () => {
    const bus = new EventBus<{ ping: number }>();
    const listener = vi.fn();
    bus.on('ping', listener)();
    bus.emit('ping', 1);
    expect(listener).not.toHaveBeenCalled();
  });

  it('isolates a throwing listener from the others', () => {
    const bus = new EventBus<{ ping: number }>();
    const good = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    bus.on('ping', () => {
      throw new Error('boom');
    });
    bus.on('ping', good);
    expect(() => bus.emit('ping', 1)).not.toThrow();
    expect(good).toHaveBeenCalled();
  });

  it('allows a listener to unsubscribe itself during dispatch', () => {
    const bus = new EventBus<{ ping: number }>();
    const calls: number[] = [];
    const off = bus.on('ping', (value) => {
      calls.push(value);
      off();
    });
    bus.emit('ping', 1);
    bus.emit('ping', 2);
    expect(calls).toEqual([1]);
  });
});

describe('ServiceContainer', () => {
  const token = createServiceToken<{ value: number }>('Thing');

  it('resolves what was provided', () => {
    const container = new ServiceContainer();
    container.provide(token, { value: 7 });
    expect(container.resolve(token).value).toBe(7);
  });

  it('throws a helpful error for a missing service', () => {
    expect(() => new ServiceContainer().resolve(token)).toThrow(/was not provided/);
  });

  it('refuses a duplicate registration', () => {
    const container = new ServiceContainer();
    container.provide(token, { value: 1 });
    expect(() => container.provide(token, { value: 2 })).toThrow(/already registered/);
  });
});

describe('Engine', () => {
  const makeSystem = (id: string, priority: number, log: string[]): EngineSystem => ({
    id,
    priority,
    fixedUpdate: () => log.push(id),
  });

  it('runs systems in priority order regardless of registration order', async () => {
    const log: string[] = [];
    const scheduler = createManualScheduler();
    const engine = new Engine({ scheduler });
    engine.register(makeSystem('late', 500, log)).register(makeSystem('early', 10, log));
    await engine.start();
    engine.loop.runFrame(20);
    expect(log.slice(0, 2)).toEqual(['early', 'late']);
    engine.dispose();
  });

  it('initialises in registration order, so dependencies exist', async () => {
    const order: string[] = [];
    const engine = new Engine({ scheduler: createManualScheduler() });
    engine
      .register({ id: 'first', priority: 900, init: () => void order.push('first') })
      .register({ id: 'second', priority: 1, init: () => void order.push('second') });
    await engine.start();
    expect(order).toEqual(['first', 'second']);
    engine.dispose();
  });

  it('quarantines a system that throws instead of failing the frame', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const engine = new Engine({ scheduler: createManualScheduler() });
    const healthy = vi.fn();
    engine
      .register({
        id: 'broken',
        priority: 1,
        fixedUpdate: () => {
          throw new Error('boom');
        },
      })
      .register({ id: 'healthy', priority: 2, fixedUpdate: healthy });

    const errors = vi.fn();
    engine.events.on('engine:system-error', errors);
    await engine.start();
    // runFrame takes an absolute timestamp, so the second frame must be later.
    engine.loop.runFrame(20);
    engine.loop.runFrame(40);

    expect(errors).toHaveBeenCalledTimes(1); // quarantined after the first throw
    expect(healthy).toHaveBeenCalledTimes(2);
    engine.dispose();
  });

  it('refuses to register a system after start', async () => {
    const engine = new Engine({ scheduler: createManualScheduler() });
    await engine.start();
    expect(() => engine.register({ id: 'late' })).toThrow(/after the engine has started/);
    engine.dispose();
  });

  it('refuses duplicate system ids', () => {
    const engine = new Engine({ scheduler: createManualScheduler() });
    engine.register({ id: 'dup' });
    expect(() => engine.register({ id: 'dup' })).toThrow(/already registered/);
  });
});

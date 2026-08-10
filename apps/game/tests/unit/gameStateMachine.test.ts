/**
 * State transitions. The guard table is a safety mechanism, so the tests focus
 * on what it must refuse.
 */
import { describe, expect, it, vi } from 'vitest';
import { GameStateMachine } from '@game/states/GameStateMachine.js';
import { canTransition } from '@game/states/transitions.js';
import type { GamePhase, GameState } from '@game/states/GameState.js';
import { GameStateSystem } from '@game/systems/GameStateSystem.js';
import type { InputSystem } from '@engine/input/InputSystem.js';
import type { GameAction } from '@game/GameActions.js';

const state = (id: GamePhase, hooks: Partial<GameState> = {}): GameState => ({ id, ...hooks });

function makeMachine() {
  const machine = new GameStateMachine();
  for (const phase of ['boot', 'menu', 'loading', 'playing', 'paused'] as const) {
    machine.register(state(phase));
  }
  return machine;
}

describe('transition table', () => {
  it('allows the intended flow', () => {
    expect(canTransition('menu', 'loading')).toBe(true);
    expect(canTransition('loading', 'playing')).toBe(true);
    expect(canTransition('playing', 'paused')).toBe(true);
    expect(canTransition('paused', 'playing')).toBe(true);
  });

  it('refuses pausing during a load', () => {
    expect(canTransition('loading', 'paused')).toBe(false);
  });

  it('refuses skipping the loading phase', () => {
    expect(canTransition('menu', 'playing')).toBe(false);
  });
});

describe('GameStateMachine', () => {
  it('enters the initial state', async () => {
    const machine = makeMachine();
    await machine.begin('boot');
    expect(machine.current).toBe('boot');
  });

  it('applies a queued transition on flush', async () => {
    const machine = makeMachine();
    await machine.begin('menu');
    machine.transitionTo('loading');
    expect(machine.current).toBe('menu'); // queued, not applied yet
    await machine.flush();
    expect(machine.current).toBe('loading');
  });

  it('rejects an illegal transition and stays put', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const machine = makeMachine();
    const rejected = vi.fn();
    machine.events.on('state:rejected', rejected);
    await machine.begin('menu');
    machine.transitionTo('playing');
    await machine.flush();
    expect(machine.current).toBe('menu');
    expect(rejected).toHaveBeenCalled();
  });

  it('calls exit on the outgoing state and enter on the incoming one', async () => {
    const machine = new GameStateMachine();
    const exit = vi.fn();
    const enter = vi.fn();
    machine.register(state('menu', { exit })).register(state('loading', { enter }));
    await machine.begin('menu');
    machine.transitionTo('loading');
    await machine.flush();
    expect(exit).toHaveBeenCalledWith('loading');
    expect(enter).toHaveBeenCalled();
  });

  it('ignores a transition to the state it is already in', async () => {
    const machine = makeMachine();
    await machine.begin('menu');
    machine.transitionTo('menu');
    expect(machine.isTransitioning).toBe(false);
  });

  it('throws if transitionTo is called before begin', () => {
    expect(() => makeMachine().transitionTo('menu')).toThrow(/begin\(\)/);
  });
});

describe('GameStateSystem', () => {
  it('lets an open interface consume Escape before the pause state sees it', async () => {
    const machine = makeMachine();
    await machine.begin('playing');
    const input = { wasPressed: () => true } as unknown as InputSystem<GameAction>;
    const system = new GameStateSystem(machine, input, () => false);

    system.fixedUpdate({ stepSeconds: 1 / 60, tick: 0 });
    await machine.flush();

    expect(machine.current).toBe('playing');
  });

  it('still pauses when no interface is consuming Escape', async () => {
    const machine = makeMachine();
    await machine.begin('playing');
    const input = { wasPressed: () => true } as unknown as InputSystem<GameAction>;
    const system = new GameStateSystem(machine, input, () => true);

    system.fixedUpdate({ stepSeconds: 1 / 60, tick: 0 });
    await machine.flush();

    expect(machine.current).toBe('paused');
  });
});

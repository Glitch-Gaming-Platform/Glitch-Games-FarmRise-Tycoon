import { describe, expect, it } from 'vitest';
import { Player } from '@game/player/Player.js';

describe('Player', () => {
  it('walks another 15% faster by default while preserving explicit speed overrides', () => {
    const player = new Player(0, 0);

    expect(player.walkSpeed).toBeCloseTo(1.848 * 1.15, 10);
    expect(player.walkSpeed * player.sprintMultiplier).toBeCloseTo(5.20674, 10);
    expect(new Player(0, 0, { walkSpeed: 2 }).walkSpeed).toBe(2);
  });
});

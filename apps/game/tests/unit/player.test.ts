import { describe, expect, it } from 'vitest';
import { Player } from '@game/player/Player.js';

describe('Player', () => {
  it('walks 10% faster by default while preserving explicit speed overrides', () => {
    const player = new Player(0, 0);

    expect(player.walkSpeed).toBeCloseTo(1.4 * 1.1, 10);
    expect(player.walkSpeed * player.sprintMultiplier).toBeCloseTo(3.773, 10);
    expect(new Player(0, 0, { walkSpeed: 2 }).walkSpeed).toBe(2);
  });
});

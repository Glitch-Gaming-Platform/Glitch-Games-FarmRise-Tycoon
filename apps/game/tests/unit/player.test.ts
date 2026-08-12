import { describe, expect, it } from 'vitest';
import { Player } from '@game/player/Player.js';

describe('Player', () => {
  it('walks 20% faster by default while preserving explicit speed overrides', () => {
    const player = new Player(0, 0);

    expect(player.walkSpeed).toBeCloseTo(1.54 * 1.2, 10);
    expect(player.walkSpeed * player.sprintMultiplier).toBeCloseTo(4.5276, 10);
    expect(new Player(0, 0, { walkSpeed: 2 }).walkSpeed).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { RenderContext } from '@engine/core/types.js';
import { Player } from '@game/player/Player.js';
import { PlayerView } from '@game/player/PlayerView.js';

describe('player locomotion presentation', () => {
  it('turns the shared actor over several frames instead of snapping its feet', () => {
    const player = new Player(0, 0);
    const view = new PlayerView(player, null);
    const actor = view.object.children.find(
      (child): child is THREE.Group => child instanceof THREE.Group,
    );
    expect(actor).toBeDefined();
    if (!actor) return;

    let elapsedSeconds = 0;
    const sync = (): void => {
      elapsedSeconds += 1 / 60;
      const context: RenderContext = {
        deltaSeconds: 1 / 60,
        alpha: 0.5,
        elapsedSeconds,
      };
      view.sync(player, context);
    };

    sync();
    player.activity = 'walking';
    player.locomotionIntensity = 1;
    player.facing = Math.PI / 2;

    let previous = actor.rotation.y;
    let largestStep = 0;
    for (let frame = 0; frame < 30; frame += 1) {
      player.position.x += player.walkSpeed / 60;
      sync();
      largestStep = Math.max(largestStep, Math.abs(actor.rotation.y - previous));
      previous = actor.rotation.y;
      if (frame === 0) {
        expect(actor.rotation.y).toBeGreaterThan(0);
        expect(actor.rotation.y).toBeLessThan(0.12);
      }
    }

    expect(largestStep).toBeLessThan(0.11);
    expect(Math.abs(actor.rotation.y - Math.PI / 2)).toBeLessThan(0.02);
    expect(player.facing).toBe(Math.PI / 2);
    view.dispose();
  });
});

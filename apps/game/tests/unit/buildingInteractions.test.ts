import { describe, expect, it } from 'vitest';
import { BUILDING_KINDS, type BuildingKind } from '@farmrise/shared';
import type { InputSystem } from '@engine/input/InputSystem.js';
import { IncidentDirector } from '@game/events/IncidentDirector.js';
import type { GameAction } from '@game/GameActions.js';
import { Player } from '@game/player/Player.js';
import { PlayerController } from '@game/player/PlayerController.js';
import { InteractionController } from '@game/systems/InteractionController.js';
import { BUILDING_INTERACTIONS, buildingInteraction } from '@game/world/buildingInteractions.js';
import { makeCareer } from '../helpers/career.js';

const STEP = { stepSeconds: 1 / 60, tick: 0 };

const ACTIONABLE = [
  ['barn', 'storage', 'Inspect Barn'],
  ['loading_pad', 'storage', 'Inspect Loading pad'],
  ['cold_store', 'storage', 'Inspect Cold store'],
  ['animal_shelter', 'livestock', 'Manage Animal Shelter'],
  ['worker_hut', 'workforce', 'Manage Worker hut'],
  ['mill', 'processing', 'Manage Stone Mill'],
  ['creamery', 'processing', 'Manage Creamery'],
  ['preserve_kitchen', 'processing', 'Manage Preserve Kitchen'],
] as const;

const PASSIVE = ['irrigation', 'road', 'fence', 'water_trough', 'well'] as const;

describe('building interaction audit', () => {
  it('classifies every building exactly once', () => {
    expect(Object.keys(BUILDING_INTERACTIONS).sort()).toEqual([...BUILDING_KINDS].sort());
  });

  it.each(ACTIONABLE)('%s exposes its contextual prompt and action', (kind, action, label) => {
    const { interaction, prompts, requests } = setUp(kind, false, true);

    interaction.fixedUpdate(STEP);

    expect(prompts).toEqual([label]);
    expect(requests).toEqual([{ buildingId: `test-${kind}`, kind, interaction: action }]);
  });

  it.each(PASSIVE)('%s intentionally has no healthy action prompt', (kind) => {
    const { interaction, prompts, requests } = setUp(kind, false, true);

    interaction.fixedUpdate(STEP);

    expect(buildingInteraction(kind)).toBe('passive');
    expect(prompts).toEqual([]);
    expect(requests).toEqual([]);
  });

  it.each(BUILDING_KINDS)('%s can be repaired from outside its footprint', (kind) => {
    const { interaction, prompts, career } = setUp(kind, true, true);

    interaction.fixedUpdate(STEP);

    expect(prompts).toEqual([expect.stringMatching(/^Repair /)]);
    expect(career.world.structures.get(`test-${kind}`)?.broken).toBe(false);
  });

  it('does not expose an action while a building is still under construction', () => {
    const { interaction, prompts, requests } = setUp('preserve_kitchen', false, true, 60);

    interaction.fixedUpdate(STEP);

    expect(prompts).toEqual([]);
    expect(requests).toEqual([]);
  });

  it('labels a processor as Load when the player carries its recipe input', () => {
    const setup = setUp('preserve_kitchen', false, false);
    setup.career.world.carry.pickUp('pumpkin', 3);

    setup.interaction.fixedUpdate(STEP);

    expect(setup.prompts).toEqual(['Load Preserve Kitchen']);
  });
});

function setUp(
  kind: BuildingKind,
  broken: boolean,
  pressInteract: boolean,
  remainingBuildTicks = 0,
) {
  const career = makeCareer();
  const world = career.world;
  world.structures.add({
    id: `test-${kind}`,
    kind,
    tileX: 24,
    tileZ: 20,
    rotation: 0,
    remainingBuildTicks,
    broken,
  });
  const at = world.grid.tileToWorld(23, 20);
  const player = new Player(at.x, at.z);
  const input = {
    wasPressed: (action: GameAction) => pressInteract && action === 'interact',
    isDown: () => false,
    axis: () => 0,
  } as unknown as InputSystem<GameAction>;
  const interaction = new InteractionController(
    career,
    player,
    new PlayerController(player, world, world.physics, input),
    new IncidentDirector(career),
    input,
  );
  const prompts: string[] = [];
  const requests: Array<{ buildingId: string; kind: BuildingKind; interaction: string }> = [];
  interaction.events.on('interaction:prompt', ({ label }) => {
    if (label) prompts.push(label);
  });
  interaction.events.on('interaction:building-requested', (request) => requests.push(request));
  return { career, interaction, prompts, requests };
}

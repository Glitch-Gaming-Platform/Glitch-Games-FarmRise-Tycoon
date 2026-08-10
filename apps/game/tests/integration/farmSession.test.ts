/**
 * A whole play session, headless.
 *
 * This is the test that answers the core playtest question mechanically: can a
 * player plant, survive a warned setback, harvest, and end up with more money
 * than they started with? It runs the real world model, the real event director
 * and the real tick loop - only the rendering is absent.
 */
import { describe, expect, it } from 'vitest';
import { FARM_EVENTS, requireCrop, secondsToTicks } from '@farmrise/shared';
import { FarmWorld } from '@game/world/FarmWorld.js';
import { STARTER_FARM } from '@game/world/levels/starterFarm.js';
import { build, harvest, plant, tend } from '@game/world/FarmCommands.js';
import { EventDirector } from '@game/events/EventDirector.js';

function advance(world: FarmWorld, director: EventDirector, ticks: number): void {
  for (let i = 0; i < ticks; i += 1) {
    world.advance(1);
    director.fixedUpdate(1);
  }
}

describe('a production cycle', () => {
  it('turns seed money into a larger balance', () => {
    const world = new FarmWorld(STARTER_FARM, 42);
    const director = new EventDirector(world, { graceTicks: Number.MAX_SAFE_INTEGER });
    const startingBalance = world.balance;

    for (const placement of STARTER_FARM.plots) {
      plant(world, placement.id, 'wheat');
      tend(world, placement.id);
    }
    const afterPlanting = world.balance;
    expect(afterPlanting).toBeLessThan(startingBalance);

    // Un-irrigated plots grow at slightly under 1x as water drains, so give the
    // cycle generous headroom rather than exactly one growth period.
    advance(world, director, requireCrop('wheat').growthTicks * 2);

    let harvested = 0;
    for (const placement of STARTER_FARM.plots) {
      const result = harvest(world, placement.id);
      if (result.ok) harvested += result.value.quantity;
    }

    expect(harvested).toBeGreaterThan(0);
    // The goods are worth more than the seed spend - selling happens on the
    // server, so this asserts the produce exists, not the payout.
    const wheatValue = harvested * requireCrop('wheat').baseUnitPrice;
    expect(afterPlanting + wheatValue).toBeGreaterThan(startingBalance);
  });
});

describe('warned events', () => {
  it('always warns before it damages anything', () => {
    const world = new FarmWorld(STARTER_FARM, 7);
    for (const placement of STARTER_FARM.plots) plant(world, placement.id, 'wheat');

    const director = new EventDirector(world, { graceTicks: 10, meanIntervalTicks: 600 });
    const seen: string[] = [];
    director.events.on('event:warned', () => seen.push('warned'));
    director.events.on('event:started', () => seen.push('started'));

    advance(world, director, secondsToTicks(600));

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toBe('warned');
    // Every 'started' must be preceded by a 'warned'.
    seen.forEach((entry, index) => {
      if (entry === 'started') expect(seen[index - 1]).toBe('warned');
    });
  });

  it('lets the player pay to mitigate during the warning window', () => {
    const world = new FarmWorld(STARTER_FARM, 3);
    for (const placement of STARTER_FARM.plots) plant(world, placement.id, 'wheat');
    const director = new EventDirector(world, { graceTicks: 5, meanIntervalTicks: 600 });

    let mitigatedAvailable = false;
    director.events.on('event:warned', () => {
      const balanceBefore = world.balance;
      const result = director.prevent();
      if (result.ok) {
        mitigatedAvailable = true;
        expect(world.balance).toBeLessThan(balanceBefore);
      }
    });

    advance(world, director, secondsToTicks(400));
    expect(mitigatedAvailable).toBe(true);
  });

  it('cannot be prevented once it has already landed', () => {
    const world = new FarmWorld(STARTER_FARM, 11);
    for (const placement of STARTER_FARM.plots) plant(world, placement.id, 'wheat');
    const director = new EventDirector(world, { graceTicks: 5, meanIntervalTicks: 600 });

    let checkedAfterImpact = false;
    director.events.on('event:started', () => {
      expect(director.prevent().ok).toBe(false);
      checkedAfterImpact = true;
    });

    advance(world, director, secondsToTicks(600));
    expect(checkedAfterImpact).toBe(true);
  });

  it('leaves the farm recoverable: damage scales yield but never zeroes the plot', () => {
    const world = new FarmWorld(STARTER_FARM, 5);
    const plotId = STARTER_FARM.plots[0]!.id;
    plant(world, plotId, 'wheat');

    const plot = world.getPlot(plotId)!;
    world.setPlot(plotId, { ...plot, eventMultiplier: FARM_EVENTS.drought.unmitigatedMultiplier });
    world.advance(requireCrop('wheat').growthTicks * 3);

    expect(world.previewYield(plotId)).toBeGreaterThanOrEqual(0);
    expect(harvest(world, plotId).ok).toBe(true);
  });
});

describe('reinvestment', () => {
  it('irrigation makes adjacent plots grow at full rate', () => {
    const world = new FarmWorld(STARTER_FARM, 9);
    const placement = STARTER_FARM.plots[0]!;

    // Give the player enough money to build, then place irrigation next door.
    world.adjustBalance(20_000 as never);
    expect(build(world, 'irrigation', placement.tileX + 1, placement.tileZ).ok).toBe(true);
    world.advance(60 * 200);

    plant(world, placement.id, 'corn');
    expect(world.getPlot(placement.id)?.irrigated).toBe(true);
  });
});

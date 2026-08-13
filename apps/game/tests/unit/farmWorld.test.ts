import { beforeEach, describe, expect, it } from 'vitest';
import {
  ANIMALS,
  BUYER_DEFINITIONS,
  GAME_DAY_TICKS,
  BUILDINGS,
  ITEM_IDS,
  CROPS,
  RECIPES,
  RECIPES_BY_ID,
  STARTER_SHELTER_ID,
  actionTicks,
  cents,
  requireCrop,
  storageUsed,
  animalShelterProductDropTile,
} from '@farmrise/shared';
import { Career } from '@game/career/Career.js';
import {
  build,
  buildingSiteProblem,
  acceptContract,
  buyAnimal,
  buyLand,
  collectStack,
  deliverContract,
  harvest,
  hireWorker,
  plant,
  queueProcessing,
  sellableInventory,
  sellSpot,
  tend,
  withdrawStored,
} from '@game/world/FarmCommands.js';
import {
  addToYard,
  firstPlotId,
  fundedCareer,
  growAndHarvest,
  makeCareer,
  setBalance,
} from '../helpers/career.js';

let career: Career;

beforeEach(() => {
  career = fundedCareer();
});

describe('career farming commands', () => {
  it('charges seed, refuses invalid planting, and clears a harvested plot', () => {
    const plotId = firstPlotId(career);
    const before = career.balance;
    expect(plant(career, plotId, 'wheat').ok).toBe(true);
    expect(career.balance).toBe(before - CROPS.wheat!.seedCost);
    expect(plant(career, plotId, 'corn').ok).toBe(false);
    expect(plant(career, 'missing', 'diamonds').ok).toBe(false);

    career.advance(requireCrop('wheat').growthTicks * 2);
    expect(harvest(career, plotId).ok).toBe(true);
    expect(career.world.getPlot(plotId)?.cropId).toBeNull();
    expect(career.world.carry.used).toBeGreaterThan(0);
  });

  it('refuses a seed the career cannot afford', () => {
    setBalance(career, 0);
    expect(plant(career, firstPlotId(career), 'pumpkin').ok).toBe(false);
  });

  it('only sells seasonal seed during its planting season', () => {
    expect(career.season).toBe('spring');
    expect(plant(career, firstPlotId(career), 'strawberry').ok).toBe(true);
    expect(plant(career, career.world.fields.placements[1]!.id, 'avocado').ok).toBe(false);
  });

  it('rewards tending with at least as much harvested produce', () => {
    const untended = makeCareer({ balance: career.balance }, 'untended');
    const untendedTotal = growAndHarvest(untended);

    const tended = makeCareer({ balance: career.balance }, 'tended');
    const plotId = firstPlotId(tended);
    expect(plant(tended, plotId, 'wheat').ok).toBe(true);
    expect(tend(tended, plotId).ok).toBe(true);
    tended.advance(requireCrop('wheat').growthTicks * 2);
    const result = harvest(tended, plotId);
    expect(result.ok).toBe(true);
    const tendedTotal = result.ok ? result.value.carried + result.value.leftInField : 0;
    expect(tendedTotal).toBeGreaterThanOrEqual(untendedTotal);
  });

  it('keeps each localized store within its own capacity', () => {
    const yard = career.world.stores.get('store-yard')!;
    career.world.stores.deposit(yard.id, 'wheat', yard.capacity + 50);
    expect(storageUsed(yard.items)).toBeLessThanOrEqual(yard.capacity);
  });

  it('accounts for heavy processed goods in carry capacity', () => {
    const outcome = career.world.carry.pickUp('cheese', 10);
    expect(outcome.taken).toBe(4);
    expect(career.world.carry.used).toBe(career.world.carry.capacity);
  });
});

describe('construction and collision', () => {
  it('keeps the trough always purchasable for $10', () => {
    const before = career.balance;
    const result = build(career, 'water_trough', 10, 12);

    expect(result.ok).toBe(true);
    expect(career.balance).toBe(before - 1_000);
    expect(BUILDINGS.water_trough.requiresUnlock).toBeNull();
  });

  it('unlocks the $30 animal shelter at Stage 1 and reserves its product area', () => {
    expect(build(career, 'animal_shelter', 20, 18).ok).toBe(false);
    career.grant(['animal_shelters']);
    const before = career.balance;
    const result = build(career, 'animal_shelter', 20, 18);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(career.balance).toBe(before - 3_000);
    const drop = animalShelterProductDropTile(20, 18, 0);
    expect(build(career, 'road', drop.tileX, drop.tileZ).ok).toBe(false);
  });

  it('charges for a building, reserves its footprint, then creates storage on completion', () => {
    const beforeBalance = career.balance;
    const beforeCapacity = career.world.storageCapacity;
    const result = build(career, 'barn', 20, 18);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(career.balance).toBe(beforeBalance - BUILDINGS.barn.buildCost);
    expect(build(career, 'road', 20, 18).ok).toBe(false);
    expect(career.world.storageCapacity).toBe(beforeCapacity);

    career.advance(BUILDINGS.barn.buildTicks + 1);
    expect(career.world.storageCapacity).toBeGreaterThan(beforeCapacity);
    expect(career.world.stores.stores.some((store) => store.buildingId === result.value.id)).toBe(
      true,
    );
  });

  it('refuses beds and unowned parcels, while roads remain walkable', () => {
    const bed = career.world.fields.placements[0]!;
    expect(build(career, 'barn', bed.tileX, bed.tileZ).ok).toBe(false);
    // The anchor is open, but the barn's second tile would cover plot 1.
    expect(build(career, 'barn', bed.tileX - 1, bed.tileZ).ok).toBe(false);
    const productDrop = career.world.level.animalProductDrop;
    expect(build(career, 'road', productDrop.tileX, productDrop.tileZ).ok).toBe(false);
    const productDropWorld = career.world.grid.tileToWorld(productDrop.tileX, productDrop.tileZ);
    expect(career.world.physics.isBlockedWorld(productDropWorld.x, productDropWorld.z)).toBe(false);
    expect(build(career, 'road', 4, 4).ok).toBe(false);
    expect(build(career, 'road', 10, 12).ok).toBe(true);
    const road = career.world.grid.tileToWorld(10, 12);
    expect(career.world.physics.isBlockedWorld(road.x, road.z)).toBe(false);
  });

  it('reserves all three Starter Extension beds from structures before and after purchase', () => {
    for (const [tileX, tileZ] of [
      [13, 6],
      [15, 6],
      [17, 6],
    ] as const) {
      expect(build(career, 'road', tileX, tileZ).ok).toBe(false);
    }

    expect(buyLand(career, 'parcel-starter-extension').ok).toBe(true);
    const extensionBeds = career.world.fields.placements.filter((plot) =>
      /^plot-n[567]$/.test(plot.id),
    );
    expect(extensionBeds).toHaveLength(3);
    for (const bed of extensionBeds) {
      expect(build(career, 'road', bed.tileX, bed.tileZ).ok).toBe(false);
      expect(plant(career, bed.id, 'wheat').ok).toBe(true);
    }
  });

  it('keeps the shelter collision outside the visible structure', () => {
    const shelter = career.world.grid.tileToWorld(
      career.world.level.shelter.tileX,
      career.world.level.shelter.tileZ,
    );
    const body = { position: { x: shelter.x, z: shelter.z + 3 }, radius: 0.45 };
    let collided = false;
    for (let step = 0; step < 20; step += 1) {
      collided ||= career.world.physics.moveCharacter(body, 0, -0.2).collided;
    }
    expect(collided).toBe(true);
    expect(body.position.z).toBeGreaterThan(shelter.z + 1);
  });
});

describe('livestock and persistence', () => {
  it('unlocks sheep after Stage 1 and shears slow, non-spoiling wool from stored corn', () => {
    career.world.livestock.hydrate([]);
    expect(buyAnimal(career, 'sheep').ok).toBe(false);
    career.grant(['animal_shelters']);
    const before = career.balance;

    expect(buyAnimal(career, 'sheep').ok).toBe(true);
    expect(career.balance).toBe(before - ANIMALS.sheep.purchaseCost);
    const sheep = career.world.livestock.groups.find((group) => group.species === 'sheep');
    expect(sheep?.shelterId).toBe(STARTER_SHELTER_ID);
    expect(career.world.shelterSlotsUsedAt(STARTER_SHELTER_ID)).toBe(2);
    expect(career.world.shelterSlotsAvailableAt(STARTER_SHELTER_ID)).toBe(2);

    career.advance(ANIMALS.sheep.cycleTicks - 1);
    expect(career.world.stores.totalOf('wool')).toBe(0);
    career.advance(1);
    expect(career.world.stores.totalOf('wool')).toBe(4);
    expect(career.world.stores.storedTotalOf('corn')).toBe(1);

    career.world.stores.advance(GAME_DAY_TICKS * 20, 1, 6);
    expect(career.world.stores.totalOf('wool')).toBe(4);
  });

  it('assigns new livestock to the nearest completed shelter and drops produce there', () => {
    career.grant(['animal_shelters']);
    const shelter = build(career, 'animal_shelter', 20, 18);
    expect(shelter.ok).toBe(true);
    if (!shelter.ok) return;

    // Construction sites do not attract livestock or provide capacity.
    expect(buyAnimal(career, 'chicken', 3, { tileX: 21, tileZ: 19 }).ok).toBe(false);
    career.advance(BUILDINGS.animal_shelter.buildTicks + 1);
    expect(buyAnimal(career, 'chicken', 1, { tileX: 21, tileZ: 19 }).ok).toBe(true);

    const remote = career.world.livestock.groups.find(
      (group) => group.shelterId === shelter.value.id,
    );
    expect(remote?.count).toBe(1);
    expect(remote?.tileX).toBe(20);
    expect(remote?.tileZ).toBe(18);

    addToYard(career, 'corn', 20);
    career.advance(ANIMALS.chicken.cycleTicks + 1);
    const drop = animalShelterProductDropTile(20, 18, 0);
    expect(career.world.stores.get(`stack-${drop.tileX}-${drop.tileZ}`)?.items.eggs).toBe(4);
  });

  it('skips a full nearest shelter and assigns sheep to the nearest shelter with two free slots', () => {
    career.world.livestock.hydrate([]);
    career.grant(['animal_shelters']);
    const shelter = build(career, 'animal_shelter', 20, 18);
    expect(shelter.ok).toBe(true);
    if (!shelter.ok) return;
    career.advance(BUILDINGS.animal_shelter.buildTicks + 1);

    expect(buyAnimal(career, 'chicken', 4, { tileX: 19, tileZ: 16 }).ok).toBe(true);
    expect(career.world.shelterSlotsAvailableAt(STARTER_SHELTER_ID)).toBe(0);
    expect(buyAnimal(career, 'sheep', 1, { tileX: 19, tileZ: 16 }).ok).toBe(true);

    const sheep = career.world.livestock.groups.find((group) => group.species === 'sheep');
    expect(sheep?.shelterId).toBe(shelter.value.id);
    expect(career.world.shelterSlotsUsedAt(shelter.value.id)).toBe(2);
    expect(career.world.shelterSlotsAvailableAt(shelter.value.id)).toBe(2);
  });

  it('does not silently buy into another shelter when a contextual shelter is full', () => {
    career.grant(['animal_shelters']);
    const shelter = build(career, 'animal_shelter', 20, 18);
    expect(shelter.ok).toBe(true);
    if (!shelter.ok) return;
    career.advance(BUILDINGS.animal_shelter.buildTicks + 1);

    expect(
      buyAnimal(career, 'chicken', 4, {
        tileX: 20,
        tileZ: 18,
        shelterId: shelter.value.id,
      }).ok,
    ).toBe(true);
    expect(career.world.shelterSlotsAvailableAt(STARTER_SHELTER_ID)).toBeGreaterThanOrEqual(2);

    const sheep = buyAnimal(career, 'sheep', 1, {
      tileX: 20,
      tileZ: 18,
      shelterId: shelter.value.id,
    });
    expect(sheep.ok).toBe(false);
    expect(career.world.livestock.countOf('sheep')).toBe(0);
  });

  it('rejects a sheep when site-wide free slots are fragmented across full local shelters', () => {
    career.world.livestock.hydrate([]);
    career.grant(['animal_shelters']);
    const shelter = build(career, 'animal_shelter', 20, 18);
    expect(shelter.ok).toBe(true);
    if (!shelter.ok) return;
    career.advance(BUILDINGS.animal_shelter.buildTicks + 1);
    career.world.livestock.hydrate([
      {
        id: 'animals-starter',
        species: 'chicken',
        shelterId: STARTER_SHELTER_ID,
        count: 3,
        cycleTicks: 0,
        tileX: career.world.level.shelter.tileX,
        tileZ: career.world.level.shelter.tileZ,
        sheltered: false,
      },
      {
        id: 'animals-remote',
        species: 'chicken',
        shelterId: shelter.value.id,
        count: 3,
        cycleTicks: 0,
        tileX: 20,
        tileZ: 18,
        sheltered: false,
      },
    ]);

    expect(career.world.shelterCapacity() - career.world.animalSlotsUsed()).toBe(2);
    expect(career.world.maxShelterSlotsAvailable()).toBe(1);
    const result = buyAnimal(career, 'sheep', 1, { tileX: 19, tileZ: 16 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no single shelter/i);
  });

  it('does not move an existing flock when a nearer shelter finishes later', () => {
    const starter = career.world.livestock.groups[0]!;
    career.grant(['animal_shelters']);
    const shelter = build(career, 'animal_shelter', 20, 18);
    expect(shelter.ok).toBe(true);
    if (!shelter.ok) return;
    career.advance(BUILDINGS.animal_shelter.buildTicks + 1);

    expect(starter.shelterId).toBe(STARTER_SHELTER_ID);
    expect(career.world.livestock.groups).toHaveLength(1);
  });

  it('keeps tutorial eggs on the ground until the lesson can be completed', () => {
    career.world.dropAt(19, 17, 'eggs', 4, 1);
    const stack = career.world.stores.stores.find((store) => store.id === 'stack-19-17')!;

    career.world.stores.advance(GAME_DAY_TICKS, 1, 6, ['eggs']);
    expect(stack.items.eggs).toBe(4);
    expect(stack.quality.eggs).toBe(1);

    career.world.stores.advance(GAME_DAY_TICKS, 1, 6);
    expect(stack.items.eggs).toBeLessThan(4);
  });

  it('reports when the last goods in a field pile spoil away', () => {
    const placement = career.world.fields.placements[0]!;
    career.world.dropAt(placement.tileX, placement.tileZ, 'pea', 1, 1);
    const spoiled: Array<{ items: Readonly<Record<string, number>>; emptied: boolean }> = [];
    career.world.events.on('world:goods-spoiled', ({ items, emptied }) =>
      spoiled.push({ items, emptied }),
    );

    career.advance(GAME_DAY_TICKS * 3);

    expect(spoiled).toContainEqual({ items: { pea: 1 }, emptied: true });
  });

  it('enforces shelter capacity and produces only when feed exists', () => {
    expect(buyAnimal(career, 'chicken', 99).ok).toBe(false);
    expect(career.world.stores.withdraw('store-yard', 'corn', 2).ok).toBe(true);
    career.advance(ANIMALS.chicken.cycleTicks + 1);
    expect(career.world.inventory.eggs ?? 0).toBe(0);

    addToYard(career, 'corn', 20);
    career.advance(ANIMALS.chicken.cycleTicks + 1);
    const eggStack = career.world.stores.stores.find(
      (store) => store.id.startsWith('stack-') && (store.items.eggs ?? 0) > 0,
    );
    expect(eggStack).toBeDefined();
    expect(career.world.stores.get('store-yard')?.items.eggs ?? 0).toBe(0);
    expect(collectStack(career, eggStack!.tileX, eggStack!.tileZ).ok).toBe(true);
    expect(career.world.carry.items.eggs ?? 0).toBeGreaterThan(0);
  });

  it('requires feed to be stored at the shelter rather than left in a field pile', () => {
    expect(career.world.stores.withdraw('store-yard', 'corn', 3).ok).toBe(true);
    career.world.dropAt(13, 13, 'corn', 3, 1);
    const hungry: Array<{ needed: number; available: number }> = [];
    career.world.events.on('world:animal-hungry', ({ needed, available }) =>
      hungry.push({ needed, available }),
    );

    career.advance(ANIMALS.chicken.cycleTicks + 1);

    expect(career.world.stores.get('stack-13-13')?.items.corn).toBe(3);
    expect(career.world.inventory.eggs ?? 0).toBe(0);
    expect(hungry.at(-1)).toEqual({ needed: 2, available: 0 });
  });

  it('pauses the starter clutch until the egg lesson enables animal production', () => {
    const hens = career.world.livestock.groups.find((group) => group.species === 'chicken')!;
    const before = hens.cycleTicks;

    career.advance(600, ['eggs'], false);
    expect(hens.cycleTicks).toBe(before);
    expect(career.world.inventory.eggs ?? 0).toBe(0);

    career.advance(600, ['eggs'], true);
    expect(career.world.inventory.eggs).toBe(8);
  });

  it('finishes the already-fed onboarding clutch when a resumed farm has no corn', () => {
    expect(career.world.stores.withdraw('store-yard', 'corn', 3).ok).toBe(true);
    const hens = career.world.livestock.groups.find((group) => group.species === 'chicken')!;
    const remaining = ANIMALS.chicken.cycleTicks - hens.cycleTicks;

    career.advance(remaining, ['eggs'], true, ['chicken']);

    const drop = career.world.level.animalProductDrop;
    expect(career.world.stores.get(`stack-${drop.tileX}-${drop.tileZ}`)?.items.eggs).toBe(8);
    expect(career.world.stores.storedTotalOf('corn')).toBe(0);

    career.advance(ANIMALS.chicken.cycleTicks, ['eggs'], true);
    expect(career.world.stores.totalOf('eggs')).toBe(8);
  });

  it('moves animal-product baskets from old unreachable save locations to the collection point', () => {
    const state = career.toSaveState();
    const site = state.sites[0]!;
    const resumed = Career.fromSaveState({
      ...state,
      sites: [
        {
          ...site,
          stores: [
            ...site.stores,
            {
              id: 'stack-19-16',
              buildingId: null,
              tileX: 19,
              tileZ: 16,
              capacity: 999,
              preserving: false,
              items: { eggs: 8 },
              quality: { eggs: 0.75 },
              spoilageRemainder: { eggs: 0.4 },
            },
          ],
        },
      ],
    });
    const drop = resumed.world.level.animalProductDrop;

    expect(resumed.world.stores.get('stack-19-16')).toBeUndefined();
    expect(resumed.world.stores.get(`stack-${drop.tileX}-${drop.tileZ}`)?.items.eggs).toBe(8);
    expect(resumed.world.stores.get(`stack-${drop.tileX}-${drop.tileZ}`)?.quality.eggs).toBeCloseTo(
      0.75,
    );
  });

  it('makes collected animal products sellable but excludes baskets still on the ground', () => {
    const hens = career.world.livestock.groups.find((group) => group.species === 'chicken')!;
    const remaining = ANIMALS.chicken.cycleTicks - hens.cycleTicks;
    career.advance(remaining - 1);
    career.advance(1);
    const eggStack = career.world.stores.stores.find(
      (store) => store.id.startsWith('stack-') && (store.items.eggs ?? 0) > 0,
    )!;
    expect(sellableInventory(career).eggs ?? 0).toBe(0);

    const collected = collectStack(career, eggStack.tileX, eggStack.tileZ);
    expect(collected.ok).toBe(true);
    expect(sellableInventory(career).eggs).toBe(8);
    expect(sellSpot(career, 'eggs', 8).ok).toBe(true);
    expect(career.world.carry.items.eggs).toBe(0);
  });

  it('lists and pays for every tradeable item, including cranberries and animal products', () => {
    for (const itemId of ITEM_IDS) {
      const itemCareer = fundedCareer();
      const existing = sellableInventory(itemCareer)[itemId] ?? 0;
      addToYard(itemCareer, itemId, 2);
      const before = itemCareer.balance;

      expect(sellableInventory(itemCareer)[itemId]).toBe(existing + 2);
      const result = sellSpot(itemCareer, itemId, 2);

      expect(result.ok, itemId).toBe(true);
      if (!result.ok) continue;
      expect(result.value.payout, itemId).toBeGreaterThan(0);
      expect(itemCareer.balance, itemId).toBe(before + result.value.payout);
      expect(sellableInventory(itemCareer)[itemId] ?? 0, itemId).toBe(existing);
      expect(itemCareer.statistics.itemsSold, itemId).toBe(2);
    }
  });

  it('charges for purchased animals and adds them to the existing herd', () => {
    const beforeBalance = career.balance;
    const beforeHens = career.world.livestock.countOf('chicken');

    expect(buyAnimal(career, 'chicken', 1).ok).toBe(true);

    expect(career.balance).toBe(beforeBalance - ANIMALS.chicken.purchaseCost);
    expect(career.world.livestock.countOf('chicken')).toBe(beforeHens + 1);
  });

  it('turns clover into collectible milk on a normal dairy-cow cycle', () => {
    const shelter = career.world.level.shelter;
    career.world.livestock.hydrate([
      {
        id: 'animals-cow-test',
        species: 'cow',
        shelterId: STARTER_SHELTER_ID,
        count: 2,
        cycleTicks: 0,
        tileX: shelter.tileX,
        tileZ: shelter.tileZ,
        sheltered: false,
      },
    ]);
    addToYard(career, 'clover', 20);

    career.advance(ANIMALS.cow.cycleTicks - 1);
    expect(career.world.stores.totalOf('milk')).toBe(0);
    expect(career.world.stores.totalOf('clover')).toBe(20);

    career.advance(1);
    expect(career.world.stores.totalOf('clover')).toBe(14);
    expect(career.world.stores.totalOf('milk')).toBe(12);

    const milkStack = career.world.stores.stores.find(
      (store) => store.id.startsWith('stack-') && (store.items.milk ?? 0) > 0,
    );
    expect(milkStack).toBeDefined();
    expect(collectStack(career, milkStack!.tileX, milkStack!.tileZ).ok).toBe(true);
    expect(career.world.carry.items.milk ?? 0).toBeGreaterThan(0);
    expect(sellableInventory(career).milk).toBeGreaterThan(0);
    expect(sellSpot(career, 'milk', 1).ok).toBe(true);
  });

  it('round-trips the complete career, including localized stores and construction', () => {
    expect(plant(career, firstPlotId(career), 'corn').ok).toBe(true);
    expect(build(career, 'road', 10, 12).ok).toBe(true);
    addToYard(career, 'wheat', 5);
    career.advance(500);

    const state = career.toSaveState();
    const restored = Career.fromSaveState(state);
    expect(restored.toSaveState()).toEqual(state);
    expect(restored.world.getPlot(firstPlotId(restored))?.cropId).toBe('corn');
    expect(restored.world.inventory.wheat).toBe(5);
  });
});

describe('processing and workers', () => {
  it('loads processing inputs from the carried pack before collected storage', () => {
    career.grant(['processing']);
    const placed = build(career, 'preserve_kitchen', 20, 18);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    career.advance(BUILDINGS.preserve_kitchen.buildTicks + 1);
    career.world.carry.pickUp('pumpkin', 3);

    expect(queueProcessing(career, placed.value.id, 'recipe-preserves', 1).ok).toBe(true);
    expect(career.world.carry.items.pumpkin ?? 0).toBe(0);
    expect(career.world.processing.forBuilding(placed.value.id)?.queue).toHaveLength(1);
  });

  it('does not remotely load an uncollected field pile into a processor', () => {
    career.grant(['processing']);
    const placed = build(career, 'mill', 20, 18);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    career.advance(BUILDINGS.mill.buildTicks + 1);
    career.world.dropAt(22, 20, 'wheat', 4, 1);

    expect(queueProcessing(career, placed.value.id, 'recipe-flour', 1).ok).toBe(false);
  });

  it('withdraws from the selected storage building and clamps to carrier capacity', () => {
    const placed = build(career, 'barn', 20, 18);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    career.advance(BUILDINGS.barn.buildTicks + 1);
    const store = career.world.stores.stores.find(
      (candidate) => candidate.buildingId === placed.value.id,
    );
    expect(store).toBeDefined();
    if (!store) return;
    career.world.stores.deposit(store.id, 'wheat', 20, 1);

    const taken = withdrawStored(career, placed.value.id, 19, 18, 'wheat', 20);
    expect(taken).toEqual({ ok: true, value: { taken: 8 } });
    expect(career.world.carry.items.wheat).toBe(8);
    expect(store.items.wheat).toBe(12);
    expect(withdrawStored(career, placed.value.id, 19, 18, 'wheat', 1).ok).toBe(false);
  });

  it('lets an accepted processed-goods contract reveal only its required processor', () => {
    career.grant(['contracts']);
    const acceptedTick = career.tick;
    const accepted = acceptContract(career, {
      id: 'offer-preserves-regression',
      buyerId: 'growers_co_op',
      itemId: 'preserves',
      quantity: 21,
      unitPrice: cents(342),
      minimumQuality: 0,
      deadlineTick: acceptedTick + 1,
    });

    expect(accepted.ok).toBe(true);
    expect(career.contracts.at(-1)?.deadlineTick).toBe(
      acceptedTick + BUYER_DEFINITIONS.growers_co_op.deadlineTicks,
    );
    expect(build(career, 'preserve_kitchen', 20, 18).ok).toBe(true);
    expect(build(career, 'mill', 22, 18).ok).toBe(false);
  });

  it('counts processed goods when a batch finishes, not when it is queued', () => {
    career.grant(['processing']);
    const placed = build(career, 'mill', 20, 18);
    expect(placed.ok).toBe(true);
    if (!placed.ok) throw new Error(placed.reason);
    career.advance(BUILDINGS.mill.buildTicks + 1);
    addToYard(career, 'wheat', 8);
    expect(queueProcessing(career, placed.value.id, 'recipe-flour', 1).ok).toBe(true);
    expect(career.statistics.goodsProcessed).toBe(0);
    const storageCapacity = career.world.storageCapacity;

    career.advance(RECIPES_BY_ID['recipe-flour']!.batchTicks + 1);
    expect(career.statistics.goodsProcessed).toBe(2);
    expect(career.world.stores.totalOf('flour')).toBe(2);
    expect(career.world.storageCapacity).toBe(storageCapacity);
  });

  it.each(RECIPES)(
    'turns inputs into $outputItemId and fulfills its matching contract',
    (recipe) => {
      const processingCareer = fundedCareer();
      processingCareer.grant(['contracts', 'processing']);
      const placement = Array.from({ length: 16 * 16 }, (_, index) => ({
        tileX: 8 + (index % 16),
        tileZ: 8 + Math.floor(index / 16),
      })).find(
        ({ tileX, tileZ }) =>
          Math.abs(tileX - 19) + Math.abs(tileZ - 16) > 3 &&
          buildingSiteProblem(processingCareer, recipe.processor, tileX, tileZ) === null,
      );
      expect(placement).toBeDefined();
      if (!placement) return;
      const placed = build(processingCareer, recipe.processor, placement.tileX, placement.tileZ);
      expect(placed.ok, placed.ok ? '' : placed.reason).toBe(true);
      if (!placed.ok) return;
      processingCareer.advance(BUILDINGS[recipe.processor].buildTicks + 1, [], false);
      addToYard(processingCareer, recipe.inputItemId, recipe.inputQuantity);

      expect(queueProcessing(processingCareer, placed.value.id, recipe.id, 1).ok).toBe(true);
      processingCareer.advance(recipe.batchTicks + 1, [], false);

      const outputStack = processingCareer.world.stores.stores.find(
        (store) => store.id.startsWith('stack-') && (store.items[recipe.outputItemId] ?? 0) > 0,
      );
      expect(outputStack).toBeDefined();
      if (!outputStack) return;
      expect(
        collectStack(processingCareer, outputStack.tileX, outputStack.tileZ, outputStack.id).ok,
      ).toBe(true);
      expect(
        processingCareer.world.carry.items[recipe.outputItemId],
        JSON.stringify(processingCareer.world.carry.items),
      ).toBe(recipe.outputQuantity);

      const contractId = `contract-${recipe.outputItemId}`;
      expect(
        acceptContract(processingCareer, {
          id: contractId,
          buyerId: 'growers_co_op',
          itemId: recipe.outputItemId,
          quantity: recipe.outputQuantity,
          unitPrice: cents(1),
          minimumQuality: 0,
          deadlineTick: processingCareer.tick + 1,
        }).ok,
      ).toBe(true);
      const delivered = deliverContract(processingCareer, contractId, recipe.outputQuantity);
      expect(delivered.ok, delivered.ok ? '' : delivered.reason).toBe(true);
      expect(processingCareer.contracts.find((entry) => entry.id === contractId)?.status).toBe(
        'fulfilled',
      );
    },
  );

  it('lets field hands tend and haulers move a completed repetitive job', () => {
    career.grant(['workers']);
    const hut = build(career, 'worker_hut', 20, 18);
    expect(hut.ok).toBe(true);
    career.advance(BUILDINGS.worker_hut.buildTicks + 1);
    expect(hireWorker(career, 'field_hand').ok).toBe(true);
    const fieldHand = career.world.workforce.workers[0]!;
    const plotId = firstPlotId(career);
    expect(plant(career, plotId, 'wheat').ok).toBe(true);
    career.advance(actionTicks(fieldHand) + 1);
    expect(career.world.getPlot(plotId)?.tendCount).toBeGreaterThan(0);

    const haulCareer = fundedCareer();
    haulCareer.grant(['workers']);
    const secondHut = build(haulCareer, 'worker_hut', 20, 18);
    expect(secondHut.ok).toBe(true);
    haulCareer.advance(BUILDINGS.worker_hut.buildTicks + 1);
    expect(hireWorker(haulCareer, 'hauler').ok).toBe(true);
    // The starter hens may have laid their onboarding clutch during the long
    // hut build. Remove that unrelated job so this assertion isolates wheat.
    for (const store of haulCareer.world.stores.stores) {
      if (store.id.startsWith('stack-')) haulCareer.world.stores.remove(store.id);
    }
    haulCareer.world.stores.add({
      id: 'stack-test',
      buildingId: null,
      tileX: 13,
      tileZ: 13,
      capacity: 999,
      preserving: false,
      items: { wheat: 10 },
      quality: { wheat: 1 },
      spoilageRemainder: {},
    });
    const before = haulCareer.world.stores.totalOf('wheat');
    const hauler = haulCareer.world.workforce.workers[0]!;
    haulCareer.advance(actionTicks(hauler) + 1);
    expect(haulCareer.world.stores.get('stack-test')?.items.wheat).toBeLessThan(10);
    expect(haulCareer.world.stores.totalOf('wheat')).toBe(before);
    expect(haulCareer.statistics.goodsHauled).toBeGreaterThan(0);
  });

  it('hires into the selected hut and refuses to redirect when that hut is occupied', () => {
    career.grant(['workers']);
    const placements: Array<{ tileX: number; tileZ: number }> = [];
    for (let tileZ = 8; tileZ < 28 && placements.length < 2; tileZ += 1) {
      for (let tileX = 8; tileX < 28 && placements.length < 2; tileX += 1) {
        if (buildingSiteProblem(career, 'worker_hut', tileX, tileZ) !== null) continue;
        const placed = build(career, 'worker_hut', tileX, tileZ);
        if (placed.ok) placements.push({ tileX, tileZ });
      }
    }
    const huts = career.world.structures.buildings.filter(
      (building) => building.kind === 'worker_hut',
    );
    expect(huts).toHaveLength(2);
    career.advance(BUILDINGS.worker_hut.buildTicks + 1);

    expect(hireWorker(career, 'field_hand', huts[0]!.id).ok).toBe(true);
    expect(hireWorker(career, 'hauler', huts[0]!.id).ok).toBe(false);
    expect(hireWorker(career, 'hauler', huts[1]!.id).ok).toBe(true);
    expect(career.world.workforce.workers.map((worker) => worker.hutBuildingId)).toEqual([
      huts[0]!.id,
      huts[1]!.id,
    ]);
    expect(placements).toHaveLength(2);
  });
});

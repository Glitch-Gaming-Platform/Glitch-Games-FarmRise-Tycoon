/**
 * Translates input into farm commands.
 *
 * This is the only place that connects "the player pressed E" to "plant wheat".
 * Progression added a dozen verbs, and the rule from
 * docs/PROGRESSION_GAMEPLAY_PLAN.md §38.1 is that they must not each get a key:
 * one context action resolves to whatever the player is standing in front of,
 * and the prompt says which verb that is before they commit to it.
 *
 * Priority order is by proximity of intent, not by system: a bed you are
 * standing on beats a barn two tiles away, and an incident you can still answer
 * beats both, because that is the one with a clock on it.
 */
import {
  CROPS,
  ANIMALS,
  BUILDINGS,
  STARTER_SHELTER_ID,
  buildingFootprint,
  FIELD_SPOILAGE_MULTIPLIER,
  STORED_SPOILAGE_MULTIPLIER,
  THIRSTY_WATER,
  formatItemQuantity,
  formatTicks,
  fractionKeptPerDay,
  isThirsty,
  loadWeight,
  secondsToTicks,
  ticksUntilNextLoss,
  ticksUntilReady,
  ticksUntilThirsty,
  totalUnits,
  type PlotState,
  type AnimalSpecies,
  type Season,
  getCrop,
  getItem,
  isProducingAnimal,
  getIncident,
  plantableCrops,
  plotStage,
  ticksToSeconds,
  recipesFor,
  type BuildingKind,
  type Result,
  ok,
  ruleViolation,
} from '@farmrise/shared';
import { EventBus } from '@engine/core/EventBus.js';
import type { InputSystem } from '@engine/input/InputSystem.js';
import type { FixedUpdateContext } from '@engine/core/types.js';
import { collectStack, depositCarried, harvest, plant, tend } from '../world/FarmCommands.js';
import type { Career } from '../career/Career.js';
import type { IncidentDirector } from '../events/IncidentDirector.js';
import type { StoreState } from '../world/models/StoreModel.js';
import type { AnimalShelterState } from '../world/models/AnimalShelterModel.js';
import type { Player } from '../player/Player.js';
import type { WorkAction } from '../player/Player.js';
import type { PlayerController } from '../player/PlayerController.js';
import type { GameAction } from '../GameActions.js';
import { chickenPose, createChickenPose } from '../animals/chickenMotion.js';
import { cowPose, createCowPose } from '../animals/cowMotion.js';
import { createSheepPose, sheepPose } from '../animals/sheepMotion.js';
import { visibleAnimalCountForGroup } from '../animals/visibleAnimalInstances.js';
import {
  buildingInteraction,
  type BuildingInteractionKind,
} from '../world/buildingInteractions.js';

export type ContextVerb =
  'plant' | 'tend' | 'harvest' | 'deposit' | 'collect' | 'respond' | 'repair' | 'manage';

export interface InteractionEvents extends Record<string, unknown> {
  'interaction:prompt': {
    target: string | null;
    label: string | null;
    secondaryLabel: string | null;
    notice: string | null;
    verb: ContextVerb | null;
  };
  'interaction:performed': {
    target: string;
    action: ContextVerb;
    responseKind?: string;
  };
  'interaction:refused': { reason: string };
  'interaction:crop-selected': { cropId: string };
  'interaction:building-requested': {
    buildingId: string;
    kind: BuildingKind;
    interaction: Exclude<BuildingInteractionKind, 'passive'>;
  };
}

/** How long each action locks the player in place. Work should be felt. */
const WORK_TICKS: Record<ContextVerb, number> = {
  // Each verb keeps its readable pose on screen long enough to register at the
  // gameplay camera: anticipation, contact, then follow-through.
  plant: secondsToTicks(1.15),
  tend: secondsToTicks(1.65),
  harvest: secondsToTicks(1.35),
  deposit: secondsToTicks(0.9),
  collect: secondsToTicks(0.9),
  respond: secondsToTicks(1.4),
  repair: secondsToTicks(1.8),
  manage: 0,
};

const FULL_PACK_MESSAGE = "You can't carry anymore. Store some items first.";

interface ContextTarget {
  readonly verb: ContextVerb;
  readonly id: string;
  readonly label: string;
  readonly secondaryLabel?: string;
  readonly responseKind?: string;
  readonly buildingKind?: BuildingKind;
  readonly buildingInteraction?: Exclude<BuildingInteractionKind, 'passive'>;
  /** Bars describing the thing under the player's feet, if it has any. */
  readonly meters?: readonly ProximityMeter[];
}

/**
 * A gauge shown while the player stands next to something.
 *
 * `value` is always "how much is left" rather than "how much is gone", so a
 * full bar is always the good state and the player never has to read the
 * direction before reading the number.
 */
export interface ProximityMeter {
  readonly kind: 'water' | 'growth' | 'freshness' | 'storage' | 'shelter' | 'animal';
  /** The world object this gauge floats above. */
  readonly target:
    | {
        readonly kind: 'plot' | 'store' | 'shelter';
        readonly id: string;
      }
    | {
        readonly kind: 'animal';
        readonly id: string;
        readonly x: number;
        readonly y: number;
        readonly z: number;
      };
  readonly label: string;
  /** 0..1, remaining. */
  readonly value: number;
  /** What the bar means in words, e.g. "dry in 1m 20s". */
  readonly detail: string;
  /** Optional two-column rows shown between the detail and progress bar. */
  readonly contents?: readonly string[];
  /** True when this needs attention now. Drives the warning colour. */
  readonly urgent: boolean;
}

export class InteractionController {
  readonly events = new EventBus<InteractionEvents>();
  #selectedCropId = Object.keys(CROPS)[0] ?? 'wheat';
  #lastPromptId: string | null = null;
  #lastPromptLabel: string | null = null;
  #lastSecondaryLabel: string | null = null;
  #lastPromptNotice: string | null = null;
  #fullPackStackId: string | null = null;

  constructor(
    private readonly career: Career,
    private readonly player: Player,
    private readonly playerController: PlayerController,
    private readonly incidents: IncidentDirector,
    private readonly input: InputSystem<GameAction>,
  ) {}

  get selectedCropId(): string {
    const available = plantableCrops(this.career.unlocks, this.career.season);
    const selected = available.find((crop) => crop.id === this.#selectedCropId);
    return (selected?.id as string) ?? (available[0]?.id as string) ?? 'wheat';
  }

  fixedUpdate(_context: FixedUpdateContext): void {
    this.#reportBlockedPickup();

    const target = this.#resolveTarget();
    const notice = this.#fullPackStackId ? FULL_PACK_MESSAGE : null;
    if (
      target?.id !== this.#lastPromptId ||
      target?.label !== this.#lastPromptLabel ||
      (target?.secondaryLabel ?? null) !== this.#lastSecondaryLabel ||
      notice !== this.#lastPromptNotice
    ) {
      this.#lastPromptId = target?.id ?? null;
      this.#lastPromptLabel = target?.label ?? null;
      this.#lastSecondaryLabel = target?.secondaryLabel ?? null;
      this.#lastPromptNotice = notice;
      this.events.emit('interaction:prompt', {
        target: target?.id ?? null,
        label: target?.label ?? null,
        secondaryLabel: target?.secondaryLabel ?? null,
        notice,
        verb: target?.verb ?? null,
      });
    }

    if (!this.input.wasPressed('interact') || !target || this.player.busy) return;
    this.#perform(target);
  }

  /**
   * Finds the one thing the context key should act on.
   *
   * A physical transfer wins first: a basket labelled Pick up with E must
   * actually collect when E is pressed, even if a fox warning is also active
   * at the shelter. The incident wins after transfers because it expires. A
   * plot or generic repair comes last.
   */
  #resolveTarget(): ContextTarget | null {
    const world = this.career.world;
    const tile = world.grid.worldToTile(this.player.position.x, this.player.position.z);
    const stack = world.stores.nearestStack(tile.x, tile.z, 2);
    if (stack && stackHasItemThatFits(stack, world.carry.free)) {
      const item = Object.entries(stack.items).find(
        ([itemId, quantity]) =>
          quantity > 0 && world.carry.free >= (getItem(itemId)?.storageWeight ?? 1),
      );
      const itemId = item?.[0] ?? '';
      const quantity = item?.[1] ?? 0;
      return {
        verb: 'collect',
        id: stack.id,
        label: quantity > 0 ? `Pick up ${formatItemQuantity(itemId, quantity)}` : 'Pick up',
        meters: this.#storeMeters(stack),
      };
    }

    const building = world.structures.nearest(
      tile.x,
      tile.z,
      2,
      (candidate) =>
        candidate.remainingBuildTicks <= 0 &&
        (candidate.broken || buildingInteraction(candidate.kind) !== 'passive'),
    );

    // A processor consumes carried ingredients directly. Resolve it before a
    // neighbouring yard/barn deposit so "Load Mill" does what its prompt says.
    if (
      building &&
      !building.broken &&
      buildingInteraction(building.kind) === 'processing' &&
      this.#carriesProcessorInput(building.kind)
    ) {
      return this.#buildingTarget(building.id, building.kind, 'Load');
    }

    if (!world.carry.isEmpty && !building?.broken) {
      const buildingStore = building
        ? world.stores.stores.find((store) => store.buildingId === building.id)
        : undefined;
      const store = buildingStore ?? world.stores.nearestStored(tile.x, tile.z, 2);
      if (store) {
        return {
          verb: 'deposit',
          id: store.id,
          label: `Put down (${world.carry.used})`,
          meters: this.#storeMeters(store),
        };
      }
    }

    const incident = this.#incidentTarget();
    if (incident) return incident;

    const plotId = this.playerController.plotInReach();
    if (plotId) {
      const plot = this.career.world.getPlot(plotId);
      if (plot) {
        const stage = plotStage(plot);
        if (stage === 'empty') {
          const crop = getCrop(this.selectedCropId);
          return {
            verb: 'plant',
            id: plotId,
            label: `Plant ${crop?.displayName ?? this.selectedCropId}`,
            secondaryLabel: 'Choose seed',
          };
        }
        if (stage === 'ready') {
          const crop = plot.cropId ? getCrop(plot.cropId) : undefined;
          return {
            verb: 'harvest',
            id: plotId,
            label: `Harvest ${crop?.displayName ?? 'Crop'}`,
            meters: plotMeters(plotId, plot, this.career.season),
          };
        }
        return {
          verb: 'tend',
          id: plotId,
          label: 'Tend',
          meters: plotMeters(plotId, plot, this.career.season),
        };
      }
    }

    if (building?.broken) {
      return {
        verb: 'repair',
        id: building.id,
        label: `Repair ${BUILDINGS[building.kind].displayName}`,
      };
    }
    if (building) return this.#buildingTarget(building.id, building.kind);
    return null;
  }

  #carriesProcessorInput(kind: BuildingKind): boolean {
    const carried = this.career.world.carry.items;
    return recipesFor(kind as never).some((recipe) => (carried[recipe.inputItemId] ?? 0) > 0);
  }

  #buildingTarget(
    id: string,
    kind: BuildingKind,
    verb: 'Manage' | 'Inspect' | 'Load' = buildingInteraction(kind) === 'storage'
      ? 'Inspect'
      : 'Manage',
  ): ContextTarget {
    const interaction = buildingInteraction(kind);
    if (interaction === 'passive') {
      throw new Error(`Passive building ${kind} cannot own the context action.`);
    }
    return {
      verb: 'manage',
      id,
      label: `${verb} ${BUILDINGS[kind].displayName}`,
      buildingKind: kind,
      buildingInteraction: interaction,
    };
  }

  /**
   * Gauges for whatever the player is currently standing next to.
   *
   * Read by the HUD on its own cadence rather than pushed on the prompt event:
   * water and freshness change every tick, and re-emitting a prompt sixty times
   * a second to move a bar would rebuild DOM the player cannot perceive.
   */
  proximityMeters(): readonly ProximityMeter[] {
    const world = this.career.world;
    const meters: ProximityMeter[] = [];

    // Status belongs to the object under the player, not to whichever action
    // currently wins. Carrying goods or answering an incident may replace the
    // E prompt, but it must not make a growing crop's water/timer bars vanish.
    const plotId = this.playerController.plotInReach();
    const plot = plotId ? world.getPlot(plotId) : undefined;
    if (plotId && plot && plotStage(plot) !== 'empty') {
      meters.push(...plotMeters(plotId, plot, this.career.season));
    }

    const tile = world.grid.worldToTile(this.player.position.x, this.player.position.z);
    const stack = world.stores.nearestStack(tile.x, tile.z, 2);
    const store =
      stack ??
      (plot && plotStage(plot) !== 'empty'
        ? undefined
        : world.stores.nearestStored(tile.x, tile.z, 2));
    if (store) meters.push(...this.#storeMeters(store));

    const buildingStore = this.#nearestBuildingStore(tile.x, tile.z);
    if (buildingStore) {
      if (buildingStore.id !== store?.id) meters.push(...this.#storeMeters(buildingStore));
      meters.push(this.#buildingStorageMeter(buildingStore));
    }

    const shelter = this.#nearestShelterMeter(tile.x, tile.z);
    if (shelter) meters.push(shelter);

    const animal = this.#animalGuidanceMeter();
    if (animal) meters.push(animal);

    return meters;
  }

  /** Storage buildings report their own inventory without stealing the E action. */
  #nearestBuildingStore(tileX: number, tileZ: number): StoreState | undefined {
    const world = this.career.world;
    let nearest: StoreState | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const store of world.stores.stores) {
      if (!store.buildingId || store.capacity <= 0) continue;
      const building = world.structures.get(store.buildingId);
      if (!building || building.remainingBuildTicks > 0) continue;
      const footprint = buildingFootprint(building.kind, building.rotation);
      const minX = building.tileX;
      const maxX = building.tileX + footprint.width - 1;
      const minZ = building.tileZ;
      const maxZ = building.tileZ + footprint.depth - 1;
      const dx = tileX < minX ? minX - tileX : tileX > maxX ? tileX - maxX : 0;
      const dz = tileZ < minZ ? minZ - tileZ : tileZ > maxZ ? tileZ - maxZ : 0;
      const distance = dx + dz;
      if (distance > 2 || distance >= nearestDistance) continue;
      nearest = store;
      nearestDistance = distance;
    }
    return nearest;
  }

  #buildingStorageMeter(store: StoreState): ProximityMeter {
    const building = store.buildingId
      ? this.career.world.structures.get(store.buildingId)
      : undefined;
    const name = building ? BUILDINGS[building.kind].displayName : 'Building';
    const used = loadWeight(store.items);
    const free = Math.max(0, store.capacity - used);
    const contents = Object.entries(store.items)
      .filter(([, quantity]) => quantity > 0)
      .map(([itemId, quantity]) => ({
        name: getItem(itemId)?.displayName ?? itemId,
        text: formatItemQuantity(itemId, quantity),
      }))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((item) => item.text);
    return {
      kind: 'storage',
      target: { kind: 'store', id: store.id },
      label: `${name} storage`,
      value: store.capacity > 0 ? free / store.capacity : 0,
      detail:
        free === 0
          ? `Full · ${used}/${store.capacity} used`
          : `${used}/${store.capacity} used · ${free} until full`,
      contents,
      urgent: free === 0,
    };
  }

  /** Shelter occupancy appears only while the player is beside that shelter. */
  #nearestShelterMeter(tileX: number, tileZ: number): ProximityMeter | null {
    const world = this.career.world;
    let nearest: AnimalShelterState | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const shelter of world.shelters.all()) {
      const footprint =
        shelter.buildingId === null
          ? { width: 1, depth: 1 }
          : buildingFootprint('animal_shelter', shelter.rotation);
      const minX = shelter.tileX;
      const maxX = shelter.tileX + footprint.width - 1;
      const minZ = shelter.tileZ;
      const maxZ = shelter.tileZ + footprint.depth - 1;
      const dx = tileX < minX ? minX - tileX : tileX > maxX ? tileX - maxX : 0;
      const dz = tileZ < minZ ? minZ - tileZ : tileZ > maxZ ? tileZ - maxZ : 0;
      const distance = dx + dz;
      if (
        distance > 2 ||
        distance > nearestDistance ||
        (distance === nearestDistance && nearest && shelter.id >= nearest.id)
      ) {
        continue;
      }
      nearest = shelter;
      nearestDistance = distance;
    }

    if (!nearest) return null;
    const capacity = world.shelters.capacityFor(nearest.id);
    const used = world.shelterSlotsUsedAt(nearest.id);
    const available = Math.max(0, capacity - used);
    const overCapacity = Math.max(0, used - capacity);
    const name = nearest.id === STARTER_SHELTER_ID ? 'Starter Shelter' : 'Animal Shelter';
    return {
      kind: 'shelter',
      target: { kind: 'shelter', id: nearest.id },
      label: `${name} capacity`,
      value: capacity > 0 ? available / capacity : 0,
      detail:
        overCapacity > 0
          ? `${used}/${capacity} slots used · ${overCapacity} over capacity`
          : available === 0
            ? `Full · ${used}/${capacity} slots used`
            : `${used}/${capacity} slots used · ${available} available`,
      urgent: available === 0,
    };
  }

  /** Announces a blocked pickup once when the player enters a pile's range. */
  #reportBlockedPickup(): void {
    const world = this.career.world;
    const tile = world.grid.worldToTile(this.player.position.x, this.player.position.z);
    const stack = world.stores.nearestStack(tile.x, tile.z, 2);
    const contents = stack
      ? Object.entries(stack.items).filter(([, quantity]) => quantity > 0)
      : [];
    const cannotFitAny =
      contents.length > 0 &&
      contents.every(([itemId]) => world.carry.free < (getItem(itemId)?.storageWeight ?? 1));
    if (!stack || !cannotFitAny) {
      this.#fullPackStackId = null;
      return;
    }
    if (this.#fullPackStackId === stack.id) return;
    this.#fullPackStackId = stack.id;
    this.events.emit('interaction:refused', {
      reason: FULL_PACK_MESSAGE,
    });
  }

  /** Feed/product guidance follows the nearest visible animal without owning E. */
  #animalGuidanceMeter(): ProximityMeter | null {
    const world = this.career.world;
    const groups = world.livestock.groups;
    const simulationTime = ticksToSeconds(world.tick);
    let nearest:
      | {
          readonly groupId: string;
          readonly species: AnimalSpecies;
          readonly count: number;
          readonly distance: number;
          readonly x: number;
          readonly z: number;
        }
      | undefined;

    const chicken = createChickenPose();
    for (const group of groups) {
      if (group.species !== 'chicken') continue;
      const count = visibleAnimalCountForGroup(groups, 'chicken', group.id, 64);
      const shelter = world.shelters.worldPosition(group.shelterId);
      for (let index = 0; index < count; index += 1) {
        chickenPose(shelter, index, count, simulationTime, 0, 1, chicken);
        const distance = Math.hypot(
          this.player.position.x - chicken.x,
          this.player.position.z - chicken.z,
        );
        if (!nearest || distance < nearest.distance) {
          nearest = {
            groupId: group.id,
            species: 'chicken',
            count: group.count,
            distance,
            x: chicken.x,
            z: chicken.z,
          };
        }
      }
    }

    const cow = createCowPose();
    for (const group of groups) {
      if (group.species !== 'cow') continue;
      const count = visibleAnimalCountForGroup(groups, 'cow', group.id, 16);
      const shelter = world.shelters.worldPosition(group.shelterId);
      for (let index = 0; index < count; index += 1) {
        cowPose(shelter, index, count, simulationTime, 1, cow);
        const distance = Math.hypot(this.player.position.x - cow.x, this.player.position.z - cow.z);
        if (!nearest || distance < nearest.distance) {
          nearest = {
            groupId: group.id,
            species: 'cow',
            count: group.count,
            distance,
            x: cow.x,
            z: cow.z,
          };
        }
      }
    }

    const sheep = createSheepPose();
    for (const group of groups) {
      if (group.species !== 'sheep') continue;
      const count = visibleAnimalCountForGroup(groups, 'sheep', group.id, 24);
      const shelter = world.shelters.worldPosition(group.shelterId);
      for (let index = 0; index < count; index += 1) {
        sheepPose(shelter, index, count, simulationTime, 1, sheep);
        const distance = Math.hypot(
          this.player.position.x - sheep.x,
          this.player.position.z - sheep.z,
        );
        if (!nearest || distance < nearest.distance) {
          nearest = {
            groupId: group.id,
            species: 'sheep',
            count: group.count,
            distance,
            x: sheep.x,
            z: sheep.z,
          };
        }
      }
    }

    if (!nearest || nearest.distance > 2.6) return null;
    const definition = ANIMALS[nearest.species];
    if (!isProducingAnimal(definition)) return null;
    const count = nearest.count;
    const needed = definition.feedPerCycle * count;
    const available = world.stores.storedTotalOf(definition.feedItemId);
    const produced = definition.producePerCycle * count;
    const animals = animalGroupLabel(nearest.species, count);
    const feed = getItem(definition.feedItemId)?.displayName ?? definition.feedItemId;
    const product = getItem(definition.producesItemId)?.displayName ?? definition.producesItemId;
    return {
      kind: 'animal',
      target: {
        kind: 'animal',
        id: nearest.groupId,
        x: nearest.x,
        y: nearest.species === 'chicken' ? 1.25 : nearest.species === 'sheep' ? 1.65 : 1.9,
        z: nearest.z,
      },
      label: `${animals} ${count === 1 ? 'makes' : 'make'} ${produced} ${product}`,
      value: needed <= 0 ? 1 : Math.min(1, available / needed),
      detail: `Store ${needed} ${feed} each cycle · ${available}/${needed} stored`,
      urgent: available < needed,
    };
  }

  /** Freshness of the pile the player is standing at, if it can spoil at all. */
  #storeMeters(store: StoreState): readonly ProximityMeter[] {
    if (totalUnits(store.items) <= 0) return [];

    const item = Object.entries(store.items).find(([, quantity]) => quantity > 0);
    const itemId = item?.[0] ?? '';
    const quantity = item?.[1] ?? 0;
    const contents = formatItemQuantity(itemId, quantity);

    const inTheOpen = store.buildingId === null && store.id.startsWith('stack-');
    const multiplier = inTheOpen ? FIELD_SPOILAGE_MULTIPLIER : STORED_SPOILAGE_MULTIPLIER;
    const ticks = ticksUntilNextLoss(
      store.items,
      multiplier,
      store.spoilageRemainder,
      store.preserving,
    );

    if (store.preserving || ticks === null) {
      return [
        {
          kind: 'freshness',
          target: { kind: 'store', id: store.id },
          label: `${contents} freshness`,
          value: 1,
          detail: store.preserving ? 'Cold store — no spoilage' : 'Does not spoil',
          urgent: false,
        },
      ];
    }

    return [
      {
        kind: 'freshness',
        target: { kind: 'store', id: store.id },
        label: `${contents} freshness`,
        value: fractionKeptPerDay(store.items, multiplier),
        detail: `1 spoils in ${formatTicks(ticks)}${inTheOpen ? ' — left in field' : ''}`,
        urgent: ticks <= SOON_TICKS,
      },
    ];
  }

  #incidentTarget(): ContextTarget | null {
    const instance = this.incidents.mostUrgentActionable;
    if (!instance) return null;
    const definition = getIncident(instance.definitionId);
    if (!definition) return null;

    const world = this.career.world;
    const plotId = this.playerController.plotInReach();
    const targetPlot = plotId ? world.getPlot(plotId) : undefined;
    const playerTile = world.grid.worldToTile(this.player.position.x, this.player.position.z);
    const nearestShelter = world.shelters.nearest(playerTile.x, playerTile.z);
    const nearestShelterDoor = world.shelters.doorPoint(nearestShelter.id);

    for (const response of definition.responses) {
      if (response.kind === 'pay') continue;
      let relevant = false;
      switch (response.kind) {
        case 'tend_targets':
          // Once a targeted crop is mature, watering it is no longer a valid
          // action. Let Harvest own E instead of letting an active drought mask
          // the only action that can clear the ready bed.
          relevant = Boolean(
            plotId &&
            instance.targetIds.includes(plotId) &&
            targetPlot &&
            plotStage(targetPlot) !== 'ready',
          );
          break;
        case 'move_animals':
          relevant = instance.targetIds.some((groupId) => {
            const group = world.livestock.get(groupId);
            if (!group) return false;
            const shelter = world.shelters.doorPoint(group.shelterId);
            return this.player.canReach(shelter.x, shelter.z);
          });
          break;
        case 'haul_to_shelter':
          relevant = this.player.canReach(nearestShelterDoor.x, nearestShelterDoor.z);
          break;
        case 'repair':
          if (definition.target === 'processor') {
            relevant = instance.targetIds.some((id) => {
              const building = world.structures.get(id);
              if (!building || building.broken) return false;
              const at = world.grid.tileToWorld(building.tileX, building.tileZ);
              return this.player.canReach(at.x, at.z);
            });
          } else if (definition.target === 'carried_goods') {
            const cart = world.carry.cartTile;
            if (cart) {
              const at = world.grid.tileToWorld(cart.tileX, cart.tileZ);
              relevant = this.player.canReach(at.x, at.z);
            } else {
              relevant = world.carry.carrier !== 'arms' && !world.carry.isEmpty;
            }
          } else if (definition.target === 'contract') {
            const at = world.grid.tileToWorld(
              world.level.townGate.tileX,
              world.level.townGate.tileZ,
            );
            relevant = this.player.canReach(at.x, at.z);
          }
          break;
        case 'unload_processor':
          relevant = instance.targetIds.some((id) => {
            const building = world.structures.get(id);
            if (!building?.broken) return false;
            const at = world.grid.tileToWorld(building.tileX, building.tileZ);
            return this.player.canReach(at.x, at.z);
          });
          break;
        default:
          break;
      }
      if (relevant) {
        return {
          verb: 'respond',
          id: instance.id,
          label: response.displayName,
          responseKind: response.kind,
        };
      }
    }

    return null;
  }

  #perform(target: ContextTarget): void {
    if (target.verb === 'manage' && target.buildingKind && target.buildingInteraction) {
      this.events.emit('interaction:building-requested', {
        buildingId: target.id,
        kind: target.buildingKind,
        interaction: target.buildingInteraction,
      });
      this.events.emit('interaction:performed', {
        target: target.id,
        action: target.verb,
      });
      this.#clearPromptCache();
      return;
    }

    const world = this.career.world;
    const tile = world.grid.worldToTile(this.player.position.x, this.player.position.z);
    let result: Result<unknown>;

    switch (target.verb) {
      case 'plant':
        result = plant(this.career, target.id, this.selectedCropId);
        break;
      case 'tend':
        result = tend(this.career, target.id);
        break;
      case 'harvest':
        result = harvest(this.career, target.id);
        break;
      case 'deposit':
        result = depositCarried(this.career, tile.x, tile.z, target.id);
        break;
      case 'collect':
        result = collectStack(this.career, tile.x, tile.z, target.id);
        break;
      case 'repair':
        world.structures.setBroken(target.id, false);
        result = { ok: true, value: undefined };
        break;
      case 'respond': {
        const instance = this.incidents.active.find((entry) => entry.id === target.id);
        const definition = instance ? getIncident(instance.definitionId) : undefined;
        const response = definition?.responses.find((entry) => entry.kind === target.responseKind);
        result = response
          ? this.incidents.respond(target.id, response.kind)
          : { ok: false, code: 'RULE_VIOLATION' as never, reason: 'Nothing to do.' };
        break;
      }
      default:
        return;
    }

    if (!result.ok) {
      this.events.emit('interaction:refused', { reason: result.reason });
      return;
    }

    this.player.beginWork(WORK_TICKS[target.verb], workPose(target.verb));
    this.events.emit('interaction:performed', {
      target: target.id,
      action: target.verb,
      ...(target.responseKind ? { responseKind: target.responseKind } : {}),
    });
    // The prompt text changes as soon as the action lands, so force a refresh.
    this.#clearPromptCache();
  }

  /** The seed ledger is contextual: Q does nothing unless Plant owns the prompt. */
  seedSelectionTargetId(): string | null {
    const target = this.#resolveTarget();
    return target?.verb === 'plant' ? target.id : null;
  }

  /** Applies a visual-menu choice while retaining the normal planting command. */
  selectCrop(cropId: string): Result<void> {
    const available = plantableCrops(this.career.unlocks, this.career.season);
    const crop = available.find((candidate) => candidate.id === cropId);
    if (!crop) return ruleViolation('That seed is not available this season.');

    const previous = this.selectedCropId;
    this.#selectedCropId = cropId;
    this.#clearPromptCache();
    if (previous !== cropId) this.events.emit('interaction:crop-selected', { cropId });
    return ok(undefined);
  }

  #clearPromptCache(): void {
    this.#lastPromptId = null;
    this.#lastPromptLabel = null;
    this.#lastSecondaryLabel = null;
    this.#lastPromptNotice = null;
  }
}

function animalGroupLabel(species: AnimalSpecies, count: number): string {
  if (species === 'chicken') return `${count} ${count === 1 ? 'Hen' : 'Hens'}`;
  if (species === 'cow') return `${count} ${count === 1 ? 'Dairy cow' : 'Dairy cows'}`;
  if (species === 'dog') return `${count} ${count === 1 ? 'Farm dog' : 'Farm dogs'}`;
  return `${count} Sheep`;
}

/** Maps a context verb onto a readable player gesture. */
function workPose(verb: ContextVerb): WorkAction {
  if (verb === 'plant') return 'plant';
  if (verb === 'tend') return 'tend';
  if (verb === 'harvest') return 'harvest';
  if (verb === 'collect' || verb === 'deposit') return 'transfer';
  if (verb === 'respond') return 'shoo';
  return 'repair';
}

/** Anything due within this window is worth acting on before walking away. */
const SOON_TICKS = secondsToTicks(45);

/**
 * Water gauge for a bed the player is standing at.
 *
 * An irrigated bed still shows a bar - full, and saying why - because "this one
 * is handled" is exactly the feedback that makes the irrigation purchase feel
 * like it did something.
 */
function plotMeters(plotId: string, plot: PlotState, season: Season): readonly ProximityMeter[] {
  if (!plot.cropId) return [];

  const stage = plotStage(plot);
  const crop = getCrop(plot.cropId);
  const growth: ProximityMeter[] =
    stage === 'dead' || !crop
      ? []
      : [
          {
            kind: 'growth',
            target: { kind: 'plot', id: plotId },
            label: `Harvest ${crop.displayName}`,
            value: stage === 'ready' ? 1 : Math.min(1, plot.grownTicks / crop.growthTicks),
            detail:
              stage === 'ready'
                ? 'Ready now'
                : `Ready in ${formatTicks(ticksUntilReady(plot, season))}`,
            urgent: stage === 'ready',
          },
        ];

  // Water can no longer improve a mature crop, so showing a thirsty card beside
  // "Ready now" suggests an action the rules reject. At maturity the harvest
  // card is the complete status for the bed.
  if (stage === 'ready') return growth;

  if (plot.irrigated) {
    return [
      {
        kind: 'water',
        target: { kind: 'plot', id: plotId },
        label: 'Water',
        value: 1,
        detail: 'Irrigated',
        urgent: false,
      },
      ...growth,
    ];
  }

  const ticks = ticksUntilThirsty(plot);
  const thirsty = isThirsty(plot);
  const detail = thirsty
    ? 'Thirsty — tend it'
    : ticks === null
      ? 'Holding'
      : `Dry in ${formatTicks(ticks)}`;

  return [
    {
      kind: 'water',
      target: { kind: 'plot', id: plotId },
      label: 'Water',
      value: Math.min(1, Math.max(0, plot.water)),
      detail,
      urgent: thirsty || (ticks !== null && ticks <= SOON_TICKS),
    },
    ...growth,
  ];
}

/** Exported so the HUD test can assert the threshold it draws against. */
export { THIRSTY_WATER };

function stackHasItemThatFits(store: StoreState, freeCapacity: number): boolean {
  return Object.entries(store.items).some(
    ([itemId, quantity]) => quantity > 0 && freeCapacity >= (getItem(itemId)?.storageWeight ?? 1),
  );
}

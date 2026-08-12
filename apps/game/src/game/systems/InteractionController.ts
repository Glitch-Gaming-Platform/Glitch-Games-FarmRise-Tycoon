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
  type Season,
  getCrop,
  getItem,
  getIncident,
  plantableCrops,
  plotStage,
  ticksToSeconds,
  type Result,
} from '@farmrise/shared';
import { EventBus } from '@engine/core/EventBus.js';
import type { InputSystem } from '@engine/input/InputSystem.js';
import type { FixedUpdateContext } from '@engine/core/types.js';
import { collectStack, depositCarried, harvest, plant, tend } from '../world/FarmCommands.js';
import type { Career } from '../career/Career.js';
import type { IncidentDirector } from '../events/IncidentDirector.js';
import type { StoreState } from '../world/models/StoreModel.js';
import type { Player } from '../player/Player.js';
import type { WorkAction } from '../player/Player.js';
import type { PlayerController } from '../player/PlayerController.js';
import type { GameAction } from '../GameActions.js';
import { shelterDoorPoint } from '../world/collisionProfiles.js';
import { chickenPose, createChickenPose } from '../animals/chickenMotion.js';
import { cowPose, createCowPose } from '../animals/cowMotion.js';

export type ContextVerb =
  'plant' | 'tend' | 'harvest' | 'deposit' | 'collect' | 'respond' | 'repair';

export interface InteractionEvents extends Record<string, unknown> {
  'interaction:prompt': {
    target: string | null;
    label: string | null;
    secondaryLabel: string | null;
    notice: string | null;
    verb: ContextVerb | null;
  };
  'interaction:performed': { target: string; action: ContextVerb };
  'interaction:refused': { reason: string };
  'interaction:crop-selected': { cropId: string };
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
};

const FULL_PACK_MESSAGE = "You can't carry anymore. Store some items first.";

interface ContextTarget {
  readonly verb: ContextVerb;
  readonly id: string;
  readonly label: string;
  readonly secondaryLabel?: string;
  readonly responseKind?: string;
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
  readonly kind: 'water' | 'growth' | 'freshness' | 'storage' | 'animal';
  /** The world object this gauge floats above. */
  readonly target:
    | {
        readonly kind: 'plot' | 'store';
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
  #selectedCropIndex = 0;
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
    const crop = available[this.#selectedCropIndex % Math.max(1, available.length)];
    return (crop?.id as string) ?? Object.keys(CROPS)[0] ?? 'wheat';
  }

  fixedUpdate(_context: FixedUpdateContext): void {
    if (this.input.wasPressed('cycleCrop')) this.#cycleCrop();
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
    if (!world.carry.isEmpty) {
      const store = world.stores.nearestStored(tile.x, tile.z, 2);
      if (store) {
        return {
          verb: 'deposit',
          id: store.id,
          label: `Put down (${world.carry.used})`,
          meters: this.#storeMeters(store),
        };
      }
    } else {
      // A collectible pile wins over the nearby yard. Previously the yard at
      // the shelter masked the egg basket one tile away, making E appear to do
      // nothing unless the player stood on exactly the right pixel.
      const store = world.stores.nearestStack(tile.x, tile.z, 2);
      if (store) {
        const item = Object.entries(store.items).find(([, quantity]) => quantity > 0);
        const itemId = item?.[0] ?? '';
        const quantity = item?.[1] ?? 0;
        return {
          verb: 'collect',
          id: store.id,
          label: quantity > 0 ? `Pick up ${formatItemQuantity(itemId, quantity)}` : 'Pick up',
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
            secondaryLabel: 'Change seed',
          };
        }
        if (stage === 'ready') {
          return {
            verb: 'harvest',
            id: plotId,
            label: 'Harvest',
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

    const building = world.structures.at(tile.x, tile.z);
    if (building?.broken) {
      return { verb: 'repair', id: building.id, label: 'Repair' };
    }
    return null;
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
      const definition = BUILDINGS[building.kind];
      const minX = building.tileX;
      const maxX = building.tileX + definition.footprint.width - 1;
      const minZ = building.tileZ;
      const maxZ = building.tileZ + definition.footprint.depth - 1;
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
    const shelter = world.grid.tileToWorld(world.level.shelter.tileX, world.level.shelter.tileZ);
    const simulationTime = ticksToSeconds(world.tick);
    let nearest:
      | {
          readonly species: 'chicken' | 'cow';
          readonly distance: number;
          readonly x: number;
          readonly z: number;
        }
      | undefined;

    const chickenCount = Math.min(world.livestock.countOf('chicken'), 64);
    const chicken = createChickenPose();
    for (let index = 0; index < chickenCount; index += 1) {
      chickenPose(shelter, index, chickenCount, simulationTime, 0, 1, chicken);
      const distance = Math.hypot(
        this.player.position.x - chicken.x,
        this.player.position.z - chicken.z,
      );
      if (!nearest || distance < nearest.distance) {
        nearest = { species: 'chicken', distance, x: chicken.x, z: chicken.z };
      }
    }

    const cowCount = Math.min(world.livestock.countOf('cow'), 16);
    const cow = createCowPose();
    for (let index = 0; index < cowCount; index += 1) {
      cowPose(shelter, index, cowCount, simulationTime, 1, cow);
      const distance = Math.hypot(this.player.position.x - cow.x, this.player.position.z - cow.z);
      if (!nearest || distance < nearest.distance) {
        nearest = { species: 'cow', distance, x: cow.x, z: cow.z };
      }
    }

    if (!nearest || nearest.distance > 2.6) return null;
    const definition = ANIMALS[nearest.species];
    const count = world.livestock.countOf(nearest.species);
    const needed = definition.feedPerCycle * count;
    const available = world.stores.storedTotalOf(definition.feedItemId);
    const produced = definition.producePerCycle * count;
    const animals =
      nearest.species === 'chicken'
        ? `${count} ${count === 1 ? 'Hen' : 'Hens'}`
        : `${count} ${count === 1 ? 'Dairy cow' : 'Dairy cows'}`;
    const feed = getItem(definition.feedItemId)?.displayName ?? definition.feedItemId;
    const product = getItem(definition.producesItemId)?.displayName ?? definition.producesItemId;
    return {
      kind: 'animal',
      target: {
        kind: 'animal',
        id: nearest.species,
        x: nearest.x,
        y: nearest.species === 'chicken' ? 1.25 : 1.9,
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
    const shelter = shelterDoorPoint(
      world.grid,
      world.level.shelter.tileX,
      world.level.shelter.tileZ,
    );

    for (const response of definition.responses) {
      if (response.kind === 'pay') continue;
      let relevant = false;
      switch (response.kind) {
        case 'tend_targets':
          relevant = Boolean(plotId && instance.targetIds.includes(plotId));
          break;
        case 'move_animals':
        case 'haul_to_shelter':
          relevant = this.player.canReach(shelter.x, shelter.z);
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
    this.events.emit('interaction:performed', { target: target.id, action: target.verb });
    // The prompt text changes as soon as the action lands, so force a refresh.
    this.#lastPromptId = null;
    this.#lastPromptLabel = null;
    this.#lastSecondaryLabel = null;
    this.#lastPromptNotice = null;
  }

  #cycleCrop(): void {
    const available = plantableCrops(this.career.unlocks, this.career.season);
    this.#selectedCropIndex = (this.#selectedCropIndex + 1) % Math.max(1, available.length);
    this.events.emit('interaction:crop-selected', { cropId: this.selectedCropId });
  }
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
            label: 'Harvest',
            value: stage === 'ready' ? 1 : Math.min(1, plot.grownTicks / crop.growthTicks),
            detail:
              stage === 'ready'
                ? 'Ready now'
                : `Ready in ${formatTicks(ticksUntilReady(plot, season))}`,
            urgent: stage === 'ready',
          },
        ];

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

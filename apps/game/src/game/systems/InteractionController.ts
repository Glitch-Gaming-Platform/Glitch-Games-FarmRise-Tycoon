/**
 * Translates input into farm commands.
 *
 * This is the only place that connects "the player pressed E" to "plant wheat".
 * Keeping it separate from both the input system and the command functions
 * means the commands stay unit-testable without synthesising key events, and
 * the input system stays game-agnostic.
 */
import { CROP_IDS, getCrop, plotStage, secondsToTicks, type Result } from '@farmrise/shared';
import { EventBus } from '@engine/core/EventBus.js';
import type { InputSystem } from '@engine/input/InputSystem.js';
import type { FixedUpdateContext } from '@engine/core/types.js';
import { harvest, plant, tend } from '../world/FarmCommands.js';
import type { FarmWorld } from '../world/FarmWorld.js';
import type { Player } from '../player/Player.js';
import type { PlayerController } from '../player/PlayerController.js';
import type { GameAction } from '../GameActions.js';

export interface InteractionEvents extends Record<string, unknown> {
  'interaction:prompt': { plotId: string | null; label: string | null };
  'interaction:performed': { plotId: string; action: 'plant' | 'tend' | 'harvest' };
  'interaction:refused': { reason: string };
  'interaction:crop-selected': { cropId: string };
}

/** How long each action locks the player in place. Work should be felt. */
const WORK_TICKS = {
  plant: secondsToTicks(0.5),
  tend: secondsToTicks(0.4),
  harvest: secondsToTicks(0.7),
} as const;

export class InteractionController {
  readonly events = new EventBus<InteractionEvents>();
  #selectedCropIndex = 0;
  #lastPromptPlotId: string | null = null;
  #lastPromptLabel: string | null = null;

  constructor(
    private readonly world: FarmWorld,
    private readonly player: Player,
    private readonly playerController: PlayerController,
    private readonly input: InputSystem<GameAction>,
  ) {}

  get selectedCropId(): string {
    return CROP_IDS[this.#selectedCropIndex] ?? CROP_IDS[0] ?? 'wheat';
  }

  fixedUpdate(_context: FixedUpdateContext): void {
    if (this.input.wasPressed('cycleCrop')) this.#cycleCrop();

    const plotId = this.playerController.plotInReach();
    const label = plotId ? this.#labelFor(plotId) : null;
    if (plotId !== this.#lastPromptPlotId || label !== this.#lastPromptLabel) {
      this.#lastPromptPlotId = plotId;
      this.#lastPromptLabel = label;
      this.events.emit('interaction:prompt', {
        plotId,
        label,
      });
    }

    if (!this.input.wasPressed('interact') || !plotId || this.player.busy) return;
    this.#perform(plotId);
  }

  #perform(plotId: string): void {
    const plot = this.world.getPlot(plotId);
    if (!plot) return;
    const stage = plotStage(plot);

    let result: Result<unknown>;
    let action: 'plant' | 'tend' | 'harvest';

    if (stage === 'empty') {
      action = 'plant';
      result = plant(this.world, plotId, this.selectedCropId);
    } else if (stage === 'ready') {
      action = 'harvest';
      result = harvest(this.world, plotId);
    } else {
      action = 'tend';
      result = tend(this.world, plotId);
    }

    if (!result.ok) {
      this.events.emit('interaction:refused', { reason: result.reason });
      return;
    }

    this.player.beginWork(WORK_TICKS[action], action);
    this.events.emit('interaction:performed', { plotId, action });
    // The prompt text changes as soon as the action lands, so force a refresh.
    this.#lastPromptPlotId = null;
    this.#lastPromptLabel = null;
  }

  #cycleCrop(): void {
    this.#selectedCropIndex = (this.#selectedCropIndex + 1) % CROP_IDS.length;
    this.events.emit('interaction:crop-selected', { cropId: this.selectedCropId });
  }

  #labelFor(plotId: string): string {
    const plot = this.world.getPlot(plotId);
    if (!plot) return '';
    const stage = plotStage(plot);
    if (stage === 'empty') {
      const crop = getCrop(this.selectedCropId);
      return `Plant ${crop?.displayName ?? this.selectedCropId}`;
    }
    if (stage === 'ready') return 'Harvest';
    return 'Tend';
  }
}

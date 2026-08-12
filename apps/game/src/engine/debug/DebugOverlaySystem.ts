/**
 * A small always-on-top panel showing frame health.
 *
 * It is a plain DOM element rather than a canvas overlay so it costs nothing on
 * the GPU and stays readable at any device pixel ratio. It updates at 4Hz -
 * updating text every frame is itself a measurable cost and makes the numbers
 * unreadable anyway.
 */
import { SystemPriority, type EngineSystem, type SystemInitContext } from '../core/System.js';
import type { RenderContext } from '../core/types.js';
import { RendererToken } from '../render/RendererSystem.js';
import type { GameLoop } from '../core/GameLoop.js';

export interface DebugOverlayOptions {
  readonly container: HTMLElement;
  readonly loop: GameLoop;
  /** Extra rows contributed by the game layer, e.g. balance or active event. */
  readonly extraRows?: () => Record<string, string | number>;
  readonly updateHz?: number;
}

export class DebugOverlaySystem implements EngineSystem {
  readonly id = 'debug-overlay';
  readonly priority = SystemPriority.Debug;

  #element: HTMLElement | null = null;
  #services: SystemInitContext['services'] | null = null;
  #accumulator = 0;
  readonly #interval: number;

  constructor(private readonly options: DebugOverlayOptions) {
    this.#interval = 1 / (options.updateHz ?? 4);
  }

  init(context: SystemInitContext): void {
    this.#services = context.services;
    const element = document.createElement('div');
    element.dataset['testid'] = 'debug-overlay';
    element.setAttribute('aria-hidden', 'true');
    Object.assign(element.style, {
      position: 'absolute',
      top: '8px',
      left: '8px',
      padding: '6px 10px',
      font: '12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
      color: '#c9f7d2',
      background: 'rgba(6, 12, 10, 0.72)',
      border: '1px solid rgba(120, 220, 150, 0.25)',
      borderRadius: '6px',
      pointerEvents: 'none',
      whiteSpace: 'pre',
      zIndex: '9999',
    } satisfies Partial<CSSStyleDeclaration>);
    this.options.container.appendChild(element);
    this.#element = element;
  }

  update(context: RenderContext): void {
    const element = this.#element;
    if (!element) return;
    this.#accumulator += context.deltaSeconds;
    if (this.#accumulator < this.#interval) return;
    this.#accumulator = 0;

    const renderer = this.#services?.tryResolve(RendererToken);
    const stats = renderer?.stats;
    const rows: Record<string, string | number> = {
      fps: this.options.loop.fps.toFixed(0),
      tick: this.options.loop.tick,
      // Tier and program count are here specifically so the claim "the low tier
      // gained nothing" is checkable from a screenshot rather than from trust.
      tier: renderer?.pipeline?.tier ?? 'low',
      draws: stats?.drawCalls ?? 0,
      tris: stats?.triangles ?? 0,
      programs: stats?.programs ?? 0,
      ...(this.options.extraRows?.() ?? {}),
    };

    element.textContent = Object.entries(rows)
      .map(([key, value]) => `${key.padEnd(9)} ${value}`)
      .join('\n');
  }

  dispose(): void {
    this.#element?.remove();
    this.#element = null;
  }
}

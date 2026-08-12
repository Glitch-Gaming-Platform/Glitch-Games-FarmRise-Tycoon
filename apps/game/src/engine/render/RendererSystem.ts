/**
 * Owns the single WebGLRenderer and draws whatever the SceneManager says is
 * active. It runs last in the frame (SystemPriority.Render) so everything else
 * has already moved this tick.
 *
 * This class does not know what a farm is. It asks for "a scene and a camera"
 * through the SceneProvider port, which the game layer implements.
 */
import * as THREE from 'three';
import type { EngineSystem, SystemInitContext } from '../core/System.js';
import { SystemPriority } from '../core/System.js';
import { createServiceToken } from '../core/ServiceContainer.js';
import type { RenderContext } from '../core/types.js';
import { ViewportSizer, type ViewportSize } from './ViewportSizer.js';
import { detectCapabilities, WebGLUnavailableError } from './capabilities.js';
import { RenderPipelineToken, type RenderPipeline } from './RenderPipeline.js';

/** What the renderer needs from the rest of the app in order to draw a frame. */
export interface SceneProvider {
  getRenderPair(): { scene: THREE.Scene; camera: THREE.Camera } | null;
}

export const SceneProviderToken = createServiceToken<SceneProvider>('SceneProvider');
export const RendererToken = createServiceToken<RendererSystem>('RendererSystem');

export interface RendererOptions {
  readonly container: HTMLElement;
  readonly maxPixelRatio?: number;
  readonly antialias?: boolean;
  readonly clearColor?: number;
  /** Defaults to NoToneMapping; see the note in init(). */
  readonly toneMapping?: THREE.ToneMapping;
  /** Injected in tests so the system can be exercised without a GPU. */
  readonly rendererFactory?: (canvas: HTMLCanvasElement) => THREE.WebGLRenderer;
  /**
   * Optional Ultra-tier pipeline (sky, IBL, soft shadows, post stack).
   *
   * Absent on the `low` tier, and absent is the *only* thing that guarantees
   * the low path is unchanged: with no pipeline this class takes exactly the
   * same branches it took before the pipeline existed. Everything below that
   * touches it is guarded by a null check for that reason.
   */
  readonly pipeline?: RenderPipeline;
}

export class RendererSystem implements EngineSystem {
  readonly id = 'renderer';
  readonly priority = SystemPriority.Render;

  readonly #options: RendererOptions;
  readonly #sizer: ViewportSizer;
  #renderer: THREE.WebGLRenderer | null = null;
  #sceneProvider: SceneProvider | null = null;
  #services: SystemInitContext['services'] | null = null;
  #pipeline: RenderPipeline | null = null;

  constructor(options: RendererOptions) {
    this.#options = options;
    this.#sizer = new ViewportSizer(options.container, options.maxPixelRatio ?? 2);
  }

  get renderer(): THREE.WebGLRenderer {
    if (!this.#renderer) throw new Error('RendererSystem.init() has not run yet.');
    return this.#renderer;
  }

  get viewport(): ViewportSize {
    return this.#sizer.size;
  }

  /** Resize notifications. The camera rig subscribes to keep its aspect correct. */
  get viewportEvents() {
    return this.#sizer.events;
  }

  init(context: SystemInitContext): void {
    const capabilities = detectCapabilities();
    if (!capabilities.webgl2 && !capabilities.webgl1 && !this.#options.rendererFactory) {
      throw new WebGLUnavailableError();
    }

    const canvas = document.createElement('canvas');
    this.#options.container.appendChild(canvas);

    this.#renderer =
      this.#options.rendererFactory?.(canvas) ??
      new THREE.WebGLRenderer({
        canvas,
        antialias: this.#options.antialias ?? capabilities.devicePixelRatio < 2,
        powerPreference: 'high-performance',
        // The default alpha:false plus an opaque clear colour is measurably
        // cheaper than compositing a transparent canvas over the page.
        alpha: false,
        stencil: false,
      });

    const pipeline = this.#options.pipeline ?? null;
    this.#pipeline = pipeline;

    this.#renderer.setClearColor(this.#options.clearColor ?? 0x0b1014, 1);
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    // No tone mapping. ACES filmic desaturates and rolls off exactly the
    // saturated crop hues this art direction depends on - the gold of ready
    // wheat and the orange of a ripe pumpkin are gameplay signals, not
    // photographic highlights, and they must reach the screen unmodified.
    // Configurable so a future scene with real HDR lighting can opt back in.
    this.#renderer.toneMapping = this.#options.toneMapping ?? THREE.NoToneMapping;
    this.#renderer.shadowMap.enabled = true;
    // Three r185 removed the distinct PCFSoft implementation. Standard PCF
    // keeps the warm, readable contact shadows without emitting a runtime
    // deprecation warning.
    this.#renderer.shadowMap.type = THREE.PCFShadowMap;

    // The pipeline may override tone mapping, shadow map type and the global
    // shadow shader chunk. It runs after the defaults above so that "what the
    // low tier does" stays visible in one place.
    if (pipeline) {
      pipeline.init(this.#renderer);
      context.services.provide(RenderPipelineToken, pipeline);
    }

    // Resolved lazily in update(): the scene provider is usually registered
    // after the renderer, because it needs the renderer to exist first.
    this.#services = context.services;
    context.services.provide(RendererToken, this);

    this.#sizer.events.on('resize', (size) => {
      this.#applySize(size);
      this.#pipeline?.resize(size);
    });
    this.#sizer.start();
    this.#applySize(this.#sizer.size);
    pipeline?.resize(this.#sizer.size);
  }

  update(context: RenderContext): void {
    const renderer = this.#renderer;
    this.#sceneProvider ??= this.#services?.tryResolve(SceneProviderToken) ?? null;
    const pair = this.#sceneProvider?.getRenderPair();
    if (!renderer || !pair) return;
    // A pipeline that declines the frame (low tier, or every pass disabled)
    // leaves this line as the only thing that ever drew anything.
    if (this.#pipeline?.render(pair.scene, pair.camera, context.deltaSeconds)) return;
    renderer.render(pair.scene, pair.camera);
  }

  /** The active pipeline, or null on the low tier. */
  get pipeline(): RenderPipeline | null {
    return this.#pipeline;
  }

  /** Total triangles/draw calls last frame, for the debug overlay. */
  get stats(): { drawCalls: number; triangles: number; programs: number } {
    const info = this.#renderer?.info;
    return {
      drawCalls: info?.render.calls ?? 0,
      triangles: info?.render.triangles ?? 0,
      programs: info?.programs?.length ?? 0,
    };
  }

  dispose(): void {
    this.#sizer.dispose();
    this.#pipeline?.dispose();
    this.#pipeline = null;
    this.#renderer?.dispose();
    this.#renderer?.domElement.remove();
    this.#renderer = null;
  }

  #applySize(size: ViewportSize): void {
    const renderer = this.#renderer;
    if (!renderer) return;
    renderer.setPixelRatio(size.pixelRatio);
    // updateStyle=false: the canvas is sized by CSS (100%/100%), and letting
    // Three.js write inline styles fights the stylesheet on orientation change.
    renderer.setSize(size.widthCss, size.heightCss, false);
  }
}

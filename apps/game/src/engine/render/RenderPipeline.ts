/**
 * The render pipeline: one object that owns everything tier-dependent about how
 * a frame is produced, and the single API the rest of the codebase asks about
 * lighting.
 *
 * The contract, in one sentence: **if the pipeline is absent or inactive, the
 * renderer behaves exactly as it did before this file existed.** That is why
 * `RendererSystem` treats it as an optional collaborator rather than a
 * dependency, why `low` never constructs one, and why every effect has an
 * individual off switch that returns it to the previous path.
 *
 * What other systems get from it:
 *
 *   pipeline.tier                     -> 'low' | 'ultra'
 *   pipeline.profile                  -> the whole quality profile
 *   pipeline.environment              -> PMREM texture for PBR materials
 *   pipeline.sun                      -> direction, colour, intensity, sky tints
 *   pipeline.registerMaterial(m, r)   -> tier-appropriate treatment for a material
 *   pipeline.setSunElevation(deg)     -> time of day, for whoever drives it later
 *
 * See docs/RENDER_PIPELINE.md. That document is the contract; this file is the
 * implementation of it.
 */
import * as THREE from 'three';
import type { ViewportSize } from './ViewportSizer.js';
import { createServiceToken } from '../core/ServiceContainer.js';
import {
  qualityProfile,
  type QualityFeatures,
  type QualityProfile,
  type QualityTier,
} from './quality/QualityTier.js';
import { SkyRig, type SkyState } from './sky/SkyRig.js';
import { PostProcessor, type GradeSettings, type PostPassId } from './post/PostProcessor.js';
import { installPcssShadows, pcssShadowRadius, restorePcssShadows } from './shadows/pcss.js';

/**
 * How a material is lit, from the pipeline's point of view.
 *
 * This is deliberately a small closed set rather than a free-form options bag:
 * the point is that terrain from one agent and buildings from another end up
 * with a coherent response to the same environment, which cannot happen if
 * every caller invents its own `envMapIntensity`.
 */
export type MaterialRole =
  'terrain' | 'foliage' | 'structure' | 'metal' | 'water' | 'skin' | 'cloth' | 'unlit';

export interface MaterialTreatment {
  readonly envMapIntensity: number;
  /** Clamps roughness up, so nothing authored for the flat path turns mirror-like. */
  readonly minRoughness: number;
}

const TREATMENTS: Readonly<Record<MaterialRole, MaterialTreatment>> = Object.freeze({
  // Ground is the largest surface in frame; a strong sky term here is what
  // makes the whole image feel outdoors rather than studio-lit.
  terrain: { envMapIntensity: 1.0, minRoughness: 0.7 },
  // Leaves are thin and mostly bounce light; they read best slightly hotter
  // than their albedo suggests.
  foliage: { envMapIntensity: 1.15, minRoughness: 0.55 },
  structure: { envMapIntensity: 0.85, minRoughness: 0.45 },
  metal: { envMapIntensity: 1.3, minRoughness: 0.18 },
  water: { envMapIntensity: 1.6, minRoughness: 0.04 },
  skin: { envMapIntensity: 0.8, minRoughness: 0.5 },
  cloth: { envMapIntensity: 0.75, minRoughness: 0.72 },
  unlit: { envMapIntensity: 0, minRoughness: 0 },
});

export interface RenderPipelineOptions {
  readonly tier: QualityTier;
  /** Overrides individual feature flags from the profile. Used by `?quality` review shots. */
  readonly features?: Partial<QualityFeatures>;
  readonly sunElevation?: number;
  readonly sunAzimuth?: number;
  readonly turbidity?: number;
  /** Distance at which aerial perspective halves the view, in world units. */
  readonly fogDistance?: number;
  readonly exposure?: number;
  /**
   * Ambient (image-based) light as a fraction of direct sun, 0..1.
   *
   * Not a raw `scene.environmentIntensity`: see `DEFAULT_AMBIENT_FRACTION`.
   */
  readonly ambientFraction?: number;
  readonly aoIntensity?: number;
  readonly bloomStrength?: number;
  readonly saturation?: number;
  readonly warmGain?: number;
  readonly growthGain?: number;
  readonly contrast?: number;
  readonly vignette?: number;
}

/**
 * Default exposure for the Ultra transform.
 *
 * Calibrated against the Preetham sky, whose radiance is in the tens near the
 * sun. Feed that into AgX at unit exposure and the whole frame sits on the
 * shoulder of the curve, which is what produces the classic first-pass
 * "everything is milk" result. This value puts the lit ground at roughly 0.45
 * display, leaving headroom for the sky and for genuine speculars.
 */
const DEFAULT_EXPOSURE = 0.82;

/**
 * How much ambient light the sky supplies, as a fraction of direct sun.
 *
 * This is a *ratio*, not a `scene.environmentIntensity`, and the difference is
 * the single biggest thing this pipeline got wrong on its first pass. The
 * Preetham dome is scene-referred and unnormalised: its mean radiance is in the
 * tens at midday and falls by an order of magnitude by dusk. Setting the raw
 * intensity to a constant therefore sets a *different* ambient level at every
 * sun elevation, and at midday it sets "flat white" - which is exactly the frame
 * the first review shot produced.
 *
 * Expressing it as a ratio and dividing by the measured sky luminance
 * (`SkyRig.meanRadiance`) makes it stable across time of day and turbidity, and
 * makes the number mean something a person can argue about: at 0.34, a surface
 * turned away from the sun receives roughly a third of the light one facing it
 * receives, which is about right for a clear day with dry ground bouncing.
 *
 * Too high and shadows stop reading as shadows. Too low and the shaded sides go
 * to black and the art's hue separation dies with them.
 */
const DEFAULT_AMBIENT_FRACTION = 0.34;

/**
 * Converts an ambient fraction into the raw `scene.environmentIntensity` three
 * wants.
 *
 * Derivation, from `three`'s own shading: a directional light contributes
 * `intensity * dotNL * albedo / PI` to a diffuse surface, while the environment
 * contributes `radiance * environmentIntensity * albedo`. Setting the second to
 * `fraction` times the first at `dotNL = 1` gives the expression below. Written
 * out because a magic 0.037 in this file would be unmaintainable the first time
 * anyone changed the sun's elevation.
 */
function environmentIntensityFor(
  fraction: number,
  sunIntensity: number,
  meanRadiance: number,
): number {
  return (fraction * sunIntensity) / (Math.PI * Math.max(1e-3, meanRadiance));
}

export interface SunState extends SkyState {
  /** Position to place a DirectionalLight at, given a focus point. */
  positionFor(focus: THREE.Vector3, distance?: number): THREE.Vector3;
}

export const RenderPipelineToken = createServiceToken<RenderPipeline>('RenderPipeline');

export class RenderPipeline {
  readonly tier: QualityTier;
  readonly profile: QualityProfile;
  readonly features: QualityFeatures;

  #renderer: THREE.WebGLRenderer | null = null;
  #sky: SkyRig | null = null;
  #post: PostProcessor | null = null;
  #scene: THREE.Scene | null = null;
  #camera: THREE.Camera | null = null;
  #pcssInstalled = false;
  #shadowRadius = 1;
  #fogDistance: number;
  #ambientFraction: number;
  #environmentIntensity = 0;
  readonly #options: RenderPipelineOptions;
  readonly #treated = new WeakSet<THREE.Material>();
  readonly #registered = new Set<THREE.Material>();
  /** Restored on dispose so a scene handed back to the low path is unchanged. */
  #originalBackground: THREE.Scene['background'] = null;
  #originalFog: THREE.Fog | THREE.FogExp2 | null = null;

  constructor(options: RenderPipelineOptions) {
    this.#options = options;
    this.tier = options.tier;
    this.profile = qualityProfile(options.tier);
    this.features = { ...this.profile.features, ...options.features };
    // Half-transmittance at 320 m.
    //
    // Matching the old linear fog's 42-108 m schedule was the wrong instinct
    // and the first review shot proved it: that curve was tuned for a fog
    // colour hand-picked to sit near the ground hue, so heavy application was
    // invisible. Sampling the *sky* instead means the same density washes the
    // warm ochre toward pale blue, and because this camera looks down a shallow
    // 34 degrees, most of the frame is far field - so the whole image went
    // milky and the ground lost the red-ochre identity the art depends on.
    //
    // 320 m puts half-transmittance beyond the visible estate. What survives is
    // a few percent of haze at the horizon, which is what aerial perspective
    // actually looks like at this scale, and the playfield keeps its hue.
    this.#fogDistance = options.fogDistance ?? 320;
    this.#ambientFraction = options.ambientFraction ?? DEFAULT_AMBIENT_FRACTION;
  }

  /** True when the pipeline actually changes how a frame is drawn. */
  get active(): boolean {
    return this.tier !== 'low';
  }

  get renderer(): THREE.WebGLRenderer | null {
    return this.#renderer;
  }

  /** The convolved sky. Null on `low`, or before the first frame. */
  get environment(): THREE.Texture | null {
    return this.#sky?.environment ?? null;
  }

  /** The raw weight `scene.environmentIntensity` is set to, after normalisation. */
  get environmentIntensity(): number {
    return this.#environmentIntensity;
  }

  /** Ambient light as a fraction of direct sun. The number worth tuning. */
  get ambientFraction(): number {
    return this.#ambientFraction;
  }

  get sky(): SkyRig | null {
    return this.#sky;
  }

  get post(): PostProcessor | null {
    return this.#post;
  }

  /** Suggested directional shadow settings for whoever owns the sun light. */
  get shadow(): { mapSize: number; extent: number; depth: number; radius: number } {
    return {
      mapSize: this.profile.shadowMapSize,
      extent: this.profile.shadowExtent,
      depth: this.profile.shadowDepth,
      radius: this.#shadowRadius,
    };
  }

  /**
   * Everything the game needs to place and colour its sun.
   *
   * Returns a snapshot: callers copy out of it and are free to keep it for a
   * frame. `positionFor` exists because a DirectionalLight needs a position, not
   * a direction, and getting that conversion wrong (placing the light inside the
   * shadow frustum, say) is a silent and confusing failure.
   */
  get sun(): SunState | null {
    const sky = this.#sky;
    if (!sky) return null;
    const state = sky.state;
    return {
      ...state,
      positionFor: (focus: THREE.Vector3, distance = this.profile.shadowDepth * 0.4) =>
        state.direction.clone().multiplyScalar(distance).add(focus),
    };
  }

  init(renderer: THREE.WebGLRenderer): void {
    if (!this.active) return;
    this.#renderer = renderer;

    // AgX over ACES: both compress, but AgX keeps hues far closer to their
    // input as they brighten, which halves the work the grade pass has to do to
    // put the ready-crop gold back. ACES pulls saturated oranges towards yellow
    // as they approach white and no grade fully undoes that.
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = this.#options.exposure ?? DEFAULT_EXPOSURE;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    if (this.features.softShadows) {
      // See shadows/pcss.ts: the blocker search needs raw depth, which only the
      // "basic" sampler type exposes.
      this.#pcssInstalled = installPcssShadows();
      renderer.shadowMap.type = this.#pcssInstalled ? THREE.BasicShadowMap : THREE.PCFShadowMap;
      this.#shadowRadius = pcssShadowRadius(
        this.profile.shadowDepth,
        this.profile.shadowExtent * 2,
        this.profile.sunAngularSize,
      );
    } else {
      renderer.shadowMap.type = THREE.PCFShadowMap;
      this.#shadowRadius = 2;
    }
    renderer.shadowMap.enabled = true;

    if (this.features.sky || this.features.environmentMap) {
      this.#sky = new SkyRig(renderer, {
        // 33 degrees put the sun low enough that every object threw a shadow
        // several times its own length, which reads as late evening rather than
        // a working day and smeared the plot grid the player plans on. 46 keeps
        // the shadows long enough to model form and ground contact, without
        // letting the barn's shadow reach the crop beds.
        elevation: this.#options.sunElevation ?? 46,
        azimuth: this.#options.sunAzimuth ?? 152,
        turbidity: this.#options.turbidity ?? 3.2,
      });
      this.#sky.refresh();
      this.#recomputeEnvironmentIntensity();
    }
  }

  /**
   * Binds the pipeline to whatever the scene provider handed the renderer.
   *
   * Called every frame; almost always a no-op. It is cheap and idempotent so
   * that a scene swap needs no explicit notification, which removes a whole
   * category of "the composer is still pointing at the old scene" bug.
   */
  attach(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.active || !this.#renderer) return;
    if (this.#scene === scene && this.#camera === camera) return;

    if (this.#scene && this.#scene !== scene) this.#detachScene(this.#scene);

    if (this.#scene !== scene) {
      this.#originalBackground = scene.background;
      this.#originalFog = scene.fog;
      if (this.#sky) {
        if (this.features.sky) {
          scene.add(this.#sky.sky);
          scene.background = null;
        }
        if (this.features.environmentMap) {
          scene.environment = this.#sky.environment;
          scene.environmentIntensity = this.#environmentIntensity;
        }
        if (this.features.aerialFog) this.#applyAerialFog(scene);
      }
    }

    this.#scene = scene;
    this.#camera = camera;

    if (this.#post) {
      this.#post.setScene(scene, camera);
    } else if (this.#anyPostPassEnabled()) {
      this.#post = new PostProcessor(this.#renderer, scene, camera, {
        ao: this.features.ao,
        bloom: this.features.bloom,
        grade: this.features.grade,
        vignette: this.features.vignette,
        smaa: this.features.smaa,
        width: this.#renderer.domElement.width,
        height: this.#renderer.domElement.height,
      });
      const o = this.#options;
      if (o.aoIntensity !== undefined) this.#post.setAoIntensity(o.aoIntensity);
      if (o.bloomStrength !== undefined) this.#post.setBloomStrength(o.bloomStrength);
      this.#post.setGrade({
        ...(o.saturation !== undefined ? { saturation: o.saturation } : {}),
        ...(o.warmGain !== undefined ? { warmGain: o.warmGain } : {}),
        ...(o.growthGain !== undefined ? { growthGain: o.growthGain } : {}),
        ...(o.contrast !== undefined ? { contrast: o.contrast } : {}),
        ...(o.vignette !== undefined ? { vignette: o.vignette } : {}),
      });
    }
  }

  /** Sets ambient light as a fraction of direct sun. See `DEFAULT_AMBIENT_FRACTION`. */
  setAmbientFraction(fraction: number): void {
    this.#ambientFraction = fraction;
    this.#recomputeEnvironmentIntensity();
  }

  #recomputeEnvironmentIntensity(): void {
    const sky = this.#sky;
    if (!sky) return;
    this.#environmentIntensity = environmentIntensityFor(
      this.#ambientFraction,
      sky.sunIntensity,
      sky.meanRadiance,
    );
    if (this.#scene && this.features.environmentMap) {
      this.#scene.environmentIntensity = this.#environmentIntensity;
    }
  }

  /**
   * Draws the frame. Returns false when the caller should fall back to a plain
   * `renderer.render()`, which is what happens on `low` and whenever every post
   * pass has been switched off.
   */
  render(scene: THREE.Scene, camera: THREE.Camera, deltaSeconds: number): boolean {
    if (!this.active || !this.#renderer) return false;
    this.attach(scene, camera);
    const post = this.#post;
    if (!post) return false;
    post.render(deltaSeconds);
    return true;
  }

  resize(size: ViewportSize): void {
    this.#post?.setPixelRatio(size.pixelRatio);
    this.#post?.setSize(size.widthCss, size.heightCss);
  }

  /** Moves the sun and re-convolves the environment. Time of day lives here. */
  setSunElevation(elevationDegrees: number, azimuthDegrees?: number): void {
    if (!this.#sky) return;
    this.#sky.setSun(elevationDegrees, azimuthDegrees);
    this.#sky.refresh();
    // Both the sun's intensity and the sky's mean radiance just changed, so the
    // ambient *ratio* the caller asked for now needs a different raw weight.
    this.#recomputeEnvironmentIntensity();
    if (this.#scene) {
      if (this.features.environmentMap) this.#scene.environment = this.#sky.environment;
      if (this.features.aerialFog) this.#applyAerialFog(this.#scene);
    }
  }

  /** Haze. 2 is a clean morning, 10 is a dust event. */
  setTurbidity(turbidity: number): void {
    if (!this.#sky) return;
    this.#sky.setTurbidity(turbidity);
    this.#sky.refresh();
    this.#recomputeEnvironmentIntensity();
    if (this.#scene && this.features.aerialFog) this.#applyAerialFog(this.#scene);
  }

  setFogDistance(distance: number): void {
    this.#fogDistance = distance;
    if (this.#scene && this.features.aerialFog) this.#applyAerialFog(this.#scene);
  }

  setPassEnabled(id: PostPassId, enabled: boolean): void {
    this.#post?.setPassEnabled(id, enabled);
  }

  setGrade(settings: GradeSettings): void {
    this.#post?.setGrade(settings);
  }

  setExposure(exposure: number): void {
    if (this.#renderer) this.#renderer.toneMappingExposure = exposure;
  }

  /**
   * Gives a material the treatment its role deserves on the active tier.
   *
   * On `low` this is a no-op that returns the material unchanged - callers can
   * therefore call it unconditionally, which is the whole point. On `ultra` it
   * sets `envMapIntensity`, clamps roughness up so art authored for the flat
   * path does not become a mirror under image-based light, and re-applies the
   * environment whenever the sun moves.
   *
   * Idempotent, and safe to call with the same material from several views.
   */
  registerMaterial<T extends THREE.Material>(material: T, role: MaterialRole = 'structure'): T {
    if (!this.active || role === 'unlit') return material;
    this.#registered.add(material);
    if (this.#treated.has(material)) return material;
    this.#treated.add(material);

    const treatment = TREATMENTS[role];
    const standard = material as unknown as {
      isMeshStandardMaterial?: boolean;
      envMapIntensity?: number;
      roughness?: number;
    };
    if (standard.isMeshStandardMaterial) {
      standard.envMapIntensity = treatment.envMapIntensity;
      if (typeof standard.roughness === 'number') {
        standard.roughness = Math.max(standard.roughness, treatment.minRoughness);
      }
      material.needsUpdate = true;
    }
    return material;
  }

  /** Forgets a material, so a disposed view does not pin it alive. */
  unregisterMaterial(material: THREE.Material): void {
    this.#registered.delete(material);
  }

  dispose(): void {
    if (this.#scene) this.#detachScene(this.#scene);
    this.#scene = null;
    this.#camera = null;
    this.#post?.dispose();
    this.#post = null;
    this.#sky?.dispose();
    this.#sky = null;
    this.#registered.clear();
    if (this.#pcssInstalled) {
      restorePcssShadows();
      this.#pcssInstalled = false;
    }
    this.#renderer = null;
  }

  #anyPostPassEnabled(): boolean {
    const f = this.features;
    return f.ao || f.bloom || f.grade || f.smaa || f.vignette;
  }

  /**
   * Aerial perspective: exponential-squared fog whose colour is a sample of the
   * sky at the horizon.
   *
   * Linear `THREE.Fog` with a hand-picked colour is what produced the flat band
   * the brief complains about - distant geometry faded to a colour that had
   * nothing to do with the sky above it, so the horizon read as a seam. Sampling
   * the dome guarantees they agree by construction, and exp2 puts most of the
   * fade in the far half of the frame where atmosphere actually lives.
   */
  #applyAerialFog(scene: THREE.Scene): void {
    const sky = this.#sky;
    if (!sky) return;
    const horizon = sky.horizonColor;
    // Density chosen so transmittance is ~0.5 at fogDistance: exp(-(d*x)^2)=0.5.
    const density = Math.sqrt(Math.LN2) / Math.max(1, this.#fogDistance);
    const existing = scene.fog;
    if (existing instanceof THREE.FogExp2) {
      existing.color.copy(horizon);
      existing.density = density;
    } else {
      scene.fog = new THREE.FogExp2(horizon.getHex(THREE.LinearSRGBColorSpace), density);
      scene.fog.color.copy(horizon);
    }
  }

  #detachScene(scene: THREE.Scene): void {
    if (this.#sky) scene.remove(this.#sky.sky);
    scene.background = this.#originalBackground;
    scene.fog = this.#originalFog;
    scene.environment = null;
    this.#originalBackground = null;
    this.#originalFog = null;
  }
}

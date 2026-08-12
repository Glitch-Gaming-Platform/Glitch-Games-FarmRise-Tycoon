/**
 * Physical sky, sun state and image-based ambient light.
 *
 * Three jobs, deliberately in one object because they are one physical fact:
 *
 *  1. Draw an analytic (Preetham) sky dome instead of a flat clear colour.
 *  2. Convolve that sky into a PMREM environment map, which is what makes
 *     `MeshStandardMaterial` receive plausible ambient light instead of the
 *     single flat `AmbientLight`/`HemisphereLight` term.
 *  3. Publish the sun as a direction, a colour and an intensity, so the sun
 *     that lights the world is provably the same sun the sky drew. Time of day
 *     is then a single call - `setSunElevation` - rather than a hunt through
 *     four files for hard-coded light positions.
 *
 * The environment map is regenerated only when the sun actually moves, because
 * PMREM convolution is a chain of render passes and doing it per frame costs
 * more than everything else in this file combined.
 *
 * Game-agnostic on purpose: it knows about a scene, a sun and an atmosphere,
 * and nothing about farms.
 */
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export interface SkyState {
  /** Unit vector pointing *towards* the sun from the world origin. */
  readonly direction: THREE.Vector3;
  /** Elevation above the horizon, in degrees. */
  readonly elevation: number;
  /** Compass azimuth, in degrees. */
  readonly azimuth: number;
  /** Sun colour after atmospheric extinction, linear-sRGB. */
  readonly color: THREE.Color;
  /** Recommended `DirectionalLight.intensity` for this elevation. */
  readonly intensity: number;
  /** Sky colour at the horizon, in the sun's direction. Drives the fog. */
  readonly horizonColor: THREE.Color;
  /** Sky colour at zenith. */
  readonly zenithColor: THREE.Color;
  /**
   * Mean luminance of the dome, in the same scene-referred units the sky is
   * drawn in.
   *
   * This is the number that makes image-based ambient light controllable. The
   * Preetham dome is *not* normalised: its radiance runs into the tens, and it
   * changes by an order of magnitude between noon and dusk. Anyone who sets
   * `scene.environmentIntensity` to a hand-picked constant is therefore setting
   * a different ambient level at every time of day, and at noon they are almost
   * certainly setting "white". Divide by this and the control becomes "how much
   * ambient, relative to the sun", which is a quantity a human can reason about.
   */
  readonly meanRadiance: number;
}

export interface SkyRigOptions {
  /** Aerosol density. 2 is a clean day, 10 is haze. */
  readonly turbidity?: number;
  /** Rayleigh scattering strength - how blue the sky is. */
  readonly rayleigh?: number;
  readonly mieCoefficient?: number;
  readonly mieDirectionalG?: number;
  readonly elevation?: number;
  readonly azimuth?: number;
  /** Radius of the dome mesh. Must comfortably exceed the camera's far plane. */
  readonly radius?: number;
  /** Resolution of the PMREM source cubemap. 256 is plenty for a smooth sky. */
  readonly environmentResolution?: number;
  /** Scales the ambient contribution of the generated environment. */
  readonly environmentIntensity?: number;
}

const DEG = Math.PI / 180;

export class SkyRig {
  readonly sky: Sky;
  readonly #pmrem: THREE.PMREMGenerator;
  readonly #captureScene = new THREE.Scene();
  #environment: THREE.Texture | null = null;
  #dirty = true;

  #elevation: number;
  #azimuth: number;
  readonly #options: Required<SkyRigOptions>;
  readonly #direction = new THREE.Vector3();
  readonly #sunColor = new THREE.Color();
  readonly #horizonColor = new THREE.Color();
  readonly #zenithColor = new THREE.Color();
  readonly #antiSunColor = new THREE.Color();
  #intensity = 1;
  #meanRadiance = 1;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    options: SkyRigOptions = {},
  ) {
    this.#options = {
      turbidity: options.turbidity ?? 3.4,
      rayleigh: options.rayleigh ?? 1.9,
      mieCoefficient: options.mieCoefficient ?? 0.006,
      mieDirectionalG: options.mieDirectionalG ?? 0.78,
      elevation: options.elevation ?? 34,
      azimuth: options.azimuth ?? 148,
      radius: options.radius ?? 6000,
      environmentResolution: options.environmentResolution ?? 256,
      environmentIntensity: options.environmentIntensity ?? 1,
    };

    this.sky = new Sky();
    this.sky.scale.setScalar(this.#options.radius);
    // The dome is a box drawn from the inside with depthWrite off. Frustum
    // culling has to stay on but the bounding sphere is enormous, so it never
    // culls; renderOrder keeps it from paying for overdraw against the world.
    this.sky.renderOrder = -1000;
    this.sky.name = 'SkyRig.dome';
    const uniforms = this.sky.material.uniforms;
    uniforms['turbidity']!.value = this.#options.turbidity;
    uniforms['rayleigh']!.value = this.#options.rayleigh;
    uniforms['mieCoefficient']!.value = this.#options.mieCoefficient;
    uniforms['mieDirectionalG']!.value = this.#options.mieDirectionalG;

    this.#elevation = this.#options.elevation;
    this.#azimuth = this.#options.azimuth;

    this.#pmrem = new THREE.PMREMGenerator(renderer);
    this.#pmrem.compileEquirectangularShader();

    this.#applySun();
  }

  get state(): SkyState {
    return {
      direction: this.#direction.clone(),
      elevation: this.#elevation,
      azimuth: this.#azimuth,
      color: this.#sunColor.clone(),
      intensity: this.#intensity,
      horizonColor: this.#horizonColor.clone(),
      zenithColor: this.#zenithColor.clone(),
      meanRadiance: this.#meanRadiance,
    };
  }

  /** See `SkyState.meanRadiance`. Always > 0, so it is safe to divide by. */
  get meanRadiance(): number {
    return this.#meanRadiance;
  }

  /** Live, non-copying accessor for per-frame consumers that will not mutate it. */
  get sunDirection(): THREE.Vector3 {
    return this.#direction;
  }

  get sunColor(): THREE.Color {
    return this.#sunColor;
  }

  get sunIntensity(): number {
    return this.#intensity;
  }

  get horizonColor(): THREE.Color {
    return this.#horizonColor;
  }

  /** The PMREM texture. Null until `refresh()` has run once. */
  get environment(): THREE.Texture | null {
    return this.#environment;
  }

  get environmentIntensity(): number {
    return this.#options.environmentIntensity;
  }

  /**
   * Moves the sun. Cheap: it only marks the environment dirty, and the
   * convolution happens on the next `refresh()`.
   *
   * @param elevation degrees above the horizon
   * @param azimuth degrees clockwise from north
   */
  setSun(elevation: number, azimuth: number = this.#azimuth): void {
    if (elevation === this.#elevation && azimuth === this.#azimuth) return;
    this.#elevation = elevation;
    this.#azimuth = azimuth;
    this.#applySun();
    this.#dirty = true;
  }

  setTurbidity(turbidity: number): void {
    if (this.sky.material.uniforms['turbidity']!.value === turbidity) return;
    this.sky.material.uniforms['turbidity']!.value = turbidity;
    this.#dirty = true;
  }

  /** Regenerates the environment map if the sun moved. Returns the texture. */
  refresh(): THREE.Texture | null {
    if (!this.#dirty && this.#environment) return this.#environment;
    this.#dirty = false;

    // The sun disc is a tiny, extremely bright feature. Convolving it produces
    // a hot blob that shows up as a fake specular smear on every surface, so it
    // is hidden for the capture and the DirectionalLight represents it instead.
    const uniforms = this.sky.material.uniforms;
    const showSunDisc = uniforms['showSunDisc']!.value;
    uniforms['showSunDisc']!.value = 0;

    this.#captureScene.add(this.sky);
    const previous = this.#environment;
    try {
      this.#environment = this.#pmrem.fromScene(
        this.#captureScene,
        0,
        0.1,
        this.#options.radius * 4,
        {
          size: this.#options.environmentResolution,
        },
      ).texture;
      previous?.dispose();
    } catch (error) {
      // A PMREM failure must not take the frame down; the scene simply keeps
      // whatever environment it already had (or none, which is the low path).
      console.warn('[SkyRig] environment generation failed', error);
      this.#environment = previous;
    } finally {
      this.#captureScene.remove(this.sky);
      uniforms['showSunDisc']!.value = showSunDisc;
    }

    this.#sampleSkyColors();
    return this.#environment;
  }

  dispose(): void {
    this.#environment?.dispose();
    this.#environment = null;
    this.#pmrem.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.sky.removeFromParent();
  }

  #applySun(): void {
    const phi = (90 - this.#elevation) * DEG;
    const theta = this.#azimuth * DEG;
    this.#direction.setFromSphericalCoords(1, phi, theta);
    this.sky.material.uniforms['sunPosition']!.value.copy(this.#direction);

    // Extinction towards the horizon. An analytic stand-in for integrating the
    // Preetham model along the view ray, which is more than the light rig needs.
    const height = Math.max(0.02, Math.sin(this.#elevation * DEG));
    const airMass = 1 / height;
    const warm = Math.min(1, (airMass - 1) * 0.32);
    this.#sunColor.setRGB(1, 1 - warm * 0.28, 1 - warm * 0.62).convertSRGBToLinear();
    // Peaks near 3.2 at noon and falls off with the cosine of the zenith angle,
    // so dusk dims without anyone hand-animating an intensity curve.
    this.#intensity = 3.35 * Math.pow(height, 0.42);
  }

  /**
   * Renders the dome into a 4x4 float target three times - the horizon along
   * the sun's bearing, the horizon behind the viewer, and zenith - and averages
   * the pixels of each.
   *
   * This is how the fog provably matches the sky: the fog colour is literally
   * a sample of the sky the player is looking at, not a hand-picked hex that
   * drifts out of agreement the first time anyone changes turbidity. It costs
   * three four-by-four renders and only runs when the sun moves.
   *
   * The anti-sun sample is not decoration. Without it the "mean" would be taken
   * from the two brightest places in the sky, which overstates the hemisphere by
   * roughly a factor of two and lands the ambient term exactly where the first
   * pass of this pipeline landed it: white.
   *
   * Falls back to plausible tints if the read fails, which it does wherever
   * there is no real GL context (jsdom).
   */
  #sampleSkyColors(): void {
    const target = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.FloatType,
      colorSpace: THREE.NoColorSpace,
      depthBuffer: false,
    });
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, this.#options.radius * 4);
    const showSunDisc = this.sky.material.uniforms['showSunDisc']!.value;
    this.sky.material.uniforms['showSunDisc']!.value = 0;
    this.#captureScene.add(this.sky);
    try {
      camera.lookAt(this.#direction.x, 0.06, this.#direction.z);
      this.#renderInto(camera, target, this.#horizonColor);
      camera.lookAt(-this.#direction.x, 0.06, -this.#direction.z);
      this.#renderInto(camera, target, this.#antiSunColor);
      camera.lookAt(0, 1, 0);
      this.#renderInto(camera, target, this.#zenithColor);
      this.#meanRadiance = this.#hemisphereMean();
    } catch (error) {
      console.warn('[SkyRig] sky colour read-back failed, using fallback tints', error);
      this.#horizonColor.setRGB(0.62, 0.72, 0.86);
      this.#zenithColor.setRGB(0.19, 0.36, 0.68);
      this.#antiSunColor.copy(this.#horizonColor);
      this.#meanRadiance = this.#hemisphereMean();
    } finally {
      this.#captureScene.remove(this.sky);
      this.sky.material.uniforms['showSunDisc']!.value = showSunDisc;
      target.dispose();
    }
  }

  /**
   * Cosine-weighted mean luminance of the three samples.
   *
   * A flat surface facing up integrates the dome weighted by cos(theta), which
   * puts most of the weight overhead and comparatively little at the horizon.
   * 0.5 zenith / 0.5 split between the two horizon samples is the crude version
   * of that integral, and it is accurate enough for a control that a human is
   * going to nudge by eye anyway. Clamped away from zero so callers can divide.
   */
  #hemisphereMean(): number {
    const luminance = (color: THREE.Color): number =>
      color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
    const mean =
      0.5 * luminance(this.#zenithColor) +
      0.25 * luminance(this.#horizonColor) +
      0.25 * luminance(this.#antiSunColor);
    return Math.max(1e-3, mean);
  }

  #renderInto(camera: THREE.Camera, target: THREE.WebGLRenderTarget, out: THREE.Color): void {
    const previousTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.#captureScene, camera);
    const buffer = new Float32Array(4 * 4 * 4);
    this.renderer.readRenderTargetPixels(target, 0, 0, 4, 4, buffer);
    this.renderer.setRenderTarget(previousTarget);
    let r = 0;
    let g = 0;
    let b = 0;
    for (let index = 0; index < 16; index += 1) {
      r += buffer[index * 4]!;
      g += buffer[index * 4 + 1]!;
      b += buffer[index * 4 + 2]!;
    }
    out.setRGB(r / 16, g / 16, b / 16);
  }
}

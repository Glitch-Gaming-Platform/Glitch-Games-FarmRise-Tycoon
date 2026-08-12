/**
 * The Ultra post-processing stack.
 *
 * Built on three's own `EffectComposer` rather than a hand-rolled chain or an
 * external effects library, for three reasons:
 *
 *  1. It ships inside the `three` package this project already depends on. A
 *     postprocessing library would be a new runtime dependency, a second copy
 *     of the tone-mapping and colour-space logic, and a second thing to keep in
 *     step with every three.js upgrade.
 *  2. Each addon pass is an independent object, so "every pass must be
 *     individually toggleable" is `pass.enabled = false` rather than a rebuild.
 *  3. GTAO in particular is non-trivial (depth+normal prepass, Poisson
 *     denoise); the version in `three/examples` is the reference one.
 *
 * The cost is that `EffectComposer` ping-pongs full-resolution targets between
 * passes rather than merging them into one shader, which a library like
 * `postprocessing` would do. At the pass count here (five) that is two or three
 * extra full-screen blits - real, but small next to the AO prepass, and worth
 * paying to avoid a dependency.
 *
 * Order, and why:
 *
 *   RenderPass    scene -> half-float linear HDR. Three disables tone mapping
 *                 when the destination is a render target, so what lands here
 *                 is genuinely scene-referred.
 *   GTAOPass      must see linear radiance and real depth, so it goes first.
 *                 Multiplying AO after tone mapping darkens midtones instead of
 *                 removing ambient light, which is the classic "sooty" AO look.
 *   BloomPass     also HDR: thresholding at 1.0 only means "brighter than
 *                 white" while the buffer is still scene-referred.
 *   OutputPass    the tone map (AgX) and the linear -> sRGB encode.
 *   GradePass     display-referred grading + vignette, i.e. after the transform
 *                 whose hue rolloff it is there to answer.
 *   SMAAPass      last, because morphological AA reads perceptual edges. Run it
 *                 before the tone map and it hunts for edges in a contrast
 *                 range the player will never see.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GradeShader } from './GradeShader.js';

export type PostPassId = 'ao' | 'bloom' | 'output' | 'grade' | 'smaa';

export interface PostProcessorOptions {
  readonly ao?: boolean;
  readonly bloom?: boolean;
  readonly grade?: boolean;
  readonly vignette?: boolean;
  readonly smaa?: boolean;
  readonly width?: number;
  readonly height?: number;
}

export interface GradeSettings {
  readonly saturation?: number;
  readonly warmGain?: number;
  readonly growthGain?: number;
  readonly contrast?: number;
  readonly vignette?: number;
}

export class PostProcessor {
  readonly composer: EffectComposer;
  readonly #renderPass: RenderPass;
  readonly #ao: GTAOPass;
  readonly #bloom: UnrealBloomPass;
  readonly #output: OutputPass;
  readonly #grade: ShaderPass;
  readonly #smaa: SMAAPass;
  #vignetteEnabled: boolean;
  #width: number;
  #height: number;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: PostProcessorOptions = {},
  ) {
    this.#width = Math.max(1, options.width ?? 1);
    this.#height = Math.max(1, options.height ?? 1);

    // Half float, no depth-stencil pressure, no sRGB on the intermediate: every
    // pass before OutputPass works in linear light. An 8-bit intermediate here
    // would band the sky and clip the highlights bloom is meant to find.
    const target = new THREE.WebGLRenderTarget(this.#width, this.#height, {
      type: THREE.HalfFloatType,
      colorSpace: THREE.NoColorSpace,
      samples: 0,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.setSize(this.#width, this.#height);

    this.#renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.#renderPass);

    this.#ao = new GTAOPass(scene, camera, this.#width, this.#height);
    this.#ao.enabled = options.ao ?? true;
    this.#ao.output = GTAOPass.OUTPUT.Default;
    // Half a metre is roughly the scale of the contacts that matter here: a
    // crate against the ground, a fence post in grass, a chicken's feet. A
    // larger radius produces the soft grey "dirty corners" look that reads as
    // a bug rather than as occlusion.
    this.#ao.updateGtaoMaterial({
      radius: 0.55,
      distanceExponent: 1.6,
      thickness: 0.6,
      scale: 1.0,
      samples: 16,
      screenSpaceRadius: false,
      distanceFallOff: 1.0,
    });
    this.#ao.updatePdMaterial({
      lumaPhi: 9,
      depthPhi: 2.2,
      normalPhi: 3.4,
      radius: 6,
      rings: 2,
      samples: 12,
    });
    // Not 1.0. Full-strength GTAO on an already ambient-occluded PBR scene is
    // double-counting, and it is what turns every crevice into a black hole.
    this.#ao.blendIntensity = 0.72;
    this.composer.addPass(this.#ao);

    // Threshold above 1 means only genuine over-white highlights bloom: the sun
    // disc, a specular hit on the water tank. Ordinary bright gold does not.
    this.#bloom = new UnrealBloomPass(
      new THREE.Vector2(this.#width, this.#height),
      0.24,
      0.62,
      1.05,
    );
    this.#bloom.enabled = options.bloom ?? true;
    this.composer.addPass(this.#bloom);

    this.#output = new OutputPass();
    this.composer.addPass(this.#output);

    this.#grade = new ShaderPass(GradeShader);
    this.#grade.enabled = options.grade ?? true;
    this.#vignetteEnabled = options.vignette ?? true;
    if (!this.#vignetteEnabled) this.#grade.uniforms['vignette']!.value = 0;
    this.composer.addPass(this.#grade);

    this.#smaa = new SMAAPass();
    this.#smaa.enabled = options.smaa ?? true;
    this.composer.addPass(this.#smaa);
  }

  /** Points the whole chain at a different scene/camera pair, e.g. after a scene swap. */
  setScene(scene: THREE.Scene, camera: THREE.Camera): void {
    this.#renderPass.scene = scene;
    this.#renderPass.camera = camera;
    this.#ao.scene = scene;
    this.#ao.camera = camera;
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (w === this.#width && h === this.#height) return;
    this.#width = w;
    this.#height = h;
    this.composer.setSize(w, h);
    this.#ao.setSize(w, h);
  }

  setPixelRatio(ratio: number): void {
    this.composer.setPixelRatio(ratio);
  }

  setPassEnabled(id: PostPassId, enabled: boolean): void {
    this.#passById(id).enabled = enabled;
  }

  isPassEnabled(id: PostPassId): boolean {
    return this.#passById(id).enabled;
  }

  /** Live grading tweaks. Used by the review harness and, later, by weather. */
  setGrade(settings: GradeSettings): void {
    const uniforms = this.#grade.uniforms;
    if (settings.saturation !== undefined) uniforms['saturation']!.value = settings.saturation;
    if (settings.warmGain !== undefined) uniforms['warmGain']!.value = settings.warmGain;
    if (settings.growthGain !== undefined) uniforms['growthGain']!.value = settings.growthGain;
    if (settings.contrast !== undefined) uniforms['contrast']!.value = settings.contrast;
    if (settings.vignette !== undefined) {
      this.#vignetteEnabled = settings.vignette > 0;
      uniforms['vignette']!.value = settings.vignette;
    }
  }

  setAoIntensity(intensity: number): void {
    this.#ao.blendIntensity = intensity;
  }

  setBloomStrength(strength: number): void {
    this.#bloom.strength = strength;
  }

  render(deltaSeconds: number): void {
    this.composer.render(deltaSeconds);
  }

  dispose(): void {
    this.composer.dispose();
    this.#ao.dispose();
    this.#bloom.dispose();
    this.#output.dispose();
    this.#grade.dispose();
    this.#smaa.dispose();
  }

  #passById(id: PostPassId): { enabled: boolean } {
    switch (id) {
      case 'ao':
        return this.#ao;
      case 'bloom':
        return this.#bloom;
      case 'output':
        return this.#output;
      case 'grade':
        return this.#grade;
      case 'smaa':
        return this.#smaa;
    }
  }
}

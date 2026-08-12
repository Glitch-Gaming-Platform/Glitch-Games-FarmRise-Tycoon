/**
 * The guarantee these tests exist to protect is the one the whole tier design
 * rests on: **a `low` boot must be indistinguishable from the build that
 * existed before the pipeline.** Every assertion below is a way of saying that.
 *
 * They run in jsdom, so there is no GL context and nothing is actually drawn.
 * That is fine - what is being checked is the shape of the decisions, not the
 * pixels. Pixels are the review harness's job (tools/review/README.md).
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { RenderPipeline } from '../../src/engine/render/RenderPipeline.js';
import {
  installPcssShadows,
  isPcssInstalled,
  pcssShadowRadius,
  restorePcssShadows,
} from '../../src/engine/render/shadows/pcss.js';

describe('RenderPipeline on the low tier', () => {
  it('is inert: no sky, no environment, no post, and it declines the frame', () => {
    const pipeline = new RenderPipeline({ tier: 'low' });
    const renderer = {} as THREE.WebGLRenderer;
    pipeline.init(renderer);

    expect(pipeline.active).toBe(false);
    expect(pipeline.sky).toBeNull();
    expect(pipeline.post).toBeNull();
    expect(pipeline.environment).toBeNull();
    expect(pipeline.sun).toBeNull();
    // Declining is what makes RendererSystem fall through to renderer.render().
    expect(pipeline.render(new THREE.Scene(), new THREE.PerspectiveCamera(), 0.016)).toBe(false);
  });

  it('leaves the scene background, fog and environment exactly as it found them', () => {
    const pipeline = new RenderPipeline({ tier: 'low' });
    pipeline.init({} as THREE.WebGLRenderer);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x65bde7);
    scene.fog = new THREE.Fog(0xa7d7e8, 42, 108);
    const background = scene.background;
    const fog = scene.fog;

    pipeline.attach(scene, new THREE.PerspectiveCamera());

    expect(scene.background).toBe(background);
    expect(scene.fog).toBe(fog);
    expect(scene.environment).toBeNull();
  });

  it('does not touch the renderer, so tone mapping and shadow type keep their defaults', () => {
    const renderer = {
      toneMapping: THREE.NoToneMapping,
      toneMappingExposure: 1,
      shadowMap: { enabled: true, type: THREE.PCFShadowMap },
      outputColorSpace: THREE.SRGBColorSpace,
    } as unknown as THREE.WebGLRenderer;

    new RenderPipeline({ tier: 'low' }).init(renderer);

    expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
    expect(renderer.toneMappingExposure).toBe(1);
    expect(renderer.shadowMap.type).toBe(THREE.PCFShadowMap);
  });

  it('leaves registered materials untouched', () => {
    const pipeline = new RenderPipeline({ tier: 'low' });
    const material = new THREE.MeshStandardMaterial({ roughness: 0.1 });
    const before = { env: material.envMapIntensity, roughness: material.roughness };

    expect(pipeline.registerMaterial(material, 'water')).toBe(material);

    expect(material.envMapIntensity).toBe(before.env);
    expect(material.roughness).toBe(before.roughness);
  });
});

describe('RenderPipeline material treatment on ultra', () => {
  const ultra = () => new RenderPipeline({ tier: 'ultra' });

  it('applies the role environment weight and roughness floor', () => {
    const pipeline = ultra();
    const terrain = new THREE.MeshStandardMaterial({ roughness: 0.2 });
    pipeline.registerMaterial(terrain, 'terrain');

    expect(terrain.envMapIntensity).toBe(1);
    // Never below the floor: art authored flat must not become a mirror.
    expect(terrain.roughness).toBe(0.7);
  });

  it('never lowers an already-rough material', () => {
    const pipeline = ultra();
    const cloth = new THREE.MeshStandardMaterial({ roughness: 0.95 });
    pipeline.registerMaterial(cloth, 'cloth');
    expect(cloth.roughness).toBe(0.95);
  });

  it('is idempotent, so several views may register the same shared material', () => {
    const pipeline = ultra();
    const material = new THREE.MeshStandardMaterial({ roughness: 0.3 });
    pipeline.registerMaterial(material, 'metal');
    material.roughness = 0.9;
    pipeline.registerMaterial(material, 'metal');
    expect(material.roughness).toBe(0.9);
  });

  it('skips the unlit role entirely', () => {
    const pipeline = ultra();
    const material = new THREE.MeshStandardMaterial({ roughness: 0.05 });
    pipeline.registerMaterial(material, 'unlit');
    expect(material.roughness).toBe(0.05);
  });

  it('honours a feature override, which is how a pass gets bisected', () => {
    const pipeline = new RenderPipeline({ tier: 'ultra', features: { ao: false, bloom: false } });
    expect(pipeline.features.ao).toBe(false);
    expect(pipeline.features.bloom).toBe(false);
    expect(pipeline.features.smaa).toBe(true);
  });
});

describe('PCSS shader patch', () => {
  it('installs and restores the shadow chunk byte-for-byte', () => {
    const before = THREE.ShaderChunk.shadowmap_pars_fragment;
    expect(isPcssInstalled()).toBe(false);

    const installed = installPcssShadows();
    expect(installed).toBe(true);
    expect(THREE.ShaderChunk.shadowmap_pars_fragment).not.toBe(before);
    expect(THREE.ShaderChunk.shadowmap_pars_fragment).toContain('frPcssBlockerDepth');

    restorePcssShadows();
    // This is the low-tier guarantee at the shader level: a process that booted
    // ultra and then low must compile the original source.
    expect(THREE.ShaderChunk.shadowmap_pars_fragment).toBe(before);
    expect(isPcssInstalled()).toBe(false);
  });

  it('replaces only the basic branch, leaving PCF and VSM intact', () => {
    installPcssShadows();
    const patched = THREE.ShaderChunk.shadowmap_pars_fragment;
    restorePcssShadows();

    expect(patched).toContain('SHADOWMAP_TYPE_VSM');
    expect(patched).toContain('sampler2DShadow directionalShadowMap');
    // Exactly three getShadow definitions survive: PCF, VSM and the PCSS one.
    expect(patched.match(/float getShadow\(/g)?.length).toBe(3);
  });

  it('fails soft when the upstream chunk no longer matches', () => {
    const original = THREE.ShaderChunk.shadowmap_pars_fragment;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    THREE.ShaderChunk.shadowmap_pars_fragment = 'void main() {}';

    expect(installPcssShadows()).toBe(false);
    expect(THREE.ShaderChunk.shadowmap_pars_fragment).toBe('void main() {}');
    expect(warn).toHaveBeenCalled();

    THREE.ShaderChunk.shadowmap_pars_fragment = original;
    warn.mockRestore();
  });

  it('derives a penumbra rate from the shadow frustum, not from a magic number', () => {
    // Doubling the frustum depth doubles how fast the penumbra opens; doubling
    // its width halves it. Both are what the geometry says they should be.
    const base = pcssShadowRadius(220, 96, 0.038);
    expect(pcssShadowRadius(440, 96, 0.038)).toBeCloseTo(base * 2, 6);
    expect(pcssShadowRadius(220, 192, 0.038)).toBeCloseTo(base / 2, 6);
    expect(base).toBeGreaterThan(0);
  });
});

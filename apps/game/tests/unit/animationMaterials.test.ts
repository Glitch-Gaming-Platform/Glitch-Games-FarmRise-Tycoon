import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RenderPipeline } from '../../src/engine/render/RenderPipeline.js';
import {
  createChickenMotionMaterial,
  createCowMotionMaterial,
  createFoxMotionMaterial,
  createWaterMaterial,
  createWindMaterial,
} from '../../src/game/world/view/animationMaterials.js';

interface FakeShader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

function compile(material: THREE.Material): FakeShader {
  const shader: FakeShader = {
    uniforms: {},
    vertexShader: 'void main() {\n#include <beginnormal_vertex>\n#include <begin_vertex>\n}',
    fragmentShader: 'void main() {\n#include <color_fragment>\n#include <opaque_fragment>\n}',
  };
  const hook = material.onBeforeCompile as unknown as (source: FakeShader) => void;
  hook(shader);
  return shader;
}

describe('procedural animation materials', () => {
  it('injects rooted, instance-aware wind and advances its time uniform', () => {
    const wind = createWindMaterial(new THREE.MeshStandardMaterial(), {
      key: 'test-field',
      strength: 0.05,
      speed: 1.4,
      baseHeight: 0.04,
      fullHeight: 0.42,
      tipFlutter: 0.6,
      torsion: 0.02,
      lateralRatio: 0.25,
    });
    const shader = compile(wind.material);

    expect(shader.vertexShader).toContain('smoothstep(uWindBase, uWindTop, position.y)');
    expect(shader.vertexShader).toContain('instanceMatrix[3].x');
    expect(shader.vertexShader).toContain('farmStemFlutter');
    expect(shader.vertexShader).toContain('farmWindTorsion');
    expect(shader.vertexShader).toContain('* uWindStrength * 0.25 * farmWindWeight');
    wind.setTime(3.25);
    expect(shader.uniforms['uWindTime']?.value).toBe(3.25);
    wind.dispose();
  });

  it('emits valid float literals when optional wind coefficients are zero', () => {
    const wind = createWindMaterial(new THREE.MeshStandardMaterial(), {
      key: 'zero-coefficients',
      strength: 0.05,
      speed: 1.4,
      baseHeight: 0.04,
      fullHeight: 0.42,
      torsion: 0,
    });
    const shader = compile(wind.material);

    expect(shader.vertexShader).toContain('farmWindWeight * 0.0');
    expect(shader.vertexShader).not.toContain('farmWindWeight * 0;');
    wind.dispose();
  });

  it('keeps trunked vegetation rooted while varying branch phase and tip flutter', () => {
    const wind = createWindMaterial(new THREE.MeshStandardMaterial(), {
      key: 'test-eucalyptus',
      strength: 0.12,
      speed: 0.82,
      baseHeight: 0.72,
      fullHeight: 2.35,
      cantilever: true,
      tipFlutter: 0.7,
      torsion: 0.01,
      lateralRatio: 0.34,
    });
    const shader = compile(wind.material);

    expect(shader.vertexShader).toContain('farmWindWeight *= farmWindWeight');
    expect(shader.vertexShader).toContain('float farmBranchBearing');
    expect(shader.vertexShader).toContain('float farmFlutter');
    expect(shader.vertexShader).toContain('instanceMatrix[3].z');
    expect(wind.material.customProgramCacheKey()).toContain('tree');
    wind.dispose();
  });

  it('articulates species-specific animal motion instead of only bobbing whole meshes', () => {
    const base = new THREE.MeshStandardMaterial();
    const chicken = createChickenMotionMaterial(base);
    const cow = createCowMotionMaterial(base);
    const fox = createFoxMotionMaterial(base);
    const chickenShader = compile(chicken.material);
    const cowShader = compile(cow.material);
    const foxShader = compile(fox.material);

    // The gait helper is the thing that distinguishes an authored cycle from an
    // oscillation, so its presence - and the absence of a bare sine driving the
    // legs - is what the test actually guards.
    expect(chickenShader.vertexShader).toContain('void farmGait(');
    expect(cowShader.vertexShader).toContain('void farmGait(');
    expect(foxShader.vertexShader).toContain('void farmGait(');
    expect(chickenShader.vertexShader).toContain('attribute float farmMotion');
    expect(chickenShader.vertexShader).toContain('farmGait(farmAnimalPhase');
    expect(chickenShader.vertexShader).toContain('farmHeadThrust');
    expect(chickenShader.vertexShader).toContain('farmPeckAngle');
    expect(cowShader.vertexShader).toContain('farmCowQuarter');
    expect(cowShader.vertexShader).toContain('farmCowGrazeAngle');
    expect(cowShader.vertexShader).toContain('float farmCowTail');
    expect(foxShader.vertexShader).toContain('farmFoxDiagonal');
    expect(chickenShader.vertexShader).toContain('float farmChickenLeg');
    expect(chickenShader.vertexShader).toContain('float farmChickenWing');
    expect(chickenShader.vertexShader).toContain('float farmChickenTail');
    expect(foxShader.vertexShader).toContain('float farmFoxLeg');
    expect(foxShader.vertexShader).toContain('float farmFoxTail');
    expect(foxShader.vertexShader).toContain('float farmFoxHead');
    chicken.setTime(2.5);
    cow.setTime(3.0);
    fox.setTime(3.5);
    fox.setMotion(1, 0.4, 1, 3.1, 0.7);
    expect(chickenShader.uniforms['uAnimalTime']?.value).toBe(2.5);
    expect(cowShader.uniforms['uAnimalTime']?.value).toBe(3.0);
    expect(foxShader.uniforms['uAnimalTime']?.value).toBe(3.5);
    expect(foxShader.uniforms['uFoxMotion']?.value).toBe(1);
    expect(foxShader.uniforms['uFoxRaid']?.value).toBe(0.4);
    expect(foxShader.uniforms['uFoxFlee']?.value).toBe(1);
    expect(foxShader.uniforms['uFoxPace']?.value).toBe(3.1);
    chicken.dispose();
    cow.dispose();
    fox.dispose();
    base.dispose();
  });

  it('animates both rippling and running water independently', () => {
    const ripples = createWaterMaterial(false);
    const stream = createWaterMaterial(true);
    ripples.setTime(4.5);
    stream.setTime(7.25);

    expect(ripples.material.name).toBe('M_FarmRise_RippleWater');
    expect(stream.material.name).toBe('M_FarmRise_RunningWater');
    expect(ripples.responsive).toBe(false);
    expect(stream.responsive).toBe(false);
    expect((ripples.material as THREE.ShaderMaterial).uniforms['uTime']?.value).toBe(4.5);
    expect((stream.material as THREE.ShaderMaterial).uniforms['uTime']?.value).toBe(7.25);
    expect((stream.material as THREE.ShaderMaterial).fragmentShader).toContain('- uTime * 7.5');
    ripples.dispose();
    stream.dispose();
  });

  it('adds contained displacement, flow direction, edge foam and fresnel on Ultra water', () => {
    const pipeline = new RenderPipeline({ tier: 'ultra' });
    const standing = createWaterMaterial(false, pipeline);
    const flowing = createWaterMaterial(true, pipeline);
    const standingShader = compile(standing.material);
    const flowingShader = compile(flowing.material);

    expect(standing.responsive).toBe(true);
    expect(flowing.responsive).toBe(true);
    expect(standing.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(standingShader.vertexShader).toContain('farmWaterContainment');
    expect(standingShader.vertexShader).toContain('farmWaterNormalContainment');
    expect(standingShader.fragmentShader).toContain('farmWaterEdgeFoam');
    expect(standingShader.fragmentShader).toContain('farmWaterFresnel');
    expect(flowingShader.vertexShader).toContain('farmWaterEndContainment');
    expect(flowingShader.fragmentShader).toContain('farmWaterDirection');
    expect(flowingShader.fragmentShader).toContain('farmWaterEndFoam');
    standing.setTime(5.25);
    flowing.setTime(8.5);
    expect(standingShader.uniforms['uFarmWaterTime']?.value).toBe(5.25);
    expect(flowingShader.uniforms['uFarmWaterTime']?.value).toBe(8.5);

    standing.dispose();
    flowing.dispose();
    pipeline.dispose();
  });
});

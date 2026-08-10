import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyCharacterMotion,
  createChickenMotionMaterial,
  createFoxMotionMaterial,
  createWaterMaterial,
  createWindMaterial,
} from '../../src/game/world/view/animationMaterials.js';

interface FakeShader {
  uniforms: Record<string, { value: number }>;
  vertexShader: string;
}

function compile(material: THREE.Material): FakeShader {
  const shader: FakeShader = {
    uniforms: {},
    vertexShader: 'void main() {\n#include <begin_vertex>\n}',
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
    });
    const shader = compile(wind.material);

    expect(shader.vertexShader).toContain('smoothstep(uWindBase, uWindTop, position.y)');
    expect(shader.vertexShader).toContain('instanceMatrix[3].x');
    wind.setTime(3.25);
    expect(shader.uniforms['uWindTime']?.value).toBe(3.25);
    wind.dispose();
  });

  it('injects independent limb and secondary character motion', () => {
    const material = new THREE.MeshStandardMaterial();
    const motion = applyCharacterMotion(material, 'test-farmer');
    const shader = compile(material);

    expect(shader.vertexShader).toContain('// Legs rotate independently');
    expect(shader.vertexShader).toContain('// The shin counters the thigh');
    expect(shader.vertexShader).toContain('// Feet clear the ground');
    expect(shader.vertexShader).toContain('// Arms counter-swing');
    expect(shader.vertexShader).toContain('// Torso twist, hat/hair lag');
    expect(shader.vertexShader).toContain('float farmPlantArc');
    expect(shader.vertexShader).toContain('float farmTendArc');
    expect(shader.vertexShader).toContain('float farmHarvestArc');
    motion.setMotion(2, 1.6, 3, 0.6);
    expect(shader.uniforms['uMotionTime']?.value).toBe(2);
    expect(shader.uniforms['uLocomotion']?.value).toBe(1.6);
    expect(shader.uniforms['uWorkAction']?.value).toBe(3);
    expect(shader.uniforms['uWorkProgress']?.value).toBe(0.6);
    motion.dispose();
  });

  it('articulates chicken and fox limbs instead of only bobbing whole meshes', () => {
    const base = new THREE.MeshStandardMaterial();
    const chicken = createChickenMotionMaterial(base);
    const fox = createFoxMotionMaterial(base);
    const chickenShader = compile(chicken.material);
    const foxShader = compile(fox.material);

    expect(chickenShader.vertexShader).toContain('float farmChickenLeg');
    expect(chickenShader.vertexShader).toContain('float farmChickenWing');
    expect(chickenShader.vertexShader).toContain('float farmChickenTail');
    expect(foxShader.vertexShader).toContain('float farmFoxLeg');
    expect(foxShader.vertexShader).toContain('float farmFoxTail');
    expect(foxShader.vertexShader).toContain('float farmFoxHead');
    chicken.setTime(2.5);
    fox.setTime(3.5);
    expect(chickenShader.uniforms['uAnimalTime']?.value).toBe(2.5);
    expect(foxShader.uniforms['uAnimalTime']?.value).toBe(3.5);
    chicken.dispose();
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
    expect(ripples.material.uniforms['uTime']?.value).toBe(4.5);
    expect(stream.material.uniforms['uTime']?.value).toBe(7.25);
    expect(stream.material.fragmentShader).toContain('- uTime * 7.5');
    ripples.dispose();
    stream.dispose();
  });
});

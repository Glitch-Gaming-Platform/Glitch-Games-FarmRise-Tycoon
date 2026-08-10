/**
 * Lightweight procedural animation materials for the authored low-poly art.
 *
 * The project deliberately keeps crops and characters as compact single
 * meshes. These shader hooks act as a small virtual rig: roots stay planted,
 * upper foliage bends in wind, and the farmer's disconnected limbs swing from
 * their authored regions without adding a skeletal runtime or extra assets.
 */
import * as THREE from 'three';

interface ShaderSource {
  uniforms: Record<string, { value: number }>;
  vertexShader: string;
}

export interface TimeMaterial {
  readonly material: THREE.MeshStandardMaterial;
  setTime(seconds: number): void;
  dispose(): void;
}

export interface CharacterMotionMaterial {
  setMotion(seconds: number, locomotion: number, workAction: number, workProgress: number): void;
  dispose(): void;
}

export interface WindOptions {
  readonly strength: number;
  readonly speed: number;
  readonly baseHeight: number;
  readonly fullHeight: number;
  readonly key: string;
}

export function createWindMaterial(
  base: THREE.MeshStandardMaterial,
  options: WindOptions,
): TimeMaterial {
  const material = base.clone();
  material.name = `M_FarmRise_Wind_${options.key}`;
  const time = { value: 0 };
  const strength = { value: options.strength };
  const speed = { value: options.speed };
  const baseHeight = { value: options.baseHeight };
  const fullHeight = { value: options.fullHeight };

  material.onBeforeCompile = (shader) => {
    const source = shader as unknown as ShaderSource;
    source.uniforms['uWindTime'] = time;
    source.uniforms['uWindStrength'] = strength;
    source.uniforms['uWindSpeed'] = speed;
    source.uniforms['uWindBase'] = baseHeight;
    source.uniforms['uWindTop'] = fullHeight;
    source.vertexShader = `
      uniform float uWindTime;
      uniform float uWindStrength;
      uniform float uWindSpeed;
      uniform float uWindBase;
      uniform float uWindTop;
    ${source.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float farmWindWeight = smoothstep(uWindBase, uWindTop, position.y);
       float farmWindPhase = position.x * 2.17 + position.z * 1.63;
       #ifdef USE_INSTANCING
         farmWindPhase += instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.29;
       #endif
       float farmWindGust = sin(uWindTime * uWindSpeed + farmWindPhase)
         + 0.34 * sin(uWindTime * uWindSpeed * 2.31 + farmWindPhase * 1.73);
       transformed.x += farmWindGust * uWindStrength * farmWindWeight;
       transformed.z += cos(uWindTime * uWindSpeed * 0.73 + farmWindPhase)
         * uWindStrength * 0.38 * farmWindWeight;`,
    );
  };
  material.customProgramCacheKey = () => `farmrise-wind-${options.key}`;

  return {
    material,
    setTime(seconds): void {
      time.value = seconds;
    },
    dispose(): void {
      material.dispose();
    },
  };
}

/** Virtual chicken rig: planted feet, alternating steps, wing lift and tail lag. */
export function createChickenMotionMaterial(base: THREE.MeshStandardMaterial): TimeMaterial {
  const material = base.clone();
  material.name = 'M_FarmRise_ChickenMotion';
  const time = { value: 0 };

  material.onBeforeCompile = (shader) => {
    const source = shader as unknown as ShaderSource;
    source.uniforms['uAnimalTime'] = time;
    source.vertexShader = `
      uniform float uAnimalTime;
    ${source.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float farmAnimalPhase = uAnimalTime * 8.2;
       #ifdef USE_INSTANCING
         farmAnimalPhase += instanceMatrix[3].x * 0.61 + instanceMatrix[3].z * 0.43;
       #endif
       float farmAnimalSide = position.x < 0.0 ? -1.0 : 1.0;
       float farmChickenStep = sin(farmAnimalPhase + farmAnimalSide * 3.14159265);
       float farmChickenLeg = (1.0 - smoothstep(0.10, 0.145, position.y))
         * smoothstep(0.025, 0.05, abs(position.x));
       transformed.z += farmChickenStep * 0.038 * farmChickenLeg;
       transformed.y += max(0.0, -farmChickenStep) * 0.022 * farmChickenLeg;

       float farmChickenWing = smoothstep(0.09, 0.135, abs(position.x))
         * smoothstep(0.13, 0.19, position.y)
         * (1.0 - smoothstep(0.285, 0.34, position.y));
       float farmChickenFlutter = max(0.0, sin(farmAnimalPhase * 0.73 + position.z * 8.0));
       transformed.x += farmAnimalSide * farmChickenFlutter * 0.024 * farmChickenWing;
       transformed.y += farmChickenFlutter * 0.030 * farmChickenWing;

       float farmChickenTail = (1.0 - smoothstep(-0.11, 0.03, position.z))
         * smoothstep(0.14, 0.22, position.y);
       transformed.x += sin(farmAnimalPhase * 0.54 + position.z * 9.0)
         * 0.022 * farmChickenTail;`,
    );
  };
  material.customProgramCacheKey = () => 'farmrise-chicken-motion-v1';

  return {
    material,
    setTime(seconds): void {
      time.value = seconds;
    },
    dispose(): void {
      material.dispose();
    },
  };
}

/** Virtual fox rig: alternating paws, breathing head motion and a swishing plume. */
export function createFoxMotionMaterial(base: THREE.MeshStandardMaterial): TimeMaterial {
  const material = base.clone();
  material.name = 'M_FarmRise_FoxMotion';
  const time = { value: 0 };

  material.onBeforeCompile = (shader) => {
    const source = shader as unknown as ShaderSource;
    source.uniforms['uAnimalTime'] = time;
    source.vertexShader = `
      uniform float uAnimalTime;
    ${source.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float farmFoxPhase = uAnimalTime * 9.4 + modelMatrix[3].x * 0.31 + modelMatrix[3].z * 0.27;
       float farmFoxSide = position.x < 0.0 ? -1.0 : 1.0;
       float farmFoxFore = position.z > 0.0 ? 1.0 : -1.0;
       float farmFoxStride = sin(farmFoxPhase + farmFoxSide * 1.8 + farmFoxFore * 1.25);
       float farmFoxLeg = (1.0 - smoothstep(0.12, 0.17, position.y))
         * smoothstep(0.035, 0.07, abs(position.x));
       transformed.z += farmFoxStride * 0.045 * farmFoxLeg;
       transformed.y += max(0.0, -farmFoxStride) * 0.025 * farmFoxLeg;

       float farmFoxTail = (1.0 - smoothstep(-0.22, -0.05, position.z))
         * smoothstep(0.15, 0.24, position.y);
       transformed.x += sin(uAnimalTime * 5.2 - position.z * 4.6)
         * 0.072 * farmFoxTail;
       transformed.y += cos(uAnimalTime * 4.1 - position.z * 3.1)
         * 0.018 * farmFoxTail;

       float farmFoxHead = smoothstep(0.18, 0.30, position.z)
         * smoothstep(0.20, 0.29, position.y);
       transformed.y += sin(uAnimalTime * 3.3 + modelMatrix[3].x)
         * 0.010 * farmFoxHead;`,
    );
  };
  material.customProgramCacheKey = () => 'farmrise-fox-motion-v1';

  return {
    material,
    setTime(seconds): void {
      time.value = seconds;
    },
    dispose(): void {
      material.dispose();
    },
  };
}

/** Adds region-based limb, torso and accessory motion to any mesh material. */
export function applyCharacterMotion(
  material: THREE.Material,
  key: string,
): CharacterMotionMaterial {
  const time = { value: 0 };
  const locomotion = { value: 0 };
  const workAction = { value: 0 };
  const workProgress = { value: 0 };

  material.onBeforeCompile = (shader) => {
    const source = shader as unknown as ShaderSource;
    source.uniforms['uMotionTime'] = time;
    source.uniforms['uLocomotion'] = locomotion;
    source.uniforms['uWorkAction'] = workAction;
    source.uniforms['uWorkProgress'] = workProgress;
    source.vertexShader = `
      uniform float uMotionTime;
      uniform float uLocomotion;
      uniform float uWorkAction;
      uniform float uWorkProgress;

      vec2 farmRotate2d(vec2 point, float angle) {
        float c = cos(angle);
        float s = sin(angle);
        return mat2(c, -s, s, c) * point;
      }
    ${source.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float farmSide = position.x < 0.0 ? -1.0 : 1.0;
       float farmLocomotion = clamp(uLocomotion, 0.0, 1.65);
       float farmStepPhase = uMotionTime * (7.4 + farmLocomotion * 2.2);
       float farmStride = sin(farmStepPhase) * farmLocomotion;
       float farmSideStep = sin(
         farmStepPhase + (farmSide < 0.0 ? 3.14159265 : 0.0)
       ) * farmLocomotion;
       float farmWorking = step(0.5, uWorkAction);
       float farmPlant = 1.0 - step(1.5, uWorkAction);
       farmPlant *= farmWorking;
       float farmTend = step(1.5, uWorkAction) * (1.0 - step(2.5, uWorkAction));
       float farmHarvest = step(2.5, uWorkAction);
       float farmOneShot = sin(clamp(uWorkProgress, 0.0, 1.0) * 3.14159265);
       float farmRecoil = smoothstep(0.56, 0.82, uWorkProgress)
         * (1.0 - smoothstep(0.82, 1.0, uWorkProgress));

       // Legs rotate independently around the hip line.
       float farmLegMask = (1.0 - smoothstep(0.50, 0.62, position.y))
         * smoothstep(0.025, 0.075, abs(position.x));
       vec2 farmLeg = farmRotate2d(
         vec2(transformed.y - 0.55, transformed.z),
         farmStride * farmSide * 0.30 * farmLegMask
       );
       transformed.y = mix(transformed.y, farmLeg.x + 0.55, farmLegMask);
       transformed.z = mix(transformed.z, farmLeg.y, farmLegMask);

       // The shin counters the thigh late in the stride, creating a visible
       // knee bend while the planted leg remains comparatively straight.
       float farmShinMask = (1.0 - smoothstep(0.39, 0.48, position.y))
         * smoothstep(0.025, 0.075, abs(position.x));
       vec2 farmShin = farmRotate2d(
         vec2(transformed.y - 0.36, transformed.z),
         -farmSideStep * 0.12 * farmShinMask
       );
       transformed.y = mix(transformed.y, farmShin.x + 0.36, farmShinMask);
       transformed.z = mix(transformed.z, farmShin.y, farmShinMask);

       // Feet clear the ground on the advancing step and roll through the
       // stride instead of skating as two rigid lower-body wedges.
       float farmFootMask = (1.0 - smoothstep(0.18, 0.25, position.y))
         * smoothstep(0.025, 0.075, abs(position.x));
       transformed.y += max(0.0, -farmSideStep) * 0.052 * farmFootMask;
       transformed.z += farmSideStep * 0.024 * farmFootMask;

       // Arms counter-swing while moving. Each work verb gets its own readable
       // arc: planting presses down, tending pours side-to-side, harvesting
       // pulls hard and recoils.
       float farmArmMask = smoothstep(0.19, 0.25, abs(position.x))
         * smoothstep(0.60, 0.76, position.y)
         * (1.0 - smoothstep(1.03, 1.12, position.y));
       float farmPlantArc = farmOneShot * (0.30 + farmSide * 0.05) * farmPlant;
       float farmTendArc = sin(uWorkProgress * 12.56637) * 0.25 * farmSide * farmTend;
       float farmHarvestArc = (farmOneShot * 0.48 - farmRecoil * 0.22)
         * farmHarvest;
       float farmArmAngle = -farmStride * farmSide * 0.24
         + farmPlantArc + farmTendArc + farmHarvestArc;
       vec2 farmArm = farmRotate2d(
         vec2(transformed.y - 0.96, transformed.z),
         farmArmAngle * farmArmMask
       );
       transformed.y = mix(transformed.y, farmArm.x + 0.96, farmArmMask);
       transformed.z = mix(transformed.z, farmArm.y, farmArmMask);

       // Torso twist, hat/hair lag and satchel bounce provide secondary motion.
       float farmTorsoMask = smoothstep(0.58, 0.78, position.y)
         * (1.0 - smoothstep(1.13, 1.25, position.y));
       transformed.x += farmStride * position.z * 0.055 * farmTorsoMask;
       float farmUpperMask = smoothstep(1.08, 1.48, position.y);
       transformed.z -= farmStride * 0.026 * farmUpperMask;
       transformed.x += sin(uMotionTime * 4.2 + position.y * 5.0)
         * 0.012 * farmUpperMask * max(uLocomotion, farmWorking * 0.65);
       float farmBagMask = smoothstep(0.16, 0.25, position.x)
         * smoothstep(0.43, 0.58, position.y)
         * (1.0 - smoothstep(0.78, 0.86, position.y));
       transformed.z += sin(uMotionTime * 5.4 + 1.1)
         * 0.035 * farmBagMask * max(uLocomotion, farmWorking);

       // Distinct body mechanics: planting crouches, tending sways, harvesting
       // leans into the pull before the recoil lands.
       float farmPlantCrouch = farmOneShot * farmPlant;
       float farmTendSway = sin(uWorkProgress * 12.56637) * farmTend;
       float farmHarvestLean = (farmOneShot - farmRecoil * 0.8) * farmHarvest;
       transformed.z += (position.y - 0.55)
         * (0.09 * farmPlantCrouch + 0.075 * farmHarvestLean);
       transformed.y -= smoothstep(0.45, 1.20, position.y)
         * (0.075 * farmPlantCrouch + 0.025 * farmHarvestLean);
       transformed.x += farmTendSway * farmTorsoMask * 0.035;`,
    );
  };
  material.customProgramCacheKey = () => `farmrise-character-motion-${key}`;

  return {
    setMotion(seconds, locomotionAmount, workActionCode, workProgressAmount): void {
      time.value = seconds;
      locomotion.value = locomotionAmount;
      workAction.value = workActionCode;
      workProgress.value = workProgressAmount;
    },
    dispose(): void {
      material.dispose();
    },
  };
}

export interface AnimatedWater {
  readonly material: THREE.ShaderMaterial;
  setTime(seconds: number): void;
  dispose(): void;
}

export function createWaterMaterial(flowing = false): AnimatedWater {
  const time = { value: 0 };
  const material = new THREE.ShaderMaterial({
    name: flowing ? 'M_FarmRise_RunningWater' : 'M_FarmRise_RippleWater',
    uniforms: { uTime: time },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime;
      varying vec2 vFarmWater;
      varying float vFarmWave;
      void main() {
        vec3 p = position;
        float wave = sin(p.x * 11.0 + uTime * 3.2)
          + 0.45 * sin(p.z * 17.0 - uTime * 4.1);
        p.y += wave * ${flowing ? '0.006' : '0.012'};
        vFarmWater = vec2(p.x, p.z);
        vFarmWave = wave;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vFarmWater;
      varying float vFarmWave;
      void main() {
        float band = 0.5 + 0.5 * sin(
          vFarmWater.x * ${flowing ? '7.0' : '13.0'}
          + vFarmWater.y * 9.0
          - uTime * ${flowing ? '7.5' : '2.8'}
        );
        vec3 deep = vec3(0.032, 0.263, 0.332);
        vec3 light = vec3(0.078, 0.570, 0.674);
        vec3 colour = mix(deep, light, 0.42 + band * 0.30 + vFarmWave * 0.04);
        gl_FragColor = vec4(colour, ${flowing ? '0.76' : '0.84'});
      }
    `,
  });
  material.toneMapped = false;

  return {
    material,
    setTime(seconds): void {
      time.value = seconds;
    },
    dispose(): void {
      material.dispose();
    },
  };
}

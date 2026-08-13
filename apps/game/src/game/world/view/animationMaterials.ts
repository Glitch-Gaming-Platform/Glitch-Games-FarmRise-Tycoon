/**
 * Lightweight procedural animation materials for the authored low-poly art.
 *
 * The project deliberately keeps crops, trees and instanced animals as compact
 * meshes. These shader hooks keep roots planted, bend foliage and give animal
 * limbs authored stance/swing timing without breaking instancing. The player
 * uses the real skeletal rig under game/player/rig instead.
 */
import type * as THREE from 'three';

export { createWaterMaterial, type AnimatedWater } from './waterMaterials.js';

interface ShaderSource {
  uniforms: Record<string, { value: number }>;
  vertexShader: string;
}

/** GLSL rejects an integer literal in some float-only multiplication chains. */
function glslFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

export interface TimeMaterial {
  readonly material: THREE.MeshStandardMaterial;
  setTime(seconds: number): void;
  dispose(): void;
}

export interface FoxMotionMaterial extends TimeMaterial {
  setMotion(motion: number, raid: number, flee: number, pace: number, phaseOffset: number): void;
}

export interface WindOptions {
  readonly strength: number;
  readonly speed: number;
  readonly baseHeight: number;
  readonly fullHeight: number;
  readonly key: string;
  /**
   * Cantilever mode, for trunked plants.
   *
   * Grass and crops are stems: they bend more or less linearly from a rooted
   * base, and linear height weighting is right for them. A tree is a cantilever
   * beam - deflection grows with roughly the square of height, so the trunk
   * barely moves while the crown swings. Applying the crop curve to a
   * eucalyptus makes the whole tree slide sideways like a cardboard cut-out,
   * which is what the audit was seeing when it called the canopies
   * "clustered geometric blobs".
   *
   * Tree mode additionally gives each branch its own phase from its angle
   * around the trunk, and adds a fast low-amplitude flutter at the extremities.
   * Without the per-branch offset every branch peaks on the same frame and the
   * canopy pulses as one object.
   */
  readonly cantilever?: boolean;
  /** Fast secondary motion at leaf/head tips, as a fraction of bend strength. */
  readonly tipFlutter?: number;
  /** Approximate rotation around the rooted vertical axis. */
  readonly torsion?: number;
  /** Cross-wind displacement relative to the primary bend. */
  readonly lateralRatio?: number;
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
       ${options.cantilever ? 'farmWindWeight *= farmWindWeight;' : ''}
       float farmWindPhase = position.x * 2.17 + position.z * 1.63;
       #ifdef USE_INSTANCING
         farmWindPhase += instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.29;
       #endif
       float farmWindReach = length(vec2(position.x, position.z));
       ${
         options.cantilever
           ? `
       // Per-branch phase from the vertex's bearing around the trunk, so
       // opposite sides of the crown lead and lag rather than pulsing together.
       float farmBranchBearing = atan(position.z, position.x);
       farmWindPhase += farmBranchBearing * 1.9;
       float farmBranchReach = farmWindReach;`
           : ''
       }
       float farmWindGust = sin(uWindTime * uWindSpeed + farmWindPhase)
         + 0.34 * sin(uWindTime * uWindSpeed * 2.31 + farmWindPhase * 1.73);
       transformed.x += farmWindGust * uWindStrength * farmWindWeight;
       transformed.z += cos(uWindTime * uWindSpeed * 0.73 + farmWindPhase)
         * uWindStrength * ${glslFloat(options.lateralRatio ?? 0.38)} * farmWindWeight;
       float farmWindTorsion = sin(
         uWindTime * uWindSpeed * 0.91 + farmWindPhase * 0.63
       ) * farmWindWeight * ${glslFloat(options.torsion ?? 0.0)};
       transformed.x += -position.z * farmWindTorsion;
       transformed.z += position.x * farmWindTorsion;
       ${
         options.cantilever
           ? `
       // Leaf flutter: fast, tiny, and only at the extremities. This is the
       // detail that separates a canopy from a painted shape, and it is cheap
       // because it needs no extra geometry.
       float farmFlutter = sin(uWindTime * uWindSpeed * 5.7 + farmWindPhase * 3.1)
         * farmBranchReach * ${glslFloat((options.tipFlutter ?? 0.45) * 0.1)} * farmWindWeight;
       transformed.y += farmFlutter * uWindStrength * 4.0;
       transformed.x += farmFlutter * uWindStrength * 2.2;`
           : `
       // Wheat heads, broad corn leaves and low pumpkin foliage each receive
       // a different authored flutter coefficient from their owning view.
       float farmTip = farmWindWeight * farmWindWeight;
       float farmStemFlutter = sin(
         uWindTime * uWindSpeed * 4.9 + farmWindPhase * 2.7
       ) * uWindStrength * ${glslFloat(options.tipFlutter ?? 0.18)} * farmTip;
       transformed.x += farmStemFlutter;
       transformed.y += abs(farmStemFlutter) * 0.16;`
       }`,
    );
  };
  // The cache key must include the mode: two materials with the same key but
  // different `cantilever` settings would otherwise share one compiled program
  // and one of them would silently get the other's shader.
  material.customProgramCacheKey = () =>
    `farmrise-wind-${options.key}-${options.cantilever ? 'tree' : 'stem'}`;

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

/**
 * A gait profile, shared by both animal shaders.
 *
 * `farmGait` returns the foot's forward offset and its lift for a phase in
 * 0..1, split into a stance and a swing rather than evaluated as a sine.
 *
 * This is the difference the audit was pointing at when it said animal motion
 * "still resembles procedural oscillation rather than authored gait cycles". A
 * sine spends equal time moving the foot forward and backward at equal speed,
 * which no animal does. A real gait plants the foot, drags it backward at
 * exactly body speed for most of the cycle, then whips it forward through the
 * air in the remaining fraction. Stance and swing being different lengths, and
 * lift being zero for the whole of stance, is what the eye reads as weight.
 */
const GAIT_GLSL = `
  void farmGait(float phase, float stance, out float forward, out float lift) {
    float p = fract(phase);
    if (p < stance) {
      forward = 0.5 - p / stance;
      lift = 0.0;
    } else {
      float s = (p - stance) / (1.0 - stance);
      forward = -0.5 + s;
      lift = sin(s * 3.14159265);
    }
  }
`;

/** Virtual chicken rig: planted feet, a real stance/swing step and head bobbing. */
export function createChickenMotionMaterial(base: THREE.MeshStandardMaterial): TimeMaterial {
  const material = base.clone();
  material.name = 'M_FarmRise_ChickenMotion';
  const time = { value: 0 };

  material.onBeforeCompile = (shader) => {
    const source = shader as unknown as ShaderSource;
    source.uniforms['uAnimalTime'] = time;
    source.vertexShader = `
      uniform float uAnimalTime;
      #ifdef USE_INSTANCING
        attribute float farmMotion;
        attribute float farmAction;
        attribute float farmGaitPhase;
      #endif
      ${GAIT_GLSL}
    ${source.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float farmAnimalPhase = fract(uAnimalTime * 1.45);
       float farmChickenMotion = 1.0;
       float farmChickenAction = 0.0;
       #ifdef USE_INSTANCING
         farmAnimalPhase = farmGaitPhase;
         farmChickenMotion = farmMotion;
         farmChickenAction = farmAction;
       #endif
       float farmAnimalSide = position.x < 0.0 ? -1.0 : 1.0;

       // Legs run half a cycle apart on a 62% stance.
       float farmLegFwd, farmLegLift;
       farmGait(farmAnimalPhase + (farmAnimalSide < 0.0 ? 0.5 : 0.0), 0.62,
                farmLegFwd, farmLegLift);
       float farmChickenLeg = (1.0 - smoothstep(0.10, 0.145, position.y))
         * smoothstep(0.025, 0.05, abs(position.x));
       transformed.z += farmLegFwd * 0.072 * farmChickenLeg * farmChickenMotion;
       transformed.y += farmLegLift * 0.030 * farmChickenLeg * farmChickenMotion;

       // Head bobbing, the single most recognisable thing a chicken does and
       // previously absent entirely. The head holds still in world space while
       // the body walks under it, then thrusts forward to catch up. Modelled as
       // the negative of body travel during the hold, released over the last
       // quarter of the cycle.
       float farmHeadPhase = fract(farmAnimalPhase);
       float farmHeadHold = 1.0 - smoothstep(0.72, 1.0, farmHeadPhase);
       float farmHeadThrust = mix(farmHeadPhase * -0.055, 0.012, 1.0 - farmHeadHold);
       float farmChickenHead = smoothstep(0.24, 0.30, position.y)
         * smoothstep(0.05, 0.18, position.z);
       transformed.z += farmHeadThrust * farmChickenHead * farmChickenMotion;

       // Peck from the neck pivot instead of pitching the complete bird. The
       // body may lean a little through its instance transform, while the head
       // delivers the sharp species-specific action.
       float farmPeckAngle = farmChickenAction * 0.78 * farmChickenHead;
       vec2 farmHeadOffset = vec2(transformed.z - 0.10, transformed.y - 0.24);
       float farmPeckCos = cos(farmPeckAngle);
       float farmPeckSin = sin(farmPeckAngle);
       transformed.z = 0.10 + farmHeadOffset.x * farmPeckCos
         + farmHeadOffset.y * farmPeckSin;
       transformed.y = 0.24 - farmHeadOffset.x * farmPeckSin
         + farmHeadOffset.y * farmPeckCos;

       float farmChickenWing = smoothstep(0.09, 0.135, abs(position.x))
         * smoothstep(0.13, 0.19, position.y)
         * (1.0 - smoothstep(0.285, 0.34, position.y));
       float farmChickenFlutter = max(0.0, sin(farmAnimalPhase * 4.6 + position.z * 8.0));
       transformed.x += farmAnimalSide * farmChickenFlutter * 0.024
         * farmChickenWing * (0.18 + farmChickenMotion * 0.64 + farmChickenAction * 0.28);
       transformed.y += farmChickenFlutter * 0.030
         * farmChickenWing * (0.18 + farmChickenMotion * 0.64 + farmChickenAction * 0.28);

       float farmChickenTail = (1.0 - smoothstep(-0.11, 0.03, position.z))
         * smoothstep(0.14, 0.22, position.y);
       transformed.x += sin(farmAnimalPhase * 3.4 + position.z * 9.0)
         * 0.022 * farmChickenTail;
       transformed.y += farmLegLift * 0.016 * farmChickenTail;`,
    );
  };
  material.customProgramCacheKey = () => 'farmrise-chicken-motion-v2';

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

/** Virtual cow rig: a four-beat walk, isolated grazing head and tail/ear follow-through. */
export function createCowMotionMaterial(base: THREE.MeshStandardMaterial): TimeMaterial {
  const material = base.clone();
  material.name = 'M_FarmRise_CowMotion';
  const time = { value: 0 };

  material.onBeforeCompile = (shader) => {
    const source = shader as unknown as ShaderSource;
    source.uniforms['uAnimalTime'] = time;
    source.vertexShader = `
      uniform float uAnimalTime;
      #ifdef USE_INSTANCING
        attribute float farmMotion;
        attribute float farmAction;
        attribute float farmGaitPhase;
      #endif
      ${GAIT_GLSL}
    ${source.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float farmCowMotion = 1.0;
       float farmCowGraze = 0.0;
       float farmCowPhase = fract(uAnimalTime * 0.85);
       #ifdef USE_INSTANCING
         farmCowMotion = farmMotion;
         farmCowGraze = farmAction;
         farmCowPhase = farmGaitPhase;
       #endif

       float farmCowSide = position.x < 0.0 ? -1.0 : 1.0;
       float farmCowFore = position.z > 0.05 ? 1.0 : -1.0;
       float farmCowQuarter = farmCowFore > 0.0
         ? (farmCowSide < 0.0 ? 0.0 : 0.5)
         : (farmCowSide < 0.0 ? 0.75 : 0.25);
       float farmCowLegFwd, farmCowLegLift;
       farmGait(farmCowPhase + farmCowQuarter, 0.67, farmCowLegFwd, farmCowLegLift);
       float farmCowLeg = (1.0 - smoothstep(0.40, 0.52, position.y))
         * smoothstep(0.11, 0.18, abs(position.x));
       transformed.z += farmCowLegFwd * 0.105 * farmCowLeg * farmCowMotion;
       transformed.y += farmCowLegLift * 0.046 * farmCowLeg * farmCowMotion;

       // A little rib-cage compression at hoof contact sells mass without
       // scaling the whole instance or disturbing the collision proxy.
       float farmCowBody = smoothstep(0.42, 0.58, position.y)
         * (1.0 - smoothstep(0.92, 1.02, position.y));
       transformed.y -= farmCowLegLift * 0.010 * farmCowBody * farmCowMotion;

       // Graze by rotating only the neck/head around the shoulder pivot.
       float farmCowHead = smoothstep(0.34, 0.56, position.z)
         * smoothstep(0.55, 0.74, position.y);
       float farmCowGrazeAngle = farmCowGraze * 0.86 * farmCowHead;
       vec2 farmCowHeadOffset = vec2(transformed.z - 0.34, transformed.y - 0.72);
       float farmCowGrazeCos = cos(farmCowGrazeAngle);
       float farmCowGrazeSin = sin(farmCowGrazeAngle);
       transformed.z = 0.34 + farmCowHeadOffset.x * farmCowGrazeCos
         + farmCowHeadOffset.y * farmCowGrazeSin;
       transformed.y = 0.72 - farmCowHeadOffset.x * farmCowGrazeSin
         + farmCowHeadOffset.y * farmCowGrazeCos;

       float farmCowTail = (1.0 - smoothstep(-0.34, -0.16, position.z))
         * smoothstep(0.42, 0.64, position.y);
       transformed.x += sin(uAnimalTime * 2.15 - position.z * 4.2)
         * 0.085 * farmCowTail;
       transformed.y += cos(uAnimalTime * 1.72 - position.z * 3.4)
         * 0.018 * farmCowTail;

       float farmCowEar = smoothstep(0.15, 0.20, abs(position.x))
         * smoothstep(0.80, 0.88, position.y)
         * smoothstep(0.50, 0.68, position.z);
       transformed.y += max(0.0, sin(uAnimalTime * 4.7 + farmCowSide * 1.8))
         * 0.020 * farmCowEar;`,
    );
  };
  material.customProgramCacheKey = () => 'farmrise-cow-motion-v1';

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

/** Virtual sheep rig: compact four-beat walk, wool recoil, grazing and ear/tail flicks. */
export function createSheepMotionMaterial(base: THREE.MeshStandardMaterial): TimeMaterial {
  const material = base.clone();
  material.name = 'M_FarmRise_SheepMotion';
  const time = { value: 0 };

  material.onBeforeCompile = (shader) => {
    const source = shader as unknown as ShaderSource;
    source.uniforms['uAnimalTime'] = time;
    source.vertexShader = `
      uniform float uAnimalTime;
      #ifdef USE_INSTANCING
        attribute float farmMotion;
        attribute float farmAction;
        attribute float farmGaitPhase;
      #endif
      ${GAIT_GLSL}
    ${source.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float farmSheepMotion = 1.0;
       float farmSheepGraze = 0.0;
       float farmSheepPhase = fract(uAnimalTime * 0.78);
       #ifdef USE_INSTANCING
         farmSheepMotion = farmMotion;
         farmSheepGraze = farmAction;
         farmSheepPhase = farmGaitPhase;
       #endif

       float farmSheepSide = position.x < 0.0 ? -1.0 : 1.0;
       float farmSheepFore = position.z > 0.02 ? 1.0 : -1.0;
       float farmSheepQuarter = farmSheepFore > 0.0
         ? (farmSheepSide < 0.0 ? 0.0 : 0.5)
         : (farmSheepSide < 0.0 ? 0.75 : 0.25);
       float farmSheepLegFwd, farmSheepLegLift;
       farmGait(farmSheepPhase + farmSheepQuarter, 0.64,
         farmSheepLegFwd, farmSheepLegLift);
       float farmSheepLeg = (1.0 - smoothstep(0.34, 0.44, position.y))
         * smoothstep(0.10, 0.17, abs(position.x));
       transformed.z += farmSheepLegFwd * 0.088 * farmSheepLeg * farmSheepMotion;
       transformed.y += farmSheepLegLift * 0.043 * farmSheepLeg * farmSheepMotion;

       float farmSheepWool = smoothstep(0.35, 0.48, position.y)
         * (1.0 - smoothstep(0.80, 0.92, position.y));
       float farmSheepRecoil = sin(farmSheepPhase * 6.283) * 0.006
         * farmSheepMotion;
       transformed.x *= 1.0 + farmSheepRecoil * farmSheepWool;
       transformed.y -= farmSheepLegLift * 0.012 * farmSheepWool * farmSheepMotion;

       float farmSheepHead = smoothstep(0.30, 0.50, position.z)
         * smoothstep(0.48, 0.68, position.y);
       float farmSheepGrazeAngle = farmSheepGraze * 0.92 * farmSheepHead;
       vec2 farmSheepHeadOffset = vec2(transformed.z - 0.29, transformed.y - 0.64);
       float farmSheepGrazeCos = cos(farmSheepGrazeAngle);
       float farmSheepGrazeSin = sin(farmSheepGrazeAngle);
       transformed.z = 0.29 + farmSheepHeadOffset.x * farmSheepGrazeCos
         + farmSheepHeadOffset.y * farmSheepGrazeSin;
       transformed.y = 0.64 - farmSheepHeadOffset.x * farmSheepGrazeSin
         + farmSheepHeadOffset.y * farmSheepGrazeCos;

       float farmSheepTail = (1.0 - smoothstep(-0.32, -0.15, position.z))
         * smoothstep(0.48, 0.68, position.y);
       transformed.x += sin(uAnimalTime * 4.1 - position.z * 5.0)
         * 0.048 * farmSheepTail;
       transformed.y += max(0.0, sin(uAnimalTime * 3.4)) * 0.014 * farmSheepTail;

       float farmSheepEar = smoothstep(0.15, 0.22, abs(position.x))
         * smoothstep(0.68, 0.79, position.y)
         * smoothstep(0.42, 0.58, position.z);
       transformed.y += max(0.0, sin(uAnimalTime * 5.3 + farmSheepSide * 1.9))
         * 0.024 * farmSheepEar;`,
    );
  };
  material.customProgramCacheKey = () => 'farmrise-sheep-motion-v1';

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
export function createFoxMotionMaterial(base: THREE.MeshStandardMaterial): FoxMotionMaterial {
  const material = base.clone();
  material.name = 'M_FarmRise_FoxMotion';
  const time = { value: 0 };
  const motion = { value: 0 };
  const raid = { value: 0 };
  const flee = { value: 0 };
  const pace = { value: 1.9 };
  const phaseOffset = { value: 0 };

  material.onBeforeCompile = (shader) => {
    const source = shader as unknown as ShaderSource;
    source.uniforms['uAnimalTime'] = time;
    source.uniforms['uFoxMotion'] = motion;
    source.uniforms['uFoxRaid'] = raid;
    source.uniforms['uFoxFlee'] = flee;
    source.uniforms['uFoxPace'] = pace;
    source.uniforms['uFoxPhaseOffset'] = phaseOffset;
    source.vertexShader = `
      uniform float uAnimalTime;
      uniform float uFoxMotion;
      uniform float uFoxRaid;
      uniform float uFoxFlee;
      uniform float uFoxPace;
      uniform float uFoxPhaseOffset;
      ${GAIT_GLSL}
    ${source.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float farmFoxPhase = uAnimalTime * uFoxPace + uFoxPhaseOffset;
       float farmFoxSide = position.x < 0.0 ? -1.0 : 1.0;
       float farmFoxFore = position.z > 0.0 ? 1.0 : -1.0;

       // A trot: diagonal pairs move together, so the offset depends on the
       // product of side and end rather than on each independently. Front legs
       // lead the diagonal by a tenth of a cycle, which is what stops a
       // four-legged trot reading as a pantomime horse.
       float farmFoxDiagonal = farmFoxSide * farmFoxFore > 0.0 ? 0.0 : 0.5;
       float farmFoxLegFwd, farmFoxLegLift;
       farmGait(farmFoxPhase + farmFoxDiagonal + (farmFoxFore > 0.0 ? 0.1 : 0.0),
                0.55, farmFoxLegFwd, farmFoxLegLift);
       float farmFoxLeg = (1.0 - smoothstep(0.12, 0.17, position.y))
         * smoothstep(0.035, 0.07, abs(position.x));
       transformed.z += farmFoxLegFwd * 0.096 * farmFoxLeg * uFoxMotion;
       transformed.y += farmFoxLegLift * 0.034 * farmFoxLeg * uFoxMotion;

       // Spine flex: the back arches as the hind legs gather and extends as
       // they drive. Twice per cycle, and it is what makes a trot look like a
       // predator rather than a table with moving legs.
       float farmFoxSpine = smoothstep(0.16, 0.26, position.y);
       transformed.y += sin(farmFoxPhase * 12.566) * 0.011 * farmFoxSpine * uFoxMotion;

       float farmFoxTail = (1.0 - smoothstep(-0.22, -0.05, position.z))
         * smoothstep(0.15, 0.24, position.y);
       transformed.x += sin(farmFoxPhase * 5.6 - position.z * 4.6)
         * (0.035 + uFoxMotion * 0.037) * farmFoxTail;
       transformed.y += cos(farmFoxPhase * 4.4 - position.z * 3.1)
         * (0.010 + uFoxMotion * 0.008) * farmFoxTail;

       float farmFoxHead = smoothstep(0.18, 0.30, position.z)
         * smoothstep(0.20, 0.29, position.y);
       transformed.y += sin(uAnimalTime * 3.3 + modelMatrix[3].x)
         * 0.010 * farmFoxHead;
       transformed.y -= uFoxRaid * 0.050 * farmFoxSpine;
       transformed.z += uFoxRaid * 0.055 * farmFoxHead;
       transformed.y -= uFoxFlee * 0.024 * farmFoxHead;
       transformed.y += uFoxFlee * 0.018 * farmFoxTail;`,
    );
  };
  material.customProgramCacheKey = () => 'farmrise-fox-motion-v3';

  return {
    material,
    setTime(seconds): void {
      time.value = seconds;
    },
    setMotion(nextMotion, nextRaid, nextFlee, nextPace, nextPhaseOffset): void {
      motion.value = nextMotion;
      raid.value = nextRaid;
      flee.value = nextFlee;
      pace.value = nextPace;
      phaseOffset.value = nextPhaseOffset;
    },
    dispose(): void {
      material.dispose();
    },
  };
}

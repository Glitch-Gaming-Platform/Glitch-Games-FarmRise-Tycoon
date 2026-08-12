/**
 * Tier-aware water surfaces.
 *
 * Low keeps the original unlit shader byte-for-byte in spirit: two scrolling
 * bands and tiny displacement, with no dependency on the render pipeline.
 * Ultra uses MeshPhysicalMaterial so the same sky, sun and exposure that light
 * the farm also light the water. Procedural hooks add only the information a
 * stock physical material cannot know: contained surface waves, flow direction
 * and contact foam at the authored container edge.
 */
import * as THREE from 'three';
import type { RenderPipeline } from '@engine/render/RenderPipeline.js';

interface WaterShaderSource {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

export type WaterSurfaceMaterial = THREE.ShaderMaterial | THREE.MeshPhysicalMaterial;

export interface AnimatedWater {
  readonly material: WaterSurfaceMaterial;
  readonly responsive: boolean;
  setTime(seconds: number): void;
  dispose(): void;
}

const WATER_TEAL = new THREE.Color(0x4fb3c4);
const WATER_DEEP = new THREE.Color(0x2e8c9c);
const WATER_FOAM = new THREE.Color(0xa7d7e8);

export function createWaterMaterial(
  flowing = false,
  pipeline: RenderPipeline | null = null,
): AnimatedWater {
  return pipeline?.active
    ? createResponsiveWaterMaterial(flowing, pipeline)
    : createFallbackWaterMaterial(flowing);
}

function createResponsiveWaterMaterial(flowing: boolean, pipeline: RenderPipeline): AnimatedWater {
  const time = { value: 0 };
  const deep = { value: WATER_DEEP.clone() };
  const teal = { value: WATER_TEAL.clone() };
  const foam = { value: WATER_FOAM.clone() };
  const material = new THREE.MeshPhysicalMaterial({
    name: flowing ? 'M_FarmRise_RunningWaterResponsive' : 'M_FarmRise_StandingWaterResponsive',
    color: WATER_DEEP,
    roughness: flowing ? 0.2 : 0.12,
    metalness: 0,
    clearcoat: flowing ? 0.72 : 0.92,
    clearcoatRoughness: flowing ? 0.2 : 0.09,
    ior: 1.333,
    specularIntensity: flowing ? 0.72 : 0.88,
    specularColor: WATER_FOAM,
    transparent: true,
    opacity: flowing ? 0.66 : 0.72,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  material.onBeforeCompile = (shader) => {
    const source = shader as unknown as WaterShaderSource;
    source.uniforms['uFarmWaterTime'] = time;
    source.uniforms['uFarmWaterDeep'] = deep;
    source.uniforms['uFarmWaterTeal'] = teal;
    source.uniforms['uFarmWaterFoam'] = foam;
    source.vertexShader = `
      uniform float uFarmWaterTime;
      varying vec2 vFarmWaterUv;
      varying float vFarmWaterCrest;
    ${source.vertexShader}`;
    source.fragmentShader = `
      uniform float uFarmWaterTime;
      uniform vec3 uFarmWaterDeep;
      uniform vec3 uFarmWaterTeal;
      uniform vec3 uFarmWaterFoam;
      varying vec2 vFarmWaterUv;
      varying float vFarmWaterCrest;
    ${source.fragmentShader}`;

    source.vertexShader = source.vertexShader.replace(
      '#include <beginnormal_vertex>',
      responsiveNormalHook(flowing),
    );
    source.vertexShader = source.vertexShader.replace(
      '#include <begin_vertex>',
      responsivePositionHook(flowing),
    );
    source.fragmentShader = source.fragmentShader.replace(
      '#include <color_fragment>',
      responsiveColourHook(flowing),
    );
    source.fragmentShader = source.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float farmWaterFresnel = pow(
         1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))),
         4.0
       );
       // The physical clearcoat carries the real specular response. This small
       // colour lift only keeps that response readable at the gameplay camera,
       // where a sub-pixel highlight would otherwise disappear entirely.
       outgoingLight += mix(uFarmWaterTeal, uFarmWaterFoam, farmWaterFresnel)
         * farmWaterFresnel * ${flowing ? '0.11' : '0.16'};
       #include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () =>
    flowing ? 'farmrise-responsive-water-flow-v1' : 'farmrise-responsive-water-standing-v1';
  material.userData['farmWaterResponsive'] = true;
  material.userData['farmWaterFlowing'] = flowing;
  pipeline.registerMaterial(material, 'water');

  return {
    material,
    responsive: true,
    setTime(seconds): void {
      time.value = seconds;
    },
    dispose(): void {
      pipeline.unregisterMaterial(material);
      material.dispose();
    },
  };
}

function responsiveNormalHook(flowing: boolean): string {
  if (flowing) {
    return `#include <beginnormal_vertex>
      float farmWaterNormalPhase = position.y * 11.0 - uFarmWaterTime * 7.2;
      float farmWaterNormalContainment = smoothstep(0.0, 0.16, uv.y)
        * smoothstep(0.0, 0.16, 1.0 - uv.y);
      vec3 farmWaterRippleNormal = vec3(
        sin(farmWaterNormalPhase + position.z * 19.0) * 0.075,
        sin(farmWaterNormalPhase * 0.73) * 0.035,
        cos(farmWaterNormalPhase - position.x * 17.0) * 0.075
      ) * farmWaterNormalContainment;
      objectNormal = normalize(objectNormal + farmWaterRippleNormal);`;
  }

  return `#include <beginnormal_vertex>
    float farmWaterSlopeX = cos(position.x * 9.0 + position.z * 3.7 + uFarmWaterTime * 1.25)
      * 0.085;
    float farmWaterSlopeZ = cos(position.z * 13.0 - position.x * 4.1 - uFarmWaterTime * 1.7)
      * 0.075;
    float farmWaterNormalEdge = min(
      min(uv.x, 1.0 - uv.x),
      min(uv.y, 1.0 - uv.y)
    );
    float farmWaterNormalContainment = smoothstep(0.0, 0.18, farmWaterNormalEdge);
    objectNormal = normalize(
      objectNormal + vec3(-farmWaterSlopeX, 0.0, -farmWaterSlopeZ)
        * farmWaterNormalContainment
    );`;
}

function responsivePositionHook(flowing: boolean): string {
  if (flowing) {
    return `#include <begin_vertex>
      float farmWaterFlowPhase = position.y * 11.0 - uFarmWaterTime * 7.2;
      float farmWaterFlowWave = sin(farmWaterFlowPhase + position.z * 19.0)
        + 0.42 * sin(farmWaterFlowPhase * 1.73 - position.x * 13.0);
      float farmWaterEndContainment = smoothstep(0.0, 0.16, uv.y)
        * smoothstep(0.0, 0.16, 1.0 - uv.y);
      transformed.xz *= 1.0 + farmWaterFlowWave * 0.0045 * farmWaterEndContainment;
      vFarmWaterUv = uv;
      vFarmWaterCrest = farmWaterFlowWave;`;
  }

  return `#include <begin_vertex>
    float farmWaterWaveA = sin(position.x * 9.0 + position.z * 3.7 + uFarmWaterTime * 1.25);
    float farmWaterWaveB = sin(position.z * 13.0 - position.x * 4.1 - uFarmWaterTime * 1.7);
    float farmWaterWaveC = sin((position.x + position.z) * 5.3 + uFarmWaterTime * 0.65);
    float farmWaterWave = farmWaterWaveA + farmWaterWaveB * 0.46 + farmWaterWaveC * 0.22;
    float farmWaterEdgeDistance = min(
      min(uv.x, 1.0 - uv.x),
      min(uv.y, 1.0 - uv.y)
    );
    float farmWaterContainment = smoothstep(0.0, 0.18, farmWaterEdgeDistance);
    transformed.y += farmWaterWave * 0.009 * farmWaterContainment;
    vFarmWaterUv = uv;
    vFarmWaterCrest = farmWaterWave;`;
}

function responsiveColourHook(flowing: boolean): string {
  if (flowing) {
    return `#include <color_fragment>
      float farmWaterDirection = vFarmWaterUv.y * 18.0 - uFarmWaterTime * 8.4;
      float farmWaterBand = 0.5 + 0.5 * sin(
        farmWaterDirection + vFarmWaterUv.x * 6.0 + vFarmWaterCrest * 0.7
      );
      float farmWaterEndFoam = 1.0 - smoothstep(
        0.025,
        0.14,
        min(vFarmWaterUv.y, 1.0 - vFarmWaterUv.y)
      );
      float farmWaterAeration = smoothstep(0.72, 1.25, vFarmWaterCrest);
      diffuseColor.rgb = mix(uFarmWaterDeep, uFarmWaterTeal, 0.34 + farmWaterBand * 0.3);
      diffuseColor.rgb = mix(
        diffuseColor.rgb,
        uFarmWaterFoam,
        clamp(farmWaterEndFoam * 0.52 + farmWaterAeration * 0.15, 0.0, 0.62)
      );`;
  }

  return `#include <color_fragment>
    float farmWaterEdgeDistance = min(
      min(vFarmWaterUv.x, 1.0 - vFarmWaterUv.x),
      min(vFarmWaterUv.y, 1.0 - vFarmWaterUv.y)
    );
    float farmWaterEdgeFoam = 1.0 - smoothstep(0.035, 0.16, farmWaterEdgeDistance);
    float farmWaterBand = 0.5 + 0.5 * sin(
      vFarmWaterUv.x * 15.0 + vFarmWaterUv.y * 9.0 - uFarmWaterTime * 1.9
    );
    float farmWaterCrestFoam = smoothstep(1.04, 1.48, vFarmWaterCrest);
    diffuseColor.rgb = mix(uFarmWaterDeep, uFarmWaterTeal, 0.3 + farmWaterBand * 0.22);
    diffuseColor.rgb = mix(
      diffuseColor.rgb,
      uFarmWaterFoam,
      clamp(farmWaterEdgeFoam * 0.34 + farmWaterCrestFoam * 0.1, 0.0, 0.42)
    );`;
}

function createFallbackWaterMaterial(flowing: boolean): AnimatedWater {
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
  material.userData['farmWaterResponsive'] = false;
  material.userData['farmWaterFlowing'] = flowing;

  return {
    material,
    responsive: false,
    setTime(seconds): void {
      time.value = seconds;
    },
    dispose(): void {
      material.dispose();
    },
  };
}

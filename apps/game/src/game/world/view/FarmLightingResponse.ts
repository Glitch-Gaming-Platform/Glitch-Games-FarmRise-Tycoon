/**
 * Smooth environmental-light response to the few incidents that are genuinely
 * atmospheric.
 *
 * Drought keeps the established low-tier numbers exactly. Ultra additionally
 * gives an active cold snap a very small cool shift. Other incidents are local
 * events and belong to FarmImpactEffects/StructureEffectsView instead of
 * recolouring the whole screen. The pipeline's sky, exposure and grade are
 * deliberately untouched.
 */
import * as THREE from 'three';
import type { RenderContext } from '@engine/core/types.js';
import type { IncidentInstance } from '@farmrise/shared';

export interface IncidentLightingTarget {
  readonly drought: number;
  readonly cold: number;
}

export function incidentLightingTarget(
  incident: IncidentInstance | null,
  ultra: boolean,
): IncidentLightingTarget {
  if (!incident) return { drought: 0, cold: 0 };
  if (incident.definitionId === 'incident-drought') {
    const mitigation = Math.min(1, incident.responseProgress / 3);
    return {
      drought: incident.appliedMultiplier === null ? 0.18 : 1 - 0.62 * mitigation,
      cold: 0,
    };
  }
  if (ultra && incident.definitionId === 'incident-cold-snap') {
    const response = Math.min(1, incident.responseProgress / 4);
    return {
      drought: 0,
      cold: (incident.appliedMultiplier === null ? 0.08 : 0.3) * (1 - response * 0.42),
    };
  }
  return { drought: 0, cold: 0 };
}

export interface FarmLightingResponseOptions {
  readonly baseSunIntensity: number;
  readonly droughtSunBoost: number;
  readonly normalSun: THREE.Color;
  readonly ultra: boolean;
}

export class FarmLightingResponse {
  readonly #targetSun = new THREE.Color();
  readonly #targetSky = new THREE.Color();
  readonly #targetGround = new THREE.Color();
  #droughtBlend = 0;
  #coldBlend = 0;

  constructor(
    private readonly sun: THREE.DirectionalLight,
    private readonly hemisphere: THREE.HemisphereLight,
    private readonly options: FarmLightingResponseOptions,
  ) {}

  get blend(): IncidentLightingTarget {
    return { drought: this.#droughtBlend, cold: this.#coldBlend };
  }

  update(incident: IncidentInstance | null, context: RenderContext): void {
    const target = incidentLightingTarget(incident, this.options.ultra);
    const dt = Math.min(0.1, Math.max(0, context.deltaSeconds));
    const droughtResponse = 1 - Math.exp(-dt * 1.8);
    const coldResponse = 1 - Math.exp(-dt * 2.35);
    this.#droughtBlend += (target.drought - this.#droughtBlend) * droughtResponse;
    this.#coldBlend += (target.cold - this.#coldBlend) * coldResponse;

    this.#targetSun
      .copy(this.options.normalSun)
      .lerp(DROUGHT_SUN, this.#droughtBlend)
      .lerp(COLD_SUN, this.#coldBlend);
    this.sun.color.copy(this.#targetSun);
    this.sun.intensity =
      this.options.baseSunIntensity +
      this.#droughtBlend * this.options.droughtSunBoost -
      this.#coldBlend * this.options.baseSunIntensity * 0.045;

    this.#targetSky
      .copy(NORMAL_SKY_FILL)
      .lerp(DROUGHT_SKY_FILL, this.#droughtBlend)
      .lerp(COLD_SKY_FILL, this.#coldBlend);
    this.#targetGround
      .copy(NORMAL_GROUND_FILL)
      .lerp(DROUGHT_GROUND_FILL, this.#droughtBlend)
      .lerp(COLD_GROUND_FILL, this.#coldBlend);
    this.hemisphere.color.copy(this.#targetSky);
    this.hemisphere.groundColor.copy(this.#targetGround);
  }
}

const DROUGHT_SUN = new THREE.Color(0xe6c85d); // ground_scrub_sun
const COLD_SUN = new THREE.Color(0xa7d7e8); // sky_haze
const NORMAL_SKY_FILL = new THREE.Color(0xc7e4ff); // established low-tier sky fill
const DROUGHT_SKY_FILL = new THREE.Color(0xa7d7e8); // sky_haze
const COLD_SKY_FILL = new THREE.Color(0x83c4d1); // window_blue
const NORMAL_GROUND_FILL = new THREE.Color(0xb06a32); // established low-tier ground bounce
const DROUGHT_GROUND_FILL = new THREE.Color(0xb9603a); // soil_dry
const COLD_GROUND_FILL = new THREE.Color(0x8a8378); // rock

/**
 * The core manifest.
 *
 * One GLB per common asset family plus one GLB per seasonal crop pack. Grouping
 * this way keeps common world requests coarse while preventing Spring from
 * downloading Summer, Autumn and Winter growth meshes.
 *
 * Seasonal packs are catalogued as preload assets but FarmScene requests the
 * active/standing seasons directly. Missing families still fall back to
 * procedural geometry, which is why a partial art load is not fatal.
 *
 * Byte counts are the real, measured sizes from art/build_report.json. They
 * are what weights the loading bar, so they must be updated whenever the
 * assets are rebuilt - `npm run art:build` prints the new numbers.
 *
 * Keep entries sorted by kind, then id, so merge conflicts stay trivial.
 */
import type { AssetManifest } from './types.js';
import { AUDIO_ASSETS } from './audio.manifest.js';
import { UI_ICON_ASSETS } from './uiIcons.manifest.js';

export const CORE_MANIFEST: AssetManifest = {
  version: 10,
  assets: [
    ...AUDIO_ASSETS,
    ...UI_ICON_ASSETS,
    {
      id: 'model:animals',
      kind: 'model',
      url: 'assets/models/animals.glb',
      phase: 'critical',
      bytes: 138_816,
      scenes: ['farm'],
    },
    {
      id: 'model:buildings',
      kind: 'model',
      url: 'assets/models/buildings.glb',
      phase: 'critical',
      bytes: 672_932,
      scenes: ['farm'],
    },
    {
      id: 'model:characters',
      kind: 'model',
      url: 'assets/models/characters.glb',
      phase: 'critical',
      bytes: 150_164,
      scenes: ['farm'],
    },
    {
      id: 'model:crops',
      kind: 'model',
      url: 'assets/models/crops.glb',
      phase: 'critical',
      bytes: 594_980,
      scenes: ['farm'],
    },
    {
      id: 'model:crops-autumn',
      kind: 'model',
      url: 'assets/models/crops-autumn.glb',
      phase: 'preload',
      bytes: 443_560,
      scenes: ['farm'],
    },
    {
      id: 'model:crops-spring',
      kind: 'model',
      url: 'assets/models/crops-spring.glb',
      phase: 'preload',
      bytes: 469_812,
      scenes: ['farm'],
    },
    {
      id: 'model:crops-summer',
      kind: 'model',
      url: 'assets/models/crops-summer.glb',
      phase: 'preload',
      bytes: 467_408,
      scenes: ['farm'],
    },
    {
      id: 'model:crops-winter',
      kind: 'model',
      url: 'assets/models/crops-winter.glb',
      phase: 'preload',
      bytes: 369_684,
      scenes: ['farm'],
    },
    {
      id: 'model:ground',
      kind: 'model',
      url: 'assets/models/ground.glb',
      phase: 'critical',
      bytes: 28_248,
      scenes: ['farm'],
    },
    {
      id: 'model:props',
      kind: 'model',
      url: 'assets/models/props.glb',
      phase: 'preload',
      bytes: 219_636,
      scenes: ['farm'],
    },
  ],
};

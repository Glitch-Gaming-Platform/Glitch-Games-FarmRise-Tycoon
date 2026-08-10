/**
 * The core manifest.
 *
 * One GLB per asset family. Grouping this way means the loading screen makes
 * six requests rather than twenty-four, and a scene that needs only crops
 * never downloads the character.
 *
 * All six are `critical` for the farm scene: the game has no fallback art
 * worth showing, so there is no honest way to start without them.
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
  version: 6,
  assets: [
    ...AUDIO_ASSETS,
    ...UI_ICON_ASSETS,
    {
      id: 'model:animals',
      kind: 'model',
      url: 'assets/models/animals.glb',
      phase: 'critical',
      bytes: 69_052,
      scenes: ['farm'],
    },
    {
      id: 'model:buildings',
      kind: 'model',
      url: 'assets/models/buildings.glb',
      phase: 'critical',
      bytes: 236_316,
      scenes: ['farm'],
    },
    {
      id: 'model:characters',
      kind: 'model',
      url: 'assets/models/characters.glb',
      phase: 'critical',
      bytes: 130_680,
      scenes: ['farm'],
    },
    {
      id: 'model:crops',
      kind: 'model',
      url: 'assets/models/crops.glb',
      phase: 'critical',
      bytes: 424_668,
      scenes: ['farm'],
    },
    {
      id: 'model:ground',
      kind: 'model',
      url: 'assets/models/ground.glb',
      phase: 'critical',
      bytes: 19_876,
      scenes: ['farm'],
    },
    {
      id: 'model:props',
      kind: 'model',
      url: 'assets/models/props.glb',
      phase: 'preload',
      bytes: 146_336,
      scenes: ['farm'],
    },
  ],
};

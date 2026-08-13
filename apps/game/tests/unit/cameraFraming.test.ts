/**
 * Anti-drift test for the gameplay camera.
 *
 * The camera framing is art direction (ADR 0017), and it necessarily exists
 * twice: once in TypeScript for the engine, once in Python for the Blender
 * review renderer. If those two copies drift, the art gets judged from a shot
 * the game never shows - which is exactly how the original 61-degree problem
 * survived as long as it did.
 *
 * So this test reads the Python file and compares. It is a slightly unusual
 * thing for a unit test to do; it is also the only way to make a
 * cross-language constant safe without a code generator.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GAMEPLAY_CAMERA,
  GAMEPLAY_CAMERA_PITCH_RADIANS,
  GAMEPLAY_CAMERA_YAW_RADIANS,
} from '@game/rules/sessionRules.js';

/**
 * Walks up from the working directory to find the repo root.
 *
 * `import.meta.url` is unusable here: this project runs under the jsdom
 * environment, where it resolves to an http:// URL and fileURLToPath throws.
 */
function findRepoFile(relative: string): string {
  let directory = resolve(process.cwd());
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(directory, relative);
    if (existsSync(candidate)) return candidate;
    directory = dirname(directory);
  }
  throw new Error(`Could not locate ${relative} from ${process.cwd()}`);
}

const PALETTE_PY = findRepoFile('tools/blender/palette.py');
const REVIEW_RENDER_PY = findRepoFile('tools/blender/review_render.py');
const RIG_PREVIEW_PY = findRepoFile('tools/blender/rig_preview.py');

function pythonConstant(source: string, name: string): number {
  const match = new RegExp(`^${name}\\s*=\\s*(-?[0-9.]+)`, 'm').exec(source);
  if (!match) throw new Error(`${name} not found in palette.py`);
  return Number(match[1]);
}

describe('gameplay camera framing', () => {
  const source = readFileSync(PALETTE_PY, 'utf8');
  const reviewSource = readFileSync(REVIEW_RENDER_PY, 'utf8');
  const rigPreviewSource = readFileSync(RIG_PREVIEW_PY, 'utf8');

  it('has not drifted from the Blender review renderer', () => {
    expect(GAMEPLAY_CAMERA.distance).toBe(pythonConstant(source, 'GAMEPLAY_REVIEW_DISTANCE'));
    expect(GAMEPLAY_CAMERA.pitchDegrees).toBe(
      pythonConstant(source, 'GAMEPLAY_REVIEW_PITCH_DEGREES'),
    );
    expect(GAMEPLAY_CAMERA.fovDegrees).toBe(pythonConstant(source, 'GAMEPLAY_REVIEW_FOV_DEGREES'));
    expect(GAMEPLAY_CAMERA.yawDegrees).toBe(pythonConstant(source, 'GAMEPLAY_REVIEW_YAW_DEGREES'));
  });

  it('converts pitch to radians correctly', () => {
    expect(GAMEPLAY_CAMERA_PITCH_RADIANS).toBeCloseTo(0.5934, 4);
    expect(GAMEPLAY_CAMERA_YAW_RADIANS).toBeCloseTo(-0.733, 4);
  });

  it('uses the runtime orbit convention and vertical FOV in Blender', () => {
    // FollowController adds cos(yaw) on world Z. A minus sign here puts the
    // review camera on the opposite diagonal even when all four constants
    // match. Blender also specifies focal length against a horizontal sensor,
    // while Three.js' PerspectiveCamera receives a vertical FOV.
    expect(reviewSource).toContain('math.cos(yaw) * math.cos(pitch) * distance');
    expect(reviewSource).not.toContain('-math.cos(yaw) * math.cos(pitch) * distance');
    expect(reviewSource).toContain('lens_for_vertical_fov(GAMEPLAY_REVIEW_FOV_DEGREES, aspect)');
  });

  it('keeps the avatar readability proof on the shipping camera contract', () => {
    const start = reviewSource.indexOf('def character_gameplay_read()');
    const end = reviewSource.indexOf('\ndef actors_focus()', start);
    expect(start).toBeGreaterThanOrEqual(0);
    const avatarProof = reviewSource.slice(start, end);

    expect(avatarProof).toContain('distance = GAMEPLAY_REVIEW_DISTANCE');
    expect(avatarProof).toContain('pitch = math.radians(GAMEPLAY_REVIEW_PITCH_DEGREES)');
    expect(avatarProof).toContain('lens_for_vertical_fov(GAMEPLAY_REVIEW_FOV_DEGREES, aspect)');
    expect(reviewSource).toContain('paths["character_gameplay_read"] = character_gameplay_read()');
  });

  it('proves contextual avatar readability without the accessibility outline', () => {
    const start = reviewSource.indexOf('def character_gameplay_context_no_outline()');
    const end = reviewSource.indexOf('\ndef character_side_profile()', start);
    expect(start).toBeGreaterThanOrEqual(0);
    const contextualProof = reviewSource.slice(start, end);

    expect(contextualProof).toContain('distance = GAMEPLAY_REVIEW_DISTANCE');
    expect(contextualProof).toContain('pitch = math.radians(GAMEPLAY_REVIEW_PITCH_DEGREES)');
    expect(contextualProof).toContain('lens_for_vertical_fov(GAMEPLAY_REVIEW_FOV_DEGREES, aspect)');
    expect(contextualProof).not.toContain('add_player_outline');
    expect(contextualProof).toContain('SM_crop_wheat_s4');
    expect(contextualProof).toContain('SM_crop_corn_s4');
    expect(reviewSource).toContain(
      'paths["character_gameplay_context_no_outline"] = character_gameplay_context_no_outline()',
    );
  });

  it('keeps enlarged deformation evidence for the ULTRA avatar review', () => {
    expect(rigPreviewSource).toContain('render.resolution_x = 480');
    expect(rigPreviewSource).toContain('render.resolution_y = 780');
    expect(rigPreviewSource).toContain('def key_pose_proof()');
    expect(rigPreviewSource).toContain('"plant_side"');
    expect(rigPreviewSource).toContain('"plant_three_quarter"');
    expect(rigPreviewSource).toContain('"wave_apex"');
    expect(rigPreviewSource).toContain('"walk_stride"');
    expect(rigPreviewSource).toContain('main()\n    key_pose_proof()');
  });

  it('keeps the pitch in the range this art direction was built for', () => {
    // Below ~25 degrees the tile grid stops being readable for planning;
    // above ~50 it flattens the vertical crop mass the art spends its
    // triangle budget on. Changing this range is an ADR-level decision.
    expect(GAMEPLAY_CAMERA.pitchDegrees).toBeGreaterThanOrEqual(25);
    expect(GAMEPLAY_CAMERA.pitchDegrees).toBeLessThanOrEqual(50);
  });
});

/**
 * Anti-drift test for the gameplay camera.
 *
 * The camera framing is art direction (ADR 0011), and it necessarily exists
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
import { GAMEPLAY_CAMERA, GAMEPLAY_CAMERA_PITCH_RADIANS } from '@game/rules/sessionRules.js';

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

function pythonConstant(source: string, name: string): number {
  const match = new RegExp(`^${name}\\s*=\\s*([0-9.]+)`, 'm').exec(source);
  if (!match) throw new Error(`${name} not found in palette.py`);
  return Number(match[1]);
}

describe('gameplay camera framing', () => {
  const source = readFileSync(PALETTE_PY, 'utf8');

  it('has not drifted from the Blender review renderer', () => {
    expect(GAMEPLAY_CAMERA.distance).toBe(pythonConstant(source, 'GAMEPLAY_REVIEW_DISTANCE'));
    expect(GAMEPLAY_CAMERA.pitchDegrees).toBe(
      pythonConstant(source, 'GAMEPLAY_REVIEW_PITCH_DEGREES'),
    );
    expect(GAMEPLAY_CAMERA.fovDegrees).toBe(pythonConstant(source, 'GAMEPLAY_REVIEW_FOV_DEGREES'));
  });

  it('converts pitch to radians correctly', () => {
    expect(GAMEPLAY_CAMERA_PITCH_RADIANS).toBeCloseTo(0.6632, 4);
  });

  it('keeps the pitch in the range this art direction was built for', () => {
    // Below ~25 degrees the tile grid stops being readable for planning;
    // above ~50 it flattens the vertical crop mass the art spends its
    // triangle budget on. Changing this range is an ADR-level decision.
    expect(GAMEPLAY_CAMERA.pitchDegrees).toBeGreaterThanOrEqual(25);
    expect(GAMEPLAY_CAMERA.pitchDegrees).toBeLessThanOrEqual(50);
  });
});

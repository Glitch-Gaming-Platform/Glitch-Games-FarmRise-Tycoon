import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORE_MANIFEST } from '../../src/assets/manifests/core.manifest.js';

const ROOT = process.cwd();
const PUBLIC_ROOT = path.resolve(ROOT, 'apps/game/public');
const REPORT = JSON.parse(readFileSync(path.resolve(ROOT, 'art/build_report.json'), 'utf8')) as {
  total_triangles: number;
  family_bytes: Record<string, { raw: number; raw_gzip: number }>;
};

describe('model catalog', () => {
  it('keeps shipped GLB sizes synchronized with the Blender report and manifest', () => {
    const modelEntries = CORE_MANIFEST.assets.filter((entry) => entry.kind === 'model');
    expect(modelEntries).toHaveLength(Object.keys(REPORT.family_bytes).length);

    for (const entry of modelEntries) {
      const family = entry.id.replace('model:', '');
      const actualBytes = statSync(path.join(PUBLIC_ROOT, entry.url)).size;
      expect(actualBytes, entry.id).toBe(REPORT.family_bytes[family]?.raw);
      expect(entry.bytes, entry.id).toBe(actualBytes);
    }
  });

  it('keeps the complete authored world below its triangle budget', () => {
    expect(REPORT.total_triangles).toBeLessThanOrEqual(20_000);
  });
});

import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILDING_KINDS, CROP_IDS } from '@farmrise/shared';
import { CORE_MANIFEST } from '../../src/assets/manifests/core.manifest.js';

const ROOT = process.cwd();
const PUBLIC_ROOT = path.resolve(ROOT, 'apps/game/public');
const REPORT = JSON.parse(readFileSync(path.resolve(ROOT, 'art/build_report.json'), 'utf8')) as {
  total_triangles: number;
  assets: readonly { name: string }[];
  family_bytes: Record<string, { raw: number; raw_gzip: number }>;
};

function glbJson(filename: string): {
  meshes?: readonly { primitives: readonly { attributes: Record<string, number> }[] }[];
} {
  const bytes = readFileSync(filename);
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as {
    meshes?: readonly { primitives: readonly { attributes: Record<string, number> }[] }[];
  };
}

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
    expect(REPORT.total_triangles).toBeLessThanOrEqual(40_000);
  });

  it('ships authored geometry for every playable building kind', () => {
    const names = new Set(REPORT.assets.map((asset) => asset.name));
    for (const kind of BUILDING_KINDS) {
      expect(names.has(`SM_building_${kind}`), kind).toBe(true);
    }
  });

  it('ships all four authored growth stages for every crop', () => {
    const names = new Set(REPORT.assets.map((asset) => asset.name));
    for (const cropId of CROP_IDS) {
      for (const stage of [1, 2, 3, 4]) {
        expect(names.has(`SM_crop_${cropId}_s${stage}`), `${cropId} stage ${stage}`).toBe(true);
      }
    }
  });

  it('exports UV coordinates for the shared building and tree detail atlas', () => {
    for (const family of ['buildings', 'props']) {
      const document = glbJson(path.join(PUBLIC_ROOT, `assets/models/${family}.glb`));
      for (const mesh of document.meshes ?? []) {
        for (const primitive of mesh.primitives) {
          expect(primitive.attributes['TEXCOORD_0'], family).toBeTypeOf('number');
        }
      }
    }
  });
});

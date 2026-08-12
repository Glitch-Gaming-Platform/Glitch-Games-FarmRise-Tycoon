import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILDING_KINDS, CROP_IDS } from '@farmrise/shared';
import { CORE_MANIFEST, LOW_CORE_MANIFEST } from '../../src/assets/manifests/core.manifest.js';

const ROOT = process.cwd();
const PUBLIC_ROOT = path.resolve(ROOT, 'apps/game/public');
const REPORT = JSON.parse(readFileSync(path.resolve(ROOT, 'art/build_report.json'), 'utf8')) as {
  total_triangles: number;
  assets: readonly { name: string; triangles: number }[];
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

  it('routes low to the immutable legacy model pack', () => {
    const ultraModels = CORE_MANIFEST.assets.filter((entry) => entry.kind === 'model');
    const lowModels = LOW_CORE_MANIFEST.assets.filter((entry) => entry.kind === 'model');
    expect(lowModels.map((entry) => entry.id)).toEqual(ultraModels.map((entry) => entry.id));

    const expectedHashes: Readonly<Record<string, string>> = {
      animals: '74a77260f87710289f801820fe4fcdf24a64fe36db19fca43b563849a22ed0c6',
      buildings: '971833ddad342cb3ccfec4694bfadf10aa2dbe0571720553cddd33a7a337c286',
      characters: '8a856aa5021e3e87932abc870d34f0edd9ed9e56faa351d0c121e1aa13c46deb',
      'crops-autumn': '79f55751e1a4ee52f44cce390925c3f9da69e498c236328422de8a59fee638af',
      'crops-spring': '055629eef3e0ba7f439c5fd390fb728fc57ce2ef2a58148a714432ac3bf2d559',
      'crops-summer': '99f52dbceecb7c75f4de3f5805c828d9ea84e934406beb4b12970bc1f88eaf39',
      'crops-winter': '6b2aafa0266422ed7aca64dbb239a3234da70ba4646a653bd3e20894a59cb3a5',
      crops: '9a45a00f9da3f436984f6f1fcdfa1ec202403078158d9ff6cfd28fd894244dbb',
      ground: 'b5147eee17f768f3e629fe4651074bbf84641b8ca7e5cb4333e19927b39cb840',
      props: 'dcb9745c1cc8b979b78971cef7115eb8c39b4b20fc4bacd7a461594bc89ab8b6',
    };

    for (const entry of lowModels) {
      const family = entry.id.replace('model:', '');
      expect(entry.url).toBe(`assets/models/low/${family}.glb`);
      const filename = path.join(PUBLIC_ROOT, entry.url);
      const bytes = readFileSync(filename);
      expect(entry.bytes, entry.id).toBe(bytes.byteLength);
      expect(createHash('sha256').update(bytes).digest('hex'), entry.id).toBe(
        expectedHashes[family],
      );
    }
  });

  it('does not even declare Ultra surface textures on low', () => {
    const declaresSurface = (manifest: typeof CORE_MANIFEST): boolean =>
      manifest.assets.some(
        (entry) => entry.kind === 'texture' && entry.url.startsWith('assets/textures/'),
      );
    expect(declaresSurface(LOW_CORE_MANIFEST)).toBe(false);
    expect(declaresSurface(CORE_MANIFEST)).toBe(true);
  });

  it('keeps the complete authored world below its triangle budget', () => {
    expect(REPORT.total_triangles).toBeLessThanOrEqual(40_000);
  });

  it('reclaims enough catalog geometry for readable crop and tree silhouettes', () => {
    const triangles = new Map(REPORT.assets.map((asset) => [asset.name, asset.triangles]));
    const count = (name: string): number => triangles.get(name) ?? Number.POSITIVE_INFINITY;

    expect(REPORT.total_triangles).toBeLessThanOrEqual(38_000);
    expect(count('SM_crop_grape_s1')).toBeLessThan(count('SM_crop_grape_s2'));
    expect(count('SM_crop_grape_s2')).toBeLessThan(count('SM_crop_grape_s3'));
    expect(count('SM_crop_grape_s3')).toBeLessThan(count('SM_crop_grape_s4'));
    expect(count('SM_crop_pea_s1')).toBeLessThan(count('SM_crop_pea_s2'));
    expect(count('SM_crop_pea_s2')).toBeLessThan(count('SM_crop_pea_s3'));
    expect(count('SM_crop_pea_s3')).toBeLessThan(count('SM_crop_pea_s4'));
    expect(count('SM_crop_corn_s2')).toBeLessThan(count('SM_crop_corn_s3'));
    expect(count('SM_crop_corn_s3')).toBeLessThan(count('SM_crop_corn_s4'));
    expect(count('SM_crop_avocado_s1')).toBeLessThan(count('SM_crop_avocado_s2'));
    expect(count('SM_crop_avocado_s2')).toBeLessThan(count('SM_crop_avocado_s3'));
    expect(count('SM_crop_avocado_s3')).toBeLessThan(count('SM_crop_avocado_s4'));
    expect(count('SM_crop_strawberry_s2')).toBeLessThan(count('SM_crop_strawberry_s3'));
    expect(count('SM_crop_strawberry_s3')).toBeLessThan(count('SM_crop_strawberry_s4'));
    expect(count('SM_crop_tomato_s4')).toBeLessThanOrEqual(650);
    for (const tree of [
      'SM_prop_eucalyptus',
      'SM_prop_eucalyptus_tall',
      'SM_prop_eucalyptus_wide',
    ]) {
      expect(count(tree), tree).toBeGreaterThanOrEqual(260);
      expect(count(tree), tree).toBeLessThanOrEqual(300);
    }
    expect(count('SM_prop_dead_tree')).toBeGreaterThanOrEqual(220);
    expect(count('SM_prop_dead_tree')).toBeLessThanOrEqual(300);
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

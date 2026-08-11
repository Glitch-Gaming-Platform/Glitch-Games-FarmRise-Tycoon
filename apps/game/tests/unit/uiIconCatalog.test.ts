import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CROP_IDS } from '@farmrise/shared';
import { CORE_MANIFEST } from '../../src/assets/manifests/core.manifest.js';
import { UI_ICON_ASSETS, UI_ICON_URLS } from '../../src/assets/manifests/uiIcons.manifest.js';

const PUBLIC_ROOT = path.resolve(process.cwd(), 'apps/game/public');
const REPORT = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'art/ui_icon_report.json'), 'utf8'),
) as {
  total_bytes: number;
  icons: Array<{ file: string; bytes: number }>;
};

describe('UI icon catalog', () => {
  it('gives every crop its own inventory and market icon', () => {
    for (const cropId of CROP_IDS) {
      expect(UI_ICON_URLS).toHaveProperty(cropId);
      expect(UI_ICON_URLS[cropId as keyof typeof UI_ICON_URLS]).toBe(
        `assets/ui/icons/${cropId}.webp`,
      );
    }
  });

  it('declares every Blender-rendered interface image in the core manifest', () => {
    const expectedUrls = Object.values(UI_ICON_URLS).sort();
    const manifestEntries = CORE_MANIFEST.assets.filter((entry) =>
      entry.id.startsWith('texture:ui-'),
    );

    expect(UI_ICON_ASSETS).toHaveLength(Object.keys(UI_ICON_URLS).length);
    expect(manifestEntries).toEqual(UI_ICON_ASSETS);
    expect(manifestEntries.map((entry) => entry.url).sort()).toEqual(expectedUrls);
    expect(
      manifestEntries.every(
        (entry) =>
          entry.kind === 'texture' && entry.phase === 'lazy' && entry.url.endsWith('.webp'),
      ),
    ).toBe(true);
  });

  it('keeps measured byte counts in sync and below the interface-art budget', () => {
    let totalBytes = 0;
    const reportBytes = new Map(REPORT.icons.map((icon) => [icon.file, icon.bytes]));

    for (const entry of UI_ICON_ASSETS) {
      const file = path.join(PUBLIC_ROOT, entry.url);
      const actualBytes = statSync(file).size;
      const filename = path.basename(entry.url);
      expect(actualBytes, `${entry.id} differs from the generation report`).toBe(
        reportBytes.get(filename),
      );
      // Blender's transparent WebP encoder can vary by a few bytes across
      // otherwise identical renders. The manifest is a loading-progress
      // weight, so keep it close without pretending it is a content hash.
      expect(Math.abs(actualBytes - (entry.bytes ?? 0)), entry.id).toBeLessThanOrEqual(64);
      totalBytes += actualBytes;
    }

    expect(totalBytes).toBe(REPORT.total_bytes);
    expect(totalBytes).toBeLessThanOrEqual(175_000);
  });
});

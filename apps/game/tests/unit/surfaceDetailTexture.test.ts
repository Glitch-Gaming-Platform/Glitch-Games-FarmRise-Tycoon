import { describe, expect, it } from 'vitest';
import { createSurfaceDetailTexture } from '../../src/assets/registries/surfaceDetailTexture.js';

describe('shared surface detail atlas', () => {
  it('builds one varied 256px texture for every authored material surface', () => {
    const texture = createSurfaceDetailTexture();
    expect(texture.image.width).toBe(256);
    expect(texture.image.height).toBe(256);

    const pixels = texture.image.data as Uint8Array;
    const values = new Set<number>();
    for (let index = 0; index < pixels.length; index += 4) values.add(pixels[index]!);
    expect(values.size).toBeGreaterThan(24);
    texture.dispose();
  });

  it('aligns the first glTF UV row with the white plain-surface cell', () => {
    const texture = createSurfaceDetailTexture();
    const pixels = texture.image.data as Uint8Array;
    const width = texture.image.width;
    const rgbaAt = (x: number, y: number) => pixels[(y * width + x) * 4]!;

    // Exported plain-surface UVs occupy the bottom-left 64 px atlas cell.
    expect(rgbaAt(8, 8)).toBe(255);
    expect(rgbaAt(56, 56)).toBe(255);
    // The unused fourth row stays black, making an accidental V flip fail
    // loudly instead of silently flattening every authored mesh again.
    expect(rgbaAt(8, 248)).toBe(0);
    texture.dispose();
  });
});

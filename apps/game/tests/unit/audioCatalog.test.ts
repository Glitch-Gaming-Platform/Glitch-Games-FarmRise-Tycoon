import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_MUSIC_IDS, DEFAULT_MUSIC_ID, MUSIC_TRACKS } from '../../src/assets/audio/musicIds.js';
import { ALL_SOUND_IDS } from '../../src/assets/audio/proceduralSfx.js';
import { FUTURE_SOUND_IDS, SOUND, SOUND_BRIEF } from '../../src/assets/audio/soundIds.js';
import { CORE_MANIFEST } from '../../src/assets/manifests/core.manifest.js';

const PUBLIC_ROOT = path.resolve(process.cwd(), 'apps/game/public');
const audioEntries = CORE_MANIFEST.assets.filter((entry) => entry.kind === 'audio');

describe('audio catalog', () => {
  it('declares one generated file for every effect and music track', () => {
    const expectedIds = [...ALL_SOUND_IDS, ...ALL_MUSIC_IDS].sort();
    const manifestIds = audioEntries.map((entry) => entry.id).sort();

    expect([...ALL_SOUND_IDS].sort()).toEqual(Object.values(SOUND).sort());
    expect(Object.keys(SOUND_BRIEF).sort()).toEqual(Object.values(SOUND).sort());
    expect(MUSIC_TRACKS).toHaveLength(5);
    expect(manifestIds).toEqual(expectedIds);
  });

  it('keeps measured byte counts in sync with files on disk', () => {
    for (const entry of audioEntries) {
      const file = path.join(PUBLIC_ROOT, entry.url);
      expect(statSync(file).size, entry.id).toBe(entry.bytes);
    }
  });

  it('preloads only the default music loop and never makes audio critical', () => {
    const musicEntries = audioEntries.filter((entry) => entry.id.startsWith('music.'));
    expect(audioEntries.every((entry) => entry.phase !== 'critical')).toBe(true);
    expect(musicEntries.find((entry) => entry.id === DEFAULT_MUSIC_ID)?.phase).toBe('preload');
    expect(
      musicEntries
        .filter((entry) => entry.id !== DEFAULT_MUSIC_ID)
        .every((entry) => entry.phase === 'lazy'),
    ).toBe(true);
  });

  it('requires every non-future sound id to appear in runtime binding code', () => {
    const bindingSource = [
      readFileSync(path.resolve(process.cwd(), 'apps/game/src/bootstrap/bindAudio.ts'), 'utf8'),
      readFileSync(path.resolve(process.cwd(), 'apps/game/src/bootstrap/startGame.ts'), 'utf8'),
    ].join('\n');

    for (const [name, id] of Object.entries(SOUND)) {
      if (FUTURE_SOUND_IDS.includes(id)) continue;
      expect(bindingSource, `${id} has no runtime binding`).toContain(`SOUND.${name}`);
    }
  });
});

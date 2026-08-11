import { describe, expect, it, vi } from 'vitest';
import { MUSIC } from '../../src/assets/audio/musicIds.js';
import type { AssetLoader } from '../../src/assets/loaders/AssetLoader.js';
import type { AudioHandle, AudioSystem, PlayOptions } from '../../src/engine/audio/AudioSystem.js';
import { MusicPlayer } from '../../src/bootstrap/MusicPlayer.js';

interface PlayedTrack {
  readonly id: string;
  readonly options: PlayOptions;
  readonly stop: ReturnType<typeof vi.fn>;
}

describe('MusicPlayer', () => {
  it('uses Sunrise Rows by default and falls back when it is disabled', () => {
    const assets = fakeAssets();
    const defaultPlayer = new MusicPlayer(fakeAudio([]), assets.loader, {
      initialTrack: MUSIC.sunriseRows,
    });
    const fallbackPlayer = new MusicPlayer(fakeAudio([]), assets.loader, {
      initialTrack: MUSIC.sunriseRows,
      disabledTracks: [MUSIC.sunriseRows],
    });

    expect(defaultPlayer.selectedTrack).toBe(MUSIC.sunriseRows);
    expect(fallbackPlayer.selectedTrack).toBe(MUSIC.marketDay);

    defaultPlayer.dispose();
    fallbackPlayer.dispose();
  });

  it('plays five seamless repeats and rotates to the next enabled song', async () => {
    const played: PlayedTrack[] = [];
    const audio = fakeAudio(played);
    const assets = fakeAssets();
    const player = new MusicPlayer(audio, assets.loader, {
      initialTrack: MUSIC.sunriseRows,
      disabledTracks: [MUSIC.marketDay],
    });

    player.unlock(fakeContext());
    await vi.waitFor(() => expect(played).toHaveLength(1));

    expect(played[0]?.id).toBe(MUSIC.sunriseRows);
    expect(played[0]?.options.repeatCount).toBe(5);
    played[0]?.options.onEnded?.();

    await vi.waitFor(() => expect(played).toHaveLength(2));
    expect(played[1]?.id).toBe(MUSIC.rainOnTin);
    expect(assets.release).toHaveBeenCalledWith(MUSIC.sunriseRows);
    expect(audio.unregister).toHaveBeenCalledWith(MUSIC.sunriseRows);

    player.dispose();
  });

  it('changes immediately when selected and skips a song disabled during playback', async () => {
    const played: PlayedTrack[] = [];
    const audio = fakeAudio(played);
    const assets = fakeAssets();
    const player = new MusicPlayer(audio, assets.loader);

    player.unlock(fakeContext());
    await vi.waitFor(() => expect(played).toHaveLength(1));

    player.select(MUSIC.marketDay);
    await vi.waitFor(() => expect(played).toHaveLength(2));
    expect(played[0]?.stop).toHaveBeenCalled();
    expect(played[1]?.id).toBe(MUSIC.marketDay);

    player.setEnabled(MUSIC.marketDay, false);
    await vi.waitFor(() => expect(played).toHaveLength(3));
    expect(player.disabledTracks).toContain(MUSIC.marketDay);
    expect(played[2]?.id).toBe(MUSIC.rainOnTin);

    player.dispose();
  });

  it('keeps one valid song enabled and avoids generated files in low-memory mode', async () => {
    const played: PlayedTrack[] = [];
    const audio = fakeAudio(played);
    const assets = fakeAssets();
    const player = new MusicPlayer(audio, assets.loader, {
      initialTrack: MUSIC.quietOutback,
      disabledTracks: [MUSIC.sunriseRows, MUSIC.marketDay, MUSIC.rainOnTin, MUSIC.goldenHarvest],
      lowMemory: true,
    });

    player.setEnabled(MUSIC.quietOutback, false);
    player.unlock(fakeContext());
    await vi.waitFor(() => expect(played).toHaveLength(1));

    expect(player.disabledTracks).not.toContain(MUSIC.quietOutback);
    expect(assets.load).not.toHaveBeenCalled();
    expect(played[0]?.id).toBe(MUSIC.quietOutback);

    player.dispose();
  });
});

function fakeAudio(played: PlayedTrack[]): AudioSystem {
  const audio = {
    registerBuffer: vi.fn(),
    registerClip: vi.fn(async () => {}),
    unregister: vi.fn(),
    play: vi.fn((id: string, options: PlayOptions = {}): AudioHandle => {
      const stop = vi.fn();
      played.push({ id, options, stop });
      return { stop };
    }),
  };
  return audio as unknown as AudioSystem;
}

function fakeAssets(): {
  readonly loader: AssetLoader;
  readonly load: ReturnType<typeof vi.fn>;
  readonly release: ReturnType<typeof vi.fn>;
} {
  const load = vi.fn(async () => new ArrayBuffer(8));
  const release = vi.fn();
  return {
    loader: { load, release } as unknown as AssetLoader,
    load,
    release,
  };
}

function fakeContext(): AudioContext {
  return {
    sampleRate: 1,
    createBuffer: vi.fn(() => ({ copyToChannel: vi.fn() })),
  } as unknown as AudioContext;
}

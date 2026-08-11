import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MUSIC, MUSIC_TRACKS } from '../../src/assets/audio/musicIds.js';
import {
  loadSettings,
  SettingsPanel,
  type SettingsCallbacks,
} from '../../src/ui/settings/SettingsPanel.js';

describe('SettingsPanel music preferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders every song and applies a manual selection immediately', () => {
    const callbacks = fakeCallbacks();
    const panel = new SettingsPanel(callbacks);
    const select = panel.root.querySelector<HTMLSelectElement>(
      '[data-testid="music-track-select"]',
    );

    expect(select).not.toBeNull();
    expect(select?.options).toHaveLength(MUSIC_TRACKS.length);
    expect(panel.root.querySelectorAll('input[aria-label^="Play "]')).toHaveLength(
      MUSIC_TRACKS.length,
    );

    select!.value = MUSIC.goldenHarvest;
    select!.dispatchEvent(new Event('change'));

    expect(callbacks.onMusicTrackChange).toHaveBeenCalledWith(MUSIC.goldenHarvest);
    expect(loadSettings().musicTrack).toBe(MUSIC.goldenHarvest);
  });

  it('disabling the current song selects the next enabled song', () => {
    const callbacks = fakeCallbacks();
    const panel = new SettingsPanel(callbacks);
    const sunrise = panel.root.querySelector<HTMLInputElement>(
      'input[aria-label="Play Sunrise Rows"]',
    );

    sunrise!.checked = false;
    sunrise!.dispatchEvent(new Event('change'));

    expect(callbacks.onMusicTrackChange).toHaveBeenCalledWith(MUSIC.marketDay);
    expect(callbacks.onMusicTrackEnabledChange).toHaveBeenCalledWith(MUSIC.sunriseRows, false);
    expect(panel.values.musicTrack).toBe(MUSIC.marketDay);
    expect(panel.values.disabledMusicTracks).toContain(MUSIC.sunriseRows);
  });

  it('repairs an invalid saved state so at least one song remains enabled', () => {
    localStorage.setItem(
      'farmrise:settings',
      JSON.stringify({
        musicTrack: MUSIC.rainOnTin,
        disabledMusicTracks: MUSIC_TRACKS.map(({ id }) => id),
      }),
    );

    const settings = loadSettings();
    expect(settings.musicTrack).toBe(MUSIC.rainOnTin);
    expect(settings.disabledMusicTracks).not.toContain(MUSIC.rainOnTin);
    expect(settings.disabledMusicTracks).toHaveLength(MUSIC_TRACKS.length - 1);
  });
});

function fakeCallbacks(): SettingsCallbacks {
  return {
    onVolumeChange: vi.fn(),
    onMusicTrackChange: vi.fn(),
    onMusicTrackEnabledChange: vi.fn(),
    onDebugToggle: vi.fn(),
    onClose: vi.fn(),
  };
}

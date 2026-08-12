/**
 * Settings.
 *
 * Values are applied immediately (no "Apply" button) and persisted to
 * localStorage, wrapped in try/catch because storage throws in private mode on
 * some browsers and losing a volume preference must never break boot.
 */
import { el } from '../core/dom.js';
import { uiIcon } from '../core/icons.js';
import type { Screen } from '../core/Screen.js';
import type { AudioBus } from '@engine/audio/AudioSystem.js';
import {
  ALL_MUSIC_IDS,
  DEFAULT_MUSIC_ID,
  MUSIC_TRACKS,
  type MusicId,
} from '@assets/audio/musicIds.js';
import {
  isQualityTier,
  persistQualityTier,
  readStoredQuality,
  resolveQualityTier,
  type QualityTier,
} from '@engine/render/quality/QualityTier.js';
import { createEnglishLocalization, type GameLocalization } from '../i18n/gameI18n.js';
import { languageSelect } from '../i18n/LanguageSelect.js';
import { localizedButton, localizedText } from '../i18n/localizedDom.js';

export interface SettingsValues {
  master: number;
  music: number;
  sfx: number;
  musicTrack: MusicId;
  disabledMusicTracks: MusicId[];
  showDebugOverlay: boolean;
}

const STORAGE_KEY = 'farmrise:settings';

export const DEFAULT_SETTINGS: SettingsValues = {
  master: 0.8,
  music: 0.5,
  sfx: 0.9,
  musicTrack: DEFAULT_MUSIC_ID,
  disabledMusicTracks: [],
  showDebugOverlay: false,
};

export function loadSettings(): SettingsValues {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return normaliseSettings(JSON.parse(raw) as Partial<SettingsValues>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(values: SettingsValues): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Preferences are a convenience; failing to persist them is not an error.
  }
}

export interface SettingsCallbacks {
  readonly onVolumeChange: (bus: AudioBus, value: number) => void;
  readonly onMusicTrackChange: (trackId: MusicId) => void;
  readonly onMusicTrackEnabledChange: (trackId: MusicId, enabled: boolean) => void;
  readonly onDebugToggle: (enabled: boolean) => void;
  readonly onClose: () => void;
  readonly onPrivacy?: () => void;
  /**
   * Optional: fired after the new tier is persisted.
   *
   * Optional because the setting is meaningful without a listener - it is read
   * at boot by `resolveQualityTier`, so persisting it is the whole mechanism.
   * A host that wants to offer "reload now" can subscribe.
   */
  readonly onQualityChange?: (tier: QualityTier) => void;
}

export class SettingsPanel implements Screen {
  readonly id = 'settings';
  readonly root: HTMLElement;
  #values: SettingsValues;
  readonly #songSelect: HTMLSelectElement;
  readonly #qualitySelect: HTMLSelectElement;
  readonly #songToggles = new Map<MusicId, HTMLInputElement>();
  readonly #i18n: GameLocalization;

  constructor(callbacks: SettingsCallbacks, i18n: GameLocalization = createEnglishLocalization()) {
    this.#i18n = i18n;
    this.#values = loadSettings();

    const slider = (
      labelKey: string,
      bus: Extract<AudioBus, 'master' | 'music' | 'sfx'>,
    ): HTMLElement => {
      const input = el('input', {
        attrs: {
          type: 'range',
          min: '0',
          max: '1',
          step: '0.05',
          value: String(this.#values[bus]),
        },
      });
      i18n.bindAttribute(input, 'aria-label', labelKey);
      input.addEventListener('input', () => {
        const value = Number(input.value);
        this.#values[bus] = value;
        callbacks.onVolumeChange(bus, value);
        saveSettings(this.#values);
      });
      return el('label', { class: 'fr-field' }, localizedText(i18n, 'span', labelKey), input);
    };

    const debugToggle = el('input', {
      attrs: { type: 'checkbox' },
    });
    i18n.bindAttribute(debugToggle, 'aria-label', 'settings.showPerformanceOverlay');
    debugToggle.checked = this.#values.showDebugOverlay;
    debugToggle.addEventListener('change', () => {
      this.#values.showDebugOverlay = debugToggle.checked;
      callbacks.onDebugToggle(debugToggle.checked);
      saveSettings(this.#values);
    });

    // Quality is not part of SettingsValues: it is read at boot by the render
    // pipeline before any UI exists, so localStorage is its home and this
    // control is a view onto that. Changing it needs a reload, because the tier
    // decides renderer construction flags and a global shader chunk.
    const activeQuality = resolveQualityTier();
    const qualitySelect = el('select', {
      testId: 'quality-select',
    }) as HTMLSelectElement;
    i18n.bindAttribute(qualitySelect, 'aria-label', 'settings.graphicsQuality');
    for (const tier of ['low', 'ultra'] as const) {
      qualitySelect.append(
        localizedText(i18n, 'option', `settings.quality.${tier}`, { attrs: { value: tier } }),
      );
    }
    qualitySelect.value = activeQuality;
    const qualityNote = el('p', {
      class: 'fr-field__note',
      text: '',
    });
    qualitySelect.addEventListener('change', () => {
      const tier = qualitySelect.value;
      if (!isQualityTier(tier)) return;
      persistQualityTier(tier);
      qualityNote.textContent = tier === activeQuality ? '' : i18n.t('settings.qualityReload');
      callbacks.onQualityChange?.(tier);
    });
    this.#qualitySelect = qualitySelect;

    this.#songSelect = el('select', {
      testId: 'music-track-select',
    });
    i18n.bindAttribute(this.#songSelect, 'aria-label', 'settings.currentSong');
    for (const track of MUSIC_TRACKS) {
      this.#songSelect.append(
        el('option', {
          attrs: { value: track.id },
          text: track.title,
        }),
      );
    }
    this.#songSelect.value = this.#values.musicTrack;
    this.#songSelect.addEventListener('change', () => {
      const trackId = this.#songSelect.value as MusicId;
      if (!isMusicId(trackId) || this.#values.disabledMusicTracks.includes(trackId)) return;
      this.#values.musicTrack = trackId;
      callbacks.onMusicTrackChange(trackId);
      saveSettings(this.#values);
    });

    const songList = el('fieldset', { class: 'fr-music-list' });
    songList.append(localizedText(i18n, 'legend', 'settings.songsInRotation'));
    for (const track of MUSIC_TRACKS) {
      const toggle = el('input', {
        attrs: {
          type: 'checkbox',
        },
      });
      i18n.bindAttribute(toggle, 'aria-label', 'settings.playSong', { song: track.title });
      this.#songToggles.set(track.id, toggle);
      toggle.addEventListener('change', () => {
        const disabled = new Set(this.#values.disabledMusicTracks);
        if (toggle.checked) disabled.delete(track.id);
        else disabled.add(track.id);

        if (disabled.size === ALL_MUSIC_IDS.length) {
          toggle.checked = true;
          return;
        }

        const selectedWasDisabled = disabled.has(this.#values.musicTrack);
        this.#values.disabledMusicTracks = ALL_MUSIC_IDS.filter((id) => disabled.has(id));
        if (selectedWasDisabled) {
          const nextTrack = MUSIC_TRACKS.find(({ id }) => !disabled.has(id))?.id;
          if (nextTrack) {
            this.#values.musicTrack = nextTrack;
            callbacks.onMusicTrackChange(nextTrack);
          }
        }
        callbacks.onMusicTrackEnabledChange(track.id, toggle.checked);
        this.#syncMusicControls();
        saveSettings(this.#values);
      });
      songList.append(
        el('label', { class: 'fr-music-list__song' }, el('span', { text: track.title }), toggle),
      );
    }
    this.#syncMusicControls();

    this.root = el(
      'div',
      { class: 'fr-layer', testId: 'settings-panel' },
      el(
        'div',
        { class: 'fr-panel fr-panel--compact fr-panel--settings' },
        el('div', { class: 'fr-screen-icon' }, uiIcon('settings', '', 'fr-screen-icon__image')),
        localizedText(i18n, 'span', 'settings.ribbon', { class: 'fr-ribbon' }),
        localizedText(i18n, 'h1', 'settings.title', { class: 'fr-title' }),
        languageSelect(i18n, { testId: 'settings-language-select' }),
        slider('settings.masterVolume', 'master'),
        slider('settings.music', 'music'),
        el(
          'label',
          { class: 'fr-field fr-field--music-select' },
          localizedText(i18n, 'span', 'settings.currentSong'),
          this.#songSelect,
        ),
        songList,
        slider('settings.effects', 'sfx'),
        el(
          'label',
          { class: 'fr-field' },
          localizedText(i18n, 'span', 'settings.graphicsQuality'),
          qualitySelect,
        ),
        qualityNote,
        el(
          'label',
          { class: 'fr-field' },
          localizedText(i18n, 'span', 'settings.performanceOverlay'),
          debugToggle,
        ),
        el(
          'div',
          { class: 'fr-actions' },
          ...(callbacks.onPrivacy
            ? [
                localizedButton(i18n, 'settings.privacy', callbacks.onPrivacy, {
                  class: 'fr-btn fr-btn--secondary',
                }),
              ]
            : []),
          localizedButton(i18n, 'settings.back', callbacks.onClose, { class: 'fr-btn' }),
        ),
      ),
    );
    i18n.onChange(() => {
      if (qualitySelect.value !== activeQuality) {
        qualityNote.textContent = i18n.t('settings.qualityReload');
      }
      this.#syncMusicControls();
    });
  }

  get values(): SettingsValues {
    return this.#values;
  }

  /** The tier the player has chosen, or the auto-detected one if they have not. */
  get quality(): QualityTier {
    const stored = readStoredQuality();
    return isQualityTier(stored) ? stored : resolveQualityTier();
  }

  set quality(tier: QualityTier) {
    persistQualityTier(tier);
    this.#qualitySelect.value = tier;
  }

  setMusicTrack(trackId: MusicId): void {
    if (this.#values.disabledMusicTracks.includes(trackId)) return;
    this.#values.musicTrack = trackId;
    this.#songSelect.value = trackId;
    saveSettings(this.#values);
  }

  #syncMusicControls(): void {
    const disabled = new Set(this.#values.disabledMusicTracks);
    const enabledCount = ALL_MUSIC_IDS.length - disabled.size;
    for (const option of this.#songSelect.options) {
      option.disabled = disabled.has(option.value as MusicId);
    }
    this.#songSelect.value = this.#values.musicTrack;
    for (const [id, toggle] of this.#songToggles) {
      const enabled = !disabled.has(id);
      toggle.checked = enabled;
      toggle.disabled = enabled && enabledCount === 1;
      toggle.title = toggle.disabled ? this.#i18n.t('settings.keepOneSong') : '';
    }
  }
}

function normaliseSettings(values: Partial<SettingsValues>): SettingsValues {
  const disabled = new Set(
    Array.isArray(values.disabledMusicTracks)
      ? values.disabledMusicTracks.filter(isMusicId)
      : DEFAULT_SETTINGS.disabledMusicTracks,
  );
  const requestedTrack = isMusicId(values.musicTrack) ? values.musicTrack : DEFAULT_MUSIC_ID;
  if (disabled.size === ALL_MUSIC_IDS.length) disabled.delete(requestedTrack);
  const musicTrack = disabled.has(requestedTrack)
    ? (MUSIC_TRACKS.find(({ id }) => !disabled.has(id))?.id ?? DEFAULT_MUSIC_ID)
    : requestedTrack;

  return {
    master: normaliseVolume(values.master, DEFAULT_SETTINGS.master),
    music: normaliseVolume(values.music, DEFAULT_SETTINGS.music),
    sfx: normaliseVolume(values.sfx, DEFAULT_SETTINGS.sfx),
    musicTrack,
    disabledMusicTracks: ALL_MUSIC_IDS.filter((id) => disabled.has(id)),
    showDebugOverlay:
      typeof values.showDebugOverlay === 'boolean'
        ? values.showDebugOverlay
        : DEFAULT_SETTINGS.showDebugOverlay,
  };
}

function normaliseVolume(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

function isMusicId(value: unknown): value is MusicId {
  return typeof value === 'string' && ALL_MUSIC_IDS.includes(value as MusicId);
}

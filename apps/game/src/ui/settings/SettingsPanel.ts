/**
 * Settings.
 *
 * Values are applied immediately (no "Apply" button) and persisted to
 * localStorage, wrapped in try/catch because storage throws in private mode on
 * some browsers and losing a volume preference must never break boot.
 */
import { button, el } from '../core/dom.js';
import { uiIcon } from '../core/icons.js';
import type { Screen } from '../core/Screen.js';
import type { AudioBus } from '@engine/audio/AudioSystem.js';

export interface SettingsValues {
  master: number;
  music: number;
  sfx: number;
  showDebugOverlay: boolean;
}

const STORAGE_KEY = 'farmrise:settings';

export const DEFAULT_SETTINGS: SettingsValues = {
  master: 0.8,
  music: 0.5,
  sfx: 0.9,
  showDebugOverlay: false,
};

export function loadSettings(): SettingsValues {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<SettingsValues>) };
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
  readonly onDebugToggle: (enabled: boolean) => void;
  readonly onClose: () => void;
}

export class SettingsPanel implements Screen {
  readonly id = 'settings';
  readonly root: HTMLElement;
  #values: SettingsValues;

  constructor(callbacks: SettingsCallbacks) {
    this.#values = loadSettings();

    const slider = (
      label: string,
      bus: Extract<AudioBus, 'master' | 'music' | 'sfx'>,
    ): HTMLElement => {
      const input = el('input', {
        attrs: {
          type: 'range',
          min: '0',
          max: '1',
          step: '0.05',
          value: String(this.#values[bus]),
          'aria-label': label,
        },
      });
      input.addEventListener('input', () => {
        const value = Number(input.value);
        this.#values[bus] = value;
        callbacks.onVolumeChange(bus, value);
        saveSettings(this.#values);
      });
      return el('label', { class: 'fr-field' }, el('span', { text: label }), input);
    };

    const debugToggle = el('input', {
      attrs: { type: 'checkbox', 'aria-label': 'Show performance overlay' },
    });
    debugToggle.checked = this.#values.showDebugOverlay;
    debugToggle.addEventListener('change', () => {
      this.#values.showDebugOverlay = debugToggle.checked;
      callbacks.onDebugToggle(debugToggle.checked);
      saveSettings(this.#values);
    });

    this.root = el(
      'div',
      { class: 'fr-layer', testId: 'settings-panel' },
      el(
        'div',
        { class: 'fr-panel fr-panel--compact' },
        el('div', { class: 'fr-screen-icon' }, uiIcon('settings', '', 'fr-screen-icon__image')),
        el('span', { class: 'fr-ribbon', text: 'Farmhouse controls' }),
        el('h1', { class: 'fr-title', text: 'Settings' }),
        slider('Master volume', 'master'),
        slider('Music', 'music'),
        slider('Effects', 'sfx'),
        el(
          'label',
          { class: 'fr-field' },
          el('span', { text: 'Performance overlay' }),
          debugToggle,
        ),
        el('div', { class: 'fr-actions' }, button('Back', callbacks.onClose, { class: 'fr-btn' })),
      ),
    );
  }

  get values(): SettingsValues {
    return this.#values;
  }
}

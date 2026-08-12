import { EventBus } from '@engine/core/EventBus.js';

export const ANALYTICS_CONSENT_VERSION = '1.0';
export const ANALYTICS_CONSENT_KEY = 'farmrise:analytics-consent';

export type AnalyticsConsentState = 'unknown' | 'granted' | 'denied';
export type AnalyticsConsentSource = 'default' | 'banner' | 'settings' | 'stored';

interface StoredConsent {
  readonly version: string;
  readonly state: Exclude<AnalyticsConsentState, 'unknown'>;
}

export interface AnalyticsConsentEvents extends Record<string, unknown> {
  changed: { state: AnalyticsConsentState; source: AnalyticsConsentSource };
}

export class AnalyticsConsent {
  readonly events = new EventBus<AnalyticsConsentEvents>();
  #state: AnalyticsConsentState;
  #explicit: boolean;
  readonly #waiters: Array<(state: Exclude<AnalyticsConsentState, 'unknown'>) => void> = [];

  constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = storageOrNull(),
  ) {
    const stored = readConsent(storage);
    this.#explicit = stored !== 'unknown';
    this.#state = stored === 'unknown' ? 'granted' : stored;
  }

  get state(): AnalyticsConsentState {
    return this.#state;
  }

  get granted(): boolean {
    return this.#state === 'granted';
  }

  /** False for the product's default-on state; true after the player chooses. */
  get explicit(): boolean {
    return this.#explicit;
  }

  decide(granted: boolean, source: Exclude<AnalyticsConsentSource, 'stored'>): void {
    const state = granted ? 'granted' : 'denied';
    this.#state = state;
    this.#explicit = true;
    try {
      this.storage?.setItem(
        ANALYTICS_CONSENT_KEY,
        JSON.stringify({ version: ANALYTICS_CONSENT_VERSION, state } satisfies StoredConsent),
      );
    } catch {
      // A private-mode storage failure must not prevent the player choosing.
    }
    this.events.emit('changed', { state, source });
    for (const resolve of this.#waiters.splice(0)) resolve(state);
  }

  waitForDecision(): Promise<Exclude<AnalyticsConsentState, 'unknown'>> {
    if (this.#state !== 'unknown') return Promise.resolve(this.#state);
    return new Promise((resolve) => this.#waiters.push(resolve));
  }
}

export function readConsent(
  storage: Pick<Storage, 'getItem'> | null = storageOrNull(),
): AnalyticsConsentState {
  try {
    const raw = storage?.getItem(ANALYTICS_CONSENT_KEY);
    if (!raw) return 'unknown';
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    if (parsed.version !== ANALYTICS_CONSENT_VERSION) return 'unknown';
    return parsed.state === 'granted' || parsed.state === 'denied' ? parsed.state : 'unknown';
  } catch {
    return 'unknown';
  }
}

function storageOrNull(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

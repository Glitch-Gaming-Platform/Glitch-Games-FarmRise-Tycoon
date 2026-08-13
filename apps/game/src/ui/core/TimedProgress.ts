import { ticksToSeconds } from '@farmrise/shared';
import { el } from './dom.js';
import type { GameLocalization } from '../i18n/gameI18n.js';

export interface TimedProgressSnapshot {
  readonly state: string;
  readonly progress: number;
  readonly remainingTicks: number;
  readonly paused?: boolean;
}

/** A time-driven bar whose visible and accessible label always includes its countdown. */
export function timedProgress(
  i18n: GameLocalization,
  snapshot: TimedProgressSnapshot,
  testId: string,
): HTMLElement {
  const progress = Math.min(1, Math.max(0, snapshot.progress));
  const percent = Math.round(progress * 100);
  const time = i18n.formatDurationSeconds(ticksToSeconds(snapshot.remainingTicks));
  const remaining = i18n.t('time.remaining', { time });
  const label = `${snapshot.state} · ${remaining}`;
  const fill = el('div', { class: 'fr-timed-progress__fill' });
  fill.style.width = `${percent}%`;

  return el(
    'div',
    {
      class: `fr-timed-progress${snapshot.paused ? ' fr-timed-progress--paused' : ''}`,
      testId,
    },
    el('div', { class: 'fr-timed-progress__label', text: label }),
    el(
      'div',
      {
        class: 'fr-timed-progress__track',
        attrs: {
          role: 'progressbar',
          'aria-label': label,
          'aria-valuemin': '0',
          'aria-valuemax': '100',
          'aria-valuenow': String(percent),
        },
      },
      fill,
    ),
  );
}

import { CROPS } from '@farmrise/shared';
import { cropName } from './domainText.js';
import type { GameLocalization } from './gameI18n.js';

/**
 * Adapts the remaining rule/controller English at the presentation boundary.
 * Stable rule codes are preferable for new behavior; these mappings keep old
 * locale-neutral game events usable while that migration happens incrementally.
 */
export function localizeGameText(
  i18n: GameLocalization,
  text: string | null | undefined,
): string | null {
  if (!text) return null;
  const exact: Readonly<Record<string, string>> = {
    'Change seed': 'interaction.changeSeed',
    Harvest: 'interaction.harvest',
    Tend: 'interaction.tend',
    Repair: 'interaction.repair',
    'Pick up': 'interaction.pickUp',
    "You can't carry anymore. Store some items first.": 'interaction.packFull',
    'Nothing to do.': 'interaction.nothingToDo',
    'That offer is gone.': 'interaction.offerGone',
    'Nothing to answer right now.': 'interaction.nothingToAnswer',
    'Go to the marked problem and use Work to answer it.': 'interaction.goToProblem',
    'Collect the eggs before opening the Starter Extension.': 'interaction.collectEggsFirst',
  };
  const key = exact[text];
  if (key) return i18n.t(key, undefined, text);

  const plant = /^Plant (.+)$/.exec(text);
  if (plant) {
    const fallbackCrop = plant[1] ?? '';
    const crop = Object.values(CROPS).find((candidate) => candidate.displayName === fallbackCrop);
    return i18n.t('interaction.plant', {
      crop: crop ? cropName(i18n, crop.id, crop.displayName) : fallbackCrop,
    });
  }

  const putDown = /^Put down \((\d+)\)$/.exec(text);
  if (putDown) return i18n.t('interaction.putDown', { quantity: putDown[1] ?? '0' });

  const pickUp = /^Pick up (.+)$/.exec(text);
  if (pickUp) return i18n.t('interaction.pickUpItems', { items: pickUp[1] ?? '' });

  return text;
}

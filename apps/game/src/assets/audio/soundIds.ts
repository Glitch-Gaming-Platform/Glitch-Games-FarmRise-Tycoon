/**
 * Every sound in the game, with the description that defines it.
 *
 * The descriptions are not decoration. They are the specification a sound
 * designer - or a generative audio tool - works from, and they are what the
 * procedural synthesiser in proceduralSfx.ts implements. Keeping them here
 * means the intent survives whichever way the audio is eventually produced.
 *
 * Real files use the same ids in the asset manifest. The procedural renderer
 * remains a fallback, so a failed optional download degrades to a simpler
 * sound rather than silence. See docs/AUDIO.md.
 */

export const SOUND = {
  uiClick: 'ui.click',
  uiConfirm: 'ui.confirm',
  uiDeny: 'ui.deny',
  uiOpen: 'ui.open',

  plant: 'farm.plant',
  tend: 'farm.tend',
  harvest: 'farm.harvest',
  footstep: 'farm.footstep',

  buildPlace: 'farm.build_place',
  buildComplete: 'farm.build_complete',

  sellSpot: 'market.sell',
  sellContract: 'market.contract',
  coinBig: 'market.big_payout',

  eventWarning: 'event.warning',
  eventImpact: 'event.impact',
  eventPrevented: 'event.prevented',

  foxAlert: 'animal.fox_alert',
  foxFlee: 'animal.fox_flee',
  chicken: 'animal.chicken',
  raidLoss: 'animal.raid_loss',

  goalReached: 'goal.land_purchased',
  runSuccess: 'run.success',
  runFail: 'run.fail',
} as const;

export type SoundId = (typeof SOUND)[keyof typeof SOUND];

/**
 * Generation briefs. Written as prompts so they can be handed straight to a
 * generative audio tool, and short enough to be useful to a human.
 */
export const SOUND_BRIEF: Record<SoundId, string> = {
  'ui.click': 'Soft muted wooden tick, very short, low velocity, no tail.',
  'ui.confirm': 'Warm two-note rising chime, wooden marimba character, gentle.',
  'ui.deny': 'Low soft thud with a slight downward bend. Discouraging, never harsh.',
  'ui.open': 'Light paper or canvas rustle opening, short and airy.',

  'farm.plant': 'Hand pressing a seed into loose soil. Soft granular crunch, damp, close-mic.',
  'farm.tend': 'Watering can splash over leaves. Short wet hiss with a light patter tail.',
  'farm.harvest':
    'Snapping a ripe stalk then a rustle of leaves, ending in a small satisfied wooden knock.',
  'farm.footstep': 'Single boot step on dry packed earth. Dusty, soft, no reverb.',

  'farm.build_place': 'Timber post dropped into position. Solid wooden thunk with a short knock.',
  'farm.build_complete':
    'Three quick hammer strikes on wood, then a warm rising chime. Accomplishment, not fanfare.',

  'market.sell': 'A few coins dropped into a wooden bowl. Bright, small, warm.',
  'market.contract':
    'Coins into a bowl followed by a paper stamp thump. Heavier and more official than a spot sale.',
  'market.big_payout': 'A generous handful of coins cascading, with a warm bell underneath.',

  'event.warning':
    'Distant low wooden wind-chime knocking, uneasy but not alarming. Two slow strikes.',
  'event.impact': 'Dry gust of wind with a low rumble. Something has gone wrong outdoors.',
  'event.prevented': 'Solid latch closing, then a short reassuring low chime. Safety.',

  'animal.fox_alert': 'Short sharp fox bark, thin and distant, slightly panicked.',
  'animal.fox_flee': 'A quick receding fox yelp with dry scrub rustle as it bolts away.',
  'animal.chicken': 'Single soft contented chicken cluck, close and dry.',
  'animal.raid_loss':
    'Brief startled wing flutter and distressed clucks. A loss cue with no injury sound.',

  'goal.land_purchased':
    'Warm ascending four-note phrase on strings and a low bell. Earned, expansive.',
  'run.success': 'Bright major fanfare on acoustic instruments, warm and rustic. Two seconds.',
  'run.fail': 'Slow descending minor phrase, gentle and sympathetic. Never mocking.',
};

/** The two sounds that must never be missed; they carry gameplay information. */
export const CRITICAL_SOUNDS: readonly SoundId[] = [SOUND.eventWarning, SOUND.foxAlert];

/** Generated now, but waiting for the outcome screen before runtime use. */
export const FUTURE_SOUND_IDS: readonly SoundId[] = [SOUND.runSuccess, SOUND.runFail];

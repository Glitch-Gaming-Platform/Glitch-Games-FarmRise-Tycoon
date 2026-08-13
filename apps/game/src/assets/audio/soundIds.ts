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
  cartRoll: 'farm.cart_roll',
  pickup: 'farm.pickup',
  deposit: 'farm.deposit',
  shooAnimals: 'farm.shoo_animals',
  repair: 'farm.repair',

  buildPlace: 'farm.build_place',
  buildComplete: 'farm.build_complete',

  processingStart: 'processing.start',
  processingComplete: 'processing.complete',

  sellSpot: 'market.sell',
  sellContract: 'market.contract',
  coinBig: 'market.big_payout',

  eventWarning: 'event.warning',
  eventImpact: 'event.impact',
  eventPrevented: 'event.prevented',

  droughtWarning: 'incident.drought_warning',
  droughtImpact: 'incident.drought_impact',
  foxRaidWarning: 'incident.fox_raid_warning',
  cartAxleWarning: 'incident.cart_axle_warning',
  cartAxleImpact: 'incident.cart_axle_impact',
  roadWashoutWarning: 'incident.road_washout_warning',
  roadWashoutImpact: 'incident.road_washout_impact',
  blightWarning: 'incident.blight_warning',
  blightImpact: 'incident.blight_impact',
  processorBreakdownWarning: 'incident.processor_breakdown_warning',
  processorBreakdownImpact: 'incident.processor_breakdown_impact',
  coldSnapWarning: 'incident.cold_snap_warning',
  coldSnapImpact: 'incident.cold_snap_impact',

  foxAlert: 'animal.fox_alert',
  foxFlee: 'animal.fox_flee',
  chicken: 'animal.chicken',
  sheep: 'animal.sheep',
  cow: 'animal.cow',
  raidLoss: 'animal.raid_loss',

  seasonTransition: 'season.transition',
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
  'farm.cart_roll': 'One short wooden cart wheel roll and axle creak over packed earth.',
  'farm.pickup': 'A small produce crate lifted from earth with a canvas-and-wood rustle.',
  'farm.deposit': 'A carried produce crate set firmly onto a wooden store floor.',
  'farm.shoo_animals':
    'Two quick hand claps and a boot scuff used to drive livestock into shelter.',
  'farm.repair': 'A short hand-tool adjustment: metal ratchet, wooden knock, then a secure click.',

  'farm.build_place': 'Timber post dropped into position. Solid wooden thunk with a short knock.',
  'farm.build_complete':
    'Three quick hammer strikes on wood, then a warm rising chime. Accomplishment, not fanfare.',

  'processing.start':
    'A farm machine engages with a belt catch, wooden gear turn and steady start.',
  'processing.complete': 'A machine winds down and drops finished goods into a wooden tray.',

  'market.sell': 'A few coins dropped into a wooden bowl. Bright, small, warm.',
  'market.contract':
    'Coins into a bowl followed by a paper stamp thump. Heavier and more official than a spot sale.',
  'market.big_payout': 'A generous handful of coins cascading, with a warm bell underneath.',

  'event.warning':
    'Distant low wooden wind-chime knocking, uneasy but not alarming. Two slow strikes.',
  'event.impact': 'Dry gust of wind with a low rumble. Something has gone wrong outdoors.',
  'event.prevented': 'Solid latch closing, then a short reassuring low chime. Safety.',

  'incident.drought_warning':
    'Dry wind over brittle grass with one strained timber creak. A drought is approaching.',
  'incident.drought_impact':
    'Parched soil cracks open with a dusty granular crumble and a short dry gust.',
  'incident.fox_raid_warning':
    'A distant fox yip, one twig snap and nervous grass movement near the treeline.',
  'incident.cart_axle_warning':
    'A loaded wooden cart axle groans and wheel hub squeaks under strain.',
  'incident.cart_axle_impact':
    'A wooden axle snaps, the wheel drops and a small farm load lands in soft mud.',
  'incident.road_washout_warning':
    'Water rises through roadside gravel with loose stones beginning to shift.',
  'incident.road_washout_impact':
    'A muddy road edge collapses into rushing water with a compact gravel slide.',
  'incident.blight_warning':
    'A close patch of leaves rustles unnaturally, then one dry leaf curls and crackles.',
  'incident.blight_impact':
    'Several crop leaves crisp, curl and shed with a brittle papery crackle.',
  'incident.processor_breakdown_warning':
    'A farm machine belt squeals briefly while a loose metal housing rattles.',
  'incident.processor_breakdown_impact':
    'A farm processor seizes with a belt slap, hard metal clunk and descending whirr.',
  'incident.cold_snap_warning':
    'A sudden thin winter wind arrives with faint ice crystals ticking on timber.',
  'incident.cold_snap_impact':
    'Frost rapidly forms across stored goods with a brittle icy crack and cold gust.',

  'animal.fox_alert': 'Short sharp fox bark, thin and distant, slightly panicked.',
  'animal.fox_flee': 'A quick receding fox yelp with dry scrub rustle as it bolts away.',
  'animal.chicken': 'Single soft contented chicken cluck, close and dry.',
  'animal.sheep': 'One calm adult sheep bleat, close, natural and friendly.',
  'animal.cow': 'One gentle dairy cow lowing call, warm, close and unhurried.',
  'animal.raid_loss':
    'Brief startled wing flutter and distressed clucks. A loss cue with no injury sound.',

  'season.transition':
    'A short airy seasonal turn with leaves, breeze and a warm three-note wooden chime.',
  'goal.land_purchased':
    'Warm ascending four-note phrase on strings and a low bell. Earned, expansive.',
  'run.success': 'Bright major fanfare on acoustic instruments, warm and rustic. Two seconds.',
  'run.fail': 'Slow descending minor phrase, gentle and sympathetic. Never mocking.',
};

/** The two sounds that must never be missed; they carry gameplay information. */
export const CRITICAL_SOUNDS: readonly SoundId[] = [SOUND.eventWarning, SOUND.foxAlert];

/** Generated now, but waiting for a terminal success screen before runtime use. */
export const FUTURE_SOUND_IDS: readonly SoundId[] = [SOUND.runSuccess];

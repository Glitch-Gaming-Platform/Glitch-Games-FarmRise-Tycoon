const additionalAnimalVariants = [
  ...variants('cow', 2, [
    'Exactly one short adult dairy cow contact moo at close range, a little brighter and more questioning than a long low, dry natural recording, no herd, no human voice, no music.',
    'Exactly one contented adult dairy cow nasal low and soft breath at close range, calm and low pitched, dry natural farm animal recording, no herd, no human voice, no music.',
  ]),
  ...variants('pig', 1, [
    'Exactly one friendly domestic pig oink at close range, medium pitch and natural, dry recording with almost no pen ambience, no group, no human voice, no music.',
    'Exactly two quick domestic pig grunts at close range, curious and relaxed, dry natural recording, no squeal, no group, no human voice, no music.',
    'Exactly one brief excited domestic pig squeal, lively but not distressed or injured, close dry recording, no group, no human voice, no music.',
  ]),
  ...variants('horse', 1, [
    'Exactly one adult farm horse neigh at medium distance, clear natural rise and fall, calm rather than alarmed, little stable ambience, no other horses, no human voice, no music.',
    'Exactly one soft adult horse whinny at close range, friendly greeting call, dry natural recording, no hoofbeats, no other horses, no human voice, no music.',
    'Exactly one adult horse nasal snort and brief breath at close range, relaxed stable animal Foley, no neigh, no hoofbeats, no human voice, no music.',
  ]),
  ...variants('goat', 1, [
    'Exactly one adult farm goat bleat at close range, clear natural nasal call, dry recording, no herd chorus, no bell, no human voice, no music.',
    'Exactly one short questioning goat maa at close range, higher and quicker than a full bleat, dry natural recording, no herd, no human voice, no music.',
    'Exactly two soft contented goat grunts and a tiny breath at close range, calm and natural, no bleat chorus, no human voice, no music.',
  ]),
  ...variants('pigeon', 1, [
    'Exactly one domestic pigeon coo phrase at close range, low rounded two-part call, dry natural bird recording, no flock, no wing noise, no human voice, no music.',
    'Exactly one shorter brighter pigeon coo at close range, curious and gentle, dry recording, no flock, no human voice, no music.',
    'One pigeon takes off nearby: exactly three quick wing flaps and one faint coo, compact natural farmyard bird Foley, no flock, no human voice, no music.',
  ]),
  ...variants('rabbit', 1, [
    'A domestic rabbit at close range makes one soft nasal sniff and tiny contented tooth purr, extremely quiet but audible, dry recording, no cage rattle, no human voice, no music.',
    'Exactly one rabbit hind-foot thump on packed earth, compact low impact with a tiny body rustle, no repeated footsteps, no human voice, no music.',
    'Exactly one very soft domestic rabbit squeak at close range, brief and curious rather than distressed, dry recording, no other animals, no human voice, no music.',
  ]),
  ...variants('sheep', 2, [
    'Exactly one short adult sheep baa at close range, slightly higher and more questioning than a long bleat, natural dry recording, no lamb, no flock, no human voice, no music.',
    'Exactly one low contented adult sheep nasal bleat and soft breath, calm and close, dry natural recording, no flock chorus, no human voice, no music.',
  ]),
  ...variants('deer', 1, [
    'Exactly one gentle adult doe bleat at medium distance, quiet natural woodland-farm edge call, dry with very little ambience, no herd, no human voice, no music.',
    'Exactly one deer alarm snort at medium distance, brief sharp breathy warning, natural and alert but not cinematic, no hoofbeats, no herd, no music.',
    'Exactly one low adult deer contact grunt at medium distance, restrained and natural, almost no ambience, no herd, no human voice, no music.',
  ]),
  ...namedVariants('hen', 2, [
    'Exactly one domestic hen gives a short egg-laying cackle phrase, lively but compact, close dry farm recording, no rooster, no flock chorus, no human voice, no music.',
    'Exactly two soft contented hen bok-bok clucks at close range, friendly and unhurried, dry natural recording, no rooster, no flock, no human voice, no music.',
  ]),
  ...variants('rooster', 1, [
    'Exactly one adult rooster crow at medium farmyard distance, full natural call, dry with light outdoor air, no hens, no repeated crowing, no human voice, no music.',
    'Exactly one shorter adult rooster crow, brisk morning call at medium distance, natural farm recording, no flock, no human voice, no music.',
    'Exactly one adult rooster warning cluck and sharp wing rustle at close range, alert but not attacking, no crow, no hens, no human voice, no music.',
  ]),
  ...variants('turkey', 1, [
    'Exactly one adult turkey gobble phrase at medium distance, natural resonant farm bird call, dry recording, no flock, no human voice, no music.',
    'Exactly two quiet adult turkey clucks at close range, curious and natural, no gobble, no flock, no human voice, no music.',
    'Exactly one soft adult turkey purr and breathy trill at close range, calm natural call, no gobble, no flock, no human voice, no music.',
  ]),
  ...variants('dove', 1, [
    'Exactly one gentle white dove coo phrase at close range, soft rounded two-note call, dry natural recording, no flock, no wing noise, no human voice, no music.',
    'Exactly one longer soothing dove coo with a quiet breath between notes, close and natural, no flock chorus, no human voice, no music.',
    'A single dove lands nearby: exactly two soft wing flaps, a light perch contact and one faint coo, compact natural Foley, no flock, no music.',
  ]),
  ...variants('bee', 1, [
    'One honey bee hovers close for a brief moment: focused natural wing buzz with a small pitch drift, isolated, no swarm, no music, no human voice.',
    'One honey bee makes a quick close fly-by from one side to the other, short natural Doppler-like wing buzz, no swarm, no sting, no music.',
    'One honey bee lands on a flower and buzzes in two short pulses, tiny close natural insect Foley, no swarm ambience, no music, no human voice.',
  ]),
  ...variants('duck', 1, [
    'Exactly one adult farm duck quack at close range, clear natural medium-pitch call, dry recording, no flock, no water ambience, no human voice, no music.',
    'Exactly two short adult duck quacks at close range, conversational and relaxed, natural dry recording, no flock chorus, no music.',
    'Exactly one softer raspy adult duck quack and tiny feather rustle, close natural farm bird recording, no flock, no human voice, no music.',
  ]),
  ...variants('duckling', 1, [
    'Exactly three tiny duckling peeps at close range, bright gentle juvenile calls, dry natural recording, no adult duck, no flock bed, no human voice, no music.',
    'Exactly one questioning duckling peep followed by a tiny breath, close and natural, no other birds, no human voice, no music.',
    'A duckling makes two excited peeps and one soft webbed-foot patter step, compact close Foley, no water splash, no flock, no music.',
  ]),
  ...variants('dog', 1, [
    'Exactly one friendly medium farm dog bark at close range, clear natural woof, alert but not aggressive, dry recording, no other dogs, no human voice, no music.',
    'Exactly two soft friendly farm dog woofs at medium distance, relaxed and welcoming, no growl, no pack, no human voice, no music.',
    'Exactly one gentle dog whine followed by a quiet panting breath, close and friendly, no barking, no distress, no human voice, no music.',
  ]),
  ...variants('cat', 1, [
    'Exactly one friendly adult farm cat meow at close range, natural medium pitch, dry recording, no kittens, no human voice, no music.',
    'Exactly one short adult cat chirp-trill greeting at close range, bright and friendly, natural dry recording, no meow sequence, no music.',
    'A contented adult farm cat gives one audible purr pulse and soft nasal breath at close range, compact and natural, no meow, no music.',
  ]),
  ...variants('donkey', 1, [
    'Exactly one adult donkey bray at medium farm distance, full natural hee-haw phrase, dry with light outdoor air, no other donkeys, no human voice, no music.',
    'Exactly one shorter adult donkey bray, compact rising then falling call, natural farm recording, no herd, no human voice, no music.',
    'Exactly one adult donkey nasal snort and low grumble at close range, calm animal Foley, no bray, no hoofbeats, no human voice, no music.',
  ]),
  ...variants('parrot', 1, [
    'Exactly one colourful parrot squawk at close range, bright natural bird call, expressive but not harsh, no words, no flock, no human voice, no music.',
    'Exactly one short parrot chatter phrase made only of natural nonverbal clicks and chirps, no intelligible speech, close dry recording, no music.',
    'Exactly two friendly parrot chirps with one small wing rustle, close natural bird recording, no words, no flock, no music.',
  ]),
  ...variants('chick', 1, [
    'Exactly three tiny newly hatched chick peeps at close range, warm gentle juvenile calls, dry natural recording, no hen, no brood chorus, no human voice, no music.',
    'Exactly one bright questioning baby chick peep followed by a tiny breath, very close and natural, no other birds, no music.',
    'A baby chick makes two quick excited peeps and one tiny straw step rustle, compact natural farm Foley, no hen, no flock bed, no music.',
  ]),
];

export const SFX_BRIEFS = [
  {
    id: 'ui.click',
    file: 'ui_click.mp3',
    durationSeconds: 0.5,
    maxDurationSeconds: 0.18,
    promptInfluence: 0.72,
    prompt:
      'One isolated soft muted wooden UI tick, very short and low velocity, dry close recording, rounded transient, no tail, no reverb, no music, no speech, silence otherwise.',
  },
  {
    id: 'ui.confirm',
    file: 'ui_confirm.mp3',
    durationSeconds: 0.7,
    maxDurationSeconds: 0.65,
    promptInfluence: 0.68,
    prompt:
      'One isolated warm two-note rising confirmation chime on small wooden marimba bars, gentle and rustic, soft attack, dry, no reverb, no music bed, no speech.',
  },
  {
    id: 'ui.deny',
    file: 'ui_deny.mp3',
    durationSeconds: 0.6,
    maxDurationSeconds: 0.5,
    gainDb: 20,
    promptInfluence: 0.82,
    prompt:
      'One clearly audible isolated low wooden refusal thud with a slight downward pitch bend, compact and friendly rather than harsh, firm rounded transient, dry close recording, no buzzer, no reverb, no music, no speech.',
  },
  {
    id: 'ui.open',
    file: 'ui_open.mp3',
    durationSeconds: 0.7,
    maxDurationSeconds: 0.65,
    promptInfluence: 0.66,
    prompt:
      'One isolated light canvas satchel flap and paper rustle opening, short and airy, tactile rustic interface sound, dry close recording, no reverb, no music, no speech.',
  },
  {
    id: 'farm.plant',
    file: 'farm_plant.mp3',
    durationSeconds: 0.8,
    maxDurationSeconds: 0.75,
    promptInfluence: 0.7,
    prompt:
      'A farmer hand presses one seed into loose slightly damp soil: a soft granular earth crunch with a tiny low palm thump, close and tactile, dry outdoor Foley, no footsteps, no voice, no music.',
  },
  {
    id: 'farm.tend',
    file: 'farm_tend.mp3',
    durationSeconds: 1,
    maxDurationSeconds: 0.95,
    promptInfluence: 0.68,
    prompt:
      'One short pour from a metal watering can over broad crop leaves, wet hiss and light droplet patter tail, close dry farm Foley, gentle, no river ambience, no voice, no music.',
  },
  {
    id: 'farm.harvest',
    file: 'farm_harvest.mp3',
    durationSeconds: 1.2,
    maxDurationSeconds: 1.1,
    promptInfluence: 0.7,
    prompt:
      'Harvesting one ripe crop by hand: crisp stalk snap, brief leafy rustle, then a small satisfied wooden basket knock, close dry farm Foley, no voice, no music.',
  },
  {
    id: 'farm.footstep',
    file: 'farm_footstep.mp3',
    durationSeconds: 0.5,
    maxDurationSeconds: 0.35,
    promptInfluence: 0.84,
    prompt:
      'Exactly one clearly audible leather work boot step on dry packed red earth, firm dusty compact heel-and-sole impact at close range, no second step, no gravel scatter, no reverb, no ambience, no music, no speech.',
  },
  {
    id: 'farm.cart_roll',
    file: 'farm_cart_roll.mp3',
    durationSeconds: 0.8,
    maxDurationSeconds: 0.8,
    promptInfluence: 0.74,
    prompt:
      'One short movement beat from a small wooden farm cart on packed red earth: wheel rolls over one shallow rut, dry wood axle creaks once, compact and close, no horse, no engine, no footsteps, no ambience, no voice, no music.',
  },
  {
    id: 'farm.pickup',
    file: 'farm_pickup.mp3',
    durationSeconds: 0.9,
    maxDurationSeconds: 0.9,
    promptInfluence: 0.72,
    prompt:
      'A small wooden produce crate is lifted cleanly from dry soil by hand: brief canvas grip rustle, light wood scrape leaving the ground, compact tactile farm Foley, no footsteps, no voice, no music.',
  },
  {
    id: 'farm.deposit',
    file: 'farm_deposit.mp3',
    durationSeconds: 0.9,
    maxDurationSeconds: 0.9,
    promptInfluence: 0.74,
    prompt:
      'A carried wooden produce crate is set firmly but carefully onto a timber store floor: one low wood contact thump and tiny settling knock, close dry farm Foley, no breaking wood, no voice, no music.',
  },
  {
    id: 'farm.shoo_animals',
    file: 'farm_shoo_animals.mp3',
    durationSeconds: 1.2,
    maxDurationSeconds: 1.2,
    promptInfluence: 0.78,
    prompt:
      'A farmer drives livestock toward shelter without speaking: exactly two quick bare-hand claps, one firm boot scuff on packed earth, and a brief nearby movement of straw, decisive but gentle, no human words, no animal calls, no music.',
  },
  {
    id: 'farm.repair',
    file: 'farm_repair.mp3',
    durationSeconds: 1.3,
    maxDurationSeconds: 1.3,
    promptInfluence: 0.74,
    prompt:
      'One compact farm repair action by hand: short metal ratchet turn, one controlled wooden tool knock, then a small secure latch click, close dry Foley, successful maintenance without a reward chime, no voice, no music.',
  },
  {
    id: 'farm.build_place',
    file: 'farm_build_place.mp3',
    durationSeconds: 0.8,
    maxDurationSeconds: 0.7,
    gainDb: 10,
    promptInfluence: 0.72,
    prompt:
      'One timber fence post dropped firmly into an earth socket, solid low wooden thunk followed by one short settling knock, dry close farm Foley, no construction ambience, no voice, no music.',
  },
  {
    id: 'farm.build_complete',
    file: 'farm_build_complete.mp3',
    durationSeconds: 1.6,
    maxDurationSeconds: 1.5,
    promptInfluence: 0.7,
    prompt:
      'Three quick hand-hammer strikes on timber followed by a warm two-note rising wooden marimba chime, modest rustic accomplishment, dry and compact, no fanfare, no voice, no background music.',
  },
  {
    id: 'processing.start',
    file: 'processing_start.mp3',
    durationSeconds: 1.6,
    maxDurationSeconds: 1.6,
    promptInfluence: 0.74,
    prompt:
      'A small belt-driven farm processing machine starts one batch: leather belt catches, wooden gear turns twice, restrained metal mechanism settles into motion, close and compact, no long loop, no engine, no alarm, no voice, no music.',
  },
  {
    id: 'processing.complete',
    file: 'processing_complete.mp3',
    durationSeconds: 2.4,
    maxDurationSeconds: 2.4,
    fadeOutSeconds: 0.35,
    promptInfluence: 0.72,
    prompt:
      'A small farm processing machine finishes one batch: mechanism winds down, one finished bundle drops into a wooden tray, followed by a subtle wooden completion tick, close dry Foley. The complete action must finish within 1.6 seconds and decay to clean silence for the rest of the file. No cash sound, no voice, no music.',
  },
  {
    id: 'market.sell',
    file: 'market_sell.mp3',
    durationSeconds: 1,
    maxDurationSeconds: 0.95,
    promptInfluence: 0.7,
    prompt:
      'A few small metal coins dropped into a wooden farmstand bowl, bright warm clinks with a short wood resonance, isolated dry Foley, modest payout, no cash register, no voice, no music.',
  },
  {
    id: 'market.contract',
    file: 'market_contract.mp3',
    durationSeconds: 1.4,
    maxDurationSeconds: 1.3,
    promptInfluence: 0.72,
    prompt:
      'Several coins land in a wooden bowl, then one firm paper contract stamp thump, heavier and more official than a small sale, isolated dry farmstand Foley, no cash register, no voice, no music.',
  },
  {
    id: 'market.big_payout',
    file: 'market_big_payout.mp3',
    durationSeconds: 1.8,
    maxDurationSeconds: 1.7,
    promptInfluence: 0.68,
    prompt:
      'A generous handful of small coins cascades into a wooden bowl with a subtle warm low bell underneath, rewarding but not casino-like, isolated dry Foley, no cash register, no voice, no music bed.',
  },
  {
    id: 'event.warning',
    file: 'event_warning.mp3',
    durationSeconds: 1.9,
    maxDurationSeconds: 1.8,
    promptInfluence: 0.84,
    prompt:
      'Exactly two clearly audible slow low wooden warning knocks outdoors, solid hollow timber transients with restrained resonance and plenty of space between them, uneasy and unmistakable but not frightening, no melody, no voice, no storm ambience.',
  },
  {
    id: 'event.impact',
    file: 'event_impact.mp3',
    durationSeconds: 2.1,
    maxDurationSeconds: 2,
    promptInfluence: 0.68,
    prompt:
      'A sudden dry outback wind gust passes over crops with a restrained low earth rumble, something has gone wrong outdoors, serious but not cinematic, no thunder crack, no voice, no music.',
  },
  {
    id: 'event.prevented',
    file: 'event_prevented.mp3',
    durationSeconds: 1.3,
    maxDurationSeconds: 1.2,
    promptInfluence: 0.72,
    prompt:
      'A solid wooden gate latch closes securely, followed by a short reassuring low two-note wooden chime, safe and resolved, isolated dry Foley, no voice, no music bed.',
  },
  {
    id: 'incident.drought_warning',
    file: 'incident_drought_warning.mp3',
    durationSeconds: 2.5,
    maxDurationSeconds: 2.5,
    promptInfluence: 0.76,
    prompt:
      'An isolated drought warning on a quiet farm: one dry wind pass over brittle grass and crop leaves, followed by a strained old timber fence creak, uneasy and sparse. The warning action must finish within 1.7 seconds and decay to clean silence for the rest of the file. No thunder, no rain, no animals, no voice, no music.',
  },
  {
    id: 'incident.drought_impact',
    file: 'incident_drought_impact.mp3',
    durationSeconds: 1.8,
    maxDurationSeconds: 1.8,
    promptInfluence: 0.76,
    prompt:
      'Parched farm soil cracks open at close range: one sharp earthen split, granular dry dirt crumble, and a short dusty gust over leaves, serious but natural, no cinematic boom, no voice, no music.',
  },
  {
    id: 'incident.fox_raid_warning',
    file: 'incident_fox_raid_warning.mp3',
    durationSeconds: 1.4,
    maxDurationSeconds: 1.4,
    promptInfluence: 0.8,
    prompt:
      'A fox raid warning from the farm treeline: one distant thin red fox yip, then one twig snap and a brief nervous movement through dry grass, alerting but not frightening, no growl, no other animals, no voice, no music.',
  },
  {
    id: 'incident.cart_axle_warning',
    file: 'incident_cart_axle_warning.mp3',
    durationSeconds: 1.6,
    maxDurationSeconds: 1.6,
    promptInfluence: 0.78,
    prompt:
      'A loaded wooden farm cart warns of failure: axle groans under weight, wheel hub gives one dry high squeak, and timber flexes without breaking, close isolated Foley, no horse, no voice, no music.',
  },
  {
    id: 'incident.cart_axle_impact',
    file: 'incident_cart_axle_impact.mp3',
    durationSeconds: 1.6,
    maxDurationSeconds: 1.6,
    promptInfluence: 0.8,
    prompt:
      'A wooden farm cart axle fails at close range: one hard timber snap, wheel drops with a low wooden thud, and a modest produce load lands in soft mud, no crash pileup, no animal, no voice, no music.',
  },
  {
    id: 'incident.road_washout_warning',
    file: 'incident_road_washout_warning.mp3',
    durationSeconds: 1.8,
    maxDurationSeconds: 1.8,
    promptInfluence: 0.76,
    prompt:
      'A rural road washout warning: shallow fast water rises through roadside gravel, several small stones shift and roll, damp earth loosens, compact isolated outdoor Foley, no thunder, no vehicle, no voice, no music.',
  },
  {
    id: 'incident.road_washout_impact',
    file: 'incident_road_washout_impact.mp3',
    durationSeconds: 2,
    maxDurationSeconds: 2,
    promptInfluence: 0.78,
    prompt:
      'A small muddy farm road edge collapses into rushing runoff: compact wet earth slump, gravel slide, then a brief stronger water rush, serious but not cinematic, no thunder, no vehicle, no voice, no music.',
  },
  {
    id: 'incident.blight_warning',
    file: 'incident_blight_warning.mp3',
    durationSeconds: 1.5,
    maxDurationSeconds: 1.5,
    promptInfluence: 0.78,
    prompt:
      'A crop blight warning heard close to one field bed: healthy leaves rustle, then one leaf dries, curls and crackles unnaturally, sparse papery plant Foley, no insects, no wind gust, no voice, no music.',
  },
  {
    id: 'incident.blight_impact',
    file: 'incident_blight_impact.mp3',
    durationSeconds: 1.7,
    maxDurationSeconds: 1.7,
    promptInfluence: 0.78,
    prompt:
      'Crop blight takes hold across a small patch: several broad leaves rapidly crisp, curl and shed with brittle papery crackles, close dry plant Foley, no fire, no insects, no voice, no music.',
  },
  {
    id: 'incident.processor_breakdown_warning',
    file: 'incident_processor_breakdown_warning.mp3',
    durationSeconds: 1.7,
    maxDurationSeconds: 1.7,
    promptInfluence: 0.8,
    prompt:
      'A small belt-driven farm processor warns it is failing: leather belt squeals briefly, loose metal housing rattles three times, mechanism continues under strain, close isolated machinery Foley, no alarm siren, no voice, no music.',
  },
  {
    id: 'incident.processor_breakdown_impact',
    file: 'incident_processor_breakdown_impact.mp3',
    durationSeconds: 1.8,
    maxDurationSeconds: 1.8,
    promptInfluence: 0.8,
    prompt:
      'A small farm processor seizes: belt slaps loose, one hard metal clunk stops the mechanism, then a short descending mechanical whirr dies away, close and serious, no explosion, no alarm, no voice, no music.',
  },
  {
    id: 'incident.cold_snap_warning',
    file: 'incident_cold_snap_warning.mp3',
    durationSeconds: 1.8,
    maxDurationSeconds: 1.8,
    promptInfluence: 0.74,
    prompt:
      'A cold snap warning arrives on a quiet farm: sudden thin winter wind through timber slats with a few tiny ice crystals ticking against wood, sparse and unmistakably cold, no blizzard, no voice, no music.',
  },
  {
    id: 'incident.cold_snap_impact',
    file: 'incident_cold_snap_impact.mp3',
    durationSeconds: 1.8,
    maxDurationSeconds: 1.8,
    promptInfluence: 0.76,
    prompt:
      'Hard frost rapidly forms over stored farm goods: one brittle icy crack spreads, dry containers tighten and creak, followed by a compact cold gust, no breaking glass, no storm, no voice, no music.',
  },
  {
    id: 'animal.fox_alert',
    file: 'animal_fox_alert.mp3',
    durationSeconds: 0.8,
    maxDurationSeconds: 0.75,
    promptInfluence: 0.78,
    prompt:
      'One short sharp red fox bark from medium distance, thin urgent slightly panicked call, isolated outdoors with almost no ambience, no growl sequence, no other animals, no music.',
  },
  {
    id: 'animal.fox_flee',
    file: 'animal_fox_flee.mp3',
    durationSeconds: 1,
    maxDurationSeconds: 0.95,
    promptInfluence: 0.72,
    prompt:
      'A startled fox gives one quick receding yelp while dry grass and scrub rustle as it bolts away, brief and relieving rather than alarming, no other animals, no voice, no music.',
  },
  {
    id: 'animal.chicken',
    file: 'animal_chicken.mp3',
    durationSeconds: 0.8,
    maxDurationSeconds: 0.75,
    promptInfluence: 0.76,
    prompt:
      'One soft contented hen cluck at close range, dry and friendly, no rooster, no flock chorus, no barn ambience, no human voice, no music.',
  },
  {
    id: 'animal.sheep',
    file: 'animal_sheep.mp3',
    durationSeconds: 1.2,
    maxDurationSeconds: 1.2,
    promptInfluence: 0.82,
    prompt:
      'Exactly one calm adult sheep bleat at close range, natural medium pitch, friendly farm animal call, dry recording with almost no barn ambience, no lamb, no flock chorus, no human voice, no music.',
  },
  {
    id: 'animal.cow',
    file: 'animal_cow.mp3',
    durationSeconds: 1.6,
    maxDurationSeconds: 1.6,
    promptInfluence: 0.82,
    prompt:
      'Exactly one gentle adult dairy cow lowing call at close range, warm and unhurried, natural farm animal vocal, dry recording with almost no barn ambience, no herd chorus, no human voice, no music.',
  },
  {
    id: 'animal.raid_loss',
    file: 'animal_raid_loss.mp3',
    durationSeconds: 1.4,
    maxDurationSeconds: 1.3,
    promptInfluence: 0.7,
    prompt:
      'A brief startled chicken wing flutter and two distressed clucks scattering away, gentle game loss cue without injury sounds, dry farm Foley, no predator growl, no voice, no music.',
  },
  {
    id: 'season.transition',
    file: 'season_transition.mp3',
    durationSeconds: 3.2,
    maxDurationSeconds: 3.2,
    promptInfluence: 0.66,
    prompt:
      'A short rustic season-turn cue: one airy breeze lifts a few dry leaves, followed by a warm ascending three-note phrase on small wooden marimba bars and soft acoustic strings, reflective rather than triumphant. The phrase and its natural decay must finish within 2.3 seconds, followed by clean silence. No voice, no background music.',
  },
  {
    id: 'goal.land_purchased',
    file: 'goal_land_purchased.mp3',
    durationSeconds: 2.4,
    maxDurationSeconds: 2.3,
    promptInfluence: 0.66,
    prompt:
      'A warm ascending four-note phrase played by wooden marimba and soft acoustic strings, ending with one low bell, earned and expansive rustic achievement, no orchestra, no voice, no background music.',
  },
  {
    id: 'run.success',
    file: 'run_success.mp3',
    durationSeconds: 2.6,
    maxDurationSeconds: 2.5,
    promptInfluence: 0.64,
    prompt:
      'A compact bright major success sting on acoustic guitar, wooden percussion and soft fiddle, warm rustic farm character, about two seconds, celebratory without sounding epic, no voice, no ongoing music bed.',
  },
  {
    id: 'run.fail',
    file: 'run_fail.mp3',
    durationSeconds: 2.3,
    maxDurationSeconds: 2.2,
    promptInfluence: 0.66,
    prompt:
      'A short slow descending minor phrase on muted wooden marimba and soft cello, gentle sympathetic setback cue, never mocking or ominous, no voice, no ongoing music bed.',
  },
  ...additionalAnimalVariants,
];

function variants(animal, firstIndex, prompts) {
  return namedVariants(animal, firstIndex, prompts);
}

function namedVariants(animal, firstIndex, prompts) {
  return prompts.map((prompt, offset) => {
    const index = firstIndex + offset;
    return {
      id: `animal.${animal}_${index}`,
      file: `animal_${animal}_${index}.mp3`,
      durationSeconds: 1.6,
      // Keep the complete generated one-shot. Several calls (especially
      // crows, brays and excited juvenile peeps) remain active at 1.5s but
      // settle into silence during the final tenth, so truncating at 1.5s
      // creates an audible hard edge.
      maxDurationSeconds: 1.6,
      promptInfluence: 0.82,
      prompt,
    };
  });
}

const LOOP_REQUIREMENTS =
  'Long-form instrumental background music for a warm stylized low-poly farming game. Continuous cyclical underscore in 4/4 with clear four-bar phrases and a steady unhurried pulse. No vocals, no spoken words, no sound effects, no dramatic hits, no cinematic trailer build, and no large arrangement changes. Begin immediately inside the established groove with no intro. Sustain subtle variation without building to a climax. Finish on the same tonic harmony, pulse, instrumentation, and texture as the opening, with no outro, final cadence, ritardando, held ending note, or fade-out, so a four-bar circular crossfade returns naturally to the opening. Keep the midrange clear for UI and warning sounds.';

export const MUSIC_BRIEFS = [
  {
    id: 'music.sunrise_rows',
    file: 'sunrise_rows.mp3',
    title: 'Sunrise Rows',
    bpm: 60,
    sourceBars: 64,
    crossfadeBars: 4,
    loopRotationBars: 30,
    prompt: `${LOOP_REQUIREMENTS} Strict 60 BPM in C major. Fingerpicked acoustic guitar, soft wooden marimba, upright bass, and very light brushed hand percussion. Optimistic early-morning mood, simple memorable pentatonic motif, sparse arrangement.`,
  },
  {
    id: 'music.market_day',
    file: 'market_day.mp3',
    title: 'Market Day',
    bpm: 64,
    sourceBars: 68,
    crossfadeBars: 4,
    loopRotationBars: 32,
    prompt: `${LOOP_REQUIREMENTS} Strict 64 BPM in D major. Gentle mandolin, muted acoustic guitar, pizzicato upright bass, and restrained shaker. Friendly productive daytime mood, playful but never busy, no bluegrass virtuosity.`,
  },
  {
    id: 'music.rain_on_tin',
    file: 'rain_on_tin.mp3',
    title: 'Rain on Tin',
    bpm: 58,
    sourceBars: 64,
    crossfadeBars: 4,
    loopRotationBars: 30,
    prompt: `${LOOP_REQUIREMENTS} Strict 58 BPM in G major with a touch of E minor warmth. Nylon-string guitar, soft accordion breaths, bowed fiddle harmonics, and low upright bass. Reflective sheltered afternoon mood, calm and comforting, no literal rain audio.`,
  },
  {
    id: 'music.golden_harvest',
    file: 'golden_harvest.mp3',
    title: 'Golden Harvest',
    bpm: 66,
    sourceBars: 72,
    crossfadeBars: 4,
    loopRotationBars: 34,
    prompt: `${LOOP_REQUIREMENTS} Strict 66 BPM in A major. Dulcimer or muted banjo plucks, acoustic guitar, cello pizzicato, and small wooden hand percussion. Satisfied harvest-time warmth, gently buoyant, rustic rather than country-pop.`,
  },
  {
    id: 'music.quiet_outback',
    file: 'quiet_outback.mp3',
    title: 'Quiet Outback',
    bpm: 56,
    sourceBars: 60,
    crossfadeBars: 4,
    loopRotationBars: 28,
    prompt: `${LOOP_REQUIREMENTS} Strict 56 BPM in F major. Sparse fingerpicked guitar, soft viola, wooden flute used very lightly, and a warm low drone. Wide peaceful evening feeling, contemplative and comfortable for long play sessions, no ambient wind audio.`,
  },
];

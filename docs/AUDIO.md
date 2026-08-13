# Audio direction and pipeline

FarmRise Tycoon's audio is warm, tactile and rustic. Wood, soil, canvas, water and small acoustic
instruments carry the identity. Harsh digital bleeps, casino-style rewards, cinematic impacts and
constant ambient noise are deliberately excluded: this is a patient farming game, and the warning
cues need clear space around them.

## Runtime structure

```
ElevenLabs source generation        Browser runtime
tools/audio/audioBriefs.mjs         AssetLoader prefetches encoded bytes
          │                                      │
          ▼                                      ▼ first user gesture
tools/audio/generateAudio.mjs       AudioSystem unlocks AudioContext
          │                                      │
          ├─ art/audio/source/                   ├─ procedural fallback registers
          ├─ art/audio/generation_report.json   ├─ MP3 clips decode over the same ids
          └─ public/assets/audio/                └─ bootstrap event bindings play them
```

- `AudioSystem` remains game-agnostic. It owns the `master`, `music`, `sfx` and `ui` gain buses,
  browser gesture unlocking, decoded buffers and playback handles.
- `assets/audio/` owns stable ids, generation briefs and procedural fallbacks.
- `assets/manifests/audio.manifest.ts` owns URLs, measured bytes, load phases and clip metadata.
- `bootstrap/bindAudio.ts` is the deliberate meeting point between game events and sounds.
- `bootstrap/MusicPlayer.ts` owns the selected song, per-song enablement, counted repeats, lazy
  loading and decoded-buffer release.
- Real clips are optional. The procedural buffers register first and remain available if a fetch or
  decode fails, so audio can degrade in quality without breaking play.
- On desktop, only `music.sunrise_rows` is prefetched and decoded. The other four tracks are lazy
  assets; loading them at boot would add about 15.6 MB of network traffic and roughly 374.7 MB of
  decoded stereo PCM. The four-minute default alone decodes to about 92.2 MB, so alternatives must
  remain lazy. The music selector releases the previous decoded buffer before loading another.
- The capability-gated mobile profile does not fetch or decode the default MP3. It renders the same
  stable ids as distinct 26-second mono procedural variants at at most 22,050 Hz, roughly 2.35 MB
  for the one active song. Sound effects still decode from their generated files and retain
  procedural fallback.

## Action audit

The rule is: sound what the player caused or must notice. Continuous simulation and passive number
changes stay quiet.

| Action or event | Cue | Status and rationale |
| --- | --- | --- |
| Work the farm button | `ui.confirm` | Wired. A warm commitment cue, not a generic click. |
| Open settings | `ui.open` | Wired from menu and pause. Canvas/paper texture matches the panel. |
| Settings back / debug toggle | `ui.click` | Wired. The volume sliders stay quiet while dragged to avoid chatter. |
| Pause from keyboard or button | `ui.open` | Wired through the state machine, so keyboard pause is covered. |
| Resume | `ui.confirm` | Wired through the state machine. |
| Return to menu | `ui.click` | Wired through the state machine. |
| Farm scene ready | `ui.confirm` | Wired after loading completes. |
| Farm scene load failure | `ui.deny` | Wired; the accompanying toast carries the detail. |
| Cycle selected crop | `ui.click` | Wired. Low volume because the player may cycle repeatedly. |
| Refused interaction | `ui.deny` | Wired. Soft and non-punitive because experimentation is encouraged. |
| Plant | `farm.plant` | Wired to successful interaction only. Soil press and granular crunch. |
| Tend | `farm.tend` | Wired to successful interaction only. Short watering-can pour. |
| Harvest | `farm.harvest` | Wired. Snap, leaf rustle and basket knock communicate completion. |
| Pick up field or processor goods | `farm.pickup` | Wired for both context Work and the haul shortcut. Crate lift and canvas grip replace the old harvest sound. |
| Put carried goods into storage | `farm.deposit` | Wired for both context Work and the haul shortcut. A settled crate thump replaces the old building-placement cue. |
| Walk / sprint | `farm.footstep` | Wired by distance travelled, not frame count. Sprinting is louder; pitch jitter prevents fatigue. |
| Move with a handcart or larger carrier | `farm.cart_roll` | Wired from the same distance cadence as footsteps, but swaps to a short wheel-and-axle movement beat while a carrier is selected. |
| Repair a structure, route or processor | `farm.repair` | Wired to both direct repair and incident repair work. Ratchet, knock and latch are distinct from construction. |
| Drive animals into shelter | `farm.shoo_animals` | Wired only to the `move_animals` response. Two hand claps and a boot scuff replace the unrelated watering sound. |
| Crop growth tick / crop becomes ready | None | Intentionally silent. Several plots can update together and would create notification spam. |
| Place a building | `farm.build_place` | Wired end to end. The reinvest panel selects, the pointer positions, and a click or touch tap commits. |
| Open build menu (`B`) | `ui.open` / `ui.click` | Wired. The reinvest panel opens on `B` and closes on `B`, `Esc` or its own button. |
| Construction completes | `farm.build_complete` | Wired. Three hammer strikes plus a modest achievement chime. |
| Buy an animal | `animal.chicken` / `animal.sheep` / `animal.cow` | Wired by species end to end via the reinvest panel. Each implemented livestock species has one restrained natural call. |
| Animal produces goods | Species call | Eggs, wool and milk trigger the matching animal at low volume. Processor output does not masquerade as an animal. |
| Animal misses a feed cycle | Species call | Wired quietly because the player must notice the stalled production, but it fires only at the missed cycle rather than looping. |
| Animal loss | `animal.raid_loss` | Wired at the authoritative loss event, so direct incident loss and a successful fox attack share one cue without double-playing. |
| Storage overflows | `ui.deny` | Wired quietly; the HUD toast explains what was lost. |
| Open / close market panel | `ui.open` / `ui.click` | Wired. The panel is mounted and opens on `M`. |
| Spot sale | `market.sell` | Wired end to end. |
| Contract fulfilment | `market.contract` | Wired end to end; heavier than a spot sale. Contracts are generated locally when offline. |
| Payout at least 8,000 cents | `market.big_payout` | Wired as a reusable payout tier. |
| Generic balance or upkeep change | None | Intentionally silent. Upkeep can change money frequently and is not a discrete player action. |
| Event warning | Incident-specific warning | Wired on the `ui` bus at full volume. Every implemented incident is identifiable before impact; `event.warning` remains only as a future-content fallback. |
| Unmitigated event impact | Incident-specific impact | Drought, axle failure, road washout, blight, processor seizure and cold snap have distinct physical consequences. Fox arrival uses `animal.fox_alert`; `event.impact` remains the fallback. |
| Prevention succeeds | `event.prevented` | Wired. Gate latch plus reassuring low chime. |
| Prevention is refused | `ui.deny` | Wired. `F` outside a warning window explains itself in a toast. |
| Foxes spawn | `animal.fox_alert` | Wired on the `ui` bus because it opens an active response window. |
| Fox scared away | `animal.fox_flee` | Wired. A receding yelp and scrub rustle, distinct from the alert. |
| Fox raid takes an animal | `animal.raid_loss` | Wired. Wing flutter and distressed clucks without injury audio. |
| Queue a processor batch | `processing.start` | Wired from the processor model. Belt catch and wooden gears confirm that stored inputs became active work. |
| Processor completes goods | `processing.complete` | Wired from the processor model before the output stack refresh. Machine wind-down and tray drop identify finished production. |
| Buy neighbouring land | `goal.land_purchased` | Wired end to end. This is the slice's success condition. |
| Claim a milestone / finish a town project | `goal.land_purchased` / `farm.build_complete` | Wired to the long-horizon director events. Existing accomplishment language is reused because the meaning is recognition or completed labour. |
| Season changes | `season.transition` | Wired once at the calendar boundary. Breeze, leaves and a short wooden phrase replace the generic run-success sting. |
| Contract failure / financial warning / restructuring | `ui.deny` / `run.fail` | Wired on the `ui` bus. Routine warnings stay compact; restructuring receives the sympathetic setback phrase. |
| Run succeeds / fails | `run.success` / `run.fail` | Wired to the outcome screen on the `ui` bus. |
| Onboarding beat shown | `ui.open` (quiet) | Wired. Low volume so a prompt never competes with the action it is describing. |
| Onboarding beat completed | `ui.confirm` (quiet) | Wired. A small confirmation that the player did the thing. |
| Open / close reinvest panel | `ui.open` / `ui.click` | Wired. |
| Backquote debug action | None yet | The binding exists, but the runtime overlay toggle is not implemented. The settings checkbox already uses `ui.click`. |
| Network reconnect/auth refresh, camera motion, HUD polling | None | Intentionally silent; there is no player-facing network control, and continuous presentation must not chatter. |

## Sound-effect catalog

All effects are mono MP3 at 44.1 kHz and 96 kbps. The whole delivered effect set is **1,930,539
bytes**. Repeated effects use runtime detune rather than storing multiple near-identical files.

| Group | Files | Design role |
| --- | --- | --- |
| UI | `ui_click`, `ui_confirm`, `ui_deny`, `ui_open` | A small wooden/canvas vocabulary reused across screens and confirmations. |
| Farm work | `farm_plant`, `farm_tend`, `farm_harvest`, `farm_footstep` | Close, dry, hand-scale Foley that makes direct work feel physical. |
| Building | `farm_build_place`, `farm_build_complete` | Placement is weight; completion is labour plus restrained reward. |
| Market | `market_sell`, `market_contract`, `market_big_payout` | Three economic tiers without electronic cash-register language. |
| Events | `event_warning`, `event_impact`, `event_prevented` | Warning, consequence and safety are unmistakably different. |
| Direct handling | `farm_pickup`, `farm_deposit`, `farm_shoo_animals`, `farm_repair`, `farm_cart_roll` | Semantic action feedback that no longer borrows harvest, watering or building sounds. |
| Processing | `processing_start`, `processing_complete` | One-shots at queue and completion; no unmanaged machinery loops. |
| Incident identities | 13 `incident_*` files | Seven unique warnings and six physical impacts. Fox impact reuses its dedicated attack bark. |
| Animals | Fox cues plus 60 farm-animal variants | The 20-animal reference library has three distinct one-shots per animal. Hen, sheep and cow variants rotate in current gameplay; the other 51 clips remain lazy until those animals exist. |
| Seasons | `season_transition` | Reserved for the calendar boundary. |
| Outcomes | `goal_land_purchased`, `run_success`, `run_fail` | Short acoustic stings reserved for major progression. |

The exact prompts, requested durations and prompt-influence settings are in
`tools/audio/audioBriefs.mjs`. The generated request metadata, delivered duration, byte count and
music seam measurement are in `art/audio/generation_report.json`.

### Farm-animal reference library

The supplied reference sheet is represented by 20 named animals and exactly three distinct
one-shots per animal. Stable ids live in `assets/audio/animalSoundVariants.ts`; generated files and
measured lazy/preload policy live in `assets/manifests/animalAudio.manifest.ts`.

| Animal | Three authored meanings |
| --- | --- |
| Cow | Long low, short contact moo, contented nasal low/breath |
| Pig | Oink, relaxed grunts, brief excited squeal |
| Horse | Neigh, friendly whinny, relaxed snort |
| Goat | Full bleat, short questioning maa, contented grunts |
| Pigeon | Rounded coo, brighter coo, takeoff flutter and faint coo |
| Rabbit | Sniff/tooth-purr, hind-foot thump, quiet squeak |
| Sheep | Calm bleat, short questioning baa, low contented bleat |
| Deer | Doe contact bleat, alarm snort, low contact grunt |
| Hen | Contented cluck, egg-laying cackle, soft bok-bok pair |
| Rooster | Full crow, short crow, warning cluck and wing rustle |
| Turkey | Gobble, quiet clucks, soft purr/trill |
| Dove | Soft coo, longer coo, landing flutter and faint coo |
| Bee | Hover buzz, fly-by buzz, flower-landing buzz pulses |
| Duck | Clear quack, two conversational quacks, soft raspy quack |
| Duckling | Three peeps, questioning peep, excited peeps and tiny step |
| Dog | Friendly bark, two soft woofs, gentle whine and breath |
| Cat | Meow, chirp-trill, contented purr pulse |
| Donkey | Full bray, short bray, nasal snort/grumble |
| Parrot | Squawk, nonverbal chatter, friendly chirps and wing rustle |
| Chick | Three peeps, questioning peep, excited peeps and straw step |

Hen, sheep and cow use round-robin playback so repeated purchases, production cycles and missed feed
cycles do not replay one identical call. Future-only animals remain encoded but lazy: adding a pig
definition later does not require regenerating audio, while today's browser does not fetch or decode
pig clips.

## Background music

The five loops were generated with Eleven Music v2 as forced instrumentals, then circularly
crossfaded and loudness-normalised. Delivered files are stereo MP3 at 48 kHz and 128 kbps. Each is
a distinct long-form ElevenLabs composition between **4:00.017 and 4:08.432**, encoded at roughly
3.84-3.98 MB.

| Id | Title | Runtime use | Character |
| --- | --- | --- | --- |
| `music.sunrise_rows` | Sunrise Rows | Default, preload | Fingerpicked guitar, wooden marimba, upright bass; optimistic morning. |
| `music.market_day` | Market Day | Lazy alternative | Mandolin, muted guitar and pizzicato bass; friendly productivity. |
| `music.rain_on_tin` | Rain on Tin | Lazy alternative | Nylon guitar, accordion and fiddle; reflective shelter without rain Foley. |
| `music.golden_harvest` | Golden Harvest | Lazy alternative | Dulcimer/banjo, guitar and cello pizzicato; satisfied harvest warmth. |
| `music.quiet_outback` | Quiet Outback | Lazy alternative | Sparse guitar, viola and light flute; peaceful evening. |

The settings panel lets the player select the current song and disable individual songs they do not
want in the rotation. At least one song remains enabled. A selected song plays through five complete,
seamless repeats, then `MusicPlayer` advances to the next enabled song. Manual selection or disabling
the active song switches immediately. Alternate encoded files remain lazy; only the active decoded
buffer is retained, and the next enabled file may be fetched ahead of the switch without decoding it.
Every session starts with `music.sunrise_rows` by default. If Sunrise Rows is disabled, startup uses
the first enabled alternative instead.

Each requested source is an exact whole-bar length at the prompted tempo. The pipeline overlaps the
last four bars with the first four bars using an equal-power circular crossfade, then rotates the
finished loop at another whole-bar point near its middle. The playback boundary is therefore an
untouched pair of adjacent source samples: playback continues across the repeat exactly as it did
inside the original composition. The generated end-to-start blend sits inside the file, away from
the runtime repeat boundary.

`npm run audio:verify` decodes every shipped MP3. For effects it rejects clips with no clearly
audible 10 ms window or with an energetic final 75 ms that indicates a hard-truncated generation.
For music it rejects anything shorter than four minutes and tests the actual repeated boundary. All
five loops currently have **0.000 ms of near-silence at the boundary**, no ending fade, and a maximum
sample jump of **0.0213 full-scale**. The 103 effects have a minimum peak activity of **-19.5 dB** and
a maximum final-tail level of **-28.3 dB**. Results are written to
`art/audio/verification_report.json`.

Music is mixed to approximately -18 LUFS with a -1.5 dB true-peak ceiling. The runtime music bus is
0.5 by default, while critical warnings use the separate UI bus so music volume never hides them.

## Generation and optimisation

The pipeline follows the current ElevenLabs API capabilities:

- Sound Effects: `POST /v1/sound-generation`, model `eleven_text_to_sound_v2`, explicit
  `duration_seconds`, `prompt_influence`, and `loop: false`.
- Music: `POST /v1/music`, model `music_v2`, per-track `music_length_ms` between 255,000 and
  264,828, and `force_instrumental: true`. Every track is generated once at full length rather than
  assembled by repeating short clips.
- API output is saved under `art/audio/source/` because SFX and music generations cannot currently
  be fetched later through the history API.
- SFX are converted to mono because gameplay does not use stereo placement and mono halves decoded
  memory. Music stays stereo.
- MP3 is used for broad browser support. Web Audio decodes it once before playback, so runtime
  playback does not repeatedly pay codec cost.
- Alternate music is lazy. Effects are small enough to prefetch together; their combined encoded
  size is less than one music track.
- No API key is read by the game or written to the repository. Generation reads
  `ELEVENLABS_API_KEY` from the shell environment.

```bash
export ELEVENLABS_API_KEY='your restricted generation key'
npm run audio:generate
npm run audio:verify
```

The command reuses existing raw generations and re-runs local processing by default. Prefer the
narrow force flags so a music change never spends credits regenerating effects:

```bash
npm run audio:generate -- --music-only --force-music
# One resumable track at a time:
npm run audio:generate -- --music-only --force-music --music-id music.sunrise_rows
```

`-- --force` deliberately regenerates both effects and music and should be reserved for a complete
audio redesign.

After regeneration:

1. Listen to every effect in context, especially warning, fox alert, footsteps and repeated UI
   clicks.
2. Run `npm run audio:verify`, then audition every music boundary for at least five consecutive
   loops.
3. Copy measured byte counts from `art/audio/generation_report.json` into
   `assets/manifests/audio.manifest.ts` and `animalAudio.manifest.ts`.
4. Run `npx vitest run --project game` and `npm run verify`.

## Budgets and measured inventory

| Metric | Delivered | Runtime policy |
| --- | ---: | --- |
| 52 active sound effects | 928,618 bytes encoded | Prefetched; decoded after gesture; procedural fallback available. Includes all three hen, sheep and cow variants. |
| 51 future animal effects | 1,001,921 bytes encoded | Shipped lazy and not fetched or decoded until a future animal implementation requests them. |
| Default music loop | 3,841,581 bytes encoded | Prefetched and decoded once; about 92.2 MB decoded PCM. |
| Mobile default music | 0 encoded bytes fetched | Procedural mono loop, at most 22,050 Hz; roughly 2.35 MB decoded PCM. |
| Four alternate loops | 15,615,156 bytes encoded | Lazy; load one at a time and release the previous decoded buffer. |
| All delivered audio | 21,387,276 bytes encoded | Only 4,770,199 bytes are on the default audio preload path. |

Do not solve variety by adding files automatically. First prefer detune, volume variation and
contextual reuse. Add a new clip only when the player must distinguish a meaning the existing
palette cannot express—fox alert versus fox fleeing is the reference example.

# 0012. Generated audio files with procedural fallback

- **Status:** Accepted
- **Date:** 2026-08-10

## Context

The browser client had a complete procedural sound brief and synthesiser, but the composition root
never registered it, the asset manifest declared no audio, and synthesis could not convincingly
produce soil, water, animal calls or acoustic background music. The game needs tactile effects and
several farm music loops without making audio availability a loading-screen failure.

## Decision

- Generate the first production audio set through the ElevenLabs Sound Effects and Music v2 APIs.
- Keep prompts and local post-processing in `tools/audio/`; keep raw API results and a measured
  report under `art/audio/`; ship optimised MP3 files under `public/assets/audio/`.
- Use the existing stable sound ids. On the first browser gesture, register procedural buffers as
  fallbacks, then decode and replace them with generated files under the same ids.
- Treat every audio file as optional. Missing or undecodable audio never prevents a scene loading.
- Prefetch all effects and one default music loop. Keep four alternate music loops lazy.
- Deliver effects as mono 44.1 kHz / 96 kbps MP3 and music as stereo 48 kHz / 128 kbps MP3. Generate
  each music source as a four-minute-plus Music v2 composition, then apply a tempo-aligned four-bar
  circular crossfade before delivery.
- The API key is a generation-time shell secret only. It is never read by Vite, the game, or the
  server.

## Consequences

- Soil, water, animals and acoustic instruments now have real texture while the game still works
  offline or with missing files.
- The current default audio preload is 4,770,199 encoded bytes. Loading all music choices at boot would add
  another 15,615,156 bytes and about 374.7 MB of decoded PCM, so a future selector must load and
  release tracks deliberately.
- MP3 has broader browser support than a smaller Opus-only delivery, at the cost of larger music
  files and lossy re-encoding after loop processing.
- Generation is reproducible in prompt and processing parameters, not bit-identical: API model
  updates can change output. Raw generations are retained because the API history endpoint does not
  currently return SFX or music items.
- A restricted API key needs Sound Effects and Music write permissions. Regeneration spends account
  credits and therefore requires an explicit force flag; use `--force-music --music-only` for music
  changes so effects are not regenerated unnecessarily.
- Procedural audio remains maintained and tested. It is not dead code; it is the graceful-degradation
  path.

## Alternatives considered

- **Keep procedural audio only.** Tiny and deterministic, but unable to meet the written Foley and
  animal briefs convincingly.
- **Make generated audio critical scene assets.** Simpler to reason about, and turns an optional
  presentation failure into a game outage.
- **Load and decode all five music tracks at boot.** Makes selection instant and spends bandwidth and
  decoded memory on four tracks the player may never hear.
- **Ship WAV.** Sample-accurate and enormous for five browser music loops.
- **Ship Opus only.** Smaller, with a less conservative compatibility story for the project's
  all-devices target.

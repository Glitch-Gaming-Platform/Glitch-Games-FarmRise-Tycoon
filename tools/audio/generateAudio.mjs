import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { MUSIC_BRIEFS, SFX_BRIEFS } from './audioBriefs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_ROOT = path.join(ROOT, 'art/audio/source');
const SFX_OUTPUT_ROOT = path.join(ROOT, 'apps/game/public/assets/audio/sfx');
const MUSIC_OUTPUT_ROOT = path.join(ROOT, 'apps/game/public/assets/audio/music');
const REPORT_PATH = path.join(ROOT, 'art/audio/generation_report.json');
const API_BASE = 'https://api.elevenlabs.io/v1';
const SFX_MODEL = 'eleven_text_to_sound_v2';
const MUSIC_MODEL = 'music_v2';
const forceAll = process.argv.includes('--force');
const forceSfx = forceAll || process.argv.includes('--force-sfx');
const forceMusic = forceAll || process.argv.includes('--force-music');
const musicOnly = process.argv.includes('--music-only');
const selectedSfxId = argumentValue('--sfx-id');
const selectedMusicId = argumentValue('--music-id');

const apiKey = process.env.ELEVENLABS_API_KEY;

await Promise.all([
  mkdir(SOURCE_ROOT, { recursive: true }),
  mkdir(SFX_OUTPUT_ROOT, { recursive: true }),
  mkdir(MUSIC_OUTPUT_ROOT, { recursive: true }),
]);

const previousReport = await readPreviousReport();

const report = {
  generatedAt: new Date().toISOString(),
  models: { soundEffects: SFX_MODEL, music: MUSIC_MODEL },
  delivery: {
    soundEffects: 'MP3, mono, 44.1 kHz, 96 kbps',
    music: 'MP3, stereo, 48 kHz, 128 kbps, tempo-aligned four-bar circular crossfade',
  },
  soundEffects: [],
  music: [],
};

if (musicOnly && previousReport?.soundEffects) {
  report.soundEffects.push(...previousReport.soundEffects);
} else {
  for (const brief of SFX_BRIEFS) {
    if (selectedSfxId && brief.id !== selectedSfxId) {
      const previous = previousReport?.soundEffects?.find((entry) => entry.id === brief.id);
      if (previous) report.soundEffects.push(previous);
      continue;
    }
    report.soundEffects.push(await generateSoundEffect(brief));
  }
}

if (selectedSfxId && !SFX_BRIEFS.some((brief) => brief.id === selectedSfxId)) {
  throw new Error(`Unknown --sfx-id "${selectedSfxId}".`);
}

for (const brief of MUSIC_BRIEFS) {
  if (selectedMusicId && brief.id !== selectedMusicId) {
    const previous = previousReport?.music?.find((entry) => entry.id === brief.id);
    if (previous) report.music.push(previous);
    continue;
  }
  report.music.push(await generateMusic(brief));
}

await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
log(`Wrote ${path.relative(ROOT, REPORT_PATH)}`);

async function generateSoundEffect(brief) {
  const rawPath = path.join(SOURCE_ROOT, `sfx_${brief.file}`);
  const outputPath = path.join(SFX_OUTPUT_ROOT, brief.file);
  let requestId =
    previousReport?.soundEffects?.find((entry) => entry.id === brief.id)?.request?.requestId ??
    null;

  if (forceSfx || !(await exists(rawPath))) {
    const response = await requestAudio(
      `${API_BASE}/sound-generation?output_format=mp3_44100_128`,
      {
        text: brief.prompt,
        loop: false,
        duration_seconds: brief.durationSeconds,
        prompt_influence: brief.promptInfluence,
        model_id: SFX_MODEL,
      },
    );
    requestId = response.headers.get('request-id') ?? response.headers.get('x-request-id');
    await writeFile(rawPath, response.bytes);
  }

  const filters = [
    // Remove only leading dead air. Removing trailing silence with
    // silenceremove also mistakes deliberate gaps (the two warning knocks,
    // coin sequences) for the end of the effect.
    'silenceremove=start_periods=1:start_duration=0.01:start_threshold=-52dB',
    'highpass=f=35',
    ...(brief.gainDb ? [`volume=${brief.gainDb}dB`] : []),
    ...(brief.fadeOutSeconds
      ? [
          `afade=t=out:st=${Math.max(0, brief.maxDurationSeconds - brief.fadeOutSeconds)}:d=${brief.fadeOutSeconds}`,
        ]
      : []),
    'alimiter=limit=0.94',
  ];

  run('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    rawPath,
    '-map_metadata',
    '-1',
    '-ac',
    '1',
    '-ar',
    '44100',
    '-af',
    filters.join(','),
    '-t',
    String(brief.maxDurationSeconds),
    '-c:a',
    'libmp3lame',
    '-b:a',
    '96k',
    '-write_xing',
    '1',
    outputPath,
  ]);

  const metrics = await audioMetrics(outputPath);
  log(`SFX ${brief.id}: ${metrics.durationSeconds.toFixed(3)}s, ${metrics.bytes} bytes`);
  return {
    id: brief.id,
    file: path.relative(ROOT, outputPath),
    prompt: brief.prompt,
    request: {
      modelId: SFX_MODEL,
      durationSeconds: brief.durationSeconds,
      promptInfluence: brief.promptInfluence,
      ...(brief.gainDb ? { gainDb: brief.gainDb } : {}),
      ...(brief.fadeOutSeconds ? { fadeOutSeconds: brief.fadeOutSeconds } : {}),
      requestId,
    },
    ...metrics,
  };
}

async function generateMusic(brief) {
  const rawPath = path.join(SOURCE_ROOT, `music_${brief.file}`);
  const outputPath = path.join(MUSIC_OUTPUT_ROOT, brief.file);
  const previous = previousReport?.music?.find((entry) => entry.id === brief.id)?.request;
  let songId = previous?.songId ?? null;
  let requestId = previous?.requestId ?? null;

  const barSeconds = (60 / brief.bpm) * 4;
  const requestedSourceSeconds = brief.sourceBars * barSeconds;
  const requestedSourceMilliseconds = Math.round(requestedSourceSeconds * 1000);

  if (forceMusic || !(await exists(rawPath))) {
    const response = await requestAudio(`${API_BASE}/music?output_format=mp3_48000_192`, {
      prompt: brief.prompt,
      music_length_ms: requestedSourceMilliseconds,
      model_id: MUSIC_MODEL,
      force_instrumental: true,
      sign_with_c2pa: false,
    });
    songId = response.headers.get('song-id');
    requestId = response.headers.get('request-id') ?? response.headers.get('x-request-id');
    await writeFile(rawPath, response.bytes);
  }

  const sourceDuration = await probeDuration(rawPath);
  const crossfade = Math.min(brief.crossfadeBars * barSeconds, sourceDuration / 4);
  const middleEnd = sourceDuration - crossfade;
  const rotation = Math.min(brief.loopRotationBars * barSeconds, sourceDuration - crossfade - 1);
  const filter =
    `[0:a]atrim=start=0:end=${crossfade},asetpts=PTS-STARTPTS[start];` +
    `[0:a]atrim=start=${crossfade}:end=${middleEnd},asetpts=PTS-STARTPTS[middle];` +
    `[0:a]atrim=start=${middleEnd}:end=${sourceDuration},asetpts=PTS-STARTPTS[end];` +
    `[end][start]acrossfade=d=${crossfade}:c1=qsin:c2=qsin[seam];` +
    `[seam][middle]concat=n=2:v=0:a=1[loop];` +
    `[loop]asplit=2[loop-tail][loop-head];` +
    `[loop-tail]atrim=start=${rotation},asetpts=PTS-STARTPTS[tail];` +
    `[loop-head]atrim=start=0:end=${rotation},asetpts=PTS-STARTPTS[head];` +
    `[tail][head]concat=n=2:v=0:a=1,loudnorm=I=-18:TP=-1.5:LRA=7[out]`;

  run('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    rawPath,
    '-filter_complex',
    filter,
    '-map',
    '[out]',
    '-map_metadata',
    '-1',
    '-ac',
    '2',
    '-ar',
    '48000',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '128k',
    '-write_xing',
    '1',
    outputPath,
  ]);

  const metrics = await audioMetrics(outputPath, true);
  log(
    `Music ${brief.id}: ${metrics.durationSeconds.toFixed(3)}s, ${metrics.bytes} bytes, seam ${metrics.seamDelta.toFixed(4)}`,
  );
  return {
    id: brief.id,
    title: brief.title,
    file: path.relative(ROOT, outputPath),
    prompt: brief.prompt,
    request: {
      modelId: MUSIC_MODEL,
      requestedSourceMilliseconds,
      requestedSourceBars: brief.sourceBars,
      bpm: brief.bpm,
      forceInstrumental: true,
      songId,
      requestId,
    },
    deliveredBars: brief.sourceBars - brief.crossfadeBars,
    crossfadeSeconds: crossfade,
    crossfadeBars: brief.crossfadeBars,
    loopRotationSeconds: rotation,
    loopRotationBars: brief.loopRotationBars,
    ...metrics,
  };
}

async function requestAudio(url, body) {
  if (!apiKey) {
    throw new Error(
      'Set ELEVENLABS_API_KEY before requesting a missing source or using a force flag.',
    );
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`ElevenLabs request failed (${response.status}): ${message}`);
  }
  return { bytes: Buffer.from(await response.arrayBuffer()), headers: response.headers };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
}

async function audioMetrics(file, includeSeam = false) {
  const details = await stat(file);
  const durationSeconds = await probeDuration(file);
  const metrics = { bytes: details.size, durationSeconds };
  if (!includeSeam) return metrics;

  const decoded = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      file,
      '-f',
      'f32le',
      '-ac',
      '2',
      '-ar',
      '48000',
      '-',
    ],
    { encoding: null, maxBuffer: 256 * 1024 * 1024 },
  );
  if (decoded.status !== 0) {
    throw new Error(`ffmpeg decode failed for ${file}: ${decoded.stderr?.toString() ?? ''}`);
  }
  const samples = new Float32Array(
    decoded.stdout.buffer,
    decoded.stdout.byteOffset,
    Math.floor(decoded.stdout.byteLength / Float32Array.BYTES_PER_ELEMENT),
  );
  const last = samples.length - 2;
  const seamDelta = Math.max(
    Math.abs((samples[0] ?? 0) - (samples[last] ?? 0)),
    Math.abs((samples[1] ?? 0) - (samples[last + 1] ?? 0)),
  );
  return { ...metrics, seamDelta };
}

async function probeDuration(file) {
  const result = run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  const duration = Number(result.stdout.trim());
  if (!Number.isFinite(duration)) throw new Error(`Could not read audio duration for ${file}.`);
  return duration;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

async function exists(file) {
  try {
    await readFile(file);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      return false;
    throw error;
  }
}

async function readPreviousReport() {
  try {
    return JSON.parse(await readFile(REPORT_PATH, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      return null;
    throw error;
  }
}

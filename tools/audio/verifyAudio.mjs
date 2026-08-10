import { readdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MUSIC_ROOT = path.join(ROOT, 'apps/game/public/assets/audio/music');
const REPORT_PATH = path.join(ROOT, 'art/audio/verification_report.json');
const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const EDGE_WINDOW_FRAMES = Math.round(SAMPLE_RATE * 0.1);
const SILENCE_THRESHOLD = 1e-4;
const MINIMUM_LOOP_SECONDS = 240;

const files = (await readdir(MUSIC_ROOT)).filter((file) => file.endsWith('.mp3')).sort();
const tracks = files.map((file) => inspectTrack(path.join(MUSIC_ROOT, file)));
const failures = tracks.flatMap((track) =>
  track.failures.map((failure) => `${track.file}: ${failure}`),
);

const report = {
  verifiedAt: new Date().toISOString(),
  thresholds: {
    minimumDurationSeconds: MINIMUM_LOOP_SECONDS,
    maximumSampleJump: 0.05,
    maximumNearSilentRunMs: 5,
    minimumEdgeRmsDb: -60,
    maximumEndFadeDb: -18,
  },
  tracks,
  passed: failures.length === 0,
};

await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
for (const track of tracks) {
  log(
    `${track.file}: ${track.durationSeconds.toFixed(3)}s, jump=${track.sampleJump.toFixed(4)}, ` +
      `silent-run=${track.maximumNearSilentRunMs.toFixed(3)}ms, edge=${track.endRmsDb.toFixed(1)}/${track.startRmsDb.toFixed(1)}dB, ` +
      `end-fade=${track.endFadeDb.toFixed(1)}dB`,
  );
}
log(`Wrote ${path.relative(ROOT, REPORT_PATH)}`);

if (failures.length > 0) {
  throw new Error(`Audio loop verification failed:\n${failures.join('\n')}`);
}

function inspectTrack(file) {
  const decoded = run(
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
      String(CHANNELS),
      '-ar',
      String(SAMPLE_RATE),
      '-',
    ],
    null,
  );
  const sampleCount = Math.floor(decoded.stdout.byteLength / Float32Array.BYTES_PER_ELEMENT);
  const aligned = decoded.stdout.subarray(0, sampleCount * Float32Array.BYTES_PER_ELEMENT);
  const samples = new Float32Array(aligned.buffer, aligned.byteOffset, sampleCount);
  const frameCount = Math.floor(samples.length / CHANNELS);
  const durationSeconds = frameCount / SAMPLE_RATE;
  const finalFrame = frameCount - 1;

  const sampleJump = Math.max(
    Math.abs(sampleAt(samples, 0, 0) - sampleAt(samples, finalFrame, 0)),
    Math.abs(sampleAt(samples, 0, 1) - sampleAt(samples, finalFrame, 1)),
  );
  const startRmsDb = toDb(rms(samples, 0, Math.min(EDGE_WINDOW_FRAMES, frameCount)));
  const endRmsDb = toDb(rms(samples, Math.max(0, frameCount - EDGE_WINDOW_FRAMES), frameCount));
  const previousRms = rms(
    samples,
    Math.max(0, frameCount - SAMPLE_RATE * 4),
    Math.max(0, frameCount - SAMPLE_RATE),
  );
  const finalSecondRms = rms(samples, Math.max(0, frameCount - SAMPLE_RATE), frameCount);
  const endFadeDb = toDb(finalSecondRms) - toDb(previousRms);
  const maximumNearSilentRunMs = boundarySilenceMs(samples, frameCount);
  const failures = [];

  if (durationSeconds < MINIMUM_LOOP_SECONDS) {
    failures.push(
      `duration ${durationSeconds.toFixed(3)}s is shorter than ${MINIMUM_LOOP_SECONDS}s`,
    );
  }
  if (sampleJump > 0.05) failures.push(`sample jump ${sampleJump.toFixed(4)} exceeds 0.05`);
  if (maximumNearSilentRunMs > 5) {
    failures.push(`near-silent boundary run ${maximumNearSilentRunMs.toFixed(3)}ms exceeds 5ms`);
  }
  if (startRmsDb < -60 || endRmsDb < -60) {
    failures.push(`edge energy is too low (${endRmsDb.toFixed(1)}/${startRmsDb.toFixed(1)} dB)`);
  }
  if (endFadeDb < -18) failures.push(`ending fades ${Math.abs(endFadeDb).toFixed(1)} dB`);

  return {
    file: path.basename(file),
    decodedFrames: frameCount,
    durationSeconds,
    sampleJump,
    startRmsDb,
    endRmsDb,
    endFadeDb,
    maximumNearSilentRunMs,
    failures,
  };
}

function boundarySilenceMs(samples, frameCount) {
  const edgeFrames = Math.min(EDGE_WINDOW_FRAMES, frameCount);
  let current = 0;
  let longest = 0;
  for (let index = frameCount - edgeFrames; index < frameCount + edgeFrames; index += 1) {
    const frame = index < frameCount ? index : index - frameCount;
    const silent =
      Math.abs(sampleAt(samples, frame, 0)) < SILENCE_THRESHOLD &&
      Math.abs(sampleAt(samples, frame, 1)) < SILENCE_THRESHOLD;
    current = silent ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return (longest / SAMPLE_RATE) * 1000;
}

function rms(samples, startFrame, endFrame) {
  let sum = 0;
  let count = 0;
  for (let frame = startFrame; frame < endFrame; frame += 1) {
    for (let channel = 0; channel < CHANNELS; channel += 1) {
      const value = sampleAt(samples, frame, channel);
      sum += value * value;
      count += 1;
    }
  }
  return count === 0 ? 0 : Math.sqrt(sum / count);
}

function sampleAt(samples, frame, channel) {
  return samples[frame * CHANNELS + channel] ?? 0;
}

function toDb(value) {
  return value <= 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(value);
}

function run(command, args, encoding = 'utf8') {
  const result = spawnSync(command, args, { encoding, maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr?.toString() || result.stdout?.toString()}`);
  }
  return result;
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

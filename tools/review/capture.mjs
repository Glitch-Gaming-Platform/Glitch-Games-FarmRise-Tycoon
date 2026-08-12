/**
 * Live visual capture harness.
 *
 * Builds nothing itself: point it at an already-built client directory, and it
 * serves that directory, drives a real Chromium (software WebGL in automation),
 * and writes deterministic PNGs for visual review.
 *
 * This exists so that "does it look right" is answered from the shipping
 * renderer at the shipping camera, not from a modelling viewport.
 *
 * Usage:
 *   node tools/review/capture.mjs --out /tmp/shots/frame.png
 *   node tools/review/capture.mjs --out a.png --debug estate --wait 2500
 *   node tools/review/capture.mjs --out a.png --width 1920 --height 1080 --menu
 *   node tools/review/capture.mjs --shots shots.json     # batch
 *
 * Options:
 *   --dist <dir>     built client directory        (default $FR_DIST or /tmp/fr-dist)
 *   --out <file>     output PNG path               (required unless --shots)
 *   --debug <name>   ?debug=<name> query parameter (e.g. estate, progression, overlay)
 *   --menu           capture the main menu instead of entering the farm
 *   --wait <ms>      settle time after the farm is ready (default 1800)
 *   --width/--height viewport pixels               (default 1600x900)
 *   --dpr <n>        device pixel ratio            (default 2)
 *   --keys <spec>    input to apply before capture, e.g. "w:600,shift+w:400"
 *   --hold <combo>    hold keys while a frame sequence is captured, e.g. "shift+w"
 *   --frame-count <n> save n equal-interval frames from the same live session
 *   --frame-step <ms> time between sequence frames (default 120)
 *   --canvas         capture only the WebGL canvas, excluding the DOM overlay
 *   --hide-ui        hide the DOM overlay entirely (HUD, coach mark, panels)
 *   --shots <file>   JSON array of option objects, captured in one browser
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

async function serve(root) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      let filePath = path.join(root, decodeURIComponent(url.pathname));
      if (url.pathname === '/' || !existsSync(filePath)) filePath = path.join(root, 'index.html');
      const body = await readFile(filePath);
      response.writeHead(200, {
        'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      response.end(body);
    } catch (error) {
      response.writeHead(404).end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

/** "w:600,shift+w:400" -> hold w 600ms, then shift+w 400ms. */
async function applyKeys(page, spec) {
  for (const step of String(spec).split(',').filter(Boolean)) {
    const [combo, duration = '400'] = step.split(':');
    if (combo === 'wait') {
      await page.waitForTimeout(Number(duration));
      continue;
    }
    const keys = combo.split('+').map((key) => (key === 'shift' ? 'Shift' : key));
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(Number(duration));
    for (const key of keys.reverse()) await page.keyboard.up(key);
  }
}

function comboKeys(combo) {
  return String(combo)
    .split('+')
    .filter(Boolean)
    .map((key) => (key === 'shift' ? 'Shift' : key));
}

function numberedOutput(output, index) {
  const extension = path.extname(output);
  const stem = output.slice(0, -extension.length);
  return `${stem}_${String(index).padStart(2, '0')}${extension}`;
}

async function writeScreenshot(page, shot, output) {
  await mkdir(path.dirname(output), { recursive: true });
  const target = shot.canvas ? page.locator('#app > canvas') : page;
  // Software WebGL renders a frame far slower than the compositor expects, so
  // the default screenshot timeout expires while a frame is still in flight.
  await target.screenshot({ path: output, timeout: 300_000, animations: 'allow', scale: 'device' });
}

async function capture(page, shot, baseUrl) {
  const width = Number(shot.width ?? 1600);
  const height = Number(shot.height ?? 900);
  await page.setViewportSize({ width, height });

  // `query` carries anything that is not a debug flag - most importantly
  // `quality=ultra|low`, which must be explicit here: detection would otherwise
  // pick a tier from the container's CPU count and the shot would silently be
  // of the wrong pipeline.
  const params = new URLSearchParams(shot.query ?? '');
  if (shot.debug) params.set('debug', shot.debug);
  const query = params.size > 0 ? `?${params.toString()}` : '';
  await page.goto(`${baseUrl}/${query}`, { waitUntil: 'load' });

  if (!shot.menu) {
    await page.getByTestId('menu-play').dispatchEvent('click');
    await page
      .getByTestId('menu-shortcuts')
      .waitFor({ state: 'visible', timeout: 60_000 })
      .catch(() => {});
  } else {
    await page.getByTestId('main-menu').waitFor({ state: 'visible', timeout: 30_000 });
  }

  if (shot.hideUi && !shot.menu) {
    // `--canvas` clips to the canvas element, but the DOM overlay is composited
    // on top of it, so HUD panels and the onboarding coach mark still appear in
    // the crop. That is how a character review ends up looking at a tutorial
    // card. Hiding the overlay is the only reliable way to see the world, and
    // it is done here rather than in the client so the shipping DOM is
    // untouched.
    await page.addStyleTag({
      content: '#app > *:not(canvas) { display: none !important; }',
    });
  }

  if (shot.keys) await applyKeys(page, shot.keys);
  await page.waitForTimeout(Number(shot.wait ?? 1800));

  const frameCount = Math.max(1, Number(shot.frameCount ?? 1));
  if (frameCount === 1) {
    await writeScreenshot(page, shot, shot.out);
    return [shot.out];
  }

  const heldKeys = shot.hold ? comboKeys(shot.hold) : [];
  for (const key of heldKeys) await page.keyboard.down(key);
  const outputs = [];
  try {
    for (let index = 0; index < frameCount; index += 1) {
      if (index > 0) await page.waitForTimeout(Number(shot.frameStep ?? 120));
      const output = numberedOutput(shot.out, index);
      await writeScreenshot(page, shot, output);
      outputs.push(output);
    }
  } finally {
    for (const key of heldKeys.reverse()) await page.keyboard.up(key);
  }
  return outputs;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dist = args.dist ?? process.env.FR_DIST ?? '/tmp/fr-dist';
  if (!existsSync(path.join(dist, 'index.html'))) {
    throw new Error(`No built client at ${dist}. Build first (see tools/review/README.md).`);
  }

  const shots = args.shots
    ? JSON.parse(await readFile(args.shots, 'utf8'))
    : [
        {
          out: args.out,
          debug: args.debug,
          query: args.query,
          menu: Boolean(args.menu),
          wait: args.wait,
          width: args.width,
          height: args.height,
          keys: args.keys,
          hold: args.hold,
          frameCount: args['frame-count'],
          frameStep: args['frame-step'],
          canvas: Boolean(args.canvas),
          hideUi: Boolean(args['hide-ui']),
        },
      ];
  if (shots.some((shot) => !shot.out)) throw new Error('Every shot needs an --out path.');

  const { server, port } = await serve(dist);
  const baseUrl = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--disable-frame-rate-limit',
    ],
  });

  const errors = [];
  try {
    const context = await browser.newContext({
      deviceScaleFactor: Number(args.dpr ?? 2),
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    for (const shot of shots) {
      const written = await capture(page, { ...shot, dpr: args.dpr }, baseUrl);
      for (const output of written) console.log(`captured ${output}`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (errors.length) {
    console.error(`\nPage errors (${errors.length}):`);
    for (const error of [...new Set(errors)]) console.error(`  ${error}`);
    process.exitCode = 1;
  }
}

await main();

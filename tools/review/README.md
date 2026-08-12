# Live visual review harness

Renders the **shipping client** in a real browser and writes PNGs. This is how visual work is
graded: from the game's own renderer at the game's own camera, never from a modelling viewport or a
unit test.

## Environment (sandboxed Linux agents — read this first)

Three things differ from a normal checkout. Each one fails confusingly if skipped.

```bash
# 1. Node 24 is required (the repo refuses Node 22; better-sqlite3 segfaults under it).
export PATH=/tmp/node-v24.14.0-linux-arm64/bin:$PATH
node --version   # must print v24.x

# 2. Chromium needs one library that is not installed system-wide.
export LD_LIBRARY_PATH=/tmp/extralib

# 3. The repo mount forbids unlink(), so Vite cannot empty apps/game/dist.
#    Always build to a path OUTSIDE the mount.
```

If `/tmp/node-v24.14.0-linux-arm64` or `/tmp/extralib` is missing, rebuild them:

```bash
cd /tmp && curl -sL https://nodejs.org/dist/v24.14.0/node-v24.14.0-linux-arm64.tar.xz -o n24.tar.xz \
  && tar xf n24.tar.xz
mkdir -p /tmp/deps && cd /tmp/deps && apt-get download libxdamage1 \
  && dpkg-deb -x libxdamage1_*.deb extracted \
  && mkdir -p /tmp/extralib && cp -a extracted/usr/lib/aarch64-linux-gnu/libXdamage.so* /tmp/extralib/
npx playwright install chromium    # only if ~/.cache/ms-playwright is empty
```

## Build then capture

```bash
export PATH=/tmp/node-v24.14.0-linux-arm64/bin:$PATH LD_LIBRARY_PATH=/tmp/extralib
cd <repo>

npm run build --workspace @farmrise/shared
cd apps/game && npx vite build --outDir /tmp/fr-dist --emptyOutDir && cd ../..

node tools/review/capture.mjs --out /tmp/shots/after.png --wait 2500 --dpr 1
```

A capture takes roughly 45–70 s: automation uses software WebGL (SwiftShader), so frames are slow.
Budget for that instead of shortening `--wait`, which produces a half-populated world.

### Options

| Flag | Meaning |
| --- | --- |
| `--out <file>` | Output PNG (required unless `--shots`) |
| `--dist <dir>` | Built client directory (default `/tmp/fr-dist`, or `$FR_DIST`) |
| `--debug <name>` | Appends `?debug=<name>` — `overlay` works in any build |
| `--menu` | Capture the main menu instead of entering the farm |
| `--wait <ms>` | Settle time once the farm is ready (default 1800) |
| `--width` / `--height` | Viewport (default 1600×900) |
| `--dpr <n>` | Device pixel ratio (default 2; use 1 for speed) |
| `--keys <spec>` | Input before capture, e.g. `w:600,shift+w:400` |
| `--hold <combo>` | Hold keys throughout a same-session frame sequence, e.g. `w` or `shift+w` |
| `--frame-count <n>` | Capture several equal-interval frames instead of one |
| `--frame-step <ms>` | Delay between sequence frames (default 120 ms) |
| `--canvas` | Capture only the WebGL canvas, excluding the DOM overlay |
| `--shots <file>` | JSON array of shot objects, all captured in one browser launch |

Batch several shots in one run — launching the browser is the expensive part:

```json
[
  { "out": "/tmp/shots/wide.png", "wait": 2500, "width": 1600, "height": 900 },
  { "out": "/tmp/shots/canvas.png", "wait": 900, "canvas": true },
  { "out": "/tmp/shots/walk.png", "keys": "w:700", "wait": 900, "canvas": true }
]
```

Use a same-session sequence when judging motion. The example below holds the
ordinary walk and saves `walk_00.png` through `walk_03.png` 120 ms apart:

```bash
node tools/review/capture.mjs --out /tmp/shots/walk.png --query quality=ultra \
  --hold w --frame-count 4 --frame-step 120 --wait 500 --canvas --dpr 1
```

Treat `--frame-step` as an exact interval only on a hardware-accelerated browser.
Under SwiftShader, encoding a PNG can block rendering for seconds or minutes, so
the resulting files are useful for pose coverage but not for measuring cadence,
foot slip or transition timing. Those claims require a real-GPU video capture or
the quantitative animation tests.

`--keys` also accepts a `wait:<ms>` step, which makes action setup reproducible:

```bash
--keys shift+w:4500,e:20,wait:900,e:20
```

The harness exits non-zero and prints every uncaught page error and console error it saw. A capture
that "looks fine" but reports errors is a failure — read them.

### Progression fixtures need a dev build

`?debug=estate` and `?debug=progression` are stripped from production bundles by design, so against
`/tmp/fr-dist` they silently fall back to the starter farm. To capture a late-game farm, run the Vite
dev server and point the harness at it, or capture the starter farm — which is the decisive view for
most art judgments anyway.

## Viewing the result

The sandbox `/tmp` is not visible to the file tools. Copy into the outputs mount to look at a shot:

```bash
cp /tmp/shots/after.png /sessions/<session>/mnt/outputs/shots/
```

Then `Read` the file at the corresponding host path.

## Rules for visual work

1. **Capture before and after.** A change with no after-shot is not reviewed.
2. **Judge from `gameplay_distance`-equivalent framing**, not a close-up, unless the change is
   specifically a close-up concern.
3. **Check the console output of the capture**, not only the image.
4. **Re-run `npm run art:check`** if you touched palette or vertex colour.

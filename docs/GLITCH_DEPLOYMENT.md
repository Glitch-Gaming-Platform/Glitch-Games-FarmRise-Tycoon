# Glitch deployment

FarmRise Tycoon has two separate Glitch deployments:

- **Distribution** uploads the browser game from `apps/game/dist`.
- **Webhosting** runs the browser game and the Next.js API together from the repository's
  `Dockerfile.glitch` build.

The credentials are intentionally not stored in this repository. Use a protected shell or CI
secret store. Never place a distribution or hosting token in Vite variables, browser code, a ZIP,
or a committed file.

## Required protected variables

```bash
export GLITCH_TITLE_ID="9a698a9d-1b27-4c78-9256-0f458368737d"
export GLITCH_HOSTING_SITE_ID="019fecaa-9c8f-71a4-a1c1-0ea19b50c2eb"
export GLITCH_TITLE_TOKEN="<distribution token from Deploy Game>"
export GLITCH_HOSTING_TOKEN="<hosting token from Hosting>"
```

The public website is `https://farmrise-tycoon.glitch-promotions.glitch.fun`.

## Choose the entry path for the actual project

An entry path is project-specific. Do not copy an entry from another game and do not infer that
`package.json` is executable merely because it is present. Before generating deployment commands or
uploading an archive, inspect the project's framework, production build output, archive root, and
runtime start command.

Use this decision process:

1. Classify the artifact as a static browser build, executable server build, or container build.
2. Inspect the finished artifact—not only the source tree—and list the files at the upload root.
3. For a static build, select the real HTML bootstrap file only if it exists at the declared archive
   path. For a Node/server build, select the executable server module that binds the platform's
   `PORT`. For a container build, verify the Docker `CMD`/`ENTRYPOINT` invokes that same runtime.
4. Treat `package.json` as metadata unless a platform contract explicitly declares it to be a
   supported manifest entry and the exact deployment path has been tested end to end.
5. Run the exact selected entry in a clean Linux environment or the production container. Verify
   health endpoints, every hashed browser asset, the main menu, and the first interactive screen.
6. For a static CDN deployment, repeat the browser test from a nested path shaped like
   `/titles/<TITLE_ID>/builds/<BUILD_ID>/`; reject root-absolute asset references such as `/assets/*`.

AI-generated instructions for another developer must state the selected entry, why it is correct,
which file/archive checks proved it, the exact command used to run it, and the pass/fail criteria for
the health and browser tests. If those facts cannot be established, the AI must stop before upload
instead of guessing an entry path.

## Verify locally

Run the normal checks and create both production builds:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:glitch-artifacts
```

The Distribution client must point its own API calls at the hosted server because Glitch's CDN and
Desktop App do not rewrite relative game API routes. Build that client with:

```bash
VITE_API_BASE_URL="https://farmrise-tycoon.glitch-promotions.glitch.fun" \
VITE_GLITCH_TITLE_ID="$GLITCH_TITLE_ID" \
VITE_GLITCH_TITLE_TOKEN="<runtime title token, not the distribution token>" \
VITE_GLITCH_BUILD_TYPE="production" \
VITE_APP_VERSION="<SAME_VERSION_USED_FOR_DISTRIBUTION>" \
npm run build --workspace @farmrise/game
```

Only the runtime title token may be compiled into the Distribution client. The hosting, distribution,
and MCP tokens must remain outside every artifact.

To exercise the combined hosting server locally:

```bash
NODE_ENV=production PORT=8787 npm run start:hosting
```

Then check `/`, `/health`, and `/api/v1/health` on port 8787. When Hosting secrets have not been
configured, the server creates secure ephemeral signing keys at startup. That keeps the first
deployment usable, but signed-in sessions do not survive a container replacement. Configure
`AUTH_JWT_SECRET` and `AUTH_REFRESH_SECRET` as protected Hosting secrets for durable accounts.

## Distribution deployment

The title is configured as a `wasm` web deployment even though the current Vite build does not
emit a separate `.wasm` file. The exact Distribution entry is `index.html` at the archive root.
Vite must emit relative `./assets/...` references because Glitch loads that entry from a nested
`/titles/<TITLE_ID>/builds/<BUILD_ID>/` CDN path. A root-absolute `/assets/...` URL is invalid here.

```bash
npx --yes --package glitch-cli-deploy glitch-deploy validate-token \
  --title "$GLITCH_TITLE_ID"

npx --yes --package glitch-cli-deploy glitch-deploy deploy apps/game/dist \
  --title "$GLITCH_TITLE_ID" \
  --version <VERSION_UP_TO_20_CHARACTERS> \
  --entry index.html \
  --type wasm \
  --build-type production \
  --wait
```

Do not pass the token on the command line; the CLI reads `GLITCH_TITLE_TOKEN`.

Before uploading, `npm run verify:glitch-artifacts` must confirm that:

- `apps/game/dist/index.html` exists;
- every local `src` and `href` in that file is relative and resolves to a real file;
- no Distribution, Hosting, or MCP token prefix exists in the browser artifact.

After upload, test the actual Glitch Play page—not only `/` on a local server. Confirm the nested
build URL returns `index.html`, both hashed JavaScript files return HTTP 200 from the same build
folder, the main menu renders, and **Work the farm** reaches the first interactive farm screen.

## Webhosting deployment

Glitch Webhosting is configured in server mode, so it cannot directly publish the static Vite
folder. First upload the repository as a ready Node/container build. The remote build uses Linux,
installs dependencies from `package-lock.json`, builds the shared package, game, and API, then runs
the combined server on port 8787.

```bash
npx --yes --package glitch-cli-deploy glitch-deploy deploy . \
  --title "$GLITCH_TITLE_ID" \
  --version <NODE_BUILD_VERSION> \
  --entry tools/hosting/server.mjs \
  --type node \
  --build-type production \
  --var dockerfile=Dockerfile.glitch \
  --var build_context=. \
  --wait
```

Copy the ready Node build ID from the command output, then publish it as the independent Hosting
release:

```bash
npx --yes --package glitch-cli-deploy glitch host \
  --title "$GLITCH_TITLE_ID" \
  --site "$GLITCH_HOSTING_SITE_ID" \
  --build <READY_NODE_BUILD_ID> \
  --version <HOSTING_RELEASE_VERSION> \
  --entry tools/hosting/server.mjs
```

The exact Webhosting entry is `tools/hosting/server.mjs`. `package.json` is project metadata and is
not a runnable server entry. Before upload, verify all of the following:

- `node tools/hosting/server.mjs` starts successfully with `NODE_ENV=production`;
- `/`, `/health`, `/readyz`, `/livez`, and `/api/v1/health` return successful responses;
- the Linux Docker image starts through `npm run start:hosting` and exposes port 8787;
- the main menu and first farm screen render without browser console errors.

The hosting CLI waits for processing and promotes the release by default. Verify that the release
is `active`, then load the public URL, reach the main menu, and check:

```bash
curl --fail --show-error --silent \
  https://farmrise-tycoon.glitch-promotions.glitch.fun/health
```

Useful read-only commands:

```bash
npx --yes --package glitch-cli-deploy glitch-deploy status --title "$GLITCH_TITLE_ID"
npx --yes --package glitch-cli-deploy glitch releases \
  --title "$GLITCH_TITLE_ID" --site "$GLITCH_HOSTING_SITE_ID"
npx --yes --package glitch-cli-deploy glitch open \
  --title "$GLITCH_TITLE_ID" --site "$GLITCH_HOSTING_SITE_ID"
```

## Deployment record — August 10, 2026

Distribution version `0.1.1-20260810` is the corrected browser release. Build
`019fecf4-4224-7174-8982-4945422d9267` uses `index.html`, emits relative asset URLs, loads from the
real nested Glitch CDN path, displays the main menu, and reaches the first interactive farm screen.

The corrected Webhosting Node build is `019fecf9-d7f7-730b-b72b-9a5923ab48a9`, and Hosting release
`019fecfe-90e9-739f-b303-e5119aba41f6` uses `tools/hosting/server.mjs`. Both artifacts reached
`ready`, but the Hosting site did not become active. The official domain verification request
returned HTTP 200, after which the generated domain returned to `failed` with certificate status
`Failed`. Promoting the exact ready release still returned HTTP 500 with `Server Error`, while the
release itself reported no build error. Therefore the public Hosting hostname must not be reported
as deployed until Glitch fixes the domain/certificate and release-promotion state.

The earlier Node build that used `package.json` as its entry is inactive, and its Hosting release was
never active. No paid database, plan, or domain purchase was authorized during this deployment.

## Rollback

Distribution and Hosting release state are separate. To restore a previous website release:

```bash
npx --yes --package glitch-cli-deploy glitch rollback <RELEASE_ID> \
  --title "$GLITCH_TITLE_ID" --site "$GLITCH_HOSTING_SITE_ID"
```

Never delete inactive or failed releases automatically; they are deployment history and rollback
evidence.

## Common failures

- **401/403:** create a new token on this title's matching Deploy Game or Hosting page. Do not swap
  the two token types.
- **422 on Distribution:** keep the exact `production` build type, `wasm` or `node` deployment type,
  and an entry path that exists inside the archive.
- **Node build fails:** read the Glitch build error, fix `Dockerfile.glitch` or the named build step,
  and deploy a new version. The current Docker build installs Python, Make, and a C++ compiler in
  its build stage because `better-sqlite3` may need a native Linux build. Do not reuse a failed
  version label.
- **Hosting release fails:** fix the Node artifact first, then create a new Hosting release. Once a
  release ID exists, poll that release instead of creating duplicates.
- **Ready release will not promote:** inspect the site's generated-domain and certificate state. If
  domain verification succeeds but the certificate remains `Failed`, the site remains `draft`, and
  promotion returns a generic server error, preserve the ready release and escalate the platform
  defect. Do not create duplicate releases or claim that the public hostname is deployed.
- **Website is active but unusable:** check `/health`, the root `index.html`, hashed `/assets/*`
  requests, API responses, and browser console errors. Roll back the Hosting release if players are
  affected.

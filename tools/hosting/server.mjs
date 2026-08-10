import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import next from 'next';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const gameRoot = path.join(root, 'apps/game/dist');
const hostname = process.env.HOST ?? process.env.HOSTNAME ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 8787);

// Glitch Hosting can supply persistent secrets from its Hosting setup. Keep a
// secure, non-committed fallback so the first deployment remains playable even
// before those optional values are configured. Sessions created with a fallback
// secret are intentionally invalidated if the container is replaced.
for (const name of ['AUTH_JWT_SECRET', 'AUTH_REFRESH_SECRET']) {
  if (!process.env[name]) {
    process.env[name] = randomBytes(48).toString('base64url');
    console.warn(`[hosting] ${name} is not configured; using an ephemeral startup value.`);
  }
}

process.env.DATABASE_DRIVER ??= 'sqlite';
process.env.DATABASE_URL ??= 'file:/data/farmrise.sqlite';
process.env.CORS_ALLOWED_ORIGINS ??= 'https://farmrise-tycoon.glitch-promotions.glitch.fun';

const configuredCorsOrigins = new Set(
  process.env.CORS_ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

async function migrateDatabase() {
  await new Promise((resolve, reject) => {
    const migration = spawn('npm', ['run', 'db:migrate', '--workspace', '@farmrise/server'], {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
    });
    migration.once('error', reject);
    migration.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(new Error(`Database migration failed (${signal ?? `exit ${code ?? 'unknown'}`}).`));
    });
  });
}

const mimeTypes = new Map([
  ['.avif', 'image/avif'],
  ['.css', 'text/css; charset=utf-8'],
  ['.glb', 'model/gltf-binary'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function requestPath(url = '/') {
  try {
    return decodeURIComponent(new URL(url, 'http://localhost').pathname);
  } catch {
    return '/';
  }
}

function safeGamePath(pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const resolved = path.resolve(gameRoot, relative);
  return resolved === gameRoot || resolved.startsWith(`${gameRoot}${path.sep}`) ? resolved : null;
}

async function existingFile(filePath) {
  if (!filePath) return null;
  try {
    const info = await stat(filePath);
    return info.isFile() ? info : null;
  } catch {
    return null;
  }
}

function sendFile(request, response, filePath, info) {
  const extension = path.extname(filePath).toLowerCase();
  const immutable = filePath.includes(`${path.sep}assets${path.sep}`);
  response.statusCode = 200;
  response.setHeader('content-type', mimeTypes.get(extension) ?? 'application/octet-stream');
  response.setHeader('content-length', info.size);
  response.setHeader(
    'cache-control',
    immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  );
  response.setHeader('x-content-type-options', 'nosniff');
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

function allowApiCors(request, response) {
  const origin = request.headers.origin;
  if (!origin) return false;

  let isGlitchOrigin = false;
  try {
    const url = new URL(origin);
    isGlitchOrigin =
      url.protocol === 'https:' &&
      (url.hostname === 'glitch.fun' || url.hostname.endsWith('.glitch.fun'));
  } catch {
    // Invalid origins are not reflected into response headers.
  }

  if (!configuredCorsOrigins.has(origin) && !isGlitchOrigin) return false;

  response.setHeader('access-control-allow-origin', origin);
  response.setHeader('access-control-allow-credentials', 'true');
  response.setHeader('access-control-allow-methods', 'GET, POST, PUT, OPTIONS');
  response.setHeader(
    'access-control-allow-headers',
    'Authorization, Content-Type, X-Farmrise-Protocol',
  );
  response.setHeader('vary', 'Origin');
  return true;
}

await migrateDatabase();

const app = next({ dev: false, dir: path.join(root, 'apps/server'), hostname, port });
await app.prepare();
const handleNext = app.getRequestHandler();

const server = createServer(async (request, response) => {
  const pathname = requestPath(request.url);

  if (pathname === '/health' || pathname === '/readyz' || pathname === '/livez') {
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (pathname.startsWith('/api/')) {
    allowApiCors(request, response);
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }
    await handleNext(request, response);
    return;
  }

  if (!['GET', 'HEAD'].includes(request.method ?? 'GET')) {
    response.writeHead(405, { allow: 'GET, HEAD' });
    response.end('Method Not Allowed');
    return;
  }

  const directPath = safeGamePath(pathname);
  const directInfo = await existingFile(directPath);
  if (directPath && directInfo) {
    sendFile(request, response, directPath, directInfo);
    return;
  }

  // The game currently has no client-side routes, but this fallback keeps a
  // future route refresh from turning into an infrastructure 404.
  const acceptsHtml = request.headers.accept?.includes('text/html');
  const indexPath = path.join(gameRoot, 'index.html');
  const indexInfo = acceptsHtml ? await existingFile(indexPath) : null;
  if (indexInfo) {
    sendFile(request, response, indexPath, indexInfo);
    return;
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not Found');
});

server.listen(port, hostname, () => {
  console.warn(`[hosting] FarmRise Tycoon is ready on ${hostname}:${port}.`);
});

async function shutdown(signal) {
  console.warn(`[hosting] received ${signal}; shutting down.`);
  server.close(async () => {
    await app.close();
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

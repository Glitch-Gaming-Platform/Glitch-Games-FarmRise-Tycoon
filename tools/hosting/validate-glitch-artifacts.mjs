import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const gameDist = path.join(root, 'apps/game/dist');
const distributionEntry = path.join(gameDist, 'index.html');
const hostingEntry = path.join(root, 'tools/hosting/server.mjs');

async function requireFile(filePath, label) {
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) throw new Error(`${label} is missing: ${path.relative(root, filePath)}`);
}

await requireFile(distributionEntry, 'Distribution entry');
await requireFile(hostingEntry, 'Webhosting entry');

const html = await readFile(distributionEntry, 'utf8');
const localReferences = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((value) => !/^(?:https?:|data:|#)/.test(value));

const rootAbsolute = localReferences.filter((value) => value.startsWith('/'));
if (rootAbsolute.length > 0) {
  throw new Error(
    `Distribution entry contains root-absolute asset URLs that break Glitch's nested CDN path: ${rootAbsolute.join(', ')}`,
  );
}

for (const reference of localReferences) {
  const clean = reference.split(/[?#]/, 1)[0];
  if (!clean) continue;
  await requireFile(path.resolve(gameDist, clean), `Referenced Distribution asset ${reference}`);
}

const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (packageJson.scripts?.['start:hosting'] !== 'node tools/hosting/server.mjs') {
  throw new Error('start:hosting must execute tools/hosting/server.mjs.');
}

const dockerfile = await readFile(path.join(root, 'Dockerfile.glitch'), 'utf8');
if (!dockerfile.includes('CMD ["npm", "run", "start:hosting"]')) {
  throw new Error('Dockerfile.glitch must start the verified Webhosting server entry.');
}
if (!dockerfile.includes('test -f apps/game/dist/index.html')) {
  throw new Error('Dockerfile.glitch must require the verified browser artifact before packaging.');
}
if (dockerfile.includes('npm run build --workspace @farmrise/game')) {
  throw new Error(
    'Dockerfile.glitch must not rebuild the browser artifact without its protected build-time configuration.',
  );
}

const assetFiles = await readdir(path.join(gameDist, 'assets'), { recursive: true });
const shippedCode = (
  await Promise.all(
    assetFiles
      .filter((name) => /\.(?:js|css|html|map)$/i.test(name))
      .map((name) => readFile(path.join(gameDist, 'assets', name), 'utf8')),
  )
).join('\n');

for (const forbiddenPrefix of ['gl_deploy_', 'gl_host_', 'gl_mcp_']) {
  if (shippedCode.includes(forbiddenPrefix)) {
    throw new Error(
      `Distribution artifact contains forbidden credential prefix ${forbiddenPrefix}`,
    );
  }
}

console.warn('Glitch artifacts verified:');
console.warn('- Distribution entry: apps/game/dist/index.html');
console.warn('- Distribution asset URLs: relative and present');
console.warn('- Webhosting entry: tools/hosting/server.mjs');
console.warn('- Webhosting image: preserves the verified browser artifact');
console.warn('- Deployment-only credential prefixes: absent');

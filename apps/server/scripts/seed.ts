/**
 * Development seed: one account with a save part-way through a session, so the
 * client has something to load without clicking through registration.
 *
 * Refuses to run in production. A seed script that can run against production
 * is a data-loss incident waiting for a typo.
 *
 * Wrapped in main() rather than using top-level await, because tsx transpiles
 * this package as CommonJS (no "type": "module" in a Next.js app).
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createSqliteConnection } from '../src/db/client';
import { migrateUp } from '../src/db/migrator';
import { createDrizzleRepositories } from '../src/repositories/drizzle/index';
import { createServices } from '../src/services/container';
import { getEnv } from '../src/config/env';

const SEED_EMAIL = 'farmer@example.com';

async function main(): Promise<void> {
  const env = getEnv();
  if (env.isProduction) {
    throw new Error('Refusing to seed a production database.');
  }

  const seedPassword = process.env.SEED_USER_PASSWORD?.trim();
  if (!seedPassword) {
    throw new Error('Set SEED_USER_PASSWORD before running the seed script.');
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const { db, raw } = createSqliteConnection(env.DATABASE_URL);

  try {
    migrateUp(raw, join(here, '..', 'src', 'db', 'migrations'));

    const repositories = createDrizzleRepositories(db);
    const services = createServices(repositories);

    if (await repositories.users.findByEmail(SEED_EMAIL)) {
      console.log(`Seed user already exists: ${SEED_EMAIL}`);
      return;
    }

    const session = await services.auth.register(
      { email: SEED_EMAIL, displayName: 'Seed Farmer', password: seedPassword },
      'seed-script',
    );
    const save = await services.saves.load(session.user.id);
    const site = save.state.sites.find((entry) => entry.id === save.state.activeSiteId);
    if (!site?.stores[0]) throw new Error('The starter career has no yard store.');
    const yard = site.stores[0];
    await services.saves.write(session.user.id, save.revision, {
      ...save.state,
      // Advance the tick alongside the goods so the save passes the same
      // plausibility check a real client's write would face.
      tick: save.state.tick + 600,
      sites: save.state.sites.map((entry) =>
        entry.id === site.id
          ? {
              ...entry,
              lastSimulatedTick: save.state.tick + 600,
              stores: entry.stores.map((store) =>
                store.id === yard.id
                  ? { ...store, items: { ...store.items, wheat: 12, corn: 4 } }
                  : store,
              ),
            }
          : entry,
      ),
    });

    console.log(`Seeded ${SEED_EMAIL}`);
  } finally {
    raw.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

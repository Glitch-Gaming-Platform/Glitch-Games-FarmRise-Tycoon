/**
 * Environment configuration, validated once at startup.
 *
 * Two rules this module exists to enforce:
 *   1. Nothing reads process.env directly anywhere else. A typo in an env name
 *      becomes a startup failure with a clear message instead of `undefined`
 *      silently disabling a security control.
 *   2. Secrets are validated for minimum strength. A 6-character JWT secret is
 *      worse than no auth at all, because it looks like auth.
 */
import { z } from 'zod';

const secretSchema = z
  .string()
  .min(32, 'Secrets must be at least 32 characters. Generate one with crypto.randomBytes(48).');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  AUTH_JWT_SECRET: secretSchema,
  AUTH_JWT_SECRET_PREVIOUS: secretSchema.optional(),
  AUTH_REFRESH_SECRET: secretSchema,
  AUTH_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  AUTH_REFRESH_TTL_SECONDS: z.coerce.number().int().min(3600).default(2_592_000),

  DATABASE_DRIVER: z.enum(['sqlite', 'postgres', 'memory']).default('sqlite'),
  DATABASE_URL: z.string().min(1).default('file:./data/farmrise.sqlite'),

  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  RATE_LIMIT_ANON_PER_MINUTE: z.coerce.number().int().min(1).default(30),
  RATE_LIMIT_USER_PER_MINUTE: z.coerce.number().int().min(1).default(120),
});

export type Env = z.infer<typeof envSchema> & {
  readonly isProduction: boolean;
  readonly corsOrigins: readonly string[];
};

let cached: Env | null = null;

export function getEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;

  // Tests and local development get working defaults so nobody has to invent
  // secrets to run `npm test`. Production never does: a missing secret must be
  // a hard failure, not a silently insecure default.
  const withDefaults =
    source.NODE_ENV === 'production'
      ? source
      : {
          AUTH_JWT_SECRET: 'dev-only-access-secret-not-for-production-use-32+',
          AUTH_REFRESH_SECRET: 'dev-only-refresh-secret-not-for-production-use-32+',
          ...source,
        };

  const parsed = envSchema.safeParse(withDefaults);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(
      `Invalid environment configuration:\n${issues.join('\n')}\n\nSee apps/server/.env.example.`,
    );
  }

  cached = {
    ...parsed.data,
    isProduction: parsed.data.NODE_ENV === 'production',
    corsOrigins: parsed.data.CORS_ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
  return cached;
}

/** Test helper. Never call this from application code. */
export function resetEnvCache(): void {
  cached = null;
}

/**
 * Fixed epoch for the server's simulation clock.
 *
 * Order deadlines are absolute tick numbers measured from here, so every client
 * and every server process agrees on what tick it is without negotiating.
 * Changing this value invalidates every stored deadline - treat it as a
 * migration, not a config knob.
 */
export const SERVER_EPOCH_MS = Date.UTC(2026, 0, 1);

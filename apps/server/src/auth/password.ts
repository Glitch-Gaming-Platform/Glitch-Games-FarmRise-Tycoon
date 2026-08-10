/**
 * Password hashing with scrypt from Node's standard library.
 *
 * scrypt rather than bcrypt or argon2 because it is memory-hard, it is built
 * in, and it adds no native dependency to install or keep patched. Parameters
 * follow OWASP's scrypt guidance (N=2^17, r=8, p=1); raising N later is safe
 * because the cost parameters are stored inside the hash string.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Hand-rolled promise wrapper rather than util.promisify, because promisify
 * picks the 3-argument overload of scrypt and silently loses the options
 * parameter - which is where the cost factors live.
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

const N = 2 ** 17;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
/** scrypt needs roughly 128*N*r bytes; the default 32MB cap is far too low for N=2^17. */
const MAX_MEMORY = 256 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEMORY,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  const salt = Buffer.from(saltRaw ?? '', 'base64');
  const expected = Buffer.from(hashRaw ?? '', 'base64');
  if (salt.length === 0 || expected.length === 0) return false;

  const derived = await scryptAsync(password.normalize('NFKC'), salt, expected.length, {
    N: Number(nRaw),
    r: Number(rRaw),
    p: Number(pRaw),
    maxmem: MAX_MEMORY,
  });

  // Constant-time comparison: a plain === leaks how many leading bytes matched.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/**
 * Burns roughly the same time as a real verification.
 *
 * Called when the email does not exist, so that "unknown account" and "wrong
 * password" take the same time and the login route cannot be used to enumerate
 * which email addresses are registered.
 */
export async function fakeVerifyDelay(): Promise<void> {
  await scryptAsync('decoy', randomBytes(16), KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEMORY });
}

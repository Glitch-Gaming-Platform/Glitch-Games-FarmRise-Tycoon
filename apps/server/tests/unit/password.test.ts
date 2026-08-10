import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/auth/password';

describe('password hashing', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('wrong horse battery staple', hash)).resolves.toBe(false);
  });

  it('salts, so the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ]);
    expect(a).not.toBe(b);
  });

  it('never stores the password in the hash string', async () => {
    const hash = await hashPassword('super-secret-value');
    expect(hash).not.toContain('super-secret-value');
    expect(hash.startsWith('scrypt$')).toBe(true);
  });

  it('returns false rather than throwing on a malformed stored hash', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('x', '')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$1$2$3$$')).resolves.toBe(false);
  });

  it('normalises unicode so equivalent passwords match', async () => {
    // "é" can be one code point or two; a user's keyboard decides which.
    const hash = await hashPassword('café-password-1');
    await expect(verifyPassword('café-password-1', hash)).resolves.toBe(true);
  });
}, 30_000);

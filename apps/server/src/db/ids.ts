/**
 * Sortable unique ids.
 *
 * Time-prefixed base36 plus randomness: sortable by creation time (so a primary
 * key index stays append-mostly rather than fragmenting), unguessable enough
 * that ids cannot be enumerated, and short enough to read in a log line.
 */
import { randomBytes } from 'node:crypto';

export function newId(prefix: string): string {
  const time = Date.now().toString(36).padStart(9, '0');
  const random = randomBytes(9).toString('base64url');
  return `${prefix}_${time}${random}`;
}

/**
 * Repository ports.
 *
 * Services depend on these interfaces and never on Drizzle, SQLite or SQL. That
 * buys three things:
 *   1. Service tests run against the in-memory implementation with no database
 *      at all, so they are fast and have no cleanup.
 *   2. Swapping SQLite for Postgres is a new folder under repositories/, not a
 *      rewrite of the game logic.
 *   3. Every query the application can make is enumerable by reading this file,
 *      which makes it possible to know where the indexes need to be.
 *
 * The methods are deliberately intention-revealing ("updateIfRevisionMatches")
 * rather than generic ("update"), so that concurrency semantics live in the
 * port instead of being reinvented at each call site.
 */
import type { SaveState } from '@farmrise/shared';

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionRecord {
  id: string;
  userId: string;
  generation: number;
  expiresAt: number;
  revokedAt: number | null;
  userAgent: string | null;
  createdAt: number;
}

export interface SaveRecord {
  id: string;
  userId: string;
  revision: number;
  state: SaveState;
  createdAt: number;
  updatedAt: number;
}

export interface MarketOrderRecord {
  id: string;
  userId: string;
  buyerId: string;
  itemId: string;
  quantity: number;
  unitPrice: number;
  deadlineTick: number;
  status: 'open' | 'fulfilled' | 'expired' | 'cancelled';
  createdAt: number;
  fulfilledAt: number | null;
}

export interface LedgerEntryRecord {
  id: string;
  userId: string;
  kind: string;
  amount: number;
  balanceAfter: number;
  metadata: Record<string, unknown> | null;
  createdAt: number;
}

export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  /** Email must already be normalised (trimmed, lowercased) by the caller. */
  findByEmail(email: string): Promise<UserRecord | null>;
  /** Returns null when the email is already taken, rather than throwing. */
  create(input: Omit<UserRecord, 'createdAt' | 'updatedAt'>): Promise<UserRecord | null>;
}

export interface SessionRepository {
  create(
    input: Omit<SessionRecord, 'createdAt' | 'revokedAt' | 'generation'>,
  ): Promise<SessionRecord>;
  findById(id: string): Promise<SessionRecord | null>;
  /**
   * Atomically bumps the generation, but only if the caller presented the
   * current one. Returns null on mismatch, which is how refresh-token replay is
   * detected.
   */
  rotate(id: string, expectedGeneration: number): Promise<SessionRecord | null>;
  revoke(id: string): Promise<void>;
  /** Used when replay is detected: kill every session the user has. */
  revokeAllForUser(userId: string): Promise<void>;
  deleteExpired(now: number): Promise<number>;
}

export interface SaveRepository {
  findByUserId(userId: string): Promise<SaveRecord | null>;
  /** Idempotent: returns the existing save if one is already there. */
  createIfMissing(userId: string, state: SaveState): Promise<SaveRecord>;
  /**
   * Optimistic-concurrency write. Returns null when the stored revision is not
   * `expectedRevision`, meaning another client wrote first.
   */
  updateIfRevisionMatches(
    userId: string,
    expectedRevision: number,
    state: SaveState,
  ): Promise<SaveRecord | null>;
}

export interface MarketRepository {
  listOpenForUser(userId: string): Promise<MarketOrderRecord[]>;
  findForUser(userId: string, orderId: string): Promise<MarketOrderRecord | null>;
  insertMany(orders: MarketOrderRecord[]): Promise<void>;
  /** Returns false if the order was already fulfilled - the double-spend guard. */
  markFulfilled(userId: string, orderId: string, at: number): Promise<boolean>;
  expireOverdue(userId: string, nowTick: number): Promise<number>;
}

export interface IdempotencyRepository {
  find(userId: string, key: string): Promise<{ route: string; response: unknown } | null>;
  /** Returns false when the key already exists, i.e. this is a replay. */
  remember(userId: string, key: string, route: string, response: unknown): Promise<boolean>;
}

export interface LedgerRepository {
  append(entry: Omit<LedgerEntryRecord, 'id' | 'createdAt'>): Promise<LedgerEntryRecord>;
  listRecent(userId: string, limit: number): Promise<LedgerEntryRecord[]>;
}

export interface Repositories {
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly saves: SaveRepository;
  readonly market: MarketRepository;
  readonly idempotency: IdempotencyRepository;
  readonly ledger: LedgerRepository;
}

/**
 * @farmrise/shared
 *
 * The only module both the browser client and the authoritative server are
 * allowed to depend on.
 *
 * What belongs here:
 *   - wire formats (request/response schemas, envelopes, error codes)
 *   - domain definitions that both sides must agree on (crop growth times,
 *     base prices, building costs)
 *   - pure, deterministic rule functions with no I/O
 *
 * What must NEVER be here:
 *   - anything that reads process.env, a database, or the network
 *   - anti-cheat thresholds, order-generation seeds, pricing heuristics, or
 *     any other logic whose secrecy has value (see docs/NETWORKING.md)
 *   - DOM or Three.js imports
 */
export * from './protocol/index.js';
export * from './schemas/index.js';
export * from './domain/index.js';
export * from './rules/index.js';

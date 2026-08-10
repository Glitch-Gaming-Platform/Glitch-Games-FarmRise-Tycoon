/**
 * A tiny Result type for rule functions.
 *
 * Rules never throw. The server turns a failed Result into an HTTP error and
 * the client turns the same failed Result into a toast, using the same code.
 */
import { ErrorCode } from '../protocol/errors.js';

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err = { readonly ok: false; readonly code: ErrorCode; readonly reason: string };
export type Result<T> = Ok<T> | Err;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = (code: ErrorCode, reason: string): Err => ({ ok: false, code, reason });
export const ruleViolation = (reason: string): Err => err(ErrorCode.RULE_VIOLATION, reason);

export function unwrapOr<T>(result: Result<T>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

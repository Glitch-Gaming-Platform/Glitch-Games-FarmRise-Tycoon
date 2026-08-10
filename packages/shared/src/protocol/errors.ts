/**
 * Canonical error codes. The client switches on `code`, never on `message`;
 * messages are for humans and may be reworded at any time.
 */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  STALE_WRITE: 'STALE_WRITE',
  REPLAYED_REQUEST: 'REPLAYED_REQUEST',
  RATE_LIMITED: 'RATE_LIMITED',
  PROTOCOL_MISMATCH: 'PROTOCOL_MISMATCH',
  RULE_VIOLATION: 'RULE_VIOLATION',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** HTTP status each code maps to. Kept here so client and server never disagree. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STALE_WRITE: 409,
  REPLAYED_REQUEST: 409,
  RATE_LIMITED: 429,
  PROTOCOL_MISMATCH: 426,
  RULE_VIOLATION: 422,
  INTERNAL: 500,
};

/** True when retrying the exact same request could plausibly succeed later. */
export function isRetryable(code: ErrorCode): boolean {
  return code === ErrorCode.RATE_LIMITED || code === ErrorCode.INTERNAL;
}

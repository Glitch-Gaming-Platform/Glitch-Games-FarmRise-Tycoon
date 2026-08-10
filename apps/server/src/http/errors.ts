/**
 * The server's error type.
 *
 * Handlers throw HttpError; the route wrapper turns it into the shared failure
 * envelope. Anything else that escapes a handler becomes a generic 500 with a
 * request id - the details go to the log, never to the client, because error
 * text is a reliable source of information disclosure.
 */
import { ERROR_STATUS, ErrorCode } from '@farmrise/shared';

export class HttpError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }

  static badRequest(message: string): HttpError {
    return new HttpError(ErrorCode.BAD_REQUEST, message);
  }
  static validation(details: Record<string, string[]>): HttpError {
    return new HttpError(ErrorCode.VALIDATION_FAILED, 'The request failed validation.', details);
  }
  static unauthenticated(message = 'Sign in to continue.'): HttpError {
    return new HttpError(ErrorCode.UNAUTHENTICATED, message);
  }
  static forbidden(message = 'You do not have access to that.'): HttpError {
    return new HttpError(ErrorCode.FORBIDDEN, message);
  }
  static notFound(message = 'Not found.'): HttpError {
    return new HttpError(ErrorCode.NOT_FOUND, message);
  }
  static conflict(message: string): HttpError {
    return new HttpError(ErrorCode.CONFLICT, message);
  }
  static staleWrite(message = 'Your save is out of date. Reload before saving again.'): HttpError {
    return new HttpError(ErrorCode.STALE_WRITE, message);
  }
  static ruleViolation(message: string): HttpError {
    return new HttpError(ErrorCode.RULE_VIOLATION, message);
  }
  static rateLimited(message = 'Too many requests. Slow down.'): HttpError {
    return new HttpError(ErrorCode.RATE_LIMITED, message);
  }
  static protocolMismatch(message: string): HttpError {
    return new HttpError(ErrorCode.PROTOCOL_MISMATCH, message);
  }
}

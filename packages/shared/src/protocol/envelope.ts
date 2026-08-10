/**
 * Uniform response envelope.
 *
 * Every route returns either { ok: true, data } or { ok: false, error }. This
 * removes the "is this an error or a payload?" guess from the client and makes
 * the transport layer trivially testable.
 */
import { z } from 'zod';
import { ErrorCode } from './errors.js';

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    /** Field-level detail for VALIDATION_FAILED. Never contains server internals. */
    details?: Record<string, string[]>;
    /** Correlates a client report with a server log line. */
    requestId?: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const apiFailureSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.enum(Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]]),
    message: z.string(),
    details: z.record(z.string(), z.array(z.string())).optional(),
    requestId: z.string().optional(),
  }),
});

export function apiSuccessSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({ ok: z.literal(true), data });
}

export function apiResponseSchema<T extends z.ZodTypeAny>(data: T) {
  return z.union([apiSuccessSchema(data), apiFailureSchema]);
}

export function isSuccess<T>(response: ApiResponse<T>): response is ApiSuccess<T> {
  return response.ok;
}

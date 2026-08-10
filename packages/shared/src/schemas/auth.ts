/**
 * Authentication payloads.
 *
 * Password policy lives here rather than on the server alone so the sign-up
 * form can give the same feedback the server will enforce. The server still
 * re-validates: client-side validation is a convenience, never a control.
 */
import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'Enter a valid email address.' });

export const displayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[\p{L}\p{N} _'-]+$/u, { message: 'Display names may not contain symbols.' });

/**
 * 12 characters minimum with no composition rules. Length beats character-class
 * requirements, which mostly produce "Password1!" and a sticky note.
 */
export const passwordSchema = z.string().min(12).max(200);

export const registerRequestSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(20).max(2048),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  createdAt: z.number().int(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

/**
 * The access token is short-lived and returned in the body for the client to
 * hold in memory. The refresh token is long-lived, rotates on every use, and is
 * delivered as an httpOnly cookie so that a cross-site script cannot read it.
 */
export const authSessionSchema = z.object({
  user: publicUserSchema,
  accessToken: z.string(),
  accessTokenExpiresAt: z.number().int(),
});
export type AuthSession = z.infer<typeof authSessionSchema>;

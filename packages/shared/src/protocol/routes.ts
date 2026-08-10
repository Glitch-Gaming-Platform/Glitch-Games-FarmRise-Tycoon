/**
 * Every server route in one place. The client builds URLs exclusively from
 * these helpers so that a renamed route breaks the type-check instead of
 * failing at runtime in production.
 */
export const API_PREFIX = '/api/v1' as const;

export const Routes = {
  health: () => `${API_PREFIX}/health`,

  authRegister: () => `${API_PREFIX}/auth/register`,
  authLogin: () => `${API_PREFIX}/auth/login`,
  authRefresh: () => `${API_PREFIX}/auth/refresh`,
  authLogout: () => `${API_PREFIX}/auth/logout`,
  authMe: () => `${API_PREFIX}/auth/me`,

  save: () => `${API_PREFIX}/save`,

  marketOrders: () => `${API_PREFIX}/market/orders`,
  marketFulfill: (orderId: string) =>
    `${API_PREFIX}/market/orders/${encodeURIComponent(orderId)}/fulfill`,
  marketSpotSell: () => `${API_PREFIX}/market/spot-sell`,
} as const;

export type RouteName = keyof typeof Routes;

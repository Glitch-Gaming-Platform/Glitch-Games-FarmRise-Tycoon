/**
 * Networking composition.
 *
 * The client is built to work without a server: the transport is created
 * eagerly, but nothing blocks on it. If the API is unreachable the player still
 * gets a full local session, and the connection state machine queues anything
 * that needs the server for later.
 */
import { API_PREFIX } from '@farmrise/shared';
import { AuthClient } from '@net/AuthClient.js';
import { ConnectionState } from '@net/ConnectionState.js';
import { GameApi } from '@net/GameApi.js';
import { HttpTransport } from '@net/transport/HttpTransport.js';

export interface NetworkBundle {
  readonly transport: HttpTransport;
  readonly auth: AuthClient;
  readonly api: GameApi;
  readonly connection: ConnectionState;
}

export function createNetworking(baseUrl = ''): NetworkBundle {
  const connection = new ConnectionState();

  // Declared first so the transport can call auth.refresh on a 401; the two are
  // mutually dependent, which is resolved by passing a late-bound function
  // rather than the object itself.
  let auth: AuthClient | null = null;

  const transport = new HttpTransport({
    baseUrl,
    getAccessToken: () => auth?.getAccessToken() ?? null,
    onUnauthenticated: async () => (auth ? auth.refresh() : false),
  });

  auth = new AuthClient(transport);
  auth.events.on('auth:signed-out', () => connection.setStatus('unauthenticated'));
  auth.events.on('auth:signed-in', () => connection.setStatus('online'));

  return { transport, auth, api: new GameApi(transport), connection };
}

/** Default API origin. Vite proxies /api to the Next.js server in development. */
export const DEFAULT_API_BASE = API_PREFIX.replace(/\/v1$/, '') === '/api' ? '' : '';

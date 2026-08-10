/**
 * Wire protocol version.
 *
 * Bump MAJOR when an existing field changes meaning or is removed; bump MINOR
 * when a field is added in a backwards-compatible way. The server rejects any
 * client whose MAJOR does not match its own, which stops a stale cached bundle
 * from silently corrupting a save.
 */
export const PROTOCOL_VERSION = '1.0' as const;

export const PROTOCOL_HEADER = 'x-farmrise-protocol' as const;

export function protocolMajor(version: string): string {
  return version.split('.')[0] ?? '';
}

export function isProtocolCompatible(
  clientVersion: string,
  serverVersion = PROTOCOL_VERSION,
): boolean {
  return protocolMajor(clientVersion) === protocolMajor(serverVersion);
}

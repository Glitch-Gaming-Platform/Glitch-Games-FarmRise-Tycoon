/**
 * Status page. Deliberately contains no data: anything rendered here is public,
 * and a server that renders player data on an unauthenticated page is one
 * misconfiguration away from leaking it.
 */
export default function StatusPage() {
  return (
    <main style={{ padding: 40, maxWidth: 640, lineHeight: 1.6 }}>
      <h1 style={{ marginBottom: 8 }}>FarmRise Tycoon API</h1>
      <p style={{ opacity: 0.75 }}>
        This service holds accounts, saves and the game economy. The playable client is served
        separately by <code>apps/game</code>.
      </p>
      <p style={{ opacity: 0.75 }}>
        Health check: <code>/api/v1/health</code>
      </p>
    </main>
  );
}

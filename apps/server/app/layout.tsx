/**
 * Root layout. The server is an API first; this exists so Next has a valid app
 * tree and so there is somewhere to render the status page.
 */
import type { ReactNode } from 'react';

export const metadata = {
  title: 'FarmRise Tycoon API',
  description: 'Authoritative game backend for FarmRise Tycoon.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: '#0b1014',
          color: '#eaf5ea',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}

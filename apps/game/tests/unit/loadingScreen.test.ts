import { describe, expect, it } from 'vitest';
import { LoadingScreen, estimatedRemainingSeconds } from '@ui/loading/LoadingScreen.js';

describe('LoadingScreen countdown', () => {
  it('shows a throughput-based ETA and a readable completed state', () => {
    let now = 1_000;
    const screen = new LoadingScreen(undefined, () => now);
    screen.show();

    now = 3_000;
    screen.setProgress(0.5, 'Loading farm art');
    expect(screen.root.textContent).toContain('Loading farm art');
    expect(screen.root.querySelector('[data-testid="loading-timer"]')?.textContent).toBe(
      '50% · ~2s remaining',
    );

    screen.setProgress(1);
    expect(screen.root.querySelector('[data-testid="loading-timer"]')?.textContent).toBe(
      '100% · Ready',
    );
  });

  it('does not invent an ETA before enough progress exists', () => {
    expect(estimatedRemainingSeconds(0, 3)).toBeNull();
    expect(estimatedRemainingSeconds(0.5, 0.1)).toBeNull();
    expect(estimatedRemainingSeconds(0.25, 3)).toBe(9);
  });
});

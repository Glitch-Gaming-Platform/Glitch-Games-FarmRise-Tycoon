import { describe, expect, it, vi } from 'vitest';
import { MenuShortcutDock } from '../../src/ui/hud/MenuShortcutDock.js';

describe('MenuShortcutDock', () => {
  it('shows the menu key beside each icon and emits the matching intent', () => {
    const onMarket = vi.fn();
    const onBuild = vi.fn();
    const dock = new MenuShortcutDock({ onMarket, onBuild });
    document.body.append(dock.root);

    const market = dock.root.querySelector<HTMLButtonElement>(
      '[data-testid="menu-shortcut-market"]',
    );
    const build = dock.root.querySelector<HTMLButtonElement>('[data-testid="menu-shortcut-build"]');

    expect(market?.textContent).toContain('MarketM');
    expect(build?.textContent).toContain('BuildB');
    expect(market?.getAttribute('aria-keyshortcuts')).toBe('M');
    expect(build?.getAttribute('aria-keyshortcuts')).toBe('B');

    market?.click();
    build?.click();
    expect(onMarket).toHaveBeenCalledOnce();
    expect(onBuild).toHaveBeenCalledOnce();
  });

  it('is hidden until gameplay makes shortcuts available', () => {
    const dock = new MenuShortcutDock({ onMarket: vi.fn(), onBuild: vi.fn() });
    expect(dock.root.hidden).toBe(true);
    dock.setVisible(true);
    expect(dock.root.hidden).toBe(false);
  });
});

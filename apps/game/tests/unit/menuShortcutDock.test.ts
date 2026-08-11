import { describe, expect, it, vi } from 'vitest';
import { MenuShortcutDock } from '../../src/ui/hud/MenuShortcutDock.js';

describe('MenuShortcutDock', () => {
  it('shows the menu key beside each icon and emits the matching intent', () => {
    const onMarket = vi.fn();
    const onBuild = vi.fn();
    const onCareer = vi.fn();
    const onTown = vi.fn();
    const dock = new MenuShortcutDock({ onMarket, onBuild, onCareer, onTown });
    document.body.append(dock.root);

    const market = dock.root.querySelector<HTMLButtonElement>(
      '[data-testid="menu-shortcut-market"]',
    );
    const build = dock.root.querySelector<HTMLButtonElement>('[data-testid="menu-shortcut-build"]');
    const career = dock.root.querySelector<HTMLButtonElement>(
      '[data-testid="menu-shortcut-career"]',
    );
    const town = dock.root.querySelector<HTMLButtonElement>('[data-testid="menu-shortcut-town"]');

    expect(market?.textContent).toContain('MarketM');
    expect(build?.textContent).toContain('BuildB');
    expect(career?.textContent).toContain('OfficeC');
    expect(town?.textContent).toContain('TownT');
    expect(market?.getAttribute('aria-keyshortcuts')).toBe('M');
    expect(build?.getAttribute('aria-keyshortcuts')).toBe('B');

    market?.click();
    build?.click();
    career?.click();
    town?.click();
    expect(onMarket).toHaveBeenCalledOnce();
    expect(onBuild).toHaveBeenCalledOnce();
    expect(onCareer).toHaveBeenCalledOnce();
    expect(onTown).toHaveBeenCalledOnce();
  });

  it('is hidden until gameplay makes shortcuts available', () => {
    const dock = new MenuShortcutDock({
      onMarket: vi.fn(),
      onBuild: vi.fn(),
      onCareer: vi.fn(),
      onTown: vi.fn(),
    });
    expect(dock.root.hidden).toBe(true);
    dock.setVisible(true);
    expect(dock.root.hidden).toBe(false);
  });
});

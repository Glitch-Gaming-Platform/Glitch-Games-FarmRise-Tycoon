import { describe, expect, it, vi } from 'vitest';
import { AccountPanel, type AccountSnapshot } from '@ui/account/AccountPanel.js';

const callbacks = () => ({
  onRegister: vi.fn(),
  onLogin: vi.fn(),
  onLogout: vi.fn(),
  onClose: vi.fn(),
});

const snapshot = (overrides: Partial<AccountSnapshot> = {}): AccountSnapshot => ({
  provider: null,
  email: null,
  displayName: null,
  busy: false,
  error: null,
  ...overrides,
});

describe('account panel authentication provider', () => {
  it('treats a Glitch identity as authenticated without email or password controls', () => {
    const panel = new AccountPanel(callbacks());
    panel.update(snapshot({ provider: 'glitch', displayName: 'Glitch Farmer' }));

    expect(panel.root.textContent).toContain('Playing as Glitch Farmer');
    expect(panel.root.textContent).toContain('provided automatically by Glitch');
    expect(panel.root.querySelector('[data-testid="account-email"]')).toBeNull();
    expect(panel.root.querySelector('[data-testid="account-password"]')).toBeNull();
    expect(panel.root.querySelector('[data-testid="account-logout"]')).toBeNull();
    expect(panel.root.textContent).not.toMatch(/saved|cloud save|backup/i);
  });

  it('keeps the optional email form for a standalone web player', () => {
    const panel = new AccountPanel(callbacks());
    panel.update(snapshot());

    expect(panel.root.querySelector('[data-testid="account-email"]')).not.toBeNull();
    expect(panel.root.querySelector('[data-testid="account-password"]')).not.toBeNull();
  });
});

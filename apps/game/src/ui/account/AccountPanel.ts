/**
 * Optional account: sign up, sign in, sign out.
 *
 * Deliberately optional and deliberately late. A new player reaches the farm
 * and plays without ever seeing this - progress is already being saved to the
 * browser. The panel exists to answer one question the player asks
 * themselves: "how do I keep this if I clear my browser or switch devices?"
 *
 * On Glitch, authentication belongs to Glitch itself. The player is already
 * signed in and must never be shown a second email/password form.
 */
import { button, clear, el } from '../core/dom.js';
import { uiIcon } from '../core/icons.js';

export interface AccountSnapshot {
  readonly provider: 'farmrise' | 'glitch' | null;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly busy: boolean;
  readonly error: string | null;
}

export interface AccountCallbacks {
  readonly onRegister: (email: string, displayName: string, password: string) => void;
  readonly onLogin: (email: string, password: string) => void;
  readonly onLogout: () => void;
  readonly onClose: () => void;
}

export class AccountPanel {
  readonly root: HTMLElement;
  readonly #body: HTMLElement;
  #mode: 'signin' | 'signup' = 'signup';
  #visible = false;

  constructor(private readonly callbacks: AccountCallbacks) {
    this.#body = el('div', { class: 'fr-account__body' });
    this.root = el(
      'aside',
      {
        class: 'fr-panel-layer',
        testId: 'account-panel',
        attrs: { role: 'dialog', 'aria-label': 'Account', 'data-clarity-mask': 'true' },
      },
      el(
        'div',
        { class: 'fr-panel-card' },
        el(
          'header',
          { class: 'fr-panel-card__head' },
          el(
            'div',
            { class: 'fr-panel-card__title' },
            uiIcon('farmer', '', 'fr-panel-card__icon'),
            el('h2', { text: 'Your profile' }),
          ),
          button('Close', () => this.callbacks.onClose(), {
            class: 'fr-btn fr-btn--ghost fr-btn--small',
            testId: 'account-close',
          }),
        ),
        this.#body,
      ),
    );
    this.root.hidden = true;
  }

  get visible(): boolean {
    return this.#visible;
  }

  setVisible(visible: boolean): void {
    this.#visible = visible;
    this.root.hidden = !visible;
  }

  update(snapshot: AccountSnapshot): void {
    clear(this.#body);

    if (snapshot.error) {
      this.#body.append(
        el('p', { class: 'fr-account__error', testId: 'account-error', text: snapshot.error }),
      );
    }

    if (snapshot.provider === 'glitch') {
      this.#body.append(
        el('p', {
          class: 'fr-market__summary',
          testId: 'account-glitch-identity',
          text: `Playing as ${snapshot.displayName ?? 'your Glitch profile'}.`,
        }),
        el('p', {
          class: 'fr-market__meta',
          text: 'Your identity is provided automatically by Glitch.',
        }),
      );
      return;
    }

    if (snapshot.provider === 'farmrise') {
      this.#body.append(
        el('p', {
          class: 'fr-market__summary',
          text: `Signed in as ${snapshot.displayName ?? snapshot.email ?? 'your account'}.`,
        }),
        el(
          'div',
          { class: 'fr-actions' },
          button('Sign out', () => this.callbacks.onLogout(), {
            class: 'fr-btn fr-btn--ghost',
            testId: 'account-logout',
            attrs: snapshot.busy ? { disabled: 'true' } : {},
          }),
        ),
      );
      return;
    }

    this.#renderForm(snapshot);
  }

  #renderForm(snapshot: AccountSnapshot): void {
    const signingUp = this.#mode === 'signup';

    const email = field('Email', 'email', 'account-email', 'you@example.com');
    const name = field('Display name', 'text', 'account-name', 'Farmer');
    // 12 characters minimum, matching the server's policy, so the player is
    // told the rule before the server rejects them for it.
    const password = field('Password', 'password', 'account-password', 'At least 12 characters');

    const form = el('form', { class: 'fr-account__form', testId: 'account-form' });
    form.append(email.wrapper);
    if (signingUp) form.append(name.wrapper);
    form.append(password.wrapper);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (snapshot.busy) return;
      if (signingUp) {
        this.callbacks.onRegister(
          email.input.value.trim(),
          name.input.value.trim() || 'Farmer',
          password.input.value,
        );
      } else {
        this.callbacks.onLogin(email.input.value.trim(), password.input.value);
      }
    });

    const submit = el('button', {
      class: 'fr-btn',
      testId: 'account-submit',
      text: signingUp ? 'Create account' : 'Sign in',
      attrs: { type: 'submit', ...(snapshot.busy ? { disabled: 'true' } : {}) },
    });
    form.append(el('div', { class: 'fr-actions' }, submit));

    const toggle = button(
      signingUp ? 'I already have an account' : 'Create an account instead',
      () => {
        this.#mode = signingUp ? 'signin' : 'signup';
        this.update(snapshot);
      },
      { class: 'fr-btn fr-btn--ghost fr-btn--small', testId: 'account-toggle' },
    );

    this.#body.append(
      el('p', {
        class: 'fr-market__summary',
        text: signingUp
          ? 'Create a free account to keep your farm across devices. You can keep playing without one.'
          : 'Sign in to pick your farm back up.',
      }),
      form,
      toggle,
    );
  }
}

function field(
  label: string,
  type: string,
  testId: string,
  placeholder: string,
): { wrapper: HTMLElement; input: HTMLInputElement } {
  const input = el('input', {
    testId,
    attrs: {
      type,
      placeholder,
      required: 'true',
      autocomplete:
        type === 'password' ? 'current-password' : type === 'email' ? 'email' : 'nickname',
    },
  }) as HTMLInputElement;
  const wrapper = el(
    'label',
    { class: 'fr-field fr-field--stacked' },
    el('span', { text: label }),
    input,
  );
  return { wrapper, input };
}

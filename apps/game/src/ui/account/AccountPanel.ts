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
import { clear, el } from '../core/dom.js';
import { uiIcon } from '../core/icons.js';
import { createEnglishLocalization, type GameLocalization } from '../i18n/gameI18n.js';
import { localizedButton, localizedText } from '../i18n/localizedDom.js';

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
  #snapshot: AccountSnapshot | null = null;

  constructor(
    private readonly callbacks: AccountCallbacks,
    private readonly i18n: GameLocalization = createEnglishLocalization(),
  ) {
    this.#body = el('div', { class: 'fr-account__body' });
    this.root = el(
      'aside',
      {
        class: 'fr-panel-layer',
        testId: 'account-panel',
        attrs: { role: 'dialog', 'data-clarity-mask': 'true' },
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
            localizedText(i18n, 'h2', 'account.title'),
          ),
          localizedButton(i18n, 'account.close', () => this.callbacks.onClose(), {
            class: 'fr-btn fr-btn--ghost fr-btn--small',
            testId: 'account-close',
          }),
        ),
        this.#body,
      ),
    );
    i18n.bindAttribute(this.root, 'aria-label', 'account.dialog');
    i18n.onChange(() => {
      if (this.#snapshot) this.update(this.#snapshot);
    });
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
    this.#snapshot = snapshot;
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
          text: this.i18n.t('account.playingAs', {
            name: snapshot.displayName ?? this.i18n.t('account.glitchProfile'),
          }),
        }),
        localizedText(this.i18n, 'p', 'account.glitchIdentity', { class: 'fr-market__meta' }),
      );
      return;
    }

    if (snapshot.provider === 'farmrise') {
      this.#body.append(
        el('p', {
          class: 'fr-market__summary',
          text: this.i18n.t('account.signedInAs', {
            name: snapshot.displayName ?? snapshot.email ?? this.i18n.t('account.yourAccount'),
          }),
        }),
        el(
          'div',
          { class: 'fr-actions' },
          localizedButton(this.i18n, 'account.signOut', () => this.callbacks.onLogout(), {
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

    const email = field(
      this.i18n,
      'account.email',
      'email',
      'account-email',
      'account.emailPlaceholder',
    );
    const name = field(
      this.i18n,
      'account.displayName',
      'text',
      'account-name',
      'account.namePlaceholder',
    );
    // 12 characters minimum, matching the server's policy, so the player is
    // told the rule before the server rejects them for it.
    const password = field(
      this.i18n,
      'account.password',
      'password',
      'account-password',
      'account.passwordPlaceholder',
    );

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
          name.input.value.trim() || this.i18n.t('account.defaultFarmer'),
          password.input.value,
        );
      } else {
        this.callbacks.onLogin(email.input.value.trim(), password.input.value);
      }
    });

    const submit = el('button', {
      class: 'fr-btn',
      testId: 'account-submit',
      attrs: { type: 'submit', ...(snapshot.busy ? { disabled: 'true' } : {}) },
    });
    this.i18n.bindText(submit, signingUp ? 'account.create' : 'account.signIn');
    form.append(el('div', { class: 'fr-actions' }, submit));

    const toggle = localizedButton(
      this.i18n,
      signingUp ? 'account.haveAccount' : 'account.createInstead',
      () => {
        this.#mode = signingUp ? 'signin' : 'signup';
        this.update(snapshot);
      },
      { class: 'fr-btn fr-btn--ghost fr-btn--small', testId: 'account-toggle' },
    );

    this.#body.append(
      el('p', {
        class: 'fr-market__summary',
        text: this.i18n.t(signingUp ? 'account.createHelp' : 'account.signInHelp'),
      }),
      form,
      toggle,
    );
  }
}

function field(
  i18n: GameLocalization,
  labelKey: string,
  type: string,
  testId: string,
  placeholderKey: string,
): { wrapper: HTMLElement; input: HTMLInputElement } {
  const input = el('input', {
    testId,
    attrs: {
      type,
      required: 'true',
      autocomplete:
        type === 'password' ? 'current-password' : type === 'email' ? 'email' : 'nickname',
    },
  }) as HTMLInputElement;
  i18n.bindAttribute(input, 'placeholder', placeholderKey);
  const wrapper = el(
    'label',
    { class: 'fr-field fr-field--stacked' },
    localizedText(i18n, 'span', labelKey),
    input,
  );
  return { wrapper, input };
}

/**
 * UI styles, injected once at boot.
 *
 * The colours below are direct entries from tools/blender/palette.py. The DOM
 * interface is allowed transparency and gradients, but it does not invent a
 * second visual identity: warm paper/timber frames the information and the
 * same cool teal used by farm structures marks interactive controls.
 */
export const UI_STYLES = `
:root {
  --fr-ink: #2A2420;
  --fr-paper: #EDE7DA;
  --fr-paper-bright: #F5F1E5;
  --fr-paper-shadow: #D9A87E;
  --fr-timber: #9C6B3F;
  --fr-timber-dark: #6E4A2A;
  --fr-teal: #3F7A82;
  --fr-teal-light: #5D9399;
  --fr-teal-dark: #2E5C63;
  --fr-window: #83C4D1;
  --fr-soil: #A34A2B;
  --fr-gold: #E8C34A;
  --fr-gold-bright: #F5D341;
  --fr-green: #3E8A2E;
  --fr-red: #D45C42;
}

.fr-layer {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  padding: calc(22px + env(safe-area-inset-top)) calc(22px + env(safe-area-inset-right))
           calc(22px + env(safe-area-inset-bottom)) calc(22px + env(safe-area-inset-left));
  box-sizing: border-box; background: rgba(42, 36, 32, 0.22);
  font-family: "Trebuchet MS", ui-rounded, system-ui, -apple-system, sans-serif; color: var(--fr-ink);
}
.fr-layer[hidden] { display: none; }

.fr-panel {
  position: relative; box-sizing: border-box; min-width: 320px; max-width: min(94vw, 520px);
  padding: 30px 32px 28px; border: 4px solid var(--fr-timber-dark); border-radius: 18px;
  background: linear-gradient(180deg, var(--fr-paper-bright), var(--fr-paper));
  box-shadow: 0 0 0 3px var(--fr-paper-shadow), 0 0 0 7px var(--fr-timber),
              0 22px 70px rgba(42, 36, 32, 0.52); text-align: center;
}
.fr-panel::before, .fr-panel-card::before {
  content: ""; position: absolute; inset: 7px; pointer-events: none; border-radius: 10px;
  border: 1px solid rgba(156, 107, 63, 0.36);
}
.fr-panel--menu {
  width: min(960px, 94vw); max-width: 960px; display: grid; grid-template-columns: 1.02fr 0.98fr;
  gap: 28px; align-items: center; text-align: left; overflow: hidden;
}
.fr-panel--compact { max-width: min(92vw, 450px); }
.fr-panel--settings {
  max-height: calc(100dvh - 28px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  overflow-y: auto;
}
.fr-panel--outcome { max-width: min(92vw, 560px); }

.fr-title { margin: 6px 0 8px; color: var(--fr-timber-dark); font-size: 29px; line-height: 1.05; letter-spacing: 0.01em; }
.fr-title--hero { font-size: clamp(34px, 5vw, 54px); max-width: 480px; }
.fr-subtitle { margin: 0 0 22px; color: rgba(42, 36, 32, 0.76); font-size: 15px; line-height: 1.48; }
.fr-ribbon {
  display: inline-flex; align-items: center; width: fit-content; min-height: 25px; padding: 2px 13px;
  border: 2px solid var(--fr-teal-dark); border-radius: 999px; background: var(--fr-teal);
  color: var(--fr-paper-bright); box-shadow: inset 0 0 0 2px rgba(237, 231, 218, 0.16);
  font-size: 11px; font-weight: 800; letter-spacing: 0.09em; text-transform: uppercase;
}

.fr-menu__copy { position: relative; z-index: 2; }
.fr-menu__hero {
  position: relative; min-height: 330px; display: grid; place-items: center; align-self: stretch;
  border: 3px solid var(--fr-teal-dark); border-radius: 16px;
  background: radial-gradient(circle at 50% 40%, var(--fr-paper-bright), var(--fr-window));
  box-shadow: inset 0 0 0 5px rgba(237, 231, 218, 0.72);
}
.fr-menu__hero-image { width: min(100%, 560px); max-height: 340px; object-fit: contain; user-select: none; }
.fr-menu__hero-label {
  position: absolute; bottom: 12px; padding: 6px 13px; border: 2px solid var(--fr-timber-dark);
  border-radius: 999px; background: var(--fr-paper-bright); color: var(--fr-timber-dark);
  font-size: 12px; font-weight: 800;
}
.fr-loading__art { width: 230px; max-height: 130px; object-fit: contain; margin: -10px auto 2px; }

.fr-actions { display: flex; flex-direction: column; gap: 10px; }
.fr-actions--menu { display: grid; grid-template-columns: 1fr 1fr; }
.fr-actions--menu .fr-btn--large { grid-column: 1 / -1; }
.fr-btn {
  appearance: none; display: inline-flex; align-items: center; justify-content: center; gap: 10px;
  box-sizing: border-box; min-height: 46px; padding: 9px 16px; border: 3px solid var(--fr-teal-dark);
  border-radius: 11px; background: var(--fr-teal); color: var(--fr-paper-bright);
  box-shadow: inset 0 0 0 2px rgba(237, 231, 218, 0.18), 0 3px 0 var(--fr-teal-dark);
  font: 800 15px/1 "Trebuchet MS", ui-rounded, system-ui, sans-serif; cursor: pointer;
  transition: filter 120ms ease, transform 80ms ease, box-shadow 80ms ease;
}
.fr-btn:hover { filter: brightness(1.08) saturate(1.04); }
.fr-btn:active { transform: translateY(2px); box-shadow: inset 0 0 0 2px rgba(237, 231, 218, 0.18), 0 1px 0 var(--fr-teal-dark); }
.fr-btn:focus-visible { outline: 3px solid var(--fr-gold-bright); outline-offset: 3px; }
.fr-btn--primary { border-color: var(--fr-timber-dark); background: var(--fr-gold); color: var(--fr-ink); box-shadow: inset 0 0 0 2px rgba(245, 241, 229, 0.32), 0 3px 0 var(--fr-timber-dark); }
.fr-btn--secondary, .fr-btn--ghost { background: var(--fr-paper-bright); color: var(--fr-teal-dark); }
.fr-btn--quiet { border-color: var(--fr-timber); background: transparent; color: var(--fr-timber-dark); box-shadow: none; }
.fr-btn--large { min-height: 58px; font-size: 18px; }
.fr-btn--small { min-height: 36px; padding: 6px 11px; border-width: 2px; font-size: 12.5px; box-shadow: 0 2px 0 var(--fr-teal-dark); }
.fr-btn__icon {
  width: 46px; height: 46px; box-sizing: border-box; object-fit: contain; flex: 0 0 auto;
  padding: 1px; border-radius: 11px; background: rgba(245, 241, 229, 0.82);
  box-shadow: inset 0 0 0 2px rgba(110, 74, 42, 0.22), 0 2px 2px rgba(42, 36, 32, 0.18);
  filter: drop-shadow(0 2px 1px rgba(42, 36, 32, 0.16));
}
.fr-btn--large .fr-btn__icon { width: 62px; height: 62px; border-radius: 13px; }
.fr-btn[disabled] { opacity: 0.45; cursor: not-allowed; filter: grayscale(0.45); }

.fr-screen-icon { width: 112px; height: 92px; margin: -6px auto 0; display: grid; place-items: center; }
.fr-screen-icon__image, .fr-outcome__icon { width: 100%; height: 100%; object-fit: contain; }

.fr-progress { height: 12px; border: 3px solid var(--fr-timber-dark); border-radius: 999px; background: var(--fr-paper-shadow); overflow: hidden; margin-top: 18px; }
.fr-progress__fill { height: 100%; width: 0%; background: linear-gradient(90deg, var(--fr-teal-light), var(--fr-gold)); transition: width 180ms ease; }

.fr-field {
  display: flex; align-items: center; justify-content: space-between; gap: 14px; margin: 12px 0;
  padding: 9px 11px; border: 2px solid rgba(156, 107, 63, 0.42); border-radius: 10px;
  background: rgba(245, 241, 229, 0.68); font-size: 14px; font-weight: 700;
}
.fr-field input[type="range"] { flex: 1; min-width: 130px; accent-color: var(--fr-teal); }
.fr-field input[type="checkbox"] { width: 22px; height: 22px; accent-color: var(--fr-teal); }
.fr-field select {
  box-sizing: border-box; min-width: 180px; min-height: 44px; padding: 7px 9px;
  border: 2px solid var(--fr-timber); border-radius: 8px; background: var(--fr-paper-bright);
  color: var(--fr-ink); font: 700 13px/1.2 inherit;
}
.fr-field select:focus-visible { outline: 3px solid var(--fr-gold-bright); outline-offset: 2px; }
.fr-field--music-select { flex-wrap: wrap; }
.fr-field--music-select select { flex: 1 1 180px; min-width: 0; }
.fr-music-list {
  display: grid; gap: 6px; margin: 12px 0; padding: 10px 11px 11px;
  border: 2px solid rgba(156, 107, 63, 0.42); border-radius: 10px;
  background: rgba(245, 241, 229, 0.68); text-align: left;
}
.fr-music-list legend { padding: 0 5px; color: var(--fr-timber-dark); font-size: 13px; font-weight: 900; }
.fr-music-list__song { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; font-size: 13px; font-weight: 700; }
.fr-music-list__song input { width: 22px; height: 22px; accent-color: var(--fr-teal); }

/* Gameplay HUD ---------------------------------------------------------- */
.fr-hud {
  position: absolute; inset: 0; pointer-events: none;
  padding: calc(12px + env(safe-area-inset-top)) calc(12px + env(safe-area-inset-right))
           calc(12px + env(safe-area-inset-bottom)) calc(12px + env(safe-area-inset-left));
  font-family: "Trebuchet MS", ui-rounded, system-ui, sans-serif; color: var(--fr-ink);
}
.fr-hud__top {
  position: absolute; top: calc(12px + env(safe-area-inset-top));
  left: calc(12px + env(safe-area-inset-left)); right: calc(12px + env(safe-area-inset-right));
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(230px, 360px) minmax(0, 1fr);
  align-items: start; gap: 8px 12px;
}
.fr-hud__bar {
  position: static; grid-column: 3; justify-self: stretch;
  display: flex; gap: 7px; align-items: center; padding: 7px 10px; border: 3px solid var(--fr-timber-dark);
  border-radius: 12px; background: rgba(245, 241, 229, 0.93); box-shadow: 0 3px 0 rgba(110, 74, 42, 0.72);
  flex-wrap: wrap; justify-content: flex-end; min-width: 0; font-variant-numeric: tabular-nums; font-size: 13px;
}
.fr-hud__bar > span { padding: 3px 7px; border-radius: 7px; background: rgba(131, 196, 209, 0.18); }
.fr-hud__prompt, .fr-placing {
  position: absolute; left: 50%; bottom: calc(72px + env(safe-area-inset-bottom)); transform: translateX(-50%);
  border: 3px solid var(--fr-teal-dark); border-radius: 999px; background: var(--fr-paper-bright);
  box-shadow: 0 3px 0 var(--fr-teal-dark); padding: 8px 18px; color: var(--fr-teal-dark);
  font-size: 14px; font-weight: 800; white-space: nowrap;
}
.fr-placing--blocked { border-color: var(--fr-red); color: var(--fr-red); box-shadow: 0 3px 0 var(--fr-red); }
.fr-hud__toasts {
  position: static; grid-column: 1 / -1; justify-self: center;
  display: flex; flex-direction: column; gap: 6px; align-items: center;
}
.fr-toast {
  border: 3px solid var(--fr-timber-dark); border-radius: 9px; background: var(--fr-paper-bright);
  box-shadow: 0 3px 0 var(--fr-timber-dark); padding: 7px 14px; font-size: 13px; font-weight: 700;
  animation: fr-fade 200ms ease;
}
.fr-toast--warn { border-color: var(--fr-gold); }
.fr-toast--error { border-color: var(--fr-red); }
@keyframes fr-fade { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; } }

.fr-objective {
  position: static; grid-column: 2; justify-self: stretch;
  min-width: 230px; padding: 7px 14px; border: 3px solid var(--fr-timber-dark); border-radius: 12px;
  background: rgba(245, 241, 229, 0.93); box-shadow: 0 3px 0 rgba(110, 74, 42, 0.72); text-align: center;
}
.fr-objective__label { color: var(--fr-timber-dark); font-size: 11.5px; font-weight: 800; letter-spacing: 0.02em; }
.fr-objective__track { height: 7px; border: 1px solid var(--fr-timber); border-radius: 999px; background: var(--fr-paper-shadow); margin-top: 6px; overflow: hidden; }
.fr-objective__fill { height: 100%; width: 0%; background: linear-gradient(90deg, var(--fr-teal-light), var(--fr-gold)); transition: width 320ms ease; }
.fr-objective--ready { border-color: var(--fr-gold); }
.fr-objective--ready .fr-objective__fill { background: var(--fr-gold-bright); }

.fr-menu-shortcuts {
  position: absolute; right: calc(14px + env(safe-area-inset-right));
  bottom: calc(14px + env(safe-area-inset-bottom)); display: flex; flex-wrap: wrap;
  justify-content: flex-end; max-width: min(620px, 82vw); gap: 9px;
  pointer-events: auto;
}
.fr-menu-shortcuts[hidden] { display: none; }
.fr-menu-shortcut {
  appearance: none; display: grid; grid-template-columns: 42px auto 28px; align-items: center;
  gap: 7px; min-width: 128px; min-height: 56px; padding: 5px 7px;
  border: 3px solid var(--fr-timber-dark); border-radius: 12px;
  background: linear-gradient(180deg, var(--fr-paper-bright), var(--fr-paper));
  box-shadow: 0 3px 0 var(--fr-timber-dark), 0 8px 24px rgba(42, 36, 32, 0.24);
  color: var(--fr-timber-dark); cursor: pointer;
  font: 900 13px/1 "Trebuchet MS", ui-rounded, system-ui, sans-serif;
  transition: filter 120ms ease, transform 80ms ease, box-shadow 80ms ease;
}
.fr-menu-shortcut:hover { filter: brightness(1.05) saturate(1.04); }
.fr-menu-shortcut:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--fr-timber-dark); }
.fr-menu-shortcut:focus-visible { outline: 3px solid var(--fr-gold-bright); outline-offset: 3px; }
.fr-menu-shortcut__icon {
  width: 46px; height: 46px; object-fit: contain; border-radius: 10px;
  background: rgba(131, 196, 209, 0.18); box-shadow: inset 0 0 0 2px rgba(63, 122, 130, 0.24);
}
.fr-menu-shortcut__name { white-space: nowrap; }
.fr-menu-shortcut__key {
  display: grid; place-items: center; box-sizing: border-box; width: 28px; height: 28px;
  border: 2px solid var(--fr-timber-dark); border-radius: 7px; background: var(--fr-gold);
  box-shadow: 0 2px 0 var(--fr-timber-dark); color: var(--fr-ink);
  font: 900 13px/1 ui-monospace, Menlo, monospace;
}

/* Touch gameplay controls ---------------------------------------------- */
.fr-touch-controls {
  position: absolute; inset: 0; z-index: 5; pointer-events: none;
  font-family: "Trebuchet MS", ui-rounded, system-ui, sans-serif;
}
.fr-touch-controls[hidden], .fr-touch-gameplay[hidden], .fr-touch-placement[hidden] { display: none; }
.fr-touch-gameplay { position: absolute; inset: 0; pointer-events: none; }
.fr-touch-joystick {
  position: absolute; left: calc(12px + env(safe-area-inset-left));
  bottom: calc(12px + env(safe-area-inset-bottom));
  box-sizing: border-box; width: 148px; height: 148px; border: 4px solid rgba(110, 74, 42, 0.88);
  border-radius: 50%; background: rgba(245, 241, 229, 0.36);
  box-shadow: inset 0 0 0 7px rgba(245, 241, 229, 0.22), 0 8px 24px rgba(42, 36, 32, 0.26);
  pointer-events: auto; touch-action: none; user-select: none; -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.fr-touch-joystick::before, .fr-touch-joystick::after {
  content: ""; position: absolute; left: 50%; top: 50%; background: rgba(110, 74, 42, 0.22);
  transform: translate(-50%, -50%); pointer-events: none;
}
.fr-touch-joystick::before { width: 3px; height: 78%; }
.fr-touch-joystick::after { width: 78%; height: 3px; }
.fr-touch-joystick__knob {
  position: absolute; left: 50%; top: 50%; width: 62px; height: 62px; margin: -31px;
  border: 4px solid var(--fr-timber-dark); border-radius: 50%;
  background: linear-gradient(180deg, var(--fr-paper-bright), var(--fr-paper-shadow));
  box-shadow: 0 4px 0 var(--fr-timber-dark), 0 8px 18px rgba(42, 36, 32, 0.28);
  transition: transform 45ms linear; pointer-events: none;
}
.fr-touch-joystick--active .fr-touch-joystick__knob { transition: none; filter: brightness(0.96); }
.fr-touch-actions {
  position: absolute; right: calc(12px + env(safe-area-inset-right));
  bottom: calc(12px + env(safe-area-inset-bottom));
  display: grid; grid-template: 54px 54px / 58px 76px; gap: 7px; align-items: stretch;
}
.fr-touch-actions .fr-touch-button:nth-child(1) { grid-area: 1 / 1; }
.fr-touch-actions .fr-touch-button:nth-child(2) { grid-area: 2 / 1; }
.fr-touch-actions .fr-touch-button:nth-child(3) { grid-area: 1 / 2 / 3 / 3; }
.fr-touch-gameplay > .fr-touch-button {
  position: absolute; left: calc(16px + env(safe-area-inset-left));
  bottom: calc(170px + env(safe-area-inset-bottom)); width: 48px; height: 48px;
}
.fr-touch-placement {
  position: absolute; right: calc(14px + env(safe-area-inset-right));
  bottom: calc(14px + env(safe-area-inset-bottom)); pointer-events: auto;
}
.fr-touch-button {
  appearance: none; box-sizing: border-box; min-width: 50px; min-height: 50px; padding: 6px;
  border: 3px solid var(--fr-timber-dark); border-radius: 15px;
  background: rgba(245, 241, 229, 0.92); color: var(--fr-timber-dark);
  box-shadow: 0 4px 0 var(--fr-timber-dark), 0 8px 18px rgba(42, 36, 32, 0.28);
  pointer-events: auto; touch-action: none; user-select: none; -webkit-user-select: none;
  -webkit-touch-callout: none; font: 900 22px/1 "Trebuchet MS", ui-rounded, system-ui, sans-serif;
}
.fr-touch-button--compact { font-size: 12px; }
.fr-touch-actions .fr-touch-button:last-child { background: var(--fr-gold); font-size: 17px; }
.fr-touch-button--pressed, .fr-touch-button:active {
  transform: translateY(3px) scale(0.97); box-shadow: 0 1px 0 var(--fr-timber-dark);
  filter: brightness(0.96) saturate(1.08);
}
.fr-touch-button:focus-visible { outline: 3px solid var(--fr-gold-bright); outline-offset: 3px; }

#app[data-mobile-optimized="true"] .fr-menu-shortcuts {
  top: calc(12px + env(safe-area-inset-top));
  left: calc(12px + env(safe-area-inset-left));
  right: auto; bottom: auto; max-width: 183px;
}
#app[data-mobile-optimized="true"] .fr-hud__top { display: contents; }
#app[data-mobile-optimized="true"] .fr-hud__bar {
  position: absolute; top: calc(12px + env(safe-area-inset-top));
  right: calc(12px + env(safe-area-inset-right)); max-width: 62vw;
}
#app[data-mobile-optimized="true"] .fr-hud__toasts {
  position: absolute; left: 50%; top: calc(122px + env(safe-area-inset-top));
  transform: translateX(-50%);
}
#app[data-mobile-optimized="true"]:has([data-testid="debug-overlay"]) .fr-menu-shortcuts {
  top: calc(98px + env(safe-area-inset-top));
}
#app[data-mobile-optimized="true"] .fr-objective {
  position: absolute;
  top: calc(66px + env(safe-area-inset-top));
  left: auto; right: calc(12px + env(safe-area-inset-right));
  transform: none; max-width: 45vw;
}
#app[data-mobile-optimized="true"] .fr-hud__prompt,
#app[data-mobile-optimized="true"] .fr-placing {
  bottom: calc(176px + env(safe-area-inset-bottom));
}
#app[data-mobile-optimized="true"] .fr-coach {
  bottom: calc(300px + env(safe-area-inset-bottom));
}

/* Floating gameplay panels --------------------------------------------- */
.fr-panel-layer {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: flex-end;
  box-sizing: border-box; padding: 3vh 3vw; pointer-events: auto; background: rgba(42, 36, 32, 0.2);
}
.fr-panel-layer[hidden] { display: none; }
.fr-panel-card {
  position: relative; pointer-events: auto; box-sizing: border-box; width: min(540px, 94vw); max-height: 88vh;
  overflow-y: auto; padding: 20px 22px 22px; border: 4px solid var(--fr-timber-dark); border-radius: 17px;
  background: linear-gradient(180deg, var(--fr-paper-bright), var(--fr-paper));
  box-shadow: 0 0 0 3px var(--fr-paper-shadow), 0 0 0 7px var(--fr-timber), 0 20px 60px rgba(42, 36, 32, 0.48);
  color: var(--fr-ink); font-family: "Trebuchet MS", ui-rounded, system-ui, sans-serif;
  animation: fr-panel-in 160ms ease-out;
}
@keyframes fr-panel-in { from { opacity: 0; transform: translateX(18px) scale(0.98); } to { opacity: 1; transform: none; } }
.fr-panel-card__head { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.fr-panel-card__title { display: flex; align-items: center; gap: 10px; }
.fr-panel-card__icon { width: 64px; height: 64px; object-fit: contain; }
.fr-panel-card__head h2 { margin: 0; color: var(--fr-timber-dark); font-size: 23px; }
.fr-panel-card__section {
  position: relative; z-index: 1; margin: 17px 0 8px; padding: 5px 10px; border-radius: 7px;
  background: var(--fr-teal); color: var(--fr-paper-bright); font-size: 11.5px; font-weight: 900;
  text-transform: uppercase; letter-spacing: 0.1em;
}
.fr-market__summary { position: relative; z-index: 1; margin: 7px 0 0; color: rgba(42, 36, 32, 0.72); font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
.fr-market__list { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 8px; }
.fr-market__row {
  display: grid; grid-template-columns: 70px minmax(0, 1fr) auto; align-items: center; gap: 10px;
  min-height: 76px; padding: 8px 10px; border: 2px solid var(--fr-timber); border-radius: 11px;
  background: rgba(245, 241, 229, 0.78); box-shadow: inset 0 -3px 0 rgba(217, 168, 126, 0.28);
}
.fr-market__row--blocked { opacity: 0.54; filter: saturate(0.65); }
.fr-market__row--best { border-color: var(--fr-green); background: rgba(143, 209, 84, 0.18); }
.fr-market__icon { width: 68px; height: 68px; object-fit: contain; filter: drop-shadow(0 2px 1px rgba(42, 36, 32, 0.16)); }
.fr-market__info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.fr-market__info strong { color: var(--fr-timber-dark); font-size: 15px; }
.fr-market__meta { color: rgba(42, 36, 32, 0.67); font-size: 11.5px; line-height: 1.35; font-variant-numeric: tabular-nums; }
.fr-market__actions { display: flex; gap: 6px; flex-shrink: 0; }
.fr-market__empty { margin: 4px 0; padding: 16px; border: 2px dashed var(--fr-timber); border-radius: 10px; color: rgba(42, 36, 32, 0.62); font-size: 13px; text-align: center; }
.fr-career__body { position: relative; z-index: 1; }
.fr-career__milestone {
  display: flex; flex-direction: column; gap: 7px; padding: 12px;
  border: 2px solid var(--fr-timber); border-radius: 11px;
  background: rgba(245, 241, 229, 0.78);
}
.fr-career__milestone--ready { border-color: var(--fr-gold); box-shadow: inset 0 0 0 2px rgba(232, 195, 74, 0.22); }
.fr-career__requirement { font-size: 12px; font-weight: 800; color: var(--fr-teal-dark); }
.fr-career__row { min-height: 70px; }

/* Onboarding ------------------------------------------------------------ */
.fr-coach {
  position: absolute; left: 50%; bottom: calc(120px + env(safe-area-inset-bottom)); transform: translateX(-50%);
  box-sizing: border-box; width: min(560px, 91vw); padding: 12px 15px; pointer-events: auto;
  border: 3px solid var(--fr-teal-dark); border-radius: 12px; background: var(--fr-paper-bright);
  box-shadow: 0 0 0 3px var(--fr-window), 0 5px 0 var(--fr-teal-dark), 0 16px 35px rgba(42, 36, 32, 0.32);
  color: var(--fr-ink); animation: fr-coach-in 220ms ease-out;
}
@keyframes fr-coach-in { from { opacity: 0; transform: translate(-50%, 10px) scale(0.98); } to { opacity: 1; transform: translate(-50%, 0); } }
.fr-coach__title { margin: 0 0 3px; color: var(--fr-teal-dark); font-size: 15px; font-weight: 900; }
.fr-coach__body { margin: 0; font-size: 13px; line-height: 1.42; }
.fr-coach__foot { display: flex; align-items: center; gap: 10px; margin-top: 9px; }
.fr-coach__key { display: inline-block; min-width: 24px; padding: 3px 8px; border: 2px solid var(--fr-timber-dark); border-radius: 6px; background: var(--fr-gold); text-align: center; font: 900 12px/1.5 ui-monospace, Menlo, monospace; }
.fr-coach__skip { margin-left: auto; padding: 4px; border: none; background: none; color: var(--fr-timber-dark); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; text-decoration: underline; }

/* Outcome and account --------------------------------------------------- */
.fr-outcome__icon { width: 130px; height: 105px; margin: -12px auto -2px; }
.fr-outcome__headline { margin: 0 0 4px; color: rgba(42, 36, 32, 0.78); font-size: 15px; line-height: 1.46; }
.fr-outcome__stats { display: grid; grid-template-columns: 1fr auto; gap: 6px 16px; margin: 16px 0 20px; padding: 13px; border: 2px solid var(--fr-timber); border-radius: 11px; background: rgba(245, 241, 229, 0.7); font-size: 13.5px; font-variant-numeric: tabular-nums; text-align: left; }
.fr-outcome__stats dt { color: rgba(42, 36, 32, 0.68); }
.fr-outcome__stats dd { margin: 0; color: var(--fr-timber-dark); font-weight: 900; }

.fr-account__body { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
.fr-account__status { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border: 2px solid var(--fr-green); border-radius: 9px; background: rgba(143, 209, 84, 0.16); }
.fr-account__form { display: flex; flex-direction: column; gap: 10px; }
.fr-field--stacked { flex-direction: column; align-items: stretch; gap: 5px; margin: 0; }
.fr-field--stacked span { color: var(--fr-timber-dark); font-size: 12.5px; }
.fr-field--stacked input { box-sizing: border-box; min-height: 44px; padding: 9px 11px; border: 2px solid var(--fr-timber); border-radius: 8px; background: var(--fr-paper-bright); color: var(--fr-ink); font: 14px/1.2 inherit; }
.fr-field--stacked input:focus-visible { outline: 3px solid var(--fr-gold-bright); outline-offset: 2px; }
.fr-account__error { margin: 0; padding: 9px 11px; border: 2px solid var(--fr-red); border-radius: 8px; background: rgba(212, 92, 66, 0.12); color: var(--fr-red); font-size: 13px; font-weight: 800; }

@media (max-width: 760px) {
  .fr-layer {
    padding: calc(10px + env(safe-area-inset-top)) calc(10px + env(safe-area-inset-right))
             calc(10px + env(safe-area-inset-bottom)) calc(10px + env(safe-area-inset-left));
  }
  .fr-panel--menu { grid-template-columns: 1fr; gap: 12px; max-height: calc(100dvh - 20px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); overflow-y: auto; text-align: center; }
  .fr-menu__copy { display: contents; }
  .fr-menu__hero { order: -1; min-height: 180px; }
  .fr-menu__hero-image { max-height: 190px; }
  .fr-title--hero { font-size: 36px; margin-inline: auto; }
  .fr-ribbon { margin-inline: auto; }
  .fr-actions--menu { grid-template-columns: 1fr; }
  .fr-actions--menu .fr-btn--large { grid-column: auto; }
  .fr-panel-layer {
    align-items: flex-end; padding: calc(10px + env(safe-area-inset-top))
      calc(10px + env(safe-area-inset-right)) calc(10px + env(safe-area-inset-bottom))
      calc(10px + env(safe-area-inset-left));
  }
  .fr-panel-card { width: 100%; max-height: calc(100dvh - 20px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); }
  .fr-market__row { grid-template-columns: 58px minmax(0, 1fr); }
  .fr-market__icon { width: 56px; height: 56px; }
  .fr-market__actions, .fr-market__row > .fr-btn { grid-column: 1 / -1; justify-self: stretch; }
  .fr-market__actions .fr-btn { flex: 1; }
  .fr-hud__top { grid-template-columns: minmax(0, 1fr); }
  .fr-hud__bar { grid-column: 1; justify-self: end; max-width: 70vw; }
  .fr-objective { grid-column: 1; justify-self: start; min-width: 0; max-width: 45vw; }
  .fr-menu-shortcut { grid-template-columns: 38px 26px; min-width: 76px; padding: 5px; }
  .fr-menu-shortcut__icon { width: 38px; height: 38px; }
  .fr-menu-shortcut__name { display: none; }
}

@media (max-height: 500px) and (orientation: landscape) {
  #app[data-mobile-optimized="true"] .fr-menu-shortcut {
    grid-template-columns: 38px 26px; min-width: 76px; min-height: 56px; padding: 5px;
  }
  #app[data-mobile-optimized="true"] .fr-menu-shortcut__icon { width: 38px; height: 38px; }
  #app[data-mobile-optimized="true"] .fr-menu-shortcut__name { display: none; }
  #app[data-mobile-optimized="true"] .fr-touch-joystick {
    width: 126px; height: 126px;
  }
  #app[data-mobile-optimized="true"] .fr-touch-button { min-width: 42px; min-height: 42px; }
  #app[data-mobile-optimized="true"] .fr-touch-actions {
    grid-template: 46px 46px / 52px 66px;
  }
  #app[data-mobile-optimized="true"] .fr-touch-gameplay > .fr-touch-button {
    left: calc(196px + env(safe-area-inset-left)); bottom: 140px;
  }
  #app[data-mobile-optimized="true"] .fr-coach {
    width: min(430px, 52vw); bottom: calc(8px + env(safe-area-inset-bottom));
  }
  #app[data-mobile-optimized="true"] .fr-hud__prompt,
  #app[data-mobile-optimized="true"] .fr-placing { bottom: calc(112px + env(safe-area-inset-bottom)); }
  #app[data-mobile-optimized="true"] .fr-menu-shortcuts {
    top: calc(8px + env(safe-area-inset-top)); left: calc(8px + env(safe-area-inset-left));
    right: auto; bottom: auto;
  }
  .fr-panel--menu { grid-template-columns: 1fr 1fr; text-align: left; }
  .fr-menu__hero { min-height: 160px; }
  .fr-menu__hero-image { max-height: 150px; }
}

@media (prefers-reduced-motion: reduce) {
  .fr-toast, .fr-progress__fill, .fr-btn, .fr-panel-card, .fr-coach, .fr-objective__fill, .fr-menu-shortcut {
    animation: none !important; transition: none !important;
  }
}
`;

export function injectStyles(doc: Document = document, id = 'farmrise-ui-styles'): void {
  if (doc.getElementById(id)) return;
  const style = doc.createElement('style');
  style.id = id;
  style.textContent = UI_STYLES;
  doc.head.appendChild(style);
}

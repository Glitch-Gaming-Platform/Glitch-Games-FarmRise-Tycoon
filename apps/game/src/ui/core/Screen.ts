/**
 * A Screen is a full-surface overlay: the menu, the loading screen, the pause
 * panel. Exactly one is visible at a time, and the HUD is separate because it
 * coexists with gameplay rather than replacing it.
 */
export interface Screen {
  readonly id: string;
  readonly root: HTMLElement;
  show?(): void;
  hide?(): void;
  dispose?(): void;
}

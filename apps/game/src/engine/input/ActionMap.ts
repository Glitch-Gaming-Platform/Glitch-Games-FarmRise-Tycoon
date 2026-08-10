/**
 * Bindings map physical inputs to named actions. Game code asks "is `interact`
 * down?", never "is KeyE down?", which is what makes rebinding and alternative
 * control schemes possible without touching gameplay.
 *
 * Keys are KeyboardEvent.code values (physical position), not `.key` values, so
 * WASD still lands under the same fingers on an AZERTY keyboard.
 */
export interface ActionBinding {
  readonly keys?: readonly string[];
  readonly mouseButtons?: readonly number[];
}

export type ActionMap<TAction extends string> = Readonly<Record<TAction, ActionBinding>>;

/** An axis built from two opposing actions, e.g. left/right -> -1..1. */
export interface AxisDefinition<TAction extends string> {
  readonly negative: TAction;
  readonly positive: TAction;
}

export function mergeBindings<TAction extends string>(
  base: ActionMap<TAction>,
  overrides: Partial<ActionMap<TAction>>,
): ActionMap<TAction> {
  const merged = { ...base } as Record<TAction, ActionBinding>;
  for (const [action, binding] of Object.entries(overrides) as [TAction, ActionBinding][]) {
    if (binding) merged[action] = binding;
  }
  return merged;
}

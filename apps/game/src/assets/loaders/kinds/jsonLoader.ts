import type { KindLoader } from './loaderTypes.js';

/** JSON data assets: level definitions, dialogue tables, balance overrides. */
export const loadJson: KindLoader<unknown> = async (entry, context) => {
  const response = await fetch(context.resolveUrl(entry.url), { signal: context.signal });
  if (!response.ok) throw new Error(`Failed to load JSON "${entry.id}": HTTP ${response.status}`);
  const data: unknown = await response.json();
  context.onProgress?.(1);
  return data;
};

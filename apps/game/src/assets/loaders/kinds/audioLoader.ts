/**
 * Audio clips.
 *
 * Returns the raw ArrayBuffer rather than a decoded AudioBuffer, because
 * decoding requires an AudioContext and the AudioContext cannot exist before
 * the first user gesture. AudioSystem decodes on registration instead.
 */
import type { KindLoader } from './loaderTypes.js';

export const loadAudio: KindLoader<ArrayBuffer> = async (entry, context) => {
  const response = await fetch(context.resolveUrl(entry.url), { signal: context.signal });
  if (!response.ok) throw new Error(`Failed to load audio "${entry.id}": HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  context.onProgress?.(1);
  return buffer;
};

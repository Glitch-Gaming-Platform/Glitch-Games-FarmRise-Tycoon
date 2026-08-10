/**
 * Video, for cutscenes and animated billboards.
 *
 * The element is created but not appended to the document: it exists purely as
 * a source for THREE.VideoTexture. `playsInline` and `muted` are mandatory -
 * without them iOS refuses to play the video at all outside fullscreen.
 */
import type { KindLoader } from './loaderTypes.js';

export const loadVideo: KindLoader<HTMLVideoElement> = (entry, context) =>
  new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement('video');
    video.src = context.resolveUrl(entry.url);
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.loop = Boolean(entry.options?.['loop']);
    video.preload = 'auto';

    const cleanup = (): void => {
      video.removeEventListener('canplaythrough', onReady);
      video.removeEventListener('error', onError);
      context.signal.removeEventListener('abort', onAbort);
    };
    const onReady = (): void => {
      cleanup();
      context.onProgress?.(1);
      resolve(video);
    };
    const onError = (): void => {
      cleanup();
      reject(new Error(`Failed to load video "${entry.id}".`));
    };
    const onAbort = (): void => {
      cleanup();
      video.src = '';
      reject(new DOMException('Aborted', 'AbortError'));
    };

    video.addEventListener('canplaythrough', onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
    context.signal.addEventListener('abort', onAbort, { once: true });
    video.load();
  });

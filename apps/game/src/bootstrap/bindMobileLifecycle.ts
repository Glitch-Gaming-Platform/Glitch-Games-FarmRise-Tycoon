import type { AudioSystem } from '@engine/audio/AudioSystem.js';
import type { GameLoop } from '@engine/core/GameLoop.js';
import type { InputSystem } from '@engine/input/InputSystem.js';

export interface MobileLifecycleOptions {
  readonly enabled: boolean;
  readonly loop: Pick<GameLoop, 'running' | 'start' | 'stop'>;
  readonly input: Pick<InputSystem<string>, 'setEnabled'>;
  readonly audio: Pick<AudioSystem, 'suspend' | 'resume'>;
  readonly document?: Document;
}

/** Stops GPU/simulation work and releases held touches while mobile Safari is hidden. */
export function bindMobileLifecycle(options: MobileLifecycleOptions): () => void {
  if (!options.enabled) return () => {};
  const doc = options.document ?? document;
  const view = doc.defaultView ?? globalThis;
  let resumeLoop = false;

  const suspend = (): void => {
    resumeLoop ||= options.loop.running;
    options.loop.stop();
    options.input.setEnabled(false);
    void options.audio.suspend();
  };
  const resume = (): void => {
    options.input.setEnabled(true);
    if (resumeLoop) options.loop.start();
    resumeLoop = false;
    void options.audio.resume();
  };
  const onVisibility = (): void => {
    if (doc.visibilityState === 'hidden') suspend();
    else resume();
  };

  doc.addEventListener('visibilitychange', onVisibility);
  view.addEventListener?.('pagehide', suspend);
  view.addEventListener?.('pageshow', resume);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    view.removeEventListener?.('pagehide', suspend);
    view.removeEventListener?.('pageshow', resume);
  };
}

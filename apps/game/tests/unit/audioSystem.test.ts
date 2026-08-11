import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioSystem } from '../../src/engine/audio/AudioSystem.js';

describe('AudioSystem counted playback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('schedules an exact repeat count and reports natural completion', async () => {
    const context = new MockAudioContext();
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          return context;
        }
      },
    );
    const audio = new AudioSystem();
    await audio.registerClip('music.test', new ArrayBuffer(8));
    const onEnded = vi.fn();

    audio.play('music.test', { bus: 'music', repeatCount: 5, onEnded });

    const source = context.sources[0];
    expect(source?.loop).toBe(true);
    expect(source?.stop).toHaveBeenCalledWith(52);
    source?.onended?.(new Event('ended'));
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it('does not report a manual fade-out as a completed song', async () => {
    const context = new MockAudioContext();
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          return context;
        }
      },
    );
    const audio = new AudioSystem();
    await audio.registerClip('music.test', new ArrayBuffer(8));
    const onEnded = vi.fn();

    const handle = audio.play('music.test', { repeatCount: 5, onEnded });
    handle.stop(0.2);
    context.sources[0]?.onended?.(new Event('ended'));

    expect(onEnded).not.toHaveBeenCalled();
    audio.unregister('music.test');
    expect(audio.has('music.test')).toBe(false);
  });
});

class MockAudioContext {
  readonly sampleRate = 48_000;
  readonly currentTime = 12;
  readonly destination = {};
  readonly sources: MockBufferSource[] = [];
  state: AudioContextState = 'running';

  createGain(): GainNode {
    return {
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
      },
      connect: vi.fn((destination: AudioNode) => destination),
    } as unknown as GainNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new MockBufferSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  async decodeAudioData(_data: ArrayBuffer): Promise<AudioBuffer> {
    return { duration: 8 } as AudioBuffer;
  }

  async close(): Promise<void> {
    this.state = 'closed';
  }
}

class MockBufferSource {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: ((event: Event) => void) | null = null;
  readonly playbackRate = { value: 1 };
  readonly detune = { value: 0 };
  readonly start = vi.fn();
  readonly stop = vi.fn();

  connect<T extends AudioNode>(destination: T): T {
    return destination;
  }
}

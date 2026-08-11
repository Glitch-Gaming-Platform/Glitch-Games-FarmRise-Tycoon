import { describe, expect, it, vi } from 'vitest';
import { bindMobileLifecycle } from '../../src/bootstrap/bindMobileLifecycle.js';

describe('mobile lifecycle', () => {
  it('stops and resumes only when the mobile profile is enabled', () => {
    const loop = { running: true, start: vi.fn(), stop: vi.fn() };
    const input = { setEnabled: vi.fn() };
    const audio = { suspend: vi.fn(async () => {}), resume: vi.fn(async () => {}) };
    const unbind = bindMobileLifecycle({ enabled: true, loop, input, audio, document });

    window.dispatchEvent(new Event('pagehide'));
    expect(loop.stop).toHaveBeenCalledOnce();
    expect(input.setEnabled).toHaveBeenLastCalledWith(false);
    expect(audio.suspend).toHaveBeenCalledOnce();

    window.dispatchEvent(new Event('pageshow'));
    expect(loop.start).toHaveBeenCalledOnce();
    expect(input.setEnabled).toHaveBeenLastCalledWith(true);
    expect(audio.resume).toHaveBeenCalledOnce();
    unbind();
  });

  it('leaves desktop lifecycle behavior untouched', () => {
    const loop = { running: true, start: vi.fn(), stop: vi.fn() };
    const input = { setEnabled: vi.fn() };
    const audio = { suspend: vi.fn(async () => {}), resume: vi.fn(async () => {}) };
    bindMobileLifecycle({ enabled: false, loop, input, audio, document });

    window.dispatchEvent(new Event('pagehide'));
    expect(loop.stop).not.toHaveBeenCalled();
    expect(input.setEnabled).not.toHaveBeenCalled();
  });
});

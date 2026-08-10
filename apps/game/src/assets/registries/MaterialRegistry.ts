/**
 * Named materials, created once and shared.
 *
 * Two reasons this exists rather than `new MeshStandardMaterial()` at each call
 * site: every distinct material is a separate shader program and a separate
 * draw call, and materials must be explicitly disposed or their GPU allocations
 * leak. A registry gives one place to do both.
 */
import type * as THREE from 'three';
import type { Disposable } from '@engine/core/types.js';

export type MaterialFactory = () => THREE.Material;

export class MaterialRegistry implements Disposable {
  readonly #factories = new Map<string, MaterialFactory>();
  readonly #instances = new Map<string, THREE.Material>();

  define(id: string, factory: MaterialFactory): this {
    if (this.#factories.has(id)) throw new Error(`Material "${id}" is already defined.`);
    this.#factories.set(id, factory);
    return this;
  }

  get(id: string): THREE.Material {
    const existing = this.#instances.get(id);
    if (existing) return existing;
    const factory = this.#factories.get(id);
    if (!factory) throw new Error(`Material "${id}" is not defined. Register it before use.`);
    const material = factory();
    material.name = id;
    this.#instances.set(id, material);
    return material;
  }

  has(id: string): boolean {
    return this.#factories.has(id);
  }

  dispose(): void {
    for (const material of this.#instances.values()) material.dispose();
    this.#instances.clear();
    this.#factories.clear();
  }
}

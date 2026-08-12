/** Lightweight close-up expression layer for the authored farmer. */
import * as THREE from 'three';
import type { WorkAction } from './Player.js';

export class PlayerExpressionView {
  readonly object = new THREE.Group();
  readonly #eyelids: THREE.InstancedMesh;
  readonly #brows: THREE.InstancedMesh | null;
  readonly #eyelidGeometry: THREE.BoxGeometry;
  readonly #browGeometry: THREE.BoxGeometry | null;
  readonly #eyelidMaterial: THREE.Material;
  readonly #browMaterial: THREE.MeshStandardMaterial | null;
  readonly #matrix = new THREE.Matrix4();
  readonly #position = new THREE.Vector3();
  readonly #scale = new THREE.Vector3(1, 1, 1);
  readonly #rotation = new THREE.Quaternion();
  readonly #euler = new THREE.Euler();

  constructor(advancedEffects = true) {
    this.#eyelidGeometry = new THREE.BoxGeometry(
      advancedEffects ? 0.071 : 0.067,
      advancedEffects ? 0.028 : 0.027,
      advancedEffects ? 0.02 : 0.018,
    );
    this.#eyelidMaterial = advancedEffects
      ? new THREE.MeshStandardMaterial({
          // palette.py: skin
          color: 0xf2c9a0,
          roughness: 0.94,
          metalness: 0,
        })
      : new THREE.MeshBasicMaterial({ color: 0xf2c9a0, toneMapped: false });
    this.#eyelids = new THREE.InstancedMesh(this.#eyelidGeometry, this.#eyelidMaterial, 2);
    this.#eyelids.name = 'FarmFace_Eyelids';
    this.#eyelids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.#eyelids.frustumCulled = false;
    this.#eyelids.visible = false;

    if (advancedEffects) {
      this.#browGeometry = new THREE.BoxGeometry(0.082, 0.018, 0.022);
      this.#browMaterial = new THREE.MeshStandardMaterial({
        // palette.py: brow_brown
        color: 0x4a3020,
        roughness: 0.9,
        metalness: 0,
      });
      this.#brows = new THREE.InstancedMesh(this.#browGeometry, this.#browMaterial, 2);
      this.#brows.name = 'FarmFace_ExpressiveBrows';
      this.#brows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.#brows.frustumCulled = false;
      this.#brows.visible = false;
      this.object.add(this.#eyelids, this.#brows);
    } else {
      // Low keeps the original single instanced blink draw and unlit material.
      this.#browGeometry = null;
      this.#browMaterial = null;
      this.#brows = null;
      this.object.add(this.#eyelids);
    }
  }

  sync(elapsedSeconds: number, action: WorkAction | null, progress: number): void {
    const primaryBlink = blinkPulse((elapsedSeconds + 0.37) % 4.7, 0.17);
    const doubleBlinkTime = (elapsedSeconds + 1.9) % 13.2;
    const doubleBlink = Math.max(
      blinkPulse(doubleBlinkTime, 0.14),
      blinkPulse(doubleBlinkTime - 0.24, 0.12),
    );
    const workSquint =
      action === 'harvest' && progress > 0.26 && progress < 0.74
        ? Math.sin(((progress - 0.26) / 0.48) * Math.PI) * 0.42
        : 0;
    const closure = Math.max(primaryBlink, doubleBlink, workSquint);
    this.#eyelids.visible = closure > 0.01;

    if (this.#eyelids.visible) {
      const height = 0.24 + closure * 0.76;
      for (let index = 0; index < 2; index += 1) {
        const side = index === 0 ? -1 : 1;
        this.#matrix.compose(
          this.#position.set(side * 0.081, 1.43 - workSquint * 0.012, 0.211),
          this.#rotation.identity(),
          this.#scale.set(1, height, 1),
        );
        this.#eyelids.setMatrixAt(index, this.#matrix);
      }
      this.#eyelids.instanceMatrix.needsUpdate = true;
    }

    const actionBeat = Math.sin(Math.min(1, Math.max(0, progress)) * Math.PI);
    let browStrength = 0;
    let browAngle = 0;
    let browHeight = 0;
    if (action === 'harvest') {
      browStrength = actionBeat;
      browAngle = 0.24;
      browHeight = -0.008;
    } else if (action === 'plant' || action === 'tend' || action === 'repair') {
      browStrength = actionBeat * 0.72;
      browAngle = 0.14;
      browHeight = -0.004;
    } else if (action === 'shoo') {
      browStrength = actionBeat;
      browAngle = -0.18;
      browHeight = 0.014;
    }
    if (!this.#brows) return;
    this.#brows.visible = browStrength > 0.01;
    if (!this.#brows.visible) return;
    for (let index = 0; index < 2; index += 1) {
      const side = index === 0 ? -1 : 1;
      this.#rotation.setFromEuler(this.#euler.set(0, 0, side * browAngle));
      this.#matrix.compose(
        this.#position.set(side * 0.082, 1.484 + browHeight, 0.214),
        this.#rotation,
        this.#scale.set(1, 1 + browStrength * 0.28, 1),
      );
      this.#brows.setMatrixAt(index, this.#matrix);
    }
    this.#brows.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.#eyelids.removeFromParent();
    this.#brows?.removeFromParent();
    this.#eyelidGeometry.dispose();
    this.#browGeometry?.dispose();
    this.#eyelidMaterial.dispose();
    this.#browMaterial?.dispose();
    this.object.clear();
  }
}

function blinkPulse(time: number, duration: number): number {
  if (time < 0 || time >= duration) return 0;
  const phase = time / duration;
  if (phase < 0.34) return smootherStep(phase / 0.34);
  if (phase < 0.44) return 1;
  return 1 - smootherStep((phase - 0.44) / 0.56);
}

function smootherStep(value: number): number {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
}

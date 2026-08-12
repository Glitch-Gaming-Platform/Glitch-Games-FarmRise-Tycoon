import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { ModelLibrary } from '@assets/registries/ModelLibrary.js';
import { Player } from '@game/player/Player.js';
import { PlayerExpressionView } from '@game/player/PlayerExpressionView.js';
import { PlayerView } from '@game/player/PlayerView.js';

function authoredAvatarLibrary(): ModelLibrary {
  const geometry = new THREE.BoxGeometry(0.42, 1.6, 0.3);
  geometry.translate(0, 0.8, 0);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: false,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  return {
    has: (name: string) => name === 'SM_char_farmer',
    require: () => geometry,
    material,
  } as unknown as ModelLibrary;
}

function instanceEulerZ(mesh: THREE.InstancedMesh, index: number): number {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  mesh.getMatrixAt(index, matrix);
  matrix.decompose(position, rotation, scale);
  return new THREE.Euler().setFromQuaternion(rotation).z;
}

describe('player avatar visuals', () => {
  it('keeps face animation in two instanced passes with lit materials and a readable blink', () => {
    const expression = new PlayerExpressionView();
    const eyelids = expression.object.getObjectByName('FarmFace_Eyelids');
    const brows = expression.object.getObjectByName('FarmFace_ExpressiveBrows');

    expect(eyelids).toBeInstanceOf(THREE.InstancedMesh);
    expect(brows).toBeInstanceOf(THREE.InstancedMesh);
    if (!(eyelids instanceof THREE.InstancedMesh) || !(brows instanceof THREE.InstancedMesh))
      return;

    expect(expression.object.children).toEqual([eyelids, brows]);
    expect(eyelids.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(brows.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(eyelids.instanceMatrix.usage).toBe(THREE.DynamicDrawUsage);
    expect(brows.instanceMatrix.usage).toBe(THREE.DynamicDrawUsage);

    expression.sync(0, null, 0);
    expect(eyelids.visible).toBe(false);
    expect(brows.visible).toBe(false);

    // The primary 4.7 s blink is fully closed around this deterministic beat.
    expression.sync(4.4, null, 0);
    expect(eyelids.visible).toBe(true);
    const blinkMatrix = new THREE.Matrix4();
    const blinkPosition = new THREE.Vector3();
    const blinkRotation = new THREE.Quaternion();
    const blinkScale = new THREE.Vector3();
    eyelids.getMatrixAt(0, blinkMatrix);
    blinkMatrix.decompose(blinkPosition, blinkRotation, blinkScale);
    expect(blinkScale.y).toBeCloseTo(1, 3);
    expect(blinkPosition.z).toBeGreaterThan(0.2);

    expression.dispose();
  });

  it('angles work brows inward for focus and reverses them for a shoo reaction', () => {
    const expression = new PlayerExpressionView();
    const brows = expression.object.getObjectByName('FarmFace_ExpressiveBrows');
    expect(brows).toBeInstanceOf(THREE.InstancedMesh);
    if (!(brows instanceof THREE.InstancedMesh)) return;

    expression.sync(0, 'tend', 0.5);
    expect(brows.visible).toBe(true);
    expect(instanceEulerZ(brows, 0)).toBeLessThan(0);
    expect(instanceEulerZ(brows, 1)).toBeGreaterThan(0);

    expression.sync(0, 'shoo', 0.5);
    expect(instanceEulerZ(brows, 0)).toBeGreaterThan(0);
    expect(instanceEulerZ(brows, 1)).toBeLessThan(0);

    expression.dispose();
  });

  it('keeps low on the original single unlit blink draw', () => {
    const expression = new PlayerExpressionView(false);
    const eyelids = expression.object.getObjectByName('FarmFace_Eyelids');
    expect(eyelids).toBeInstanceOf(THREE.InstancedMesh);
    expect(expression.object.getObjectByName('FarmFace_ExpressiveBrows')).toBeUndefined();
    expect(expression.object.children).toHaveLength(1);
    expect((eyelids as THREE.InstancedMesh).material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expression.dispose();
  });

  it('uses the existing body, outline and shadow passes for silhouette and grounding', () => {
    const player = new Player(0, 0);
    const view = new PlayerView(player, authoredAvatarLibrary(), true);
    const body = view.object.getObjectByName('FarmAvatar_Body');
    const outline = view.object.getObjectByName('FarmAvatar_Outline');
    const contactShadow = view.object.getObjectByName('FarmAvatar_ContactShadow');

    expect(body).toBeInstanceOf(THREE.SkinnedMesh);
    expect(outline).toBeInstanceOf(THREE.SkinnedMesh);
    expect(contactShadow).toBeInstanceOf(THREE.Mesh);
    if (
      !(body instanceof THREE.SkinnedMesh) ||
      !(outline instanceof THREE.SkinnedMesh) ||
      !(contactShadow instanceof THREE.Mesh)
    ) {
      return;
    }

    const bodyMaterial = body.material as THREE.MeshStandardMaterial;
    const outlineMaterial = outline.material as THREE.MeshBasicMaterial;
    const shadowMaterial = contactShadow.material as THREE.MeshBasicMaterial;
    expect(body.geometry).toBe(outline.geometry);
    expect(bodyMaterial.side).toBe(THREE.DoubleSide);
    expect(bodyMaterial.roughness).toBeCloseTo(0.82);
    expect(body.receiveShadow).toBe(true);
    expect(outlineMaterial.side).toBe(THREE.BackSide);
    expect(outlineMaterial.color.getHex()).toBe(0x87979f);
    expect(outlineMaterial.transparent).toBe(true);
    expect(outlineMaterial.opacity).toBeCloseTo(0.54);
    expect(outlineMaterial.depthWrite).toBe(false);
    expect(outline.scale.x).toBeCloseTo(1.032);
    expect(shadowMaterial.alphaMap).toBeInstanceOf(THREE.DataTexture);
    expect(shadowMaterial.alphaMap?.image).toMatchObject({ width: 32, height: 32 });
    expect(shadowMaterial.alphaMap?.minFilter).toBe(THREE.LinearFilter);
    expect(shadowMaterial.alphaMap?.generateMipmaps).toBe(false);

    const skinnedDraws: THREE.SkinnedMesh[] = [];
    const faceDraws: THREE.InstancedMesh[] = [];
    view.object.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) skinnedDraws.push(object);
      if (
        object instanceof THREE.InstancedMesh &&
        (object.name === 'FarmFace_Eyelids' || object.name === 'FarmFace_ExpressiveBrows')
      ) {
        faceDraws.push(object);
      }
    });
    expect(skinnedDraws).toHaveLength(2);
    expect(faceDraws).toHaveLength(2);

    const disposeBody = vi.spyOn(bodyMaterial, 'dispose');
    const disposeOutline = vi.spyOn(outlineMaterial, 'dispose');
    const disposeShadowTexture = vi.spyOn(shadowMaterial.alphaMap!, 'dispose');
    view.dispose();
    expect(disposeBody).toHaveBeenCalledOnce();
    expect(disposeOutline).toHaveBeenCalledOnce();
    expect(disposeShadowTexture).toHaveBeenCalledOnce();
  });

  it('preserves the low avatar draw and shader path', () => {
    const player = new Player(0, 0);
    const view = new PlayerView(player, authoredAvatarLibrary(), false);
    const body = view.object.getObjectByName('FarmAvatar_Body') as THREE.SkinnedMesh;
    const outline = view.object.getObjectByName('FarmAvatar_Outline') as THREE.SkinnedMesh;
    const contactShadow = view.object.getObjectByName('FarmAvatar_ContactShadow') as THREE.Mesh;
    const outlineMaterial = outline.material as THREE.MeshBasicMaterial;
    const shadowMaterial = contactShadow.material as THREE.MeshBasicMaterial;

    expect((body.material as THREE.MeshStandardMaterial).roughness).toBeCloseTo(0.85);
    expect(body.receiveShadow).toBe(false);
    expect(outlineMaterial.color.getHex()).toBe(0xaebac1);
    expect(outlineMaterial.opacity).toBeCloseTo(0.62);
    expect(outline.scale.x).toBeCloseTo(1.04);
    expect(shadowMaterial.alphaMap).toBeNull();
    expect(shadowMaterial.opacity).toBeCloseTo(0.18);

    const skinnedDraws: THREE.SkinnedMesh[] = [];
    const faceDraws: THREE.InstancedMesh[] = [];
    view.object.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) skinnedDraws.push(object);
      if (
        object instanceof THREE.InstancedMesh &&
        (object.name === 'FarmFace_Eyelids' || object.name === 'FarmFace_ExpressiveBrows')
      ) {
        faceDraws.push(object);
      }
    });
    expect(skinnedDraws).toHaveLength(2);
    expect(faceDraws).toHaveLength(1);
    expect(faceDraws[0]?.name).toBe('FarmFace_Eyelids');
    view.dispose();
  });
});

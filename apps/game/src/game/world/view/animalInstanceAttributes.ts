import * as THREE from 'three';

export interface AnimalInstanceAttributes {
  readonly motion: THREE.InstancedBufferAttribute;
  readonly action: THREE.InstancedBufferAttribute;
  readonly gaitPhase: THREE.InstancedBufferAttribute;
}

export function addAnimalInstanceAttributes(
  geometry: THREE.BufferGeometry,
  capacity: number,
): void {
  geometry.setAttribute(
    'farmMotion',
    new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  geometry.setAttribute(
    'farmAction',
    new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  geometry.setAttribute(
    'farmGaitPhase',
    new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
}

export function getAnimalInstanceAttributes(
  geometry: THREE.BufferGeometry,
): AnimalInstanceAttributes {
  return {
    motion: geometry.getAttribute('farmMotion') as THREE.InstancedBufferAttribute,
    action: geometry.getAttribute('farmAction') as THREE.InstancedBufferAttribute,
    gaitPhase: geometry.getAttribute('farmGaitPhase') as THREE.InstancedBufferAttribute,
  };
}

export function writeAnimalInstanceAttributes(
  attributes: AnimalInstanceAttributes,
  index: number,
  motion: number,
  action: number,
  gaitPhase: number,
): void {
  attributes.motion.setX(index, motion);
  attributes.action.setX(index, action);
  attributes.gaitPhase.setX(index, gaitPhase);
}

export function markAnimalInstanceAttributesDirty(attributes: AnimalInstanceAttributes): void {
  attributes.motion.needsUpdate = true;
  attributes.action.needsUpdate = true;
  attributes.gaitPhase.needsUpdate = true;
}

/**
 * Fixed-capacity world-space burst and ripple pools.
 *
 * Both meshes and every particle record are allocated once. Triggers only
 * overwrite slots, and update reuses one matrix/quaternion/vector set, so a
 * busy harvest or incident cannot turn into a garbage-collection hitch.
 */
import * as THREE from 'three';

export interface BurstSpec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly count: number;
  readonly radius: number;
  readonly speed: number;
  readonly lift: number;
  readonly duration: number;
  readonly size: number;
  readonly gravity: number;
  readonly drag: number;
  readonly flatten?: number;
  readonly colours: readonly number[];
  readonly seed?: number;
}

export interface RingSpec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly duration: number;
  readonly startRadius: number;
  readonly endRadius: number;
  readonly colour: number;
}

interface BurstParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  duration: number;
  size: number;
  gravity: number;
  drag: number;
  flatten: number;
  phase: number;
  colour: THREE.Color;
}

interface RippleRing {
  active: boolean;
  x: number;
  y: number;
  z: number;
  life: number;
  duration: number;
  startRadius: number;
  endRadius: number;
  colour: THREE.Color;
}

const HIDDEN_SCALE = 0.0001;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export class PooledWorldEffects {
  readonly object = new THREE.Group();
  readonly particles: THREE.InstancedMesh;
  readonly rings: THREE.InstancedMesh;
  readonly #particleState: BurstParticle[];
  readonly #ringState: RippleRing[];
  readonly #matrix = new THREE.Matrix4();
  readonly #position = new THREE.Vector3();
  readonly #scale = new THREE.Vector3();
  readonly #rotation = new THREE.Quaternion();
  readonly #axis = new THREE.Vector3(0, 1, 0);
  #particleCursor = 0;
  #ringCursor = 0;
  #activeParticles = 0;
  #activeRings = 0;

  constructor(particleCapacity = 96, ringCapacity = 18) {
    const particleGeometry = new THREE.DodecahedronGeometry(0.05, 0);
    const particleMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      toneMapped: false,
    });
    this.particles = new THREE.InstancedMesh(particleGeometry, particleMaterial, particleCapacity);
    this.particles.name = 'PooledWorldBurstParticles';
    this.particles.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(particleCapacity * 3).fill(1),
      3,
    );
    this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particles.frustumCulled = false;
    this.particles.visible = false;

    const ringGeometry = new THREE.TorusGeometry(1, 0.045, 5, 28);
    ringGeometry.rotateX(Math.PI / 2);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.rings = new THREE.InstancedMesh(ringGeometry, ringMaterial, ringCapacity);
    this.rings.name = 'PooledWorldImpactRings';
    this.rings.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(ringCapacity * 3).fill(1),
      3,
    );
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rings.frustumCulled = false;
    this.rings.visible = false;

    this.#particleState = Array.from({ length: particleCapacity }, () => ({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      duration: 1,
      size: 1,
      gravity: 0,
      drag: 0,
      flatten: 1,
      phase: 0,
      colour: new THREE.Color(0xffffff),
    }));
    this.#ringState = Array.from({ length: ringCapacity }, () => ({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      life: 0,
      duration: 1,
      startRadius: 0,
      endRadius: 1,
      colour: new THREE.Color(0xffffff),
    }));
    this.object.add(this.particles, this.rings);
  }

  get particleCapacity(): number {
    return this.#particleState.length;
  }

  get ringCapacity(): number {
    return this.#ringState.length;
  }

  get activeParticleCount(): number {
    return this.#activeParticles;
  }

  get activeRingCount(): number {
    return this.#activeRings;
  }

  emitBurst(spec: BurstSpec): void {
    const colourCount = Math.max(1, spec.colours.length);
    const baseSeed = spec.seed ?? this.#particleCursor * 0.37;
    for (let index = 0; index < spec.count; index += 1) {
      const particle = this.#particleState[this.#particleCursor];
      if (!particle) return;
      this.#particleCursor = (this.#particleCursor + 1) % this.#particleState.length;
      const angle = index * GOLDEN_ANGLE + baseSeed;
      const radial = spec.radius * (0.28 + ((index * 0.618 + baseSeed) % 1) * 0.72);
      const speed = spec.speed * (0.72 + ((index * 0.414 + baseSeed) % 1) * 0.42);
      particle.active = true;
      particle.x = spec.x + Math.cos(angle) * radial;
      particle.y = spec.y;
      particle.z = spec.z + Math.sin(angle) * radial;
      particle.vx = Math.cos(angle) * speed;
      particle.vy = spec.lift * (0.76 + ((index * 0.732 + baseSeed) % 1) * 0.5);
      particle.vz = Math.sin(angle) * speed;
      particle.duration = spec.duration * (0.82 + ((index * 0.291 + baseSeed) % 1) * 0.34);
      particle.life = particle.duration;
      particle.size = spec.size * (0.74 + ((index * 0.517 + baseSeed) % 1) * 0.48);
      particle.gravity = spec.gravity;
      particle.drag = spec.drag;
      particle.flatten = spec.flatten ?? 1;
      particle.phase = angle;
      particle.colour.setHex(spec.colours[index % colourCount] ?? 0xffffff);
    }
  }

  emitRing(spec: RingSpec): void {
    const ring = this.#ringState[this.#ringCursor];
    if (!ring) return;
    this.#ringCursor = (this.#ringCursor + 1) % this.#ringState.length;
    ring.active = true;
    ring.x = spec.x;
    ring.y = spec.y;
    ring.z = spec.z;
    ring.duration = spec.duration;
    ring.life = spec.duration;
    ring.startRadius = spec.startRadius;
    ring.endRadius = spec.endRadius;
    ring.colour.setHex(spec.colour);
  }

  update(deltaSeconds: number): void {
    const dt = Math.min(0.05, Math.max(0, deltaSeconds));
    this.#activeParticles = 0;
    for (let index = 0; index < this.#particleState.length; index += 1) {
      const particle = this.#particleState[index]!;
      if (particle.active) {
        particle.life -= dt;
        if (particle.life <= 0) particle.active = false;
        else {
          const damping = Math.exp(-particle.drag * dt);
          particle.vx *= damping;
          particle.vz *= damping;
          particle.vy -= particle.gravity * dt;
          particle.x += particle.vx * dt;
          particle.y += particle.vy * dt;
          particle.z += particle.vz * dt;
        }
      }

      if (!particle.active) {
        this.#matrix.compose(
          this.#position.set(particle.x, particle.y, particle.z),
          this.#rotation.identity(),
          this.#scale.setScalar(HIDDEN_SCALE),
        );
      } else {
        this.#activeParticles += 1;
        const age = 1 - particle.life / particle.duration;
        const envelope = Math.sin(Math.min(1, age) * Math.PI);
        const size = particle.size * (0.3 + envelope * 0.92);
        this.#rotation.setFromAxisAngle(this.#axis, particle.phase + age * 2.6);
        this.#matrix.compose(
          this.#position.set(particle.x, Math.max(0.018, particle.y), particle.z),
          this.#rotation,
          this.#scale.set(size, size * particle.flatten, size),
        );
      }
      this.particles.setMatrixAt(index, this.#matrix);
      this.particles.setColorAt(index, particle.colour);
    }
    this.particles.count = this.#particleState.length;
    this.particles.instanceMatrix.needsUpdate = true;
    if (this.particles.instanceColor) this.particles.instanceColor.needsUpdate = true;
    this.particles.visible = this.#activeParticles > 0;

    this.#activeRings = 0;
    for (let index = 0; index < this.#ringState.length; index += 1) {
      const ring = this.#ringState[index]!;
      if (ring.active) {
        ring.life -= dt;
        if (ring.life <= 0) ring.active = false;
      }
      if (!ring.active) {
        this.#matrix.compose(
          this.#position.set(ring.x, ring.y, ring.z),
          this.#rotation.identity(),
          this.#scale.setScalar(HIDDEN_SCALE),
        );
      } else {
        this.#activeRings += 1;
        const age = 1 - ring.life / ring.duration;
        const radius = THREE.MathUtils.lerp(ring.startRadius, ring.endRadius, 1 - (1 - age) ** 2);
        const fade = Math.max(0.06, 1 - age);
        this.#matrix.compose(
          this.#position.set(ring.x, ring.y, ring.z),
          this.#rotation.identity(),
          this.#scale.set(radius, radius * fade, radius),
        );
      }
      this.rings.setMatrixAt(index, this.#matrix);
      this.rings.setColorAt(index, ring.colour);
    }
    this.rings.count = this.#ringState.length;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    this.rings.visible = this.#activeRings > 0;
  }

  dispose(): void {
    this.particles.geometry.dispose();
    (this.particles.material as THREE.Material).dispose();
    this.rings.geometry.dispose();
    (this.rings.material as THREE.Material).dispose();
    this.object.removeFromParent();
    this.object.clear();
  }
}

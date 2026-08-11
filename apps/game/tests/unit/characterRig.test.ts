/**
 * The rig's three load-bearing claims: phase is continuous, feet do not slide,
 * and the skin binds every vertex to something sensible.
 *
 * Each of these replaces a specific defect the audit found, so each test is
 * written to fail against the old behaviour rather than merely to describe the
 * new one.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CharacterRig } from '@game/player/rig/CharacterRig.js';
import { createSkeleton, createSkinnedGeometry } from '@game/player/rig/autoSkin.js';
import { BONE_INDEX, BONES, SHIN_LENGTH, THIGH_LENGTH } from '@game/player/rig/skeletonDefinition.js'; // prettier-ignore
import { ankleFromHip, createJointBuffer, measureStrideLength, sampleClip, sampleGait } from '@game/player/rig/clipSampler.js'; // prettier-ignore
import { RUN, WALK } from '@game/player/rig/poseClips.js';
import { solveTwoBone } from '@game/player/rig/ikSolver.js';

function makeRig(): CharacterRig {
  const { bones } = createSkeleton();
  return new CharacterRig(bones);
}

const IDLE_INPUT = {
  facing: 0,
  turn: 0,
  working: false,
  workAction: null,
  workProgress: 0,
  waveProgress: 0,
} as const;

describe('gait phase integration', () => {
  it('never jumps when speed changes mid-stride', () => {
    // The original bug: phase was `elapsedSeconds * (7.4 + locomotion * 2.2)`.
    // At t = 30 s a speed change re-scaled the whole accumulated phase and the
    // character teleported several cycles. Reproduced here by running for a
    // while at one speed and then changing it abruptly.
    const rig = makeRig();
    for (let i = 0; i < 1800; i += 1) {
      rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 3.0 });
    }

    const before = rig.phase;
    rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 7.4 });
    const after = rig.phase;

    // One frame at the highest speed advances at most speed*dt/stride of a
    // cycle. Anything beyond that is a discontinuity, not motion.
    const delta = Math.abs(((after - before + 1.5) % 1) - 0.5);
    expect(delta).toBeLessThan(0.15);
  });

  it('advances phase in proportion to distance below the cadence cap', () => {
    // Two runs covering the same distance at different speeds land on the same
    // point in the cycle. This is what keeps the feet tied to the ground, and
    // it holds exactly while cadence is under its ceiling.
    const slow = makeRig();
    for (let i = 0; i < 240; i += 1) {
      slow.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 0.3 });
    }
    const fast = makeRig();
    for (let i = 0; i < 120; i += 1) {
      fast.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 0.6 });
    }
    expect(slow.strideScale).toBe(1);
    expect(fast.strideScale).toBe(1);
    // Both covered 1.2 m. A time-driven phase would be a full cycle apart.
    expect(Math.abs(slow.phase - fast.phase)).toBeLessThan(0.06);
  });

  it('caps cadence and widens the swing instead, above walking speed', () => {
    // The farmer's legs cannot honestly cover 6.5 m/s. Rather than spin at
    // twenty cycles a second, cadence saturates and the stride widens - and
    // the rig reports that it is doing so rather than hiding it.
    const rig = makeRig();
    for (let i = 0; i < 120; i += 1) {
      rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 6.5 });
    }
    expect(rig.strideScale).toBeGreaterThan(1.5);

    let maxAdvance = 0;
    let previous = rig.phase;
    for (let i = 0; i < 120; i += 1) {
      rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 6.5 });
      maxAdvance = Math.max(maxAdvance, (rig.phase - previous + 1) % 1);
      previous = rig.phase;
    }
    // Three cycles per second is the ceiling, so one 60 Hz frame may advance
    // at most a twentieth of a cycle.
    expect(maxAdvance).toBeLessThanOrEqual(3.0 / 60 + 1e-6);
  });

  it('keeps the normal-speed walk compact instead of kicking the feet forward', () => {
    // 6.5 m/s is `Player.walkSpeed` - what the character does on held W, with
    // no sprint. This is the case the audit called a goose-step.
    const rig = makeRig();
    let maximumForwardThigh = -Infinity;
    let maximumForwardAnkle = -Infinity;
    for (let i = 0; i < 240; i += 1) {
      rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 6.5 });
      for (const side of ['L', 'R'] as const) {
        const thigh = rig.bones[BONE_INDEX[`thigh.${side}`]!]!.rotation.x;
        const shin = rig.bones[BONE_INDEX[`shin.${side}`]!]!.rotation.x;
        maximumForwardThigh = Math.max(maximumForwardThigh, thigh);
        maximumForwardAnkle = Math.max(maximumForwardAnkle, ankleFromHip(thigh, shin).forward);
      }
    }

    // Two separate faults used to drive this to 0.71 rad - 40 degrees of hip
    // flexion, a near-horizontal shoe at the gameplay camera. The blend window
    // put an ordinary walk at 78% of the RUN clip, whose hip flexion is more
    // than twice the walk's, and the stride warp then scaled that up again in
    // both directions. A walk at walking speed should look like the walk clip.
    expect(maximumForwardThigh).toBeGreaterThan(0.2);
    expect(maximumForwardThigh).toBeLessThan(0.42);

    // The silhouette measure, and the one the audit was actually reacting to:
    // how far in front of the hip the ankle gets. Legs are 0.385 m, so this is
    // under a third of a leg length ahead.
    expect(maximumForwardAnkle).toBeLessThan(0.14);
  });

  it('does not vibrate the legs at ordinary gameplay speed', () => {
    // The jitter had one cause and one aggravator, and this test fails against
    // either. The cause: the foot lock advanced its IK target by real ground
    // distance (0.108 m per frame at 6.5 m/s) while the capped cadence only
    // moved the pose about 0.010 m, so every frame applied a violent
    // correction, went out of reach, clamped and released. The aggravator: one
    // shared plant/release threshold, so the foot state flipped on consecutive
    // frames whenever clearance sat on the boundary.
    for (const speed of [1.5, 6.5, 10.4]) {
      const rig = makeRig();
      for (let i = 0; i < 180; i += 1) {
        rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed });
      }

      let previousAngle = rig.bones[BONE_INDEX['thigh.L']!]!.rotation.x;
      let previousVelocity = 0;
      let worstAcceleration = 0;
      let reversals = 0;
      const frames = 120;
      for (let i = 0; i < frames; i += 1) {
        rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed });
        const angle = rig.bones[BONE_INDEX['thigh.L']!]!.rotation.x;
        const velocity = angle - previousAngle;
        worstAcceleration = Math.max(worstAcceleration, Math.abs(velocity - previousVelocity));
        if (Math.sign(velocity) !== Math.sign(previousVelocity) && Math.abs(velocity) > 0.005) {
          reversals += 1;
        }
        previousVelocity = velocity;
        previousAngle = angle;
      }

      // Angular acceleration is the right measure: a smooth cycle has small
      // frame-to-frame velocity change no matter how fast it runs, while a
      // single snapped IK correction spikes it. The old rig hit 1.05 rad per
      // frame squared here; a clean cycle stays an order of magnitude below.
      expect(worstAcceleration).toBeLessThan(0.3);

      // A walk cycle reverses the hip exactly twice - once at peak flexion,
      // once at peak extension. 120 frames at the 2.7 cycles/s cap is about
      // 5.4 cycles, so roughly 11 reversals is correct and anything much above
      // that is the leg changing direction when the clip did not ask it to.
      expect(reversals).toBeLessThanOrEqual(14);
    }
  });

  it('holds phase still when the player stops', () => {
    const rig = makeRig();
    for (let i = 0; i < 60; i += 1) {
      rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 4 });
    }
    const moving = rig.phase;
    for (let i = 0; i < 60; i += 1) {
      rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 0 });
    }
    expect(rig.phase).toBe(moving);
  });
});

describe('authored root and secondary motion', () => {
  it('lowers the centre of mass for planting instead of lifting bent feet', () => {
    const rig = makeRig();
    rig.update({
      ...IDLE_INPUT,
      deltaSeconds: 1 / 60,
      speed: 0,
      working: true,
      workAction: 'plant',
      workProgress: 0.52,
    });

    expect(rig.rootOffset.y).toBeLessThan(-0.1);
    expect(rig.rootOffset.z).toBeGreaterThan(0.03);
  });

  it('carries a visible centre-of-mass arc through a run cycle', () => {
    const rig = makeRig();
    let minimum = Infinity;
    let maximum = -Infinity;
    // Sprint speed: walkSpeed 6.5 times sprintMultiplier 1.6. This is the only
    // speed the game can produce that should read as a run, and the blend
    // window is anchored to it.
    for (let i = 0; i < 180; i += 1) {
      rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 10.4 });
      minimum = Math.min(minimum, rig.rootOffset.y);
      maximum = Math.max(maximum, rig.rootOffset.y);
    }
    expect(maximum - minimum).toBeGreaterThan(0.06);
  });

  it('lets the ponytail and satchel lag a turn independently of the torso', () => {
    const rig = makeRig();
    rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 4, turn: 1 });
    const ponytail = rig.bones[BONE_INDEX['ponytail']!]!;
    const satchel = rig.bones[BONE_INDEX['satchel']!]!;

    expect(Math.abs(ponytail.rotation.z)).toBeGreaterThan(0.1);
    expect(Math.abs(satchel.rotation.z)).toBeGreaterThan(0.08);
    expect(Math.sign(ponytail.rotation.z)).not.toBe(Math.sign(satchel.rotation.z));
  });

  it('uses both arms and a body bounce for the fox-scare gesture', () => {
    const rig = makeRig();
    rig.update({
      ...IDLE_INPUT,
      deltaSeconds: 1 / 60,
      speed: 0,
      waveProgress: 0.46,
    });

    expect(Math.abs(rig.bones[BONE_INDEX['upperarm.L']!]!.rotation.z)).toBeGreaterThan(1);
    expect(Math.abs(rig.bones[BONE_INDEX['upperarm.R']!]!.rotation.z)).toBeGreaterThan(1);
    expect(rig.rootOffset.y).toBeGreaterThan(0.01);
  });
});

describe('stride measurement', () => {
  it('derives a stride length from the walk keys rather than a constant', () => {
    const stride = measureStrideLength(WALK);
    // Sanity: a 0.38 m leg cannot take a 2 m step, and a walk that advanced a
    // centimetre per cycle would need an absurd cadence.
    expect(stride).toBeGreaterThan(0.2);
    expect(stride).toBeLessThan(0.9);
  });

  it('spends most of the walk excursion behind the hip, not in front of it', () => {
    // This is the shape fix, stated as a property rather than as numbers that
    // someone could satisfy by scaling the whole table up.
    //
    // The original keys reached +0.31 rad in front and only -0.26 behind. A
    // leg thrown forward of the body is the goose-step silhouette; a real walk
    // lands the foot near under the hip and does its length in extension,
    // pushing the trailing leg out behind. Getting this backwards is why the
    // clip was short (stance is the trailing half, so stride was small) *and*
    // why it kicked, and both symptoms move together when it is corrected.
    const out = createJointBuffer(BONES.length);
    let front = -Infinity;
    let back = Infinity;
    for (let i = 0; i < 240; i += 1) {
      out.fill(0);
      sampleClip(WALK, i / 240, out, 1);
      const thigh = out[BONE_INDEX['thigh.L']! * 3]!;
      front = Math.max(front, thigh);
      back = Math.min(back, thigh);
    }
    expect(Math.abs(back)).toBeGreaterThan(front);

    // And the extra extension has to be real ground contact, not just a raised
    // heel: stride is measured across the stance window only, so a clip that
    // faked its length with a bigger toe-off would not move this number.
    expect(measureStrideLength(WALK)).toBeGreaterThan(0.25);
  });

  it('tracks the poses, so editing the keys cannot desynchronise the feet', () => {
    // A run reaches further than a walk. If this ever stopped holding, the
    // measurement would have decoupled from the clip - which is precisely the
    // failure mode a hard-coded stride constant has.
    expect(measureStrideLength(RUN)).toBeGreaterThan(measureStrideLength(WALK));
  });
});

describe('foot planting', () => {
  it('keeps the stance ankle within a centimetre of where it planted', () => {
    const rig = makeRig();
    const bones = rig.bones;
    const foot = bones[BONE_INDEX['foot.L']!]!;
    const world = new THREE.Vector3();

    // Warm up so the speed blend has settled. Deliberately a speed the legs
    // can honestly cover: above the cadence cap the rig is openly warping the
    // stride, and planting is no longer something it claims to guarantee.
    const speed = 0.5;
    for (let i = 0; i < 180; i += 1) {
      rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed });
    }
    expect(rig.strideScale).toBe(1);

    // Walk forward, tracking the left ankle in world space while accounting for
    // the body's own travel. During stance the two must cancel.
    let travelled = 0;
    let previousWorldZ: number | null = null;
    let maxSlide = 0;
    for (let i = 0; i < 240; i += 1) {
      const dt = 1 / 60;
      rig.update({ ...IDLE_INPUT, deltaSeconds: dt, speed });
      travelled += speed * dt;
      bones[0]!.updateMatrixWorld(true);
      foot.getWorldPosition(world);
      const groundClearance = world.y;
      const worldZ = world.z + travelled;
      if (groundClearance < 0.06 && previousWorldZ !== null) {
        maxSlide = Math.max(maxSlide, Math.abs(worldZ - previousWorldZ));
      }
      previousWorldZ = groundClearance < 0.06 ? worldZ : null;
    }

    // Per-frame slip while the foot is down. A sine-driven leg with no relation
    // to ground speed slips by several centimetres every frame here.
    expect(maxSlide).toBeLessThan(0.012);
  });
});

describe('two-bone IK', () => {
  it('places the end effector on a reachable target', () => {
    const solution = solveTwoBone(0.1, 0.3, THIGH_LENGTH, SHIN_LENGTH, 1);
    expect(solution.clamped).toBe(false);
    const { forward, depth } = ankleFromHip(solution.upper, solution.lower);
    expect(forward).toBeCloseTo(0.1, 3);
    expect(depth).toBeCloseTo(0.3, 3);
  });

  it('reports clamping instead of silently producing a broken pose', () => {
    const solution = solveTwoBone(0, 99, THIGH_LENGTH, SHIN_LENGTH, 1);
    expect(solution.clamped).toBe(true);
    expect(Number.isFinite(solution.upper)).toBe(true);
    expect(Number.isFinite(solution.lower)).toBe(true);
  });

  it('bends the knee backwards and the elbow forwards', () => {
    const knee = solveTwoBone(0.05, 0.3, THIGH_LENGTH, SHIN_LENGTH, 1);
    const elbow = solveTwoBone(0.05, 0.2, 0.18, 0.15, -1);
    expect(knee.lower).toBeLessThan(0);
    expect(elbow.lower).toBeGreaterThan(0);
  });
});

describe('clip sampling', () => {
  it('passes exactly through authored keys', () => {
    // If interpolation did not honour its keys, "authored" would be a fiction.
    const out = createJointBuffer(BONES.length);
    const key = WALK.keys[2]!;
    sampleClip(WALK, key.t, out, 1);
    const thigh = out[BONE_INDEX['thigh.L']! * 3]!;
    expect(thigh).toBeCloseTo(key.pose['thigh.L']![0], 4);
  });

  it('mirrors the gait onto the opposite leg half a cycle out of phase', () => {
    const out = createJointBuffer(BONES.length);
    const scratch = createJointBuffer(BONES.length);
    sampleGait(WALK, 0, out, scratch, 1);
    const left = out[BONE_INDEX['thigh.L']! * 3]!;
    const right = out[BONE_INDEX['thigh.R']! * 3]!;
    // At left heel strike the left leg is forward and the right is trailing.
    expect(left).toBeGreaterThan(0.3);
    expect(right).toBeLessThan(0);
  });

  it('is continuous across the loop seam', () => {
    const before = createJointBuffer(BONES.length);
    const after = createJointBuffer(BONES.length);
    sampleClip(WALK, 0.999, before, 1);
    sampleClip(WALK, 0.001, after, 1);
    for (let i = 0; i < before.length; i += 1) {
      expect(Math.abs(after[i]! - before[i]!)).toBeLessThan(0.05);
    }
  });
});

describe('auto-skinning', () => {
  it('gives every vertex weights that sum to one', () => {
    const geometry = new THREE.BoxGeometry(0.5, 1.6, 0.3);
    geometry.translate(0, 0.8, 0);
    const skinned = createSkinnedGeometry(geometry);
    const weights = skinned.getAttribute('skinWeight') as THREE.BufferAttribute;
    expect(weights).toBeDefined();
    for (let v = 0; v < weights.count; v += 1) {
      const total = weights.getX(v) + weights.getY(v) + weights.getZ(v) + weights.getW(v);
      expect(total).toBeCloseTo(1, 5);
    }
    geometry.dispose();
    skinned.dispose();
  });

  it('never binds a left-side vertex to a right-side bone', () => {
    // The tearing failure: without side gating the arms swap vertices as they
    // pass, and a hand stretches toward the opposite elbow.
    const geometry = new THREE.BoxGeometry(0.8, 1.6, 0.3);
    geometry.translate(0, 0.8, 0);
    const skinned = createSkinnedGeometry(geometry);
    const position = skinned.getAttribute('position') as THREE.BufferAttribute;
    const indices = skinned.getAttribute('skinIndex') as THREE.BufferAttribute;
    const weights = skinned.getAttribute('skinWeight') as THREE.BufferAttribute;

    for (let v = 0; v < position.count; v += 1) {
      const side = position.getX(v) < 0 ? -1 : 1;
      const slots = [
        [indices.getX(v), weights.getX(v)],
        [indices.getY(v), weights.getY(v)],
        [indices.getZ(v), weights.getZ(v)],
        [indices.getW(v), weights.getW(v)],
      ] as const;
      for (const [index, weight] of slots) {
        if (weight <= 0) continue;
        const bone = BONES[index]!;
        if (bone.side === 0) continue;
        expect(bone.side).toBe(side);
      }
    }
    geometry.dispose();
    skinned.dispose();
  });

  it('keeps the diagonal satchel strap on a dedicated chest-mounted bone', () => {
    const strap = BONES[BONE_INDEX['strap']!]!;
    expect(BONES[strap.parent]?.name).toBe('chest');
    expect(strap.priority).toBeGreaterThan(2);
    expect(strap.radius).toBeLessThan(0.08);
  });

  it('rigid-binds the brown bag and strap islands instead of blending them into arms', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0.3, 0.6, -0.04, 0, 0.9, 0.151], 3),
    );
    geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute([0.18, 0.08, 0.03, 0.05, 0.02, 0.008], 3),
    );
    const skinned = createSkinnedGeometry(geometry);
    const indices = skinned.getAttribute('skinIndex') as THREE.BufferAttribute;
    const weights = skinned.getAttribute('skinWeight') as THREE.BufferAttribute;

    expect(indices.getX(0)).toBe(BONE_INDEX['satchel']);
    expect(indices.getX(1)).toBe(BONE_INDEX['strap']);
    expect(weights.getX(0)).toBe(1);
    expect(weights.getX(1)).toBe(1);
    geometry.dispose();
    skinned.dispose();
  });

  it('leaves the source geometry untouched', () => {
    // ModelLibrary shares one geometry per asset; skin attributes leaking onto
    // it would follow the farmer into icon renders that have no skeleton.
    const geometry = new THREE.BoxGeometry(0.4, 1.6, 0.3);
    const skinned = createSkinnedGeometry(geometry);
    expect(geometry.getAttribute('skinIndex')).toBeUndefined();
    expect(skinned.getAttribute('skinIndex')).toBeDefined();
    geometry.dispose();
    skinned.dispose();
  });
});

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
import { ankleFromHip, createJointBuffer, measureStrideLength, sampleClip, sampleGait, sampleRootMotion } from '@game/player/rig/clipSampler.js'; // prettier-ignore
import { PLANT, RUN, WALK } from '@game/player/rig/poseClips.js';
import { solveTwoBone } from '@game/player/rig/ikSolver.js';

function makeRig(): CharacterRig {
  const { bones } = createSkeleton();
  return new CharacterRig(bones);
}

function plantedAnkleHeight(rig: CharacterRig, side: 'L' | 'R'): number {
  const thigh = rig.bones[BONE_INDEX[`thigh.${side}`]!]!.rotation.x;
  const shin = rig.bones[BONE_INDEX[`shin.${side}`]!]!.rotation.x;
  const { depth } = ankleFromHip(thigh, shin);
  return rig.rootOffset.y + THIGH_LENGTH + SHIN_LENGTH - depth;
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

  it('saturates cadence rather than strobing if the movement speed is raised', () => {
    // 6.5 m/s is what `Player.walkSpeed` used to be, and is now far beyond what
    // the clips cover. The cap is what stands between that and a strobe, and
    // the rig reports the shortfall through `strideScale` rather than hiding
    // it. This is the guard for a future speed change, not a description of
    // anything the shipping game does.
    const rig = makeRig();
    for (let i = 0; i < 120; i += 1) {
      rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 6.5 });
    }
    expect(rig.strideScale).toBeGreaterThan(1.5);

    let maxAdvance = 0;
    let previous = rig.phase;
    for (let i = 0; i < 120; i += 1) {
      rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 6.5 });
      maxAdvance = Math.max(maxAdvance, (previous - rig.phase + 1) % 1);
      previous = rig.phase;
    }
    // 3.5 cycles per second is the ceiling, so one 60 Hz frame may advance at
    // most that fraction of a cycle.
    expect(maxAdvance).toBeLessThanOrEqual(3.5 / 60 + 1e-6);
  });

  it('never reaches forward with the foot off the ground, at either speed', () => {
    // This replaces a bound of 0.42 rad on hip flexion, which was measured at
    // 6.5 m/s against a clip covering 0.37 m per cycle. The shipping walk now
    // leads with a flexed knee instead of limiting the thigh to a shuffle.
    //
    // What the bound was protecting against is worth keeping, so it is stated
    // directly instead of through a proxy. A goose-step is a leg thrown forward
    // *while the foot is in the air*. A stride is a leg reaching forward with
    // the foot arriving at the floor. So: the further forward the ankle is, the
    // closer to the ground it must be.
    for (const speed of [1.4, 3.43]) {
      const rig = makeRig();
      let maximumForwardThigh = -Infinity;
      let maximumForwardAnkle = -Infinity;
      let worstLiftedReach = -Infinity;
      for (let i = 0; i < 300; i += 1) {
        rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed });
        if (i < 60) continue;
        for (const side of ['L', 'R'] as const) {
          const thigh = rig.bones[BONE_INDEX[`thigh.${side}`]!]!.rotation.x;
          const shin = rig.bones[BONE_INDEX[`shin.${side}`]!]!.rotation.x;
          const { forward, depth } = ankleFromHip(thigh, shin);
          const clearance = rig.rootOffset.y + THIGH_LENGTH + SHIN_LENGTH - depth;
          maximumForwardThigh = Math.max(maximumForwardThigh, thigh);
          maximumForwardAnkle = Math.max(maximumForwardAnkle, forward);
          // A foot more than 8 cm up is unambiguously airborne rather than
          // landing, and at that height it has no business being out in front.
          if (clearance > 0.08) worstLiftedReach = Math.max(worstLiftedReach, forward);
        }
      }

      // The regression guard from the previous audit, untouched: whatever the
      // stride, the hip may not exceed 0.8 rad of flexion.
      expect(maximumForwardThigh).toBeLessThan(0.8);
      // And the reach itself stays inside the leg's geometry - 0.4 m of leg
      // cannot put an ankle further than 0.21 m forward with the foot down.
      expect(maximumForwardAnkle).toBeLessThan(0.21);
      expect(worstLiftedReach).toBeLessThan(0.1);
    }
  });

  it('leads each walking step with the knee while the shin folds behind it', () => {
    const rig = makeRig();
    const input = { ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 1.4 } as const;
    for (let frame = 0; frame < 180; frame += 1) rig.update(input);

    let terminalSamples = 0;
    for (let frame = 0; frame < 240; frame += 1) {
      rig.update(input);
      for (const side of ['L', 'R'] as const) {
        const legPhase = side === 'L' ? rig.phase : (rig.phase + 0.5) % 1;
        const inTerminalSwing = legPhase >= 0.92 || legPhase <= 0.04;
        if (!inTerminalSwing) continue;

        const thigh = rig.bones[BONE_INDEX[`thigh.${side}`]!]!.rotation.x;
        const shin = rig.bones[BONE_INDEX[`shin.${side}`]!]!.rotation.x;
        const kneeForward = Math.sin(thigh) * THIGH_LENGTH;
        const ankle = ankleFromHip(thigh, shin);
        terminalSamples += 1;

        // The knee is the foremost joint and the lower leg points back from it.
        expect(kneeForward - ankle.forward).toBeGreaterThan(0.005);
        expect(thigh + shin).toBeLessThan(-0.035);
      }
    }
    expect(terminalSamples).toBeGreaterThan(20);
  });

  it('turns airborne recovery behind the knee for both walking and running', () => {
    for (const speed of [1.4, 3.43]) {
      const rig = makeRig();
      const input = { ...IDLE_INPUT, deltaSeconds: 1 / 240, speed } as const;
      for (let frame = 0; frame < 720; frame += 1) rig.update(input);

      let airborneSamples = 0;
      for (let frame = 0; frame < 960; frame += 1) {
        rig.update(input);
        for (const side of ['L', 'R'] as const) {
          const legPhase = side === 'L' ? rig.phase : (rig.phase + 0.5) % 1;
          if (legPhase < 0.84 || legPhase > 0.92 || rig.footLock(side) > 0.1) continue;

          const thigh = rig.bones[BONE_INDEX[`thigh.${side}`]!]!.rotation.x;
          const shin = rig.bones[BONE_INDEX[`shin.${side}`]!]!.rotation.x;
          const foot = rig.bones[BONE_INDEX[`foot.${side}`]!]!.rotation.x;
          const ankle = ankleFromHip(thigh, shin);
          const clearance = rig.rootOffset.y + THIGH_LENGTH + SHIN_LENGTH - ankle.depth;
          if (clearance < 0.055) continue;

          const kneeForward = Math.sin(thigh) * THIGH_LENGTH;
          airborneSamples += 1;
          expect(kneeForward - ankle.forward).toBeGreaterThan(0.04);
          expect(thigh + shin).toBeLessThan(-0.1);
          expect(foot).toBeGreaterThan(0.18);
        }
      }
      expect(airborneSamples).toBeGreaterThan(20);
    }
  });

  it('does not pop or add un-authored reversals at either shipping speed', () => {
    for (const speed of [1.4, 3.43]) {
      const rig = makeRig();
      for (let i = 0; i < 180; i += 1) {
        rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed });
      }

      let previousAngle = rig.bones[BONE_INDEX['thigh.L']!]!.rotation.x;
      let previousVelocity = 0;
      let worstAcceleration = 0;
      let worstStep = 0;
      let reversals = 0;
      const frames = 120;
      for (let i = 0; i < frames; i += 1) {
        rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed });
        const angle = rig.bones[BONE_INDEX['thigh.L']!]!.rotation.x;
        const velocity = angle - previousAngle;
        worstStep = Math.max(worstStep, Math.abs(velocity));
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
      expect(worstAcceleration).toBeLessThan(speed <= 1.4 ? 0.25 : 0.3);
      expect(worstStep).toBeLessThan(0.22);
      expect(reversals).toBeLessThanOrEqual(24);
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

  it('loads into starts and stops without an angular discontinuity', () => {
    const rig = makeRig();
    let previousChest = rig.bones[BONE_INDEX['chest']!]!.rotation.x;
    let worstStep = 0;
    let strongestStart = 0;
    for (let frame = 0; frame < 24; frame += 1) {
      rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 3.43 });
      const chest = rig.bones[BONE_INDEX['chest']!]!.rotation.x;
      worstStep = Math.max(worstStep, Math.abs(chest - previousChest));
      strongestStart = Math.max(strongestStart, rig.transitionLoad);
      previousChest = chest;
    }
    expect(strongestStart).toBeGreaterThan(0.18);
    expect(worstStep).toBeLessThan(0.22);

    for (let frame = 0; frame < 90; frame += 1) {
      rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 3.43 });
    }
    expect(Math.abs(rig.transitionLoad)).toBeLessThan(0.02);

    let strongestStop = 0;
    for (let frame = 0; frame < 24; frame += 1) {
      rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 0 });
      strongestStop = Math.min(strongestStop, rig.transitionLoad);
    }
    expect(strongestStop).toBeLessThan(-0.18);
    for (let frame = 0; frame < 90; frame += 1) {
      rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 0 });
    }
    expect(Math.abs(rig.transitionLoad)).toBeLessThan(0.02);
  });
});

describe('authored root and secondary motion', () => {
  it('braces asymmetrically for planting while keeping both ankles planted', () => {
    const rig = makeRig();
    rig.update({
      ...IDLE_INPUT,
      deltaSeconds: 1 / 60,
      speed: 0,
      working: true,
      workAction: 'plant',
      workProgress: 0.54,
    });

    const leftThigh = rig.bones[BONE_INDEX['thigh.L']!]!.rotation.x;
    const rightThigh = rig.bones[BONE_INDEX['thigh.R']!]!.rotation.x;
    expect(rig.rootOffset.y).toBeLessThan(-0.02);
    expect(rig.rootOffset.y).toBeGreaterThan(-0.05);
    expect(rig.rootOffset.z).toBeGreaterThan(0.04);
    expect(rightThigh - leftThigh).toBeGreaterThan(0.12);
    expect(Math.abs(plantedAnkleHeight(rig, 'L'))).toBeLessThan(0.018);
    expect(Math.abs(plantedAnkleHeight(rig, 'R'))).toBeLessThan(0.018);
  });

  it('separates plant anticipation, contact, push, retraction, and recovery', () => {
    const anticipation = createJointBuffer(BONES.length);
    const contact = createJointBuffer(BONES.length);
    const push = createJointBuffer(BONES.length);
    const retract = createJointBuffer(BONES.length);
    const recover = createJointBuffer(BONES.length);
    const anticipationRoot = new Float32Array(3);
    const contactRoot = new Float32Array(3);
    const pushRoot = new Float32Array(3);
    const retractRoot = new Float32Array(3);
    const recoverRoot = new Float32Array(3);
    sampleClip(PLANT, 0.16, anticipation, 1);
    sampleClip(PLANT, 0.54, contact, 1);
    sampleClip(PLANT, 0.66, push, 1);
    sampleClip(PLANT, 0.82, retract, 1);
    sampleClip(PLANT, 0.92, recover, 1);
    sampleRootMotion(PLANT, 0.16, anticipationRoot);
    sampleRootMotion(PLANT, 0.54, contactRoot);
    sampleRootMotion(PLANT, 0.66, pushRoot);
    sampleRootMotion(PLANT, 0.82, retractRoot);
    sampleRootMotion(PLANT, 0.92, recoverRoot);
    const angle = (pose: Float32Array, bone: string, axis = 0): number =>
      pose[BONE_INDEX[bone]! * 3 + axis]!;
    const ankleHeight = (pose: Float32Array, root: Float32Array, side: 'L' | 'R'): number => {
      const { depth } = ankleFromHip(angle(pose, `thigh.${side}`), angle(pose, `shin.${side}`));
      return root[1]! + THIGH_LENGTH + SHIN_LENGTH - depth;
    };

    expect(anticipationRoot[1]).toBeLessThan(-0.012);
    expect(angle(anticipation, 'thigh.R') - angle(anticipation, 'thigh.L')).toBeGreaterThan(0.15);
    const trunkPitch = (pose: Float32Array): number =>
      angle(pose, 'hips') + angle(pose, 'spine') + angle(pose, 'chest');
    expect(trunkPitch(anticipation)).toBeGreaterThan(0.35);
    expect(angle(anticipation, 'chest')).toBeLessThan(0.14);
    // The torso commits to the bed while the neck/head counter-rotate enough
    // to keep the face below the hat brim instead of burying it in the chest.
    expect(angle(anticipation, 'head')).toBeLessThan(-0.02);

    expect(contactRoot[0]).toBeGreaterThan(0.035);
    expect(trunkPitch(contact)).toBeGreaterThan(0.7);
    expect(angle(contact, 'chest')).toBeLessThan(0.2);
    expect(angle(contact, 'upperarm.R', 2)).toBeLessThan(-0.08);
    expect(angle(contact, 'upperarm.L', 2)).toBeGreaterThan(0.3);
    expect(angle(contact, 'neck') + angle(contact, 'head')).toBeLessThan(-0.15);
    expect(Math.abs(ankleHeight(contact, contactRoot, 'L'))).toBeLessThan(0.018);
    expect(Math.abs(ankleHeight(contact, contactRoot, 'R'))).toBeLessThan(0.018);

    expect(pushRoot[2]).toBeGreaterThan(contactRoot[2]! + 0.01);
    expect(trunkPitch(push)).toBeGreaterThan(trunkPitch(contact) + 0.05);
    expect(angle(push, 'shin.R')).toBeGreaterThan(angle(contact, 'shin.R') + 0.12);
    expect(Math.abs(ankleHeight(push, pushRoot, 'L'))).toBeLessThan(0.012);
    expect(Math.abs(ankleHeight(push, pushRoot, 'R'))).toBeLessThan(0.012);

    expect(retractRoot[2]).toBeLessThan(0);
    expect(angle(retract, 'chest')).toBeLessThan(0);
    expect(angle(retract, 'upperarm.L', 2)).toBeGreaterThan(0.2);
    expect(angle(retract, 'thigh.R')).toBeLessThan(angle(contact, 'thigh.R') - 0.25);
    expect(Math.abs(recoverRoot[2]!)).toBeLessThan(0.01);
    expect(angle(recover, 'chest')).toBeGreaterThan(0);
    expect(angle(recover, 'chest')).toBeLessThan(0.1);
  });

  it('carries a visible centre-of-mass arc through a run cycle', () => {
    const rig = makeRig();
    let minimum = Infinity;
    let maximum = -Infinity;
    // Shipping sprint speed: walkSpeed 1.4 times sprintMultiplier 2.45.
    for (let i = 0; i < 180; i += 1) {
      rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 3.43 });
      minimum = Math.min(minimum, rig.rootOffset.y);
      maximum = Math.max(maximum, rig.rootOffset.y);
    }
    expect(maximum - minimum).toBeGreaterThan(0.06);
  });

  it('lets the ponytail and satchel lag and settle independently of the torso', () => {
    const rig = makeRig();
    rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 4, turn: 1 });
    const firstPonytail = rig.bones[BONE_INDEX['ponytail']!]!.rotation.z;
    const firstSatchel = rig.bones[BONE_INDEX['satchel']!]!.rotation.z;
    for (let frame = 0; frame < 12; frame += 1) {
      rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 4, turn: 1 });
    }
    const ponytail = rig.bones[BONE_INDEX['ponytail']!]!;
    const satchel = rig.bones[BONE_INDEX['satchel']!]!;

    // They do not teleport to the turn target on its first frame.
    expect(Math.abs(firstPonytail)).toBeLessThan(0.08);
    expect(Math.abs(firstSatchel)).toBeLessThan(0.08);
    expect(Math.abs(ponytail.rotation.z)).toBeGreaterThan(0.1);
    expect(Math.abs(satchel.rotation.z)).toBeGreaterThan(0.08);
    expect(Math.sign(ponytail.rotation.z)).not.toBe(Math.sign(satchel.rotation.z));

    const carriedPonytail = ponytail.rotation.z;
    const carriedSatchel = satchel.rotation.z;
    rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 0, turn: 0 });
    expect(Math.abs(ponytail.rotation.z)).toBeGreaterThan(Math.abs(carriedPonytail) * 0.45);
    expect(Math.abs(satchel.rotation.z)).toBeGreaterThan(Math.abs(carriedSatchel) * 0.55);
    for (let frame = 0; frame < 60; frame += 1) {
      rig.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 0, turn: 0 });
    }
    const control = makeRig();
    for (let frame = 0; frame < 60; frame += 1) {
      control.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 0, turn: 0 });
    }
    expect(
      Math.abs(ponytail.rotation.z - control.bones[BONE_INDEX['ponytail']!]!.rotation.z),
    ).toBeLessThan(0.01);
    expect(
      Math.abs(satchel.rotation.z - control.bones[BONE_INDEX['satchel']!]!.rotation.z),
    ).toBeLessThan(0.01);
  });

  it('leads a turn with shoulders and face while the pelvis counter-rotates', () => {
    const turning = makeRig();
    const straight = makeRig();
    for (let frame = 0; frame < 90; frame += 1) {
      turning.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 4 });
      straight.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 4 });
    }
    for (let frame = 0; frame < 6; frame += 1) {
      turning.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 4, turn: 0.8 });
      straight.update({ ...IDLE_INPUT, deltaSeconds: 1 / 60, speed: 4 });
    }

    const delta = (bone: string, axis: 'x' | 'y' | 'z'): number =>
      turning.bones[BONE_INDEX[bone]!]!.rotation[axis] -
      straight.bones[BONE_INDEX[bone]!]!.rotation[axis];
    expect(delta('hips', 'y')).toBeLessThan(-0.03);
    expect(delta('chest', 'y')).toBeGreaterThan(0.07);
    expect(delta('shoulder.R', 'y')).toBeGreaterThan(0.02);
    expect(delta('head', 'y')).toBeGreaterThan(delta('neck', 'y'));
  });

  it('solves the working hand from the animated shoulder to the trowel grip', () => {
    const rig = makeRig();
    rig.update({
      ...IDLE_INPUT,
      deltaSeconds: 1 / 60,
      speed: 0,
      working: true,
      workAction: 'plant',
      workProgress: 0.5,
    });
    const grip = new THREE.Vector3(0.24, 0.55, 0.41);
    rig.reachRightHandToPoint(grip.x, grip.y, grip.z, 1);
    const hand = new THREE.Vector3();
    rig.bones[BONE_INDEX['hand.R']!]!.getWorldPosition(hand);
    expect(Math.hypot(hand.y - grip.y, hand.z - grip.z)).toBeLessThan(0.075);
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

  it('clears the foot, carries the knee forward, then descends into contact', () => {
    const pose = createJointBuffer(BONES.length);
    const root = new Float32Array(3);
    const sampleAnkle = (phase: number): { forward: number; clearance: number } => {
      pose.fill(0);
      root.fill(0);
      sampleClip(WALK, phase, pose, 1);
      sampleRootMotion(WALK, phase, root, 1);
      const { forward, depth } = ankleFromHip(
        pose[BONE_INDEX['thigh.L']! * 3]!,
        pose[BONE_INDEX['shin.L']! * 3]!,
      );
      return { forward, clearance: THIGH_LENGTH + SHIN_LENGTH - depth + root[1]! };
    };

    const midSwing = sampleAnkle(0.84);
    const reach = sampleAnkle(0.88);
    const terminal = sampleAnkle(0.92);
    const preContact = sampleAnkle(0.96);

    expect(midSwing.clearance).toBeGreaterThan(0.1);
    expect(midSwing.forward).toBeLessThan(0);
    expect(reach.clearance).toBeGreaterThan(0.05);
    expect(reach.forward).toBeLessThan(0.03);
    expect(terminal.forward).toBeGreaterThan(-0.04);
    expect(terminal.clearance).toBeLessThan(0.06);
    expect(preContact.forward).toBeGreaterThan(terminal.forward + 0.04);
    expect(preContact.clearance).toBeLessThan(0.025);
    expect(measureStrideLength(WALK)).toBeGreaterThan(0.5);
  });

  it('keeps the walk hip excursion rear-biased', () => {
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
  });

  it('tracks the poses, so editing the keys cannot desynchronise the feet', () => {
    // A run reaches further than a walk. If this ever stopped holding, the
    // measurement would have decoupled from the clip - which is precisely the
    // failure mode a hard-coded stride constant has.
    expect(measureStrideLength(RUN)).toBeGreaterThan(measureStrideLength(WALK));
  });

  it('transfers weight laterally and drops the pelvis over each planted foot', () => {
    const leftRoot = new Float32Array(3);
    const rightRoot = new Float32Array(3);
    const left = createJointBuffer(BONES.length);
    const right = createJointBuffer(BONES.length);
    const scratch = createJointBuffer(BONES.length);
    sampleRootMotion(WALK, 0.12, leftRoot);
    sampleRootMotion(WALK, 0.62, rightRoot);
    sampleGait(WALK, 0.12, left, scratch);
    sampleGait(WALK, 0.62, right, scratch);

    expect(leftRoot[0]).toBeLessThan(-0.025);
    expect(rightRoot[0]).toBeGreaterThan(0.025);
    expect(leftRoot[1]).toBeLessThan(-0.035);
    expect(rightRoot[1]).toBeLessThan(-0.035);
    expect(left[BONE_INDEX['hips']! * 3 + 2]).toBeGreaterThan(0.06);
    expect(right[BONE_INDEX['hips']! * 3 + 2]).toBeLessThan(-0.06);
    expect(left[BONE_INDEX['shin.L']! * 3]).toBeLessThan(-0.3);
    expect(right[BONE_INDEX['shin.R']! * 3]).toBeLessThan(-0.3);
    expect(left[BONE_INDEX['thigh.L']! * 3]! - left[BONE_INDEX['thigh.R']! * 3]!).toBeGreaterThan(
      0.4,
    );
    expect(right[BONE_INDEX['thigh.R']! * 3]! - right[BONE_INDEX['thigh.L']! * 3]!).toBeGreaterThan(
      0.4,
    );
    expect(Math.sign(left[BONE_INDEX['chest']! * 3 + 2]!)).not.toBe(
      Math.sign(left[BONE_INDEX['hips']! * 3 + 2]!),
    );
    expect(Math.sign(right[BONE_INDEX['chest']! * 3 + 2]!)).not.toBe(
      Math.sign(right[BONE_INDEX['hips']! * 3 + 2]!),
    );
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
    expect(left).toBeGreaterThan(0.24);
    expect(right).toBeLessThan(0);
  });

  it('keeps both arms clear of the torso during support-leg loading', () => {
    const out = createJointBuffer(BONES.length);
    const scratch = createJointBuffer(BONES.length);
    sampleGait(WALK, 0.12, out, scratch, 1);
    const left = out[BONE_INDEX['upperarm.L']! * 3]!;
    const right = out[BONE_INDEX['upperarm.R']! * 3]!;
    const leftSplay = out[BONE_INDEX['upperarm.L']! * 3 + 2]!;
    const rightSplay = out[BONE_INDEX['upperarm.R']! * 3 + 2]!;

    expect(left).toBeLessThan(-0.2);
    expect(right).toBeGreaterThan(0.5);
    expect(right - left).toBeGreaterThan(0.75);
    expect(leftSplay).toBeGreaterThan(0.09);
    expect(rightSplay).toBeLessThan(-0.18);
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

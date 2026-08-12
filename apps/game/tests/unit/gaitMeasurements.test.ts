/**
 * Quantitative gait report.
 *
 * The rest of the rig tests assert bounds. This file exists to *measure*, and
 * to print the measurements, because the locomotion work is a negotiation
 * between three numbers that live in different files - the authored clip, the
 * skeleton's leg length and the simulation's movement speed - and any change to
 * one of them silently invalidates the other two.
 *
 * It runs the same code the game runs; nothing here re-implements kinematics.
 */
import { describe, expect, it } from 'vitest';
import { CharacterRig } from '@game/player/rig/CharacterRig.js';
import { createSkeleton } from '@game/player/rig/autoSkin.js';
import { BONE_INDEX, SHIN_LENGTH, THIGH_LENGTH } from '@game/player/rig/skeletonDefinition.js';
import { ankleFromHip, createJointBuffer, measureStrideLength, sampleClip, sampleRootMotion } from '@game/player/rig/clipSampler.js'; // prettier-ignore
import { RUN, WALK, type Clip } from '@game/player/rig/poseClips.js';
import { solveTwoBone } from '@game/player/rig/ikSolver.js';
import { Player } from '@game/player/Player.js';

const LEG = THIGH_LENGTH + SHIN_LENGTH;
const PLANT_BAND = 0.035;

interface GaitProfile {
  readonly stanceExcursion: number;
  readonly stanceFraction: number;
  readonly cycleTravel: number;
  readonly forwardReach: number;
  readonly rearReach: number;
  readonly peakThigh: number;
  readonly maxClearance: number;
}

interface WalkSnapshot {
  readonly phase: number;
  readonly rootX: number;
  readonly rootY: number;
  readonly shinL: number;
  readonly thighLZ: number;
  readonly thighRZ: number;
  readonly footL: number;
  readonly toeL: number;
  readonly hipsY: number;
  readonly chestY: number;
  readonly headY: number;
  readonly upperArmL: number;
  readonly upperArmR: number;
}

interface LeadLegSnapshot {
  readonly phase: number;
  readonly kneeForward: number;
  readonly ankleForward: number;
  readonly shinWorldAngle: number;
  readonly footAngle: number;
}

function leadLegSnapshot(phase: number): LeadLegSnapshot {
  const pose = createJointBuffer(Object.keys(BONE_INDEX).length);
  sampleClip(WALK, phase, pose, 1);
  const thigh = pose[BONE_INDEX['thigh.L']! * 3]!;
  const shin = pose[BONE_INDEX['shin.L']! * 3]!;
  return {
    phase,
    kneeForward: Math.sin(thigh) * THIGH_LENGTH,
    ankleForward: ankleFromHip(thigh, shin).forward,
    shinWorldAngle: thigh + shin,
    footAngle: pose[BONE_INDEX['foot.L']! * 3]!,
  };
}

function settledWalkSnapshots(targets: readonly number[]): WalkSnapshot[] {
  const { bones } = createSkeleton();
  const rig = new CharacterRig(bones);
  const input = {
    deltaSeconds: 1 / 60,
    speed: 1.4,
    facing: 0,
    turn: 0,
    working: false,
    workAction: null,
    workProgress: 0,
    waveProgress: 0,
  } as const;
  for (let frame = 0; frame < 180; frame += 1) rig.update(input);

  const bestDistances = targets.map(() => Infinity);
  const snapshots: Array<WalkSnapshot | null> = targets.map(() => null);
  for (let frame = 0; frame < 180; frame += 1) {
    rig.update(input);
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index]!;
      const distance = Math.abs(((rig.phase - target + 1.5) % 1) - 0.5);
      if (distance >= bestDistances[index]!) continue;
      bestDistances[index] = distance;
      snapshots[index] = {
        phase: rig.phase,
        rootX: rig.rootOffset.x,
        rootY: rig.rootOffset.y,
        shinL: bones[BONE_INDEX['shin.L']!]!.rotation.x,
        thighLZ: bones[BONE_INDEX['thigh.L']!]!.rotation.z,
        thighRZ: bones[BONE_INDEX['thigh.R']!]!.rotation.z,
        footL: bones[BONE_INDEX['foot.L']!]!.rotation.x,
        toeL: bones[BONE_INDEX['toe.L']!]!.rotation.x,
        hipsY: bones[BONE_INDEX['hips']!]!.rotation.y,
        chestY: bones[BONE_INDEX['chest']!]!.rotation.y,
        headY: bones[BONE_INDEX['head']!]!.rotation.y,
        upperArmL: bones[BONE_INDEX['upperarm.L']!]!.rotation.x,
        upperArmR: bones[BONE_INDEX['upperarm.R']!]!.rotation.x,
      };
    }
  }
  return snapshots.map((snapshot) => {
    expect(snapshot).not.toBeNull();
    return snapshot!;
  });
}

/**
 * Everything the clip implies about ground contact, sampled at 480 steps.
 *
 * `stanceFraction` is the share of the cycle one foot spends inside the planted
 * band. `cycleTravel` is the honest per-cycle ground distance: during stance
 * the foot is fixed to the world, so the body covers exactly the ankle's
 * excursion in that window, and the whole cycle therefore covers that divided
 * by the fraction of the cycle the window occupies.
 */
function profileGait(clip: Clip, rootTrack = true): GaitProfile {
  const samples = 480;
  const scratch = createJointBuffer(Object.keys(BONE_INDEX).length);
  const root = new Float32Array(3);
  const forwards = new Float64Array(samples);
  const clearances = new Float64Array(samples);
  const thighSlot = BONE_INDEX['thigh.L']! * 3;
  const shinSlot = BONE_INDEX['shin.L']! * 3;

  let stanceMin = Infinity;
  let stanceMax = -Infinity;
  let stanceSamples = 0;
  let forwardReach = -Infinity;
  let rearReach = Infinity;
  let peakThigh = -Infinity;
  let maxClearance = -Infinity;

  for (let i = 0; i < samples; i += 1) {
    scratch.fill(0);
    root.fill(0);
    sampleClip(clip, i / samples, scratch, 1);
    if (rootTrack) sampleRootMotion(clip, i / samples, root, 1);
    const thigh = scratch[thighSlot]!;
    const { forward, depth } = ankleFromHip(thigh, scratch[shinSlot]!);
    const clearance = LEG - depth + root[1]!;
    peakThigh = Math.max(peakThigh, thigh);
    forwardReach = Math.max(forwardReach, forward);
    rearReach = Math.min(rearReach, forward);
    maxClearance = Math.max(maxClearance, clearance);
    forwards[i] = forward;
    clearances[i] = clearance;
  }

  for (let i = 0; i < samples; i += 1) {
    if (clearances[i]! > PLANT_BAND) continue;
    if (forwards[(i + 1) % samples]! > forwards[i]! + 1e-4) continue;
    stanceSamples += 1;
    stanceMin = Math.min(stanceMin, forwards[i]!);
    stanceMax = Math.max(stanceMax, forwards[i]!);
  }

  const stanceFraction = stanceSamples / samples;
  const stanceExcursion = Number.isFinite(stanceMax) ? stanceMax - stanceMin : 0;
  return {
    stanceExcursion,
    stanceFraction,
    cycleTravel: stanceFraction > 0 ? stanceExcursion / stanceFraction : 0,
    forwardReach,
    rearReach,
    peakThigh,
    maxClearance,
  };
}

describe('gait measurements', () => {
  it('reports what the clips and the simulation speed imply', () => {
    const walk = profileGait(WALK);
    const run = profileGait(RUN);
    const player = new Player(0, 0);
    const report = {
      legLength: LEG,
      walk,
      run,
      measuredWalkStride: measureStrideLength(WALK),
      measuredRunStride: measureStrideLength(RUN),
      walkSpeed: player.walkSpeed,
      sprintSpeed: player.walkSpeed * player.sprintMultiplier,
      walkCadence: player.walkSpeed / measureStrideLength(WALK),
      sprintCadence: (player.walkSpeed * player.sprintMultiplier) / measureStrideLength(RUN),
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
    expect(walk.cycleTravel).toBeGreaterThan(0);
    expect(run.cycleTravel).toBeGreaterThan(0);
  });

  it('solves stance keys for a designed ankle path', () => {
    // Design targets: (t, ankle forward in hip space, ground clearance, root y).
    const walk: readonly (readonly [number, number, number, number])[] = [
      [0.84, 0.04, 0.09, 0.015],
      [0.88, 0.1, 0.08, 0.02],
      [0.92, 0.16, 0.055, 0.004],
      [0.96, 0.185, 0.02, -0.032],
    ];
    const run: readonly (readonly [number, number, number, number])[] = [
      [0.85, 0.09, 0.08, 0.008],
      [0.88, 0.166, 0.056, 0.02],
    ];
    for (const [label, table] of [
      ['walk', walk],
      ['run', run],
    ] as const) {
      for (const [t, forward, clearance, rootY] of table) {
        const depth = LEG + rootY - clearance;
        const solution = solveTwoBone(forward, depth, THIGH_LENGTH, SHIN_LENGTH, 1);
        const check = ankleFromHip(solution.upper, solution.lower);
        // eslint-disable-next-line no-console
        console.log(
          `${label} t=${t} thigh=${solution.upper.toFixed(3)} shin=${solution.lower.toFixed(3)} ` +
            `clamped=${solution.clamped} check f=${check.forward.toFixed(3)} d=${check.depth.toFixed(3)}`,
        );
      }
    }
    expect(true).toBe(true);
  });

  it('reports pose extremes and smoothness at the two gameplay speeds', () => {
    for (const speed of [0.6, 1.4, 2.4, 3.43]) {
      const { bones } = createSkeleton();
      const rig = new CharacterRig(bones);
      const input = {
        deltaSeconds: 1 / 60,
        speed,
        facing: 0,
        turn: 0,
        working: false,
        workAction: null,
        workProgress: 0,
        waveProgress: 0,
      } as const;
      for (let i = 0; i < 180; i += 1) rig.update(input);
      let peakThigh = -Infinity;
      let peakAnkle = -Infinity;
      let highForwardAnkle = -Infinity;
      let highForwardPhase = 0;
      let highForwardClearance = 0;
      let previousAngle = rig.bones[BONE_INDEX['thigh.L']!]!.rotation.x;
      let previousVelocity = 0;
      let worstAcceleration = 0;
      let worstStep = 0;
      let worstStepPhase = 0;
      let reversals = 0;
      for (let i = 0; i < 240; i += 1) {
        rig.update(input);
        for (const side of ['L', 'R'] as const) {
          const thigh = rig.bones[BONE_INDEX[`thigh.${side}`]!]!.rotation.x;
          const shin = rig.bones[BONE_INDEX[`shin.${side}`]!]!.rotation.x;
          const { forward, depth } = ankleFromHip(thigh, shin);
          const clearance = rig.rootOffset.y + LEG - depth;
          peakThigh = Math.max(peakThigh, thigh);
          peakAnkle = Math.max(peakAnkle, forward);
          if (clearance > 0.06 && forward > highForwardAnkle) {
            highForwardAnkle = forward;
            highForwardPhase = rig.phase;
            highForwardClearance = clearance;
          }
        }
        const angle = rig.bones[BONE_INDEX['thigh.L']!]!.rotation.x;
        if (process.env['GAIT_TRACE'] && speed === 3.43 && i > 40 && i < 85) {
          // eslint-disable-next-line no-console
          console.log(
            `t${i} thigh=${angle.toFixed(4)} shin=${rig.bones[BONE_INDEX['shin.L']!]!.rotation.x.toFixed(4)} lock=${rig.footLock('L').toFixed(2)}`,
          );
        }
        const velocity = angle - previousAngle;
        if (Math.abs(velocity) > worstStep) {
          worstStep = Math.abs(velocity);
          worstStepPhase = rig.phase;
        }
        worstAcceleration = Math.max(worstAcceleration, Math.abs(velocity - previousVelocity));
        if (Math.sign(velocity) !== Math.sign(previousVelocity) && Math.abs(velocity) > 0.005) {
          reversals += 1;
        }
        previousVelocity = velocity;
        previousAngle = angle;
      }
      // eslint-disable-next-line no-console
      console.log(
        `pose@${speed}: thigh ${peakThigh.toFixed(3)} ankle ${peakAnkle.toFixed(3)} ` +
          `highForward ${highForwardAnkle.toFixed(3)}@${highForwardPhase.toFixed(3)} ` +
          `clear ${highForwardClearance.toFixed(3)} step ${worstStep.toFixed(3)}@${worstStepPhase.toFixed(3)} ` +
          `accel ${worstAcceleration.toFixed(3)} ` +
          `reversals ${reversals}`,
      );
      expect(peakThigh).toBeLessThan(0.8);
      expect(worstAcceleration).toBeLessThan(speed <= 1.4 ? 0.25 : 0.3);
      if (speed === 1.4) expect(highForwardAnkle).toBeLessThan(0.14);
    }
  });

  it('keeps the walk weighted, opposed and readable through its key poses', () => {
    const snapshots = settledWalkSnapshots([0, 0.1, 0.3, 0.54, 0.8]);
    const contact = snapshots[0]!;
    const loading = snapshots[1]!;
    const midstance = snapshots[2]!;
    const toeOff = snapshots[3]!;
    const passing = snapshots[4]!;
    // eslint-disable-next-line no-console
    console.log(
      `walk polish: loadY ${loading.rootY.toFixed(3)} midY ${midstance.rootY.toFixed(3)} ` +
        `lateral ${midstance.rootX.toFixed(3)}/${passing.rootX.toFixed(3)} ` +
        `passing splay ${Math.abs(passing.thighLZ - passing.thighRZ).toFixed(3)} ` +
        `roll ${contact.footL.toFixed(3)}/${toeOff.footL.toFixed(3)}/${toeOff.toeL.toFixed(3)} ` +
        `torso ${contact.hipsY.toFixed(3)}/${contact.chestY.toFixed(3)}/${contact.headY.toFixed(3)} ` +
        `arms ${(contact.upperArmR - contact.upperArmL).toFixed(3)}`,
    );

    // Loading visibly settles below the support-side apex and bends the knee.
    expect(loading.rootY).toBeLessThan(midstance.rootY - 0.025);
    expect(loading.shinL).toBeLessThan(-0.64);
    // The pelvis travels over alternating support legs, and the passing leg
    // clears the planted silhouette instead of disappearing behind it.
    expect(midstance.rootX).toBeLessThan(-0.025);
    expect(passing.rootX).toBeGreaterThan(0.02);
    expect(Math.abs(passing.thighLZ - passing.thighRZ)).toBeGreaterThan(0.02);
    // A readable heel-to-toe chain survives at gameplay scale.
    expect(contact.footL - toeOff.footL).toBeGreaterThan(0.25);
    expect(toeOff.toeL - midstance.toeL).toBeGreaterThan(0.25);
    // Hips and ribs oppose each other, the arms balance the stride, and the
    // head counter-follows rather than inheriting the chest as a rigid block.
    expect(contact.hipsY).toBeLessThan(0);
    expect(contact.chestY).toBeGreaterThan(0);
    expect(contact.chestY - contact.hipsY).toBeGreaterThan(0.22);
    expect(contact.upperArmR - contact.upperArmL).toBeGreaterThan(0.84);
    expect(contact.chestY - contact.headY).toBeGreaterThan(0.18);
  });

  it('keeps terminal swing knee-led instead of extending into a forward kick', () => {
    const terminal = [0.92, 0.94, 0.96, 0.98, 0].map(leadLegSnapshot);
    for (const pose of terminal) {
      // Positive separation means the knee is in front of the ankle. A negative
      // world-space shin angle means the lower leg folds backward from the knee.
      expect(pose.kneeForward - pose.ankleForward).toBeGreaterThan(0.01);
      expect(pose.shinWorldAngle).toBeLessThan(-0.05);
    }
  });

  it('kicks the boot backward without changing the knee path', () => {
    const cycle = WALK.keys.map((key) => leadLegSnapshot(key.t));

    for (const pose of cycle) expect(pose.footAngle).toBeGreaterThanOrEqual(0.4);
  });

  it('measures world-space foot slip through a held walk and sprint', () => {
    for (const speed of [0.7, 1.4, 2.4, 3.43, 6.5]) {
      const { bones } = createSkeleton();
      const rig = new CharacterRig(bones);
      const dt = 1 / 60;
      let bodyZ = 0;
      // Where each foot last was, in world space, while it was planted.
      const previous: Record<'L' | 'R', number | null> = { L: null, R: null };
      let worstSlip = 0;
      let worstVerticalSlip = 0;
      let lockedFrames = 0;
      let lowFrames = 0;
      let worstLowSlip = 0;
      const lowPrevious: Record<'L' | 'R', number | null> = { L: null, R: null };
      const verticalPrevious: Record<'L' | 'R', number | null> = { L: null, R: null };
      for (let frame = 0; frame < 600; frame += 1) {
        rig.update({
          deltaSeconds: dt,
          speed,
          facing: 0,
          turn: 0,
          working: false,
          workAction: null,
          workProgress: 0,
          waveProgress: 0,
        });
        bodyZ += speed * dt;
        for (const side of ['L', 'R'] as const) {
          const thigh = rig.bones[BONE_INDEX[`thigh.${side}`]!]!.rotation.x;
          const shin = rig.bones[BONE_INDEX[`shin.${side}`]!]!.rotation.x;
          const { forward, depth } = ankleFromHip(thigh, shin);
          const clearance = rig.rootOffset.y + LEG - depth;
          const world = bodyZ + forward;
          if (
            process.env['GAIT_TRACE'] &&
            speed === 1.4 &&
            side === 'L' &&
            frame > 200 &&
            frame < 245
          ) {
            // eslint-disable-next-line no-console
            console.log(
              `f${frame} lock=${rig.footLock(side).toFixed(2)} clear=${clearance.toFixed(4)} fwd=${forward.toFixed(4)} world=${world.toFixed(4)}`,
            );
          }
          // Judged only while the lock is at full strength. The ramps in and out
          // are the foot arriving and leaving, and a foot that is leaving is
          // supposed to move.
          const locked = rig.footLock(side) >= 0.95;
          if (locked && frame > 120) {
            lockedFrames += 1;
            if (previous[side] !== null) {
              worstSlip = Math.max(worstSlip, Math.abs(world - previous[side]!));
            }
            const worldY = rig.rootOffset.y + LEG - depth;
            if (verticalPrevious[side] !== null) {
              worstVerticalSlip = Math.max(
                worstVerticalSlip,
                Math.abs(worldY - verticalPrevious[side]!),
              );
            }
            previous[side] = world;
            verticalPrevious[side] = worldY;
          } else {
            previous[side] = null;
            verticalPrevious[side] = null;
          }
          if (clearance <= PLANT_BAND && frame > 120) {
            lowFrames += 1;
            if (lowPrevious[side] !== null) {
              worstLowSlip = Math.max(worstLowSlip, Math.abs(world - lowPrevious[side]!));
            }
            lowPrevious[side] = world;
          } else {
            lowPrevious[side] = null;
          }
        }
      }
      // eslint-disable-next-line no-console
      console.log(
        `slip@${speed}: locked ${(worstSlip * 1000).toFixed(2)} mm/frame over ` +
          `${lockedFrames} frames; vertical ${(worstVerticalSlip * 1000).toFixed(2)} mm; ` +
          `near-ground ${(worstLowSlip * 1000).toFixed(2)} mm over ` +
          `${lowFrames}; strideScale ${rig.strideScale.toFixed(3)}`,
      );
      if (speed <= 3.43) {
        expect(worstSlip).toBeLessThan(0.006);
        expect(worstVerticalSlip).toBeLessThan(0.008);
      } else expect(rig.strideScale).toBeGreaterThan(1.5);
      if (speed === 1.4) expect(worstLowSlip).toBeLessThan(0.085);
    }
  });
});

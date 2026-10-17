import type { RepCounterId } from '../domain/types';
import type { CounterSpec } from './counters';
import { LM, SIDES, angle, dist, mid, torsoLength, type Frame } from './geometry';

/**
 * Additional rep counters. Same hysteresis engine as the originals; only the metric and thresholds
 * differ. Distances are divided by torso length so they don't depend on how far you stand from the
 * camera. Thresholds come from typical joint angles/proportions and were tuned on simulated landmark
 * sequences only — NOT validated on real people (see SAFETY_AND_EVIDENCE.md §4).
 *
 * "delta" baseline mode: the resting value is measured while you stand/sit still, and thresholds are
 * offsets from it, so differences in camera height or body proportions cancel out.
 */

const T = (f: Frame) => torsoLength(f);
const num = (v: number) => (Number.isFinite(v) ? v : null);
const elbowAngle = (f: Frame, s: 'left' | 'right') => {
  const j = SIDES[s];
  return num(angle(f[j.shoulder]!, f[j.elbow]!, f[j.wrist]!));
};
const BOTH_ANKLES = [LM.leftAnkle, LM.rightAnkle];
const BOTH_HIPS = [LM.leftHip, LM.rightHip];

export const EXTRA_COUNTERS: Record<Exclude<RepCounterId, 'squat' | 'sit_to_stand' | 'wall_pushup' | 'arm_raise' | 'march'>, CounterSpec> = {
  seated_march: {
    id: 'seated_march',
    label: 'Seated knee lifts',
    joints: ['hip', 'knee'],
    bilateral: true,
    fullBody: false,
    view: 'front_or_side',
    start: 'low',
    relative: true,
    baselineMode: 'delta',
    thresholds: { standard: { enter: 0.16, exit: 0.06 }, reduced: { enter: 0.1, exit: 0.04 } },
    minRepMs: 350,
    metric: (f, s) => {
      const j = SIDES[s];
      const t = T(f);
      return t < 1e-3 ? null : (f[j.hip]!.y - f[j.knee]!.y) / t;
    },
    metricLabel: 'Tracked knee lift',
    setupHint: 'Sit tall facing the camera with your hips and knees in view, then lift one knee at a time.',
  },
  shoulder_roll: {
    id: 'shoulder_roll',
    label: 'Shoulder rolls',
    joints: ['shoulder'],
    bilateral: false,
    fullBody: false,
    view: 'front',
    start: 'high',
    relative: true,
    baselineMode: 'ratio',
    thresholds: { standard: { enter: 0.86, exit: 0.94 }, reduced: { enter: 0.92, exit: 0.97 } },
    minRepMs: 500,
    metric: (f) => {
      const t = T(f);
      return t < 1e-3 ? null : (mid(f[LM.leftShoulder]!, f[LM.rightShoulder]!).y - f[LM.nose]!.y) / t;
    },
    metricLabel: 'Tracked shoulder height',
    setupHint: 'Face the camera with your head, shoulders and hips in view. Lift your shoulders, then roll them back and down.',
  },
  calf_raise: {
    id: 'calf_raise',
    label: 'Calf raises',
    joints: ['heel', 'toe'],
    bilateral: false,
    fullBody: true,
    view: 'front_or_side',
    start: 'low',
    relative: true,
    baselineMode: 'delta',
    thresholds: { standard: { enter: 0.05, exit: 0.02 }, reduced: { enter: 0.03, exit: 0.012 } },
    minRepMs: 500,
    needs: [29, 30, 31, 32],
    metric: (f) => {
      const t = T(f);
      if (t < 1e-3) return null;
      return ((f[31]!.y - f[29]!.y) / t + (f[32]!.y - f[30]!.y) / t) / 2;
    },
    metricLabel: 'Tracked heel height',
    setupHint: 'Stand side-on or facing the camera with your whole body and both feet in view, then rise onto your toes.',
  },
  side_leg_lift: {
    id: 'side_leg_lift',
    label: 'Sideways leg lifts',
    joints: ['hip', 'ankle'],
    bilateral: true,
    fullBody: true,
    view: 'front',
    start: 'low',
    relative: true,
    baselineMode: 'delta',
    thresholds: { standard: { enter: 0.22, exit: 0.1 }, reduced: { enter: 0.14, exit: 0.07 } },
    minRepMs: 600,
    metric: (f, s) => {
      const j = SIDES[s];
      const t = T(f);
      return t < 1e-3 ? null : Math.abs(f[j.ankle]!.x - f[j.hip]!.x) / t;
    },
    metricLabel: 'Tracked leg-out distance',
    setupHint: 'Face the camera with your whole body in view and lift one leg out to the side.',
  },
  step_up: {
    id: 'step_up',
    label: 'Step-ups',
    joints: ['hip', 'ankle'],
    bilateral: true,
    fullBody: true,
    view: 'front_or_side',
    start: 'low',
    relative: false,
    thresholds: { standard: { enter: 0.16, exit: 0.07 }, reduced: { enter: 0.1, exit: 0.05 } },
    minRepMs: 500,
    needs: BOTH_ANKLES,
    metric: (f, s) => {
      const t = T(f);
      if (t < 1e-3) return null;
      const mine = f[SIDES[s].ankle]!;
      const other = f[SIDES[s === 'left' ? 'right' : 'left'].ankle]!;
      return (other.y - mine.y) / t; // positive when this foot is higher (on the step)
    },
    metricLabel: 'Tracked foot height',
    setupHint: 'Stand side-on or facing the camera, with the step and both feet in view. Each foot that steps up counts one.',
  },
  glute_bridge: {
    id: 'glute_bridge',
    label: 'Glute bridges',
    joints: ['shoulder', 'hip', 'knee'],
    bilateral: false,
    fullBody: false,
    view: 'side',
    start: 'low',
    relative: false,
    thresholds: { standard: { enter: 160, exit: 140 }, reduced: { enter: 152, exit: 138 } },
    minRepMs: 800,
    metric: (f, s) => {
      const j = SIDES[s];
      return num(angle(f[j.shoulder]!, f[j.hip]!, f[j.knee]!));
    },
    metricLabel: 'Tracked hip angle',
    setupHint: 'Lie on your back side-on to the camera, with your shoulders, hips and knees in view.',
  },
  knee_extension: {
    id: 'knee_extension',
    label: 'Seated knee extensions',
    joints: ['hip', 'knee', 'ankle'],
    bilateral: true,
    fullBody: false,
    view: 'side',
    start: 'low',
    relative: false,
    thresholds: { standard: { enter: 150, exit: 120 }, reduced: { enter: 140, exit: 115 } },
    minRepMs: 700,
    metric: (f, s) => {
      const j = SIDES[s];
      return num(angle(f[j.hip]!, f[j.knee]!, f[j.ankle]!));
    },
    metricLabel: 'Tracked knee angle',
    setupHint: 'Sit side-on to the camera with your hips, knees and ankles in view.',
  },
  biceps_curl: {
    id: 'biceps_curl',
    label: 'Biceps curls',
    joints: ['shoulder', 'elbow', 'wrist'],
    bilateral: false,
    fullBody: false,
    view: 'front_or_side',
    start: 'high',
    relative: false,
    thresholds: { standard: { enter: 75, exit: 150 }, reduced: { enter: 100, exit: 145 } },
    minRepMs: 700,
    metric: (f, s) => elbowAngle(f, s),
    metricLabel: 'Tracked elbow angle',
    setupHint: 'Face the camera (or turn side-on) so your shoulder, elbow and wrist are in view.',
  },
  band_row: {
    id: 'band_row',
    label: 'Band rows',
    joints: ['shoulder', 'elbow', 'wrist'],
    bilateral: false,
    fullBody: false,
    view: 'front_or_side',
    start: 'high',
    relative: false,
    thresholds: { standard: { enter: 100, exit: 150 }, reduced: { enter: 115, exit: 148 } },
    minRepMs: 700,
    metric: (f, s) => elbowAngle(f, s),
    metricLabel: 'Tracked elbow angle',
    setupHint: 'Sit side-on to the camera so your shoulder, elbow and wrist are in view as you pull.',
  },
  side_step: {
    id: 'side_step',
    label: 'Side steps',
    joints: ['hip', 'ankle'],
    bilateral: false,
    fullBody: true,
    view: 'front',
    start: 'low',
    relative: false,
    thresholds: { standard: { enter: 1.9, exit: 1.45 }, reduced: { enter: 1.7, exit: 1.4 } },
    minRepMs: 500,
    needs: [...BOTH_ANKLES, ...BOTH_HIPS],
    metric: (f) => {
      const hipW = Math.abs(f[LM.leftHip]!.x - f[LM.rightHip]!.x);
      return hipW < 0.02 ? null : Math.abs(f[LM.leftAnkle]!.x - f[LM.rightAnkle]!.x) / hipW;
    },
    metricLabel: 'Tracked step width',
    setupHint: 'Face the camera with your whole body in view and step to the side, then bring your feet together.',
  },
  heel_toe: {
    id: 'heel_toe',
    label: 'Heel-to-toe steps',
    joints: ['hip', 'ankle'],
    bilateral: false,
    fullBody: true,
    view: 'side',
    start: 'low',
    relative: false,
    thresholds: { standard: { enter: 0.28, exit: 0.12 }, reduced: { enter: 0.2, exit: 0.1 } },
    minRepMs: 400,
    needs: BOTH_ANKLES,
    metric: (f) => {
      const t = T(f);
      return t < 1e-3 ? null : Math.abs(f[LM.leftAnkle]!.x - f[LM.rightAnkle]!.x) / t;
    },
    metricLabel: 'Tracked step length',
    setupHint: 'Stand side-on to the camera with both feet in view. Each step counts one.',
  },
  hip_hinge: {
    id: 'hip_hinge',
    label: 'Hip hinges',
    joints: ['shoulder', 'hip', 'knee'],
    bilateral: false,
    fullBody: false,
    view: 'side',
    start: 'high',
    relative: false,
    thresholds: { standard: { enter: 130, exit: 160 }, reduced: { enter: 145, exit: 165 } },
    minRepMs: 800,
    metric: (f, s) => {
      const j = SIDES[s];
      return num(angle(f[j.shoulder]!, f[j.hip]!, f[j.knee]!));
    },
    metricLabel: 'Tracked hip angle',
    setupHint: 'Stand side-on to the camera with your shoulders, hips and knees in view.',
  },
  shoulder_press: {
    id: 'shoulder_press',
    label: 'Shoulder presses',
    joints: ['shoulder', 'elbow', 'wrist'],
    bilateral: false,
    fullBody: false,
    view: 'front',
    start: 'low',
    relative: false,
    thresholds: { standard: { enter: 150, exit: 115 }, reduced: { enter: 140, exit: 110 } },
    minRepMs: 700,
    metric: (f, s) => elbowAngle(f, s),
    metricLabel: 'Tracked elbow angle',
    setupHint: 'Face the camera with your shoulders, elbows and wrists in view.',
  },
  lateral_raise: {
    id: 'lateral_raise',
    label: 'Lateral raises',
    joints: ['shoulder', 'elbow', 'wrist', 'hip'],
    bilateral: false,
    fullBody: false,
    view: 'front',
    start: 'low',
    relative: false,
    thresholds: { standard: { enter: 75, exit: 35 }, reduced: { enter: 60, exit: 30 } },
    minRepMs: 700,
    metric: (f, s) => {
      const j = SIDES[s];
      return num(angle(f[j.hip]!, f[j.shoulder]!, f[j.wrist]!));
    },
    metricLabel: 'Tracked shoulder angle',
    setupHint: 'Face the camera with your arms, shoulders and hips in view.',
  },
};

export { dist };

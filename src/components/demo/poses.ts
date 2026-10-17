/**
 * Original stick-figure keyframes for exercise demonstrations (viewBox 200×200, floor at y≈186).
 * In side views the "l*" limbs are the near side (dark) and "r*" the far side (light).
 */
export type Pt = readonly [number, number];
export interface Pose {
  head: Pt;
  neck: Pt;
  pelvis: Pt;
  lSh: Pt;
  rSh: Pt;
  lEl: Pt;
  rEl: Pt;
  lWr: Pt;
  rWr: Pt;
  lHip: Pt;
  rHip: Pt;
  lKn: Pt;
  rKn: Pt;
  lAn: Pt;
  rAn: Pt;
  lToe: Pt;
  rToe: Pt;
}
export type Prop = 'chair_seat' | 'chair_support' | 'chair_front' | 'wall' | 'step' | 'mat' | 'band' | 'weights';
export interface Demo {
  view: 'side' | 'front';
  a: Pose;
  b: Pose;
  props: Prop[];
  periodMs: number;
  caption: [string, string];
}

const SIDE: Pose = {
  head: [101, 36], neck: [100, 52], pelvis: [100, 106],
  lSh: [100, 57], rSh: [100, 57], lEl: [103, 82], rEl: [98, 82], lWr: [106, 106], rWr: [96, 106],
  lHip: [100, 106], rHip: [100, 106], lKn: [102, 145], rKn: [99, 145], lAn: [100, 183], rAn: [98, 183], lToe: [112, 185], rToe: [110, 185],
};
const FRONT: Pose = {
  head: [100, 34], neck: [100, 50], pelvis: [100, 104],
  lSh: [84, 56], rSh: [116, 56], lEl: [80, 82], rEl: [120, 82], lWr: [78, 106], rWr: [122, 106],
  lHip: [91, 104], rHip: [109, 104], lKn: [90, 144], rKn: [110, 144], lAn: [89, 183], rAn: [111, 183], lToe: [84, 186], rToe: [116, 186],
};
const SEATED_SIDE: Pose = {
  head: [98, 52], neck: [97, 67], pelvis: [93, 121],
  lSh: [97, 72], rSh: [97, 72], lEl: [103, 97], rEl: [99, 97], lWr: [116, 114], rWr: [112, 114],
  lHip: [93, 121], rHip: [93, 121], lKn: [128, 122], rKn: [125, 122], lAn: [128, 166], rAn: [125, 166], lToe: [139, 168], rToe: [136, 168],
};
const SEATED_FRONT: Pose = {
  head: [100, 50], neck: [100, 66], pelvis: [100, 120],
  lSh: [84, 72], rSh: [116, 72], lEl: [80, 98], rEl: [120, 98], lWr: [86, 118], rWr: [114, 118],
  lHip: [91, 120], rHip: [109, 120], lKn: [88, 132], rKn: [112, 132], lAn: [88, 172], rAn: [112, 172], lToe: [84, 176], rToe: [116, 176],
};

const p = (base: Pose, o: Partial<Pose>): Pose => ({ ...base, ...o });
/** Shift every point of a pose. */
const shift = (base: Pose, dx: number, dy: number): Pose =>
  Object.fromEntries(Object.entries(base).map(([k, [x, y]]) => [k, [x + dx, y + dy]])) as unknown as Pose;

const HOLD_CHAIR_SIDE: Partial<Pose> = { lEl: [116, 80], rEl: [112, 80], lWr: [134, 88], rWr: [130, 88] };
const STAND_SEATED_ARMS: Partial<Pose> = { lEl: [108, 80], rEl: [104, 80], lWr: [122, 72], rWr: [118, 72] };

export const DEMOS: Record<string, Demo> = {
  march_in_place: {
    view: 'side', props: [], periodMs: 1400, caption: ['Stand tall', 'Lift one knee, swing arms'],
    a: SIDE,
    b: p(SIDE, { lKn: [122, 102], lAn: [120, 140], lToe: [130, 142], lEl: [92, 80], lWr: [86, 100], rEl: [108, 78], rWr: [116, 96] }),
  },
  brisk_march: {
    view: 'side', props: [], periodMs: 900, caption: ['Stand tall', 'March briskly'],
    a: SIDE,
    b: p(SIDE, { lKn: [122, 102], lAn: [120, 140], lToe: [130, 142], lEl: [92, 80], lWr: [86, 100], rEl: [108, 78], rWr: [116, 96] }),
  },
  seated_march: {
    view: 'side', props: ['chair_seat'], periodMs: 1600, caption: ['Sit tall', 'Lift one knee'],
    a: SEATED_SIDE,
    b: p(SEATED_SIDE, { lKn: [124, 104], lAn: [130, 146], lToe: [140, 148] }),
  },
  heel_digs: {
    view: 'side', props: [], periodMs: 1200, caption: ['Stand tall', 'Tap one heel forward'],
    a: SIDE,
    b: p(SIDE, { lKn: [112, 146], lAn: [126, 182], lToe: [130, 172], lEl: [94, 82], lWr: [90, 104] }),
  },
  shoulder_rolls: {
    view: 'front', props: [], periodMs: 1800, caption: ['Shoulders relaxed', 'Lift, roll back and down'],
    a: FRONT,
    b: p(FRONT, { lSh: [85, 49], rSh: [115, 49], lEl: [81, 76], rEl: [119, 76], lWr: [79, 100], rWr: [121, 100] }),
  },
  sit_to_stand: {
    view: 'side', props: ['chair_seat'], periodMs: 2800, caption: ['Sit at the front of the chair', 'Stand up using your legs'],
    a: p(SEATED_SIDE, { lAn: [118, 166], rAn: [115, 166], lToe: [129, 168], rToe: [126, 168], ...STAND_SEATED_ARMS, lEl: [104, 92], rEl: [100, 92], lWr: [114, 84], rWr: [110, 84] }),
    b: p(shift(SIDE, 14, 0), { lEl: [118, 80], rEl: [114, 80], lWr: [126, 70], rWr: [122, 70] }),
  },
  mini_squat: {
    view: 'side', props: ['chair_support'], periodMs: 2600, caption: ['Hold the chair, stand tall', 'Bend knees a little'],
    a: p(SIDE, HOLD_CHAIR_SIDE),
    b: p(SIDE, { head: [106, 48], neck: [104, 63], lSh: [104, 68], rSh: [104, 68], pelvis: [93, 117], lHip: [93, 117], rHip: [93, 117], lKn: [110, 150], rKn: [107, 150], lEl: [118, 90], rEl: [114, 90], lWr: [134, 96], rWr: [130, 96] }),
  },
  bodyweight_squat: {
    view: 'side', props: [], periodMs: 2800, caption: ['Feet hip-width, stand tall', 'Hips back, knees bend'],
    a: SIDE,
    b: p(SIDE, { head: [108, 76], neck: [104, 90], lSh: [102, 95], rSh: [102, 95], pelvis: [80, 136], lHip: [80, 136], rHip: [80, 136], lKn: [112, 142], rKn: [109, 142], lEl: [120, 100], rEl: [116, 100], lWr: [140, 98], rWr: [136, 98] }),
  },
  calf_raise_supported: {
    view: 'side', props: ['chair_support'], periodMs: 2200, caption: ['Hold the chair, feet flat', 'Rise onto the balls of your feet'],
    a: p(SIDE, HOLD_CHAIR_SIDE),
    b: p(shift(SIDE, 0, -8), { lAn: [100, 177], rAn: [98, 177], lToe: [110, 185], rToe: [108, 185], lEl: [116, 74], rEl: [112, 74], lWr: [134, 86], rWr: [130, 86] }),
  },
  side_leg_lift: {
    view: 'front', props: ['chair_front'], periodMs: 2400, caption: ['Hold the chair', 'Lift one leg out to the side'],
    a: p(FRONT, { lEl: [86, 84], rEl: [114, 84], lWr: [90, 108], rWr: [110, 108] }),
    b: p(FRONT, { lEl: [86, 84], rEl: [114, 84], lWr: [90, 108], rWr: [110, 108], rKn: [126, 140], rAn: [142, 174], rToe: [148, 176] }),
  },
  step_up: {
    view: 'side', props: ['step'], periodMs: 2600, caption: ['Face the step', 'Step up, then down'],
    a: shift(SIDE, -10, 0),
    b: p(shift(SIDE, -2, -8), { lKn: [120, 132], lAn: [124, 164], lToe: [134, 166], rKn: [95, 140], rAn: [90, 182], rToe: [100, 184] }),
  },
  glute_bridge: {
    view: 'side', props: ['mat'], periodMs: 2600, caption: ['Lie on your back, knees bent', 'Lift hips to a straight line'],
    a: {
      head: [38, 170], neck: [50, 173], pelvis: [98, 176], lSh: [56, 174], rSh: [56, 174], lEl: [72, 180], rEl: [70, 180], lWr: [88, 181], rWr: [86, 181],
      lHip: [98, 176], rHip: [98, 176], lKn: [126, 148], rKn: [124, 148], lAn: [142, 180], rAn: [140, 180], lToe: [152, 182], rToe: [150, 182],
    },
    b: {
      head: [38, 170], neck: [50, 172], pelvis: [100, 152], lSh: [56, 172], rSh: [56, 172], lEl: [72, 180], rEl: [70, 180], lWr: [88, 181], rWr: [86, 181],
      lHip: [100, 152], rHip: [100, 152], lKn: [130, 142], rKn: [128, 142], lAn: [142, 180], rAn: [140, 180], lToe: [152, 182], rToe: [150, 182],
    },
  },
  seated_knee_extension: {
    view: 'side', props: ['chair_seat'], periodMs: 2400, caption: ['Sit tall, hold the seat', 'Straighten one knee'],
    a: p(SEATED_SIDE, { lEl: [98, 98], lWr: [94, 122] }),
    b: p(SEATED_SIDE, { lEl: [98, 98], lWr: [94, 122], lKn: [128, 120], lAn: [166, 116], lToe: [170, 106] }),
  },
  wall_pushup: {
    view: 'side', props: ['wall'], periodMs: 2600, caption: ['Hands on the wall, body straight', 'Bend elbows toward the wall'],
    a: {
      head: [124, 46], neck: [120, 60], pelvis: [106, 110], lSh: [119, 64], rSh: [119, 64], lEl: [134, 66], rEl: [132, 66], lWr: [148, 68], rWr: [146, 68],
      lHip: [106, 110], rHip: [106, 110], lKn: [100, 147], rKn: [98, 147], lAn: [92, 184], rAn: [90, 184], lToe: [102, 186], rToe: [100, 186],
    },
    b: {
      head: [134, 48], neck: [130, 62], pelvis: [112, 111], lSh: [128, 66], rSh: [128, 66], lEl: [128, 86], rEl: [126, 86], lWr: [148, 70], rWr: [146, 70],
      lHip: [112, 111], rHip: [112, 111], lKn: [102, 148], rKn: [100, 148], lAn: [92, 184], rAn: [90, 184], lToe: [102, 186], rToe: [100, 186],
    },
  },
  biceps_curl: {
    view: 'front', props: ['weights'], periodMs: 2400, caption: ['Arms by your sides', 'Curl up toward your shoulders'],
    a: p(FRONT, { lEl: [82, 82], rEl: [118, 82], lWr: [82, 108], rWr: [118, 108] }),
    b: p(FRONT, { lEl: [82, 82], rEl: [118, 82], lWr: [84, 60], rWr: [116, 60] }),
  },
  band_row_seated: {
    view: 'side', props: ['chair_seat', 'band'], periodMs: 2400, caption: ['Arms forward, band taut', 'Pull elbows back'],
    a: p(SEATED_SIDE, { lKn: [128, 120], rKn: [125, 120], lAn: [164, 126], rAn: [161, 126], lToe: [168, 116], rToe: [165, 116], lEl: [120, 92], rEl: [117, 92], lWr: [142, 104], rWr: [139, 104] }),
    b: p(SEATED_SIDE, { lKn: [128, 120], rKn: [125, 120], lAn: [164, 126], rAn: [161, 126], lToe: [168, 116], rToe: [165, 116], lEl: [86, 96], rEl: [83, 96], lWr: [106, 100], rWr: [103, 100] }),
  },
  arm_raise: {
    view: 'side', props: [], periodMs: 2600, caption: ['Arms by your sides', 'Raise forward and up, as comfortable'],
    a: SIDE,
    b: p(SIDE, { lEl: [108, 34], rEl: [104, 34], lWr: [112, 10], rWr: [108, 10] }),
  },
  sideways_walk: {
    view: 'front', props: [], periodMs: 1800, caption: ['Feet together', 'Step to the side, then join'],
    a: p(FRONT, { lKn: [94, 144], rKn: [106, 144], lAn: [95, 183], rAn: [105, 183], lToe: [91, 186], rToe: [109, 186] }),
    b: p(FRONT, { rKn: [118, 143], rAn: [130, 183], rToe: [135, 186], lKn: [92, 144], lAn: [94, 183], lToe: [90, 186] }),
  },
  heel_toe_walk: {
    view: 'side', props: ['wall'], periodMs: 2000, caption: ['Fingertips on the wall', 'Heel directly in front of toes'],
    a: p(SIDE, { lKn: [106, 145], lAn: [110, 183], lToe: [122, 185], rKn: [96, 145], rAn: [96, 183], rToe: [108, 185] }),
    b: p(shift(SIDE, 8, 0), { lKn: [104, 145], lAn: [104, 183], lToe: [116, 185], rKn: [116, 145], rAn: [118, 183], rToe: [130, 185] }),
  },
  one_leg_stand_supported: {
    view: 'front', props: ['wall'], periodMs: 3200, caption: ['Fingertips on the wall', 'Lift one foot, hips level'],
    a: p(FRONT, { rEl: [132, 70], rWr: [148, 70] }),
    b: p(FRONT, { rEl: [132, 70], rWr: [148, 70], lKn: [92, 132], lAn: [88, 162], lToe: [83, 165] }),
  },
  one_leg_stand: {
    view: 'front', props: [], periodMs: 3200, caption: ['Feet together', 'Lift one foot slightly'],
    a: FRONT,
    b: p(FRONT, { lKn: [92, 138], lAn: [90, 170], lToe: [85, 173], lEl: [72, 80], lWr: [64, 100], rEl: [128, 80], rWr: [136, 100] }),
  },
  brisk_walk: {
    view: 'side', props: [], periodMs: 1000, caption: ['Walk tall', 'Talk-but-not-sing pace'],
    a: p(SIDE, { lKn: [110, 145], lAn: [120, 183], lToe: [131, 185], rKn: [94, 145], rAn: [82, 181], rToe: [92, 186], lEl: [94, 80], lWr: [88, 100], rEl: [106, 80], rWr: [114, 98] }),
    b: p(SIDE, { rKn: [110, 145], rAn: [120, 183], rToe: [131, 185], lKn: [94, 145], lAn: [82, 181], lToe: [92, 186], rEl: [94, 80], rWr: [88, 100], lEl: [106, 80], lWr: [114, 98] }),
  },
  step_jacks: {
    view: 'front', props: [], periodMs: 1400, caption: ['Feet together', 'Step out, arms up'],
    a: p(FRONT, { lKn: [94, 144], rKn: [106, 144], lAn: [95, 183], rAn: [105, 183] }),
    b: p(FRONT, { rKn: [120, 143], rAn: [134, 183], rToe: [139, 186], lEl: [70, 36], rEl: [130, 36], lWr: [64, 12], rWr: [136, 12] }),
  },
  chest_stretch_seated: {
    view: 'front', props: ['chair_front'], periodMs: 3600, caption: ['Sit tall', 'Arms out, lift the chest'],
    a: SEATED_FRONT,
    b: p(SEATED_FRONT, { lEl: [62, 76], rEl: [138, 76], lWr: [42, 82], rWr: [158, 82] }),
  },
  upper_body_twist: {
    view: 'front', props: ['chair_front'], periodMs: 3200, caption: ['Arms crossed on shoulders', 'Turn the upper body, hips still'],
    a: p(SEATED_FRONT, { lEl: [96, 90], rEl: [104, 90], lWr: [114, 74], rWr: [86, 74] }),
    b: p(SEATED_FRONT, { head: [104, 50], neck: [103, 66], lSh: [92, 72], rSh: [114, 74], lEl: [104, 90], rEl: [108, 92], lWr: [116, 76], rWr: [94, 74] }),
  },
  calf_stretch_wall: {
    view: 'side', props: ['wall'], periodMs: 3600, caption: ['Hands on the wall', 'Back leg straight, heel down'],
    a: p(shift(SIDE, 10, 0), { lEl: [128, 66], rEl: [126, 66], lWr: [148, 66], rWr: [146, 66] }),
    b: {
      head: [124, 46], neck: [120, 61], pelvis: [104, 110], lSh: [119, 65], rSh: [119, 65], lEl: [134, 68], rEl: [132, 68], lWr: [148, 66], rWr: [146, 66],
      lHip: [104, 110], rHip: [104, 110], lKn: [122, 146], rKn: [88, 147], lAn: [118, 183], rAn: [72, 183], lToe: [130, 185], rToe: [84, 185],
    },
  },
  ankle_stretch_seated: {
    view: 'side', props: ['chair_seat'], periodMs: 2400, caption: ['Leg out, toes up', 'Point the toes away'],
    a: p(SEATED_SIDE, { lKn: [128, 121], lAn: [160, 128], lToe: [166, 118], lEl: [98, 98], lWr: [94, 122] }),
    b: p(SEATED_SIDE, { lKn: [128, 121], lAn: [160, 128], lToe: [170, 134], lEl: [98, 98], lWr: [94, 122] }),
  },
  side_bend: {
    view: 'front', props: [], periodMs: 3200, caption: ['Stand tall', 'Slide one hand down your side'],
    a: FRONT,
    b: p(FRONT, { head: [88, 38], neck: [91, 53], lSh: [77, 61], rSh: [108, 54], lEl: [76, 92], lWr: [78, 124], rEl: [114, 80], rWr: [116, 104] }),
  },
  neck_rotation: {
    view: 'front', props: ['chair_front'], periodMs: 3600, caption: ['Look straight ahead', 'Turn your head, as comfortable'],
    a: SEATED_FRONT,
    b: p(SEATED_FRONT, { head: [107, 50] }),
  },
  hamstring_stretch_seated: {
    view: 'side', props: ['chair_seat'], periodMs: 3600, caption: ['One leg straight, heel down', 'Lean forward slightly from the hips'],
    a: p(SEATED_SIDE, { lKn: [130, 136], lAn: [160, 178], lToe: [164, 168], lEl: [106, 96], lWr: [120, 118] }),
    b: p(SEATED_SIDE, { head: [119, 60], neck: [112, 73], lSh: [111, 77], rSh: [111, 77], lKn: [130, 136], lAn: [160, 178], lToe: [164, 168], lEl: [120, 102], rEl: [116, 102], lWr: [132, 124], rWr: [128, 124] }),
  },

  wall_sit: {
    view: 'side', props: ['wall'], periodMs: 3200, caption: ['Back flat against the wall', 'Slide down, knees bent, and hold'],
    a: shift(SIDE, 36, 0),
    b: {
      head: [141, 62], neck: [141, 77], pelvis: [139, 131], lSh: [141, 82], rSh: [141, 82], lEl: [152, 106], rEl: [148, 106], lWr: [164, 120], rWr: [160, 120],
      lHip: [139, 131], rHip: [139, 131], lKn: [171, 131], rKn: [167, 131], lAn: [171, 184], rAn: [167, 184], lToe: [183, 186], rToe: [179, 186],
    },
  },
  hip_hinge: {
    view: 'side', props: [], periodMs: 2800, caption: ['Stand tall, hands on hips', 'Hips back, chest forward'],
    a: p(SIDE, { lEl: [112, 84], rEl: [108, 84], lWr: [104, 104], rWr: [100, 104] }),
    b: {
      head: [143, 72], neck: [130, 80], pelvis: [88, 106], lSh: [126, 84], rSh: [126, 84], lEl: [124, 104], rEl: [120, 104], lWr: [106, 108], rWr: [102, 108],
      lHip: [88, 106], rHip: [88, 106], lKn: [98, 146], rKn: [95, 146], lAn: [92, 183], rAn: [90, 183], lToe: [104, 185], rToe: [102, 185],
    },
  },
  shoulder_press: {
    view: 'front', props: ['weights', 'chair_front'], periodMs: 2600, caption: ['Weights at shoulder height', 'Press straight up'],
    a: p(SEATED_FRONT, { lEl: [68, 92], rEl: [132, 92], lWr: [72, 70], rWr: [128, 70] }),
    b: p(SEATED_FRONT, { lEl: [80, 48], rEl: [120, 48], lWr: [80, 22], rWr: [120, 22] }),
  },
  lateral_raise: {
    view: 'front', props: ['weights'], periodMs: 2600, caption: ['Arms by your sides', 'Raise out to shoulder height'],
    a: p(FRONT, { lEl: [82, 82], rEl: [118, 82], lWr: [82, 108], rWr: [118, 108] }),
    b: p(FRONT, { lEl: [62, 58], rEl: [138, 58], lWr: [40, 58], rWr: [160, 58] }),
  },
  tandem_stand: {
    view: 'side', props: ['wall'], periodMs: 3400, caption: ['Fingertips on the wall', 'One foot directly in front of the other'],
    a: p(SIDE, { lEl: [126, 80], lWr: [147, 72], lAn: [101, 183], rAn: [97, 183], lToe: [113, 185], rToe: [109, 185] }),
    b: p(SIDE, { lEl: [126, 80], lWr: [147, 72], lKn: [110, 146], lAn: [118, 183], lToe: [130, 185], rKn: [92, 146], rAn: [88, 183], rToe: [100, 185] }),
  },
  step_touch: {
    view: 'front', props: [], periodMs: 1400, caption: ['Feet together, elbows bent', 'Step out to the side and tap'],
    a: p(FRONT, { lEl: [78, 84], lWr: [90, 70], rEl: [122, 84], rWr: [110, 70], lKn: [94, 144], rKn: [106, 144], lAn: [95, 183], rAn: [105, 183], lToe: [91, 186], rToe: [109, 186] }),
    b: p(FRONT, { lEl: [76, 80], lWr: [88, 66], rEl: [124, 86], rWr: [114, 74], rKn: [118, 143], rAn: [132, 183], rToe: [138, 186], lKn: [92, 144], lAn: [94, 183], lToe: [90, 186] }),
  },
  seated_brisk_march: {
    view: 'side', props: ['chair_seat'], periodMs: 1000, caption: ['Sit tall, arms bent', 'Lift a knee briskly'],
    a: p(SEATED_SIDE, { lEl: [108, 92], rEl: [104, 92], lWr: [118, 82], rWr: [114, 82] }),
    b: p(SEATED_SIDE, { lKn: [124, 104], lAn: [130, 146], lToe: [140, 148], lEl: [92, 92], lWr: [84, 106], rEl: [110, 88], rWr: [120, 76] }),
  },
  seated_punches: {
    view: 'front', props: ['chair_front'], periodMs: 1000, caption: ['Soft fists at chest height', 'Punch forward, alternating arms'],
    a: p(SEATED_FRONT, { lEl: [86, 98], rEl: [114, 98], lWr: [92, 78], rWr: [108, 78] }),
    b: p(SEATED_FRONT, { lEl: [76, 90], lWr: [66, 74], rEl: [116, 98], rWr: [108, 78] }),
  },
};

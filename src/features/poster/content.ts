/**
 * Everything on the poster that is text you may want to change before printing.
 * Numbers that come from the app itself (exercise count, food count, sources, detectors) are computed
 * in PosterPage so they can never drift out of date.
 *
 * The board is a three-flap layout: LEFT explains the features, CENTER shows how it was built (with Claude)
 * and how it works, then why it beats general exercise apps, RIGHT lists the models and where they came from.
 */
export const POSTER = {
  /** Poster size in inches (landscape). Change this and the @page rule together if your board differs. */
  widthIn: 48,
  heightIn: 36,

  title: 'Verimove: evidence-linked exercise coaching that runs entirely on your device',
  subtitle: 'Safety by rule, camera counting for every exercise, and food recognition, with no account and no uploads',
  authors: '[Your name] · [Co-author] · [Institution or department]',
  event: 'IEEE [Conference name] · [City], 2026 · Poster [number]',
  contact: '[you@example.com]',

  /** Shown in very large type so people can type it from across the aisle. */
  siteHost: 'helpful-cheesecake-c14c13.netlify.app',
  demoPath: '/demo',
  repo: 'github.com/arn-bit/IEEE-MedWork',

  /* Short on purpose: the poster is mostly pictures and the presenter does the talking. */
  /* ───────────── LEFT flap: how the three features work ───────────── */
  pose: ['33 body points per frame', 'Video never leaves the device', 'Joint angles become reps and holds'],

  gamification: ['Finish a workout, earn tokens', 'Stopping early earns 0', 'Spend them on calm games'],
  /** Reward games and what they cost in tokens. */
  games: [
    ['Photo Puzzle', 3],
    ['Memory Match', 2],
    ['Colour Echo', 2],
  ],

  food: ['Photo in, plate totals out', 'Each food read and sized separately', 'Wrong? Label it once; it learns'],
  foodSteps: ['Photo', 'Two models', 'Each food', 'Plate totals'],

  /* ───────────── CENTER flap: built with Claude, and how the app plans ───────────── */
  claudeFlow: [
    { t: 'Plan', d: 'read first' },
    { t: 'Build', d: 'small steps' },
    { t: 'Check', d: '4 layers' },
    { t: 'Fix', d: 'never hide' },
    { t: 'Ask', d: 'before big steps' },
    { t: 'Report', d: 'what passed' },
  ],
  claudeChecks: ['Typecheck + lint', '400+ unit tests', '70+ browser tests', 'Screenshots'],

  engine: ['Answers', 'Safety', 'Filter', 'Week', 'Sets + sources'],

  /** Why it is better than a general exercise app. `[what, typical app, Verimove]` */
  compare: [
    ['Explains every pick', 'Rarely', 'Sources on every exercise'],
    ['Safety', 'A disclaimer', 'Rules before any plan'],
    ['Same answers, same plan', 'Not shown', 'Always, with a trace'],
    ['Camera counting', 'A few exercises', 'Every exercise'],
    ['Privacy', 'Account and cloud', 'No account, no uploads'],
    ['Meal photos', 'Paid or manual', 'Free, on the device'],
    ['Rewards', 'Streak pressure', 'Capped, calm games'],
  ],
  compareNote: 'A general comparison of common app features, not a test of any named product.',

  /* ───────────── RIGHT flap: the models and where they came from ───────────── */
  models: [
    {
      name: 'MediaPipe Pose Landmarker Lite',
      maker: 'Google',
      badge: 'G',
      job: 'Body points for rep counting',
      from: 'Apache-2.0. From BlazePose (2020).',
      facts: ['33 points', 'Apache-2.0'],
    },
    {
      name: 'EfficientNet-B0 on Food-101',
      maker: 'Google + ETH Zurich',
      badge: 'E',
      job: 'Names the dish',
      from: 'MIT checkpoint. Trained on 101,000 photos of 101 dishes.',
      facts: ['16.5 MB', 'MIT', '84.5% reported'],
    },
    {
      name: 'OpenAI CLIP ViT-B/32',
      maker: 'OpenAI',
      badge: 'O',
      job: 'Matches 300+ foods, nuts and world cuisines',
      from: 'MIT. 4-bit image encoder, text vectors made offline.',
      facts: ['64 MB', 'MIT', '300+ names'],
    },
    {
      name: 'ONNX Runtime Web 1.30',
      maker: 'Microsoft',
      badge: 'M',
      job: 'Runs both food models in the page',
      from: 'MIT. WebAssembly, one thread, served from our own site.',
      facts: ['No server', 'MIT'],
    },
  ],
  modelsNote: 'We trained none of them. Rules and plan engine are ordinary code.',

  evaluation: ['400+ unit tests', '70+ browser tests'],

  limits: ['Not yet validated on real people', 'Food amounts are estimates', 'Not clinician-reviewed', 'General fitness guidance, not medical advice'],

  references: [
    'Bazarevsky et al., “BlazePose: On-device Real-time Body Pose Tracking,” arXiv:2006.10204, 2020.',
    'Radford et al., “Learning Transferable Visual Models From Natural Language Supervision (CLIP),” ICML 2021.',
    'Tan and Le, “EfficientNet: Rethinking Model Scaling for Convolutional Neural Networks,” ICML 2019.',
    'Bossard, Guillaumin and Van Gool, “Food-101: Mining Discriminative Components with Random Forests,” ECCV 2014.',
    'Bull et al., “World Health Organization 2020 guidelines on physical activity and sedentary behaviour,” Br J Sports Med 54(24), 2020.',
    'ACSM, “Progression models in resistance training for healthy adults,” Med Sci Sports Exerc 41(3), 2009.',
  ],
} as const;

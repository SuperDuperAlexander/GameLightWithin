/**
 * Every tunable number for chapter 1 "Receive".
 * Systems must not contain magic numbers; they read from here.
 */

export type SceneId = 1 | 2 | 3 | 4 | 5 | 6;

export interface RhythmPreset {
  readonly id: 'normal' | 'slow' | 'easy';
  /** Target in-breath in seconds. */
  readonly inhale: number;
  /** Target out-breath in seconds. */
  readonly exhale: number;
  /** Allowed relative deviation, 0.3 = plus or minus 30 percent. */
  readonly tolerance: number;
}

export const RHYTHM_PRESETS: Record<RhythmPreset['id'], RhythmPreset> = {
  normal: { id: 'normal', inhale: 4, exhale: 6, tolerance: 0.3 },
  slow: { id: 'slow', inhale: 5, exhale: 7, tolerance: 0.3 },
  easy: { id: 'easy', inhale: 3, exhale: 4, tolerance: 0.45 },
};

export const BREATH = {
  /** Movement faster than this counts as walking and resets the breath. */
  walkResetSpeed: 0.25,
  /**
   * Calm breaths needed to wake the glow in scene 1. One is enough: the point
   * is to feel the first breath land, not to drill a count.
   */
  wakeBreaths: 1,
  /**
   * Seconds the game waits between the in-breath ending and the out-breath
   * starting before it gives up on the breath.
   */
  holdGraceFactor: 2,
  /** Outline strength of the breath circle. 1.0 in chapter 1, lower in later chapters. */
  circleStrength: 1.0,
  /** A breath shorter than this is treated as a mis-tap, not a breath. */
  minBreathSeconds: 0.35,
} as const;

export const CALM = {
  /** Calm value gained per calm breath. */
  gainPerCalmBreath: 0.18,
  /** Calm value lost per non-calm breath. */
  lossPerNonCalmBreath: 0.08,
  /** Calm value lost per second while walking. */
  lossPerSecondWalking: 0.02,
  /** Calm value lost per second while standing but not breathing calmly. */
  lossPerSecondIdle: 0.004,
  min: 0,
  max: 1,
  /** At or above this value a planted seed becomes a heart seed. */
  heartThreshold: 0.6,
} as const;

export const LIGHT = {
  max: 12,
  seedCost: 5,
  /** Motes orbiting the player, one per light carried. */
  moteOrbitRadius: 0.85,
  moteOrbitSpeed: 0.55,
} as const;

export const RECEIVE = {
  /** The player must stand this close to draw light from a spring. */
  drawRadius: 3,
  /** A hidden spring reveals itself after calm breaths taken inside this radius. */
  revealRadius: 6,
  /** Calm breaths needed inside `revealRadius` to reveal a hidden spring. */
  revealBreaths: 1,
  /**
   * Light a spring gives per calm breath. A spring holds three, so one calm
   * breath empties it. Standing still for a whole breath is the moment that
   * matters; repeating it three times only adds waiting.
   */
  lightPerBreath: 3,
  /** Seconds a light mote takes to travel from spring to player. */
  moteFlightSeconds: 1.6,
  /** Radius of the colour zone a spent spring leaves behind. */
  zoneRadius: 16,
} as const;

export const TRANSFORM = {
  /** Step 1 "see it" starts inside this radius. */
  seeRadius: 8,
  /** Seconds the thought text needs to appear fully. Cannot be skipped. */
  seeSeconds: 4,
  /** Step 2 "feel it" starts inside this radius. */
  feelRadius: 5,
  /** Calm breaths needed for step 2. */
  feelBreaths: 1,
  /** Step 3 "become one" starts inside this radius of the fog centre. */
  centerRadius: 2,
  /** Calm breaths needed for step 3. This is the one place two are asked for. */
  centerBreaths: 2,
  /** Leaving `seeRadius` before step 3 ends grows the fog by this factor. */
  fleeGrowth: 0.1,
  /** The fog never grows by more than this in total. */
  fleeGrowthMax: 0.3,
  /** Metres the fog drifts toward the player each time they run away. */
  fleeDriftMetres: 1,
  /** Each push adds this many calm breaths to step 3. */
  pushExtraBreaths: 1,
  /** Pushing never adds more than this many breaths. Push never works. */
  pushExtraBreathsMax: 1,
  /** Seconds the fog takes to dissolve into motes. */
  dissolveSeconds: 2.5,
  /** Light released when the fog dissolves. */
  lightReward: 2,
  zoneRadius: 18,
} as const;

export const MANIFEST = {
  cost: LIGHT.seedCost,
  /** The seed only grows while the player is further away than this. */
  awayRadius: 15,
  /** Total away time needed for the seed to finish growing. */
  growSeconds: 25,
  /** Coming back within `awayRadius` before growth ends adds this much time. */
  returnPenaltySeconds: 3,
  /** The return penalty never adds more than this in total. */
  returnPenaltyMax: 9,
  /** Seconds the bridge takes to rise and form. */
  bridgeRiseSeconds: 3,
  /** A mind seed grows this many times faster (kept for chapter 2). */
  mindSeedSpeedFactor: 2,
  /** A mind seed fades after this many seconds (kept for chapter 2). */
  mindSeedFadeSeconds: 60,
  /** A faded mind seed returns this share of its light (kept for chapter 2). */
  mindSeedRefundShare: 0.5,
} as const;

export const THANKS = {
  /** Calm breaths needed on the finished bridge. */
  breaths: 2,
  /** Seconds the global colour takes to reach 1. */
  colorSeconds: 6,
  /** The player counts as standing on the bridge inside this radius. */
  radius: 4,
} as const;

export const HINTS = {
  /** Scene 3: seconds without a calm breath before the bird lands. */
  birdAfterSeconds: 120,
  /** Scene 5: seconds spent near the seed before the butterfly appears. */
  butterflyAfterSeconds: 30,
  /** Scene 5: the butterfly counts the player as near inside this radius. */
  butterflyRadius: MANIFEST.awayRadius,
} as const;

export const COLOR = {
  /** Seconds a new colour zone needs to reach full size. */
  zoneGrowSecondsMin: 2,
  zoneGrowSecondsMax: 4,
  /** Hard limit of the zone uniform array in the shader. */
  maxZones: 8,
  /** Reduced motion stretches colour transitions by this factor. */
  reducedMotionFactor: 1.8,
} as const;

export const PLAYER = {
  walkSpeed: 4.2,
  /**
   * How fast the player walks before their first breath. They are never held
   * still: they can set off at once, just heavily, as if not yet awake. The
   * first finished breath gives them their full stride, and keeps it.
   */
  wakingWalkFactor: 0.4,
  /** Seconds the stride takes to open up after that first breath. */
  wakingEaseSeconds: 2.5,
  /** How fast the player turns toward the movement direction, radians per second. */
  turnSpeed: 7,
  /** Slopes steeper than this cosine are not walkable. */
  maxSlopeCos: 0.55,
  radius: 0.45,
  height: 1.7,
  /** The soft glow radius at calm 1. */
  glowRadiusMax: 2.1,
  glowRadiusMin: 0.55,
} as const;

export const CAMERA = {
  distance: 8,
  height: 2.9,
  /** Higher is snappier. The camera must never move suddenly. */
  followLambda: 2.4,
  minPitch: -0.15,
  maxPitch: 0.95,
  startPitch: 0.12,
  fov: 55,
  near: 0.1,
  far: 400,
  dragSensitivity: 0.0055,
} as const;

export const SHADOW = {
  /** Side of the shadow box that follows the player, in metres. */
  boxSize: 56,
  near: 1,
  far: 180,
  /** How far up the light sits along its own direction. */
  distance: 70,
  bias: -0.0012,
  normalBias: 0.05,
} as const;

export const WORLD = {
  /** Half size of the playable valley in metres. */
  halfWidth: 60,
  /** The valley runs along negative z. */
  lengthStart: 12,
  lengthEnd: -110,
  /** Mist turns the player back inside this distance from the border. */
  borderSoftness: 10,
  terrainSegments: 168,
} as const;

/** Points of interest. All positions are x and z on the valley floor. */
export const LAYOUT = {
  playerStart: { x: 0, z: 4 },
  /** Scene 2: the dry spring with the carved sign stone. */
  spring1: { x: 3.5, z: -20, light: 3, hidden: false },
  /** Scene 3: the hidden spring in the wide field. */
  spring2: { x: -16, z: -45, light: 3, hidden: true },
  /** Scene 5: the hidden spring at the end of the side path. */
  spring3: { x: 26, z: -80, light: 3, hidden: true },
  signStone: { x: 6.2, z: -18.4 },
  /** Scene 4: the fog on the narrow path. */
  fog: { x: 2, z: -64, radius: 5.5 },
  /** Scene 5: the seed spot at the edge of the gap. */
  seedSpot: { x: 0, z: -84 },
  /** The gap the bridge spans. */
  gap: { z0: -94, z1: -86, x0: -22, x1: 12 },
  bridge: { x: 0, z: -90 },
  bird: { x: -19, z: -41 },
  butterflyPath: [
    { x: 4, z: -82 },
    { x: 14, z: -80 },
    { x: 22, z: -79 },
  ],
} as const;

/** Where each scene starts the player, and how much light they should already carry. */
export const SCENE_STARTS: Record<SceneId, { x: number; z: number; light: number }> = {
  1: { x: LAYOUT.playerStart.x, z: LAYOUT.playerStart.z, light: 0 },
  2: { x: 1, z: -12, light: 0 },
  3: { x: -6, z: -38, light: 3 },
  4: { x: 2, z: -55, light: 6 },
  5: { x: 0, z: -78, light: 8 },
  6: { x: LAYOUT.bridge.x, z: LAYOUT.bridge.z + 4, light: 3 },
};

export const SAVE_KEY = 'lightwithin.save.v1';
export const CHECKS_KEY = 'lightwithin.checks.v1';
export const SETTINGS_KEY = 'lightwithin.settings.v1';

export const QUALITY = {
  /** Seconds of frame timing measured at start before a tier is picked. */
  probeSeconds: 1.2,
  /** Average frame time above this in ms picks the low tier. */
  lowThresholdMs: 26,
  /** Average frame time above this in ms picks the medium tier. */
  mediumThresholdMs: 19,
  /** Device pixel ratio cap on touch devices. */
  mobilePixelRatioCap: 1.5,
  desktopPixelRatioCap: 2,
  /**
   * The watchdog. The start probe only measures the first second, before the
   * player has walked anywhere, so a device can still turn out slower than it
   * looked. These settle it during play.
   */
  /** Seconds of frames the watchdog averages before it judges. */
  watchdogWindowSeconds: 5,
  /** Seconds to wait after a tier change before judging again. */
  watchdogCooldownSeconds: 6,
  /** Below this many frames per second the tier steps down, on a touch device. */
  mobileFloorFps: 24,
  /** Below this many frames per second the tier steps down, elsewhere. */
  desktopFloorFps: 45,
} as const;

/**
 * `grassCards` and `grassFade` change at run time: the grass is built once at
 * the highest count and the tier only decides how many of those instances are
 * drawn and how close they fade out. `skyStrokes` and `treeBlobs` are baked
 * into the geometry when the world is built, so they follow the tier the game
 * starts with.
 */
export const TIERS = {
  low: {
    paintScale: 0.5,
    grassCards: 16000,
    grassFade: 28,
    particles: 40,
    skyStrokes: 5,
    treeBlobs: 5,
    /** Shadow map size in pixels. 0 turns real shadows off. */
    shadowMap: 0,
  },
  medium: {
    paintScale: 0.75,
    grassCards: 34000,
    grassFade: 42,
    particles: 120,
    skyStrokes: 8,
    treeBlobs: 7,
    shadowMap: 1024,
  },
  high: {
    paintScale: 1.0,
    grassCards: 60000,
    grassFade: 58,
    particles: 240,
    skyStrokes: 12,
    treeBlobs: 9,
    shadowMap: 2048,
  },
} as const;

/** Every tier from the cheapest to the most expensive. */
export const TIER_ORDER = ['low', 'medium', 'high'] as const;

export type QualityTier = keyof typeof TIERS;

import { SAVE_KEY, CHECKS_KEY, SETTINGS_KEY } from '../content/chapter1';
import type { SceneId, RhythmPreset, QualityTier } from '../content/chapter1';

export interface Answers {
  receive: number | null;
  calm: number | null;
}

export interface SaveData {
  version: 1;
  scene: SceneId;
  light: number;
  startAnswers: Answers;
  endAnswers: Answers;
  completed: boolean;
}

export interface LearningChecks {
  /** Scene 3: did the player find the hidden spring before the bird hint? */
  stoppedWithoutHint: boolean;
  /** Scene 4: how many times push was used. */
  pushCount: number;
  /** Scene 4: how many times the player ran away from the fog. */
  leftFogCount: number;
  /** Scene 5: did the player leave the 15 m zone without the butterfly hint? */
  walkedAwayFromSeed: boolean;
  /** Seconds spent in each scene. */
  timePerScene: Partial<Record<SceneId, number>>;
}

export interface SettingsData {
  rhythm: RhythmPreset['id'];
  quality: QualityTier | 'auto';
  volume: number;
  muted: boolean;
  reducedMotion: boolean;
}

export const DEFAULT_SAVE: SaveData = {
  version: 1,
  scene: 1,
  light: 0,
  startAnswers: { receive: null, calm: null },
  endAnswers: { receive: null, calm: null },
  completed: false,
};

export const DEFAULT_CHECKS: LearningChecks = {
  stoppedWithoutHint: false,
  pushCount: 0,
  leftFogCount: 0,
  walkedAwayFromSeed: false,
  timePerScene: {},
};

export const DEFAULT_SETTINGS: SettingsData = {
  rhythm: 'normal',
  quality: 'auto',
  volume: 0.7,
  muted: false,
  reducedMotion: false,
};

/**
 * Local storage only. Nothing is ever sent anywhere.
 * Every read falls back to the default, so a broken or missing entry cannot block the game.
 */
function read<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return structuredClone(fallback);
    const parsed = JSON.parse(raw) as Partial<T>;
    return { ...structuredClone(fallback), ...parsed };
  } catch {
    return structuredClone(fallback);
  }
}

function write<T>(key: string, value: T): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing or a full quota. The game keeps working without saving.
  }
}

export function loadSave(): SaveData {
  const data = read(SAVE_KEY, DEFAULT_SAVE);
  // A stored scene outside 1..6 must not strand the player.
  if (!Number.isInteger(data.scene) || data.scene < 1 || data.scene > 6) data.scene = 1;
  data.light = Math.max(0, Math.min(12, Math.round(data.light ?? 0)));
  return data;
}

export function saveSave(data: SaveData): void {
  write(SAVE_KEY, data);
}

export function clearSave(): void {
  try {
    globalThis.localStorage?.removeItem(SAVE_KEY);
  } catch {
    /* nothing to do */
  }
}

export function loadChecks(): LearningChecks {
  return read(CHECKS_KEY, DEFAULT_CHECKS);
}

export function saveChecks(data: LearningChecks): void {
  write(CHECKS_KEY, data);
}

export function loadSettings(): SettingsData {
  const s = read(SETTINGS_KEY, DEFAULT_SETTINGS);
  s.volume = Math.max(0, Math.min(1, s.volume));
  return s;
}

export function saveSettings(data: SettingsData): void {
  write(SETTINGS_KEY, data);
}

import type { QualityTier, SceneId } from '../content/chapter1';

export interface DebugFlags {
  /** `?debug=1` shows the debug panel. */
  readonly debug: boolean;
  /** `?scene=N` starts directly at scene N with the right amount of light. */
  readonly startScene: SceneId | null;
  /** `?autobreathe=1` breathes automatically with calm breaths, for browser tests. */
  readonly autobreathe: boolean;
  /** `?nopaint=1` turns the painting filter off. Useful when a driver has no float targets. */
  readonly noPaint: boolean;
  /** `?quality=low|medium|high` pins the tier instead of measuring it. */
  readonly quality: QualityTier | null;
}

function readQuality(raw: string | null): QualityTier | null {
  return raw === 'low' || raw === 'medium' || raw === 'high' ? raw : null;
}

function readScene(raw: string | null): SceneId | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 6) return null;
  return n as SceneId;
}

export function parseFlags(search: string): DebugFlags {
  const p = new URLSearchParams(search);
  return {
    debug: p.get('debug') === '1',
    startScene: readScene(p.get('scene')),
    autobreathe: p.get('autobreathe') === '1',
    noPaint: p.get('nopaint') === '1',
    quality: readQuality(p.get('quality')),
  };
}

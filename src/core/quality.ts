import { QUALITY, TIERS } from '../content/chapter1';
import type { QualityTier } from '../content/chapter1';

export type { QualityTier };

export interface QualitySettings {
  tier: QualityTier;
  pixelRatio: number;
  readonly paintScale: number;
  readonly grassCards: number;
  readonly particles: number;
  readonly skyStrokes: number;
  readonly treeBlobs: number;
}

export function isTouchDevice(): boolean {
  return (
    typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window)
  );
}

export function pixelRatioCap(): number {
  const cap = isTouchDevice() ? QUALITY.mobilePixelRatioCap : QUALITY.desktopPixelRatioCap;
  return Math.min(globalThis.devicePixelRatio ?? 1, cap);
}

export function settingsFor(tier: QualityTier): QualitySettings {
  return { tier, pixelRatio: pixelRatioCap(), ...TIERS[tier] };
}

/** Picks a tier from an average frame time in milliseconds. */
export function tierForFrameTime(avgMs: number): QualityTier {
  if (avgMs > QUALITY.lowThresholdMs) return 'low';
  if (avgMs > QUALITY.mediumThresholdMs) return 'medium';
  return 'high';
}

/**
 * Measures frame times for a short moment at start and picks a tier from them.
 * Touch devices never start above medium, so the first seconds stay smooth.
 */
export class QualityProbe {
  private samples: number[] = [];
  private elapsed = 0;
  private done = false;

  get finished(): boolean {
    return this.done;
  }

  /** Returns the chosen tier once the probe is finished, otherwise null. */
  sample(dtSeconds: number): QualityTier | null {
    if (this.done) return null;
    this.elapsed += dtSeconds;
    // Skip the first frames: they include compiling and uploading.
    if (this.elapsed > 0.35) this.samples.push(dtSeconds * 1000);
    if (this.elapsed < QUALITY.probeSeconds) return null;
    this.done = true;
    if (this.samples.length === 0) return 'medium';
    const sorted = [...this.samples].sort((a, b) => a - b);
    // The median ignores a single slow frame.
    const median = sorted[Math.floor(sorted.length / 2)] ?? 16;
    let tier = tierForFrameTime(median);
    if (isTouchDevice() && tier === 'high') tier = 'medium';
    return tier;
  }
}

/**
 * A rolling frames-per-second counter for the debug panel and the report.
 * It must be fed real elapsed seconds, never a clamped simulation step, or it
 * reports the clamp instead of the frame rate.
 */
export class FpsMeter {
  private frames = 0;
  private acc = 0;
  value = 0;
  /** The slowest frame seen since the last reset, in milliseconds. */
  worstMs = 0;

  update(realSeconds: number): void {
    this.frames++;
    this.acc += realSeconds;
    this.worstMs = Math.max(this.worstMs, realSeconds * 1000);
    if (this.acc >= 0.5) {
      this.value = Math.round(this.frames / this.acc);
      this.frames = 0;
      this.acc = 0;
    }
  }

  reset(): void {
    this.frames = 0;
    this.acc = 0;
    this.worstMs = 0;
  }
}

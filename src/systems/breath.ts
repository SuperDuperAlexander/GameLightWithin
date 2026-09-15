import { BREATH, RHYTHM_PRESETS } from '../content/chapter1';
import type { RhythmPreset } from '../content/chapter1';
import type { EventBus } from '../core/events';
import { clamp01 } from '../core/math';

export type BreathPhase = 'idle' | 'inhale' | 'exhale';

/**
 * The breath system. One breath is one hold plus one release.
 *
 * A breath counts as calm when the in-breath and the out-breath are both inside
 * the preset tolerance. Breathing only counts while the player stands still;
 * walking resets the breath in progress. Nothing bad happens when it resets.
 */
export class BreathSystem {
  phase: BreathPhase = 'idle';
  /** Seconds the current phase has run. */
  phaseTime = 0;
  /** Seconds the finished in-breath lasted, while the out-breath runs. */
  private inhaleTime = 0;
  private preset: RhythmPreset = RHYTHM_PRESETS.normal;
  /** 0..1 target size of the breath circle, following the preset rhythm. */
  targetRing = 0;
  /** 0..1 size the player is actually holding. */
  playerRing = 0;
  private targetClock = 0;
  private held = false;

  constructor(private readonly bus: EventBus) {}

  setPreset(id: RhythmPreset['id']): void {
    this.preset = RHYTHM_PRESETS[id];
    this.reset();
  }

  getPreset(): RhythmPreset {
    return this.preset;
  }

  /** True when a duration is inside the tolerance band around the target. */
  inTolerance(actual: number, target: number): boolean {
    const slack = target * this.preset.tolerance;
    return actual >= target - slack && actual <= target + slack;
  }

  reset(): void {
    this.phase = 'idle';
    this.phaseTime = 0;
    this.inhaleTime = 0;
    this.playerRing = 0;
    this.held = false;
  }

  /**
   * @param dt seconds since the last frame
   * @param held whether the breath button is held down
   * @param speed the player's current ground speed in metres per second
   */
  update(dt: number, held: boolean, speed: number): void {
    this.advanceTargetRing(dt);

    const walking = speed > BREATH.walkResetSpeed;
    if (walking) {
      // Walking resets the breath in progress. No penalty beyond that.
      if (this.phase !== 'idle') this.reset();
      this.held = held;
      return;
    }

    const pressed = held && !this.held;
    const released = !held && this.held;
    this.held = held;

    if (this.phase === 'idle') {
      if (pressed) {
        this.phase = 'inhale';
        this.phaseTime = 0;
        this.bus.emit('breathStarted');
      }
      this.playerRing = Math.max(0, this.playerRing - dt * 0.8);
      return;
    }

    this.phaseTime += dt;

    if (this.phase === 'inhale') {
      this.playerRing = clamp01(this.phaseTime / this.preset.inhale);
      if (released) {
        if (this.phaseTime < BREATH.minBreathSeconds) {
          // Too short to be a breath. Treat it as a mis-tap.
          this.reset();
          return;
        }
        this.inhaleTime = this.phaseTime;
        this.phase = 'exhale';
        this.phaseTime = 0;
      }
      return;
    }

    // Exhale: the player has let go, the circle shrinks back.
    this.playerRing = clamp01(1 - this.phaseTime / this.preset.exhale);
    if (held) {
      // Pressing again ends the out-breath and scores the whole breath.
      this.complete(this.phaseTime);
      this.phase = 'inhale';
      this.phaseTime = 0;
      this.bus.emit('breathStarted');
      return;
    }
    // An out-breath twice as long as the target is clearly over.
    if (this.phaseTime >= this.preset.exhale * 2) {
      this.complete(this.phaseTime);
      this.reset();
    }
  }

  /** Ends the out-breath at the current time. Used when the player presses again. */
  private complete(exhale: number): void {
    const calm =
      this.inTolerance(this.inhaleTime, this.preset.inhale) &&
      this.inTolerance(exhale, this.preset.exhale);
    this.bus.emit('breathCompleted', { calm, inhale: this.inhaleTime, exhale });
  }

  /** The demonstration rhythm the circle shows, independent of what the player does. */
  private advanceTargetRing(dt: number): void {
    const cycle = this.preset.inhale + this.preset.exhale;
    this.targetClock = (this.targetClock + dt) % cycle;
    this.targetRing =
      this.targetClock < this.preset.inhale
        ? this.targetClock / this.preset.inhale
        : 1 - (this.targetClock - this.preset.inhale) / this.preset.exhale;
  }

  /** Where the target rhythm currently is. The UI uses it for the label. */
  targetPhase(): 'inhale' | 'exhale' {
    return this.targetClock < this.preset.inhale ? 'inhale' : 'exhale';
  }
}

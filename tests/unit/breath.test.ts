import { describe, it, expect, beforeEach } from 'vitest';
import { BreathSystem } from '../../src/systems/breath';
import { EventBus } from '../../src/core/events';
import { RHYTHM_PRESETS } from '../../src/content/chapter1';

/** Runs `seconds` of simulation in small steps, holding the button or not. */
function run(b: BreathSystem, seconds: number, held: boolean, speed = 0): void {
  const step = 1 / 60;
  for (let t = 0; t < seconds - 1e-9; t += step) {
    b.update(Math.min(step, seconds - t), held, speed);
  }
}

/** Takes one whole breath and returns the completion payload. */
function takeBreath(
  b: BreathSystem,
  bus: EventBus,
  inhale: number,
  exhale: number,
  speed = 0,
): { calm: boolean } | null {
  let result: { calm: boolean } | null = null;
  const off = bus.on('breathCompleted', (p) => {
    result = { calm: p.calm };
  });
  run(b, inhale, true, speed);
  run(b, exhale, false, speed);
  // Pressing again closes the out-breath and scores the breath.
  b.update(1 / 60, true, speed);
  off();
  return result;
}

describe('BreathSystem', () => {
  let bus: EventBus;
  let breath: BreathSystem;

  beforeEach(() => {
    bus = new EventBus();
    breath = new BreathSystem(bus);
  });

  it('counts a breath inside the tolerance as calm', () => {
    const r = takeBreath(breath, bus, 4, 6);
    expect(r).not.toBeNull();
    expect(r?.calm).toBe(true);
  });

  it('counts a breath outside the tolerance as not calm', () => {
    // 4 s target with 30 percent tolerance allows 2.8 to 5.2 s. 1 s is outside.
    const r = takeBreath(breath, bus, 1, 6);
    expect(r?.calm).toBe(false);
  });

  it('counts an out-breath that is too long as not calm', () => {
    // 6 s target allows 4.2 to 7.8 s. 9 s is outside.
    const r = takeBreath(breath, bus, 4, 9);
    expect(r?.calm).toBe(false);
  });

  it('accepts the edges of the tolerance band', () => {
    expect(takeBreath(breath, bus, 2.85, 4.25)?.calm).toBe(true);
    breath.reset();
    expect(takeBreath(breath, bus, 5.15, 7.75)?.calm).toBe(true);
  });

  it('emits breathStarted when the button goes down', () => {
    let started = 0;
    bus.on('breathStarted', () => started++);
    run(breath, 0.5, true);
    expect(started).toBe(1);
  });

  it('resets the breath in progress when the player walks', () => {
    let completed = 0;
    bus.on('breathCompleted', () => completed++);
    run(breath, 2, true, 0);
    expect(breath.phase).toBe('inhale');
    // Walking faster than the reset speed cancels the breath.
    run(breath, 0.2, true, 3);
    expect(breath.phase).toBe('idle');
    run(breath, 6, false, 3);
    expect(completed).toBe(0);
  });

  it('does not start a breath while walking', () => {
    let started = 0;
    bus.on('breathStarted', () => started++);
    run(breath, 2, true, 3);
    expect(started).toBe(0);
    expect(breath.phase).toBe('idle');
  });

  it('ignores a tap that is too short to be a breath', () => {
    let completed = 0;
    bus.on('breathCompleted', () => completed++);
    run(breath, 0.1, true);
    run(breath, 6, false);
    expect(completed).toBe(0);
  });

  it('uses its own values for each preset', () => {
    breath.setPreset('slow');
    expect(breath.getPreset()).toEqual(RHYTHM_PRESETS.slow);
    // 4 s is outside the slow band of 3.5 to 6.5 for the in-breath? It is inside.
    // Check the out-breath instead: slow wants 7 s, band 4.9 to 9.1.
    expect(takeBreath(breath, bus, 5, 7)?.calm).toBe(true);
    breath.reset();
    expect(takeBreath(breath, bus, 5, 3)?.calm).toBe(false);

    breath.setPreset('easy');
    expect(breath.getPreset().tolerance).toBe(0.45);
    // Easy wants in 3 s, out 4 s, with a wide 45 percent band.
    expect(takeBreath(breath, bus, 3, 4)?.calm).toBe(true);
    breath.reset();
    // 4 s in-breath is inside the easy band of 1.65 to 4.35, but calm under normal too.
    expect(breath.inTolerance(4.2, 3)).toBe(true);
    breath.setPreset('normal');
    expect(breath.inTolerance(4.2, 3)).toBe(false);
  });

  it('keeps the target ring moving between 0 and 1', () => {
    for (let i = 0; i < 600; i++) {
      breath.update(1 / 60, false, 0);
      expect(breath.targetRing).toBeGreaterThanOrEqual(-1e-6);
      expect(breath.targetRing).toBeLessThanOrEqual(1 + 1e-6);
    }
  });
});

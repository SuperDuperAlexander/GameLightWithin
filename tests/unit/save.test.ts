import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSave,
  saveSave,
  clearSave,
  loadSettings,
  saveSettings,
  loadChecks,
  DEFAULT_SAVE,
} from '../../src/core/save';
import { ChecksSystem } from '../../src/systems/checks';

describe('save', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts at scene 1 with no light when nothing is stored', () => {
    const s = loadSave();
    expect(s.scene).toBe(1);
    expect(s.light).toBe(0);
    expect(s.completed).toBe(false);
  });

  it('restores the correct scene and light', () => {
    saveSave({ ...DEFAULT_SAVE, scene: 4, light: 6 });
    const s = loadSave();
    expect(s.scene).toBe(4);
    expect(s.light).toBe(6);
  });

  it('restores the start answers', () => {
    saveSave({ ...DEFAULT_SAVE, scene: 2, startAnswers: { receive: 3, calm: 5 } });
    expect(loadSave().startAnswers).toEqual({ receive: 3, calm: 5 });
  });

  it('falls back to scene 1 when the stored scene is out of range', () => {
    localStorage.setItem(
      'lightwithin.save.v1',
      JSON.stringify({ version: 1, scene: 99, light: 3 }),
    );
    expect(loadSave().scene).toBe(1);
  });

  it('clamps stored light to the maximum', () => {
    localStorage.setItem(
      'lightwithin.save.v1',
      JSON.stringify({ version: 1, scene: 2, light: 500 }),
    );
    expect(loadSave().light).toBe(12);
  });

  it('survives a broken entry', () => {
    localStorage.setItem('lightwithin.save.v1', 'not json');
    expect(loadSave().scene).toBe(1);
  });

  it('clears the save', () => {
    saveSave({ ...DEFAULT_SAVE, scene: 5 });
    clearSave();
    expect(loadSave().scene).toBe(1);
  });

  it('stores and restores settings', () => {
    saveSettings({ rhythm: 'slow', quality: 'low', volume: 0.3, muted: true, reducedMotion: true });
    const s = loadSettings();
    expect(s.rhythm).toBe('slow');
    expect(s.quality).toBe('low');
    expect(s.volume).toBeCloseTo(0.3);
    expect(s.muted).toBe(true);
    expect(s.reducedMotion).toBe(true);
  });

  it('records the learning checks locally', () => {
    const checks = new ChecksSystem();
    checks.set('pushCount', 3);
    checks.set('leftFogCount', 1);
    checks.enterScene(2);
    checks.update(4.25);
    checks.flushScene();
    const stored = loadChecks();
    expect(stored.pushCount).toBe(3);
    expect(stored.leftFogCount).toBe(1);
    expect(stored.timePerScene[2]).toBeCloseTo(4.3, 1);
  });

  it('exports the checks as JSON without sending anything', () => {
    const checks = new ChecksSystem();
    checks.set('walkedAwayFromSeed', true);
    const parsed = JSON.parse(checks.toJson()) as {
      chapter: number;
      checks: { walkedAwayFromSeed: boolean };
    };
    expect(parsed.chapter).toBe(1);
    expect(parsed.checks.walkedAwayFromSeed).toBe(true);
  });
});

describe('learning checks batching', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps a change in memory instead of writing on every set', () => {
    const checks = new ChecksSystem();
    checks.set('pushCount', 2);
    expect(checks.hasUnsaved).toBe(true);
    expect(localStorage.getItem('lightwithin.checks.v1')).toBeNull();
  });

  it('writes once the batching interval has passed', () => {
    const checks = new ChecksSystem();
    checks.set('pushCount', 2);
    for (let t = 0; t < 6; t += 0.5) checks.update(0.5);
    expect(checks.hasUnsaved).toBe(false);
    expect(loadChecks().pushCount).toBe(2);
  });

  it('ignores a set that changes nothing', () => {
    const checks = new ChecksSystem();
    checks.set('pushCount', 0);
    expect(checks.hasUnsaved).toBe(false);
  });

  it('writes straight away when a scene ends', () => {
    const checks = new ChecksSystem();
    checks.set('leftFogCount', 3);
    checks.enterScene(2);
    expect(checks.hasUnsaved).toBe(false);
    expect(loadChecks().leftFogCount).toBe(3);
  });

  it('does not lose a change when persist is called by hand', () => {
    const checks = new ChecksSystem();
    checks.set('walkedAwayFromSeed', true);
    checks.persist();
    expect(loadChecks().walkedAwayFromSeed).toBe(true);
  });
});

import { loadChecks, saveChecks } from '../core/save';
import type { LearningChecks } from '../core/save';
import type { SceneId } from '../content/chapter1';

/**
 * Hidden learning checks. Stored on this device only and shown in the debug
 * panel. Nothing is ever sent anywhere.
 */
export class ChecksSystem {
  readonly data: LearningChecks;
  private currentScene: SceneId = 1;
  private sceneClock = 0;

  constructor() {
    this.data = loadChecks();
  }

  reset(): void {
    this.data.stoppedWithoutHint = false;
    this.data.pushCount = 0;
    this.data.leftFogCount = 0;
    this.data.walkedAwayFromSeed = false;
    this.data.timePerScene = {};
    this.sceneClock = 0;
    this.persist();
  }

  enterScene(scene: SceneId): void {
    this.flushScene();
    this.currentScene = scene;
    this.sceneClock = 0;
  }

  update(dt: number): void {
    this.sceneClock += dt;
  }

  flushScene(): void {
    if (this.sceneClock <= 0) return;
    const prev = this.data.timePerScene[this.currentScene] ?? 0;
    this.data.timePerScene[this.currentScene] = Math.round((prev + this.sceneClock) * 10) / 10;
    this.sceneClock = 0;
    this.persist();
  }

  set<K extends keyof LearningChecks>(key: K, value: LearningChecks[K]): void {
    this.data[key] = value;
    this.persist();
  }

  persist(): void {
    saveChecks(this.data);
  }

  /** Builds the JSON the debug "Export results" button downloads. */
  toJson(): string {
    this.flushScene();
    return JSON.stringify({ chapter: 1, recordedAt: new Date().toISOString(), checks: this.data }, null, 2);
  }
}

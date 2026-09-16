import { CHAPTER2, SCENE2_STARTS } from './content/chapter2';
import type { Scene2Id } from './content/chapter2';
import { CHAPTERS, isLastChapter, nextChapter } from './content/chapters';
import type { ChapterId } from './content/chapters';
import { t } from './content/strings.en';
import { AudioEngine } from './audio/audio';
import type { Game } from './game';
import type { SettingsData } from './core/save';
import {
  chapterProgress,
  isChapterComplete,
  loadSave,
  loadSettings,
  saveSave,
  saveSettings,
  setChapterProgress,
  unlockedChapters,
} from './core/save';
import type { ChapterRunner } from './core/chapterRunner';

import { BreathSystem } from './systems/breath';
import { CalmSystem } from './systems/calm';
import { ChecksSystem } from './systems/checks';
import { LightSystem } from './systems/light';
import { DebugPanel } from './ui/debug';
import { Hud } from './ui/hud';
import { Panels } from './ui/panels';

type Phase = 'start' | 'playing' | 'reflect' | 'understand' | 'apply' | 'endQuestions' | 'end';

/**
 * Chapter 2 "Be aware". The player goes inside, feels what is there, and
 * gives it a name.
 *
 * This class owns the same three things chapter 1 owns: the screens around the
 * play, the six scenes, and the learning cycle after them. What it does not
 * own is the breath, the calm and the light: those are the game's, not a
 * chapter's, and they are the same systems chapter 1 uses.
 */
export class Chapter2 implements ChapterRunner {
  private readonly bus;
  private readonly breath: BreathSystem;
  private readonly calm: CalmSystem;
  private readonly light: LightSystem;
  private readonly checks = new ChecksSystem();
  private readonly audio: AudioEngine;
  private readonly hud: Hud;
  private readonly panels = new Panels();
  private readonly debug: DebugPanel | null;

  private phase: Phase = 'start';
  private scene: Scene2Id = 1;
  private settings: SettingsData;
  private save = loadSave();
  /** This chapter's own slot in the save file. */
  private readonly chapterId = 2 as const;
  /** The router sets this so a chapter can hand over to another one. */
  onLeaveToChapter: ((id: ChapterId) => void) | null = null;
  /** Automatic calm breathing for the browser tests. */
  private autoClock = 0;
  /** Counters the browser tests read. They are never shown to the player. */
  private breathsTotal = 0;
  private breathsCalm = 0;

  constructor(private readonly game: Game) {
    this.bus = game.bus;
    this.settings = loadSettings();

    this.breath = new BreathSystem(this.bus);
    this.breath.setPreset(this.settings.rhythm);
    this.calm = new CalmSystem(this.bus);
    this.light = new LightSystem(this.bus);
    this.audio = new AudioEngine(this.bus);

    this.hud = new Hud(
      this.game.input,
      () => this.openPause(),
      () => {
        /* the storm push is wired in C2-M4 */
      },
      () => {
        /* the seed choice is wired in C2-M5 */
      },
      CHAPTERS[this.chapterId].circleStrength,
    );
    this.hud.breathCircle.reducedMotion = this.settings.reducedMotion;
    this.debug = game.flags.debug ? new DebugPanel(() => this.checks.toJson()) : null;

    this.mountUi();
    this.wireEvents();
    this.applySettings(this.settings, false);
  }

  // ---------- setup ----------

  private mountUi(): void {
    this.game.root.append(this.hud.root, this.panels.root);
    if (this.debug) this.game.root.append(this.debug.root);
    this.panels.onOpenChanged = (open): void => {
      this.game.setPaused(open);
      this.game.worldInputBlocked = open;
      if (open) this.hud.setVisible(false);
    };
    this.panels.onSelect = (): void => this.bus.emit('cue', { id: 'uiSelect' });
  }

  private wireEvents(): void {
    // The calm value follows the breath on its own, inside CalmSystem.
    this.bus.on('breathCompleted', (e) => {
      this.breathsTotal++;
      if (!e.calm) return;
      this.breathsCalm++;
      this.bus.emit('cue', { id: 'calmBreath' });
      this.hud.breathCircle.pulse();
    });
    this.bus.on('zoneAdded', ({ x, z, radius }) => this.game.world.color.addZone(x, z, radius));
  }

  // ---------- flow ----------

  /** Opens the start screen, or jumps straight to a scene. */
  begin(): void {
    this.phase = 'start';
    this.hud.setVisible(false);
    this.game.setPaused(true);
    if (this.game.flags.startScene !== null) {
      this.jumpToScene(this.game.flags.startScene as Scene2Id);
      return;
    }
    this.showStart();
  }

  private showStart(): void {
    const progress = chapterProgress(this.save, this.chapterId);
    const canResume = progress.scene > 1 && !isChapterComplete(this.save, this.chapterId);
    this.panels.startScreen({
      unlocked: unlockedChapters(this.save, this.chapterId),
      resumeChapter: canResume ? this.chapterId : null,
      onChapter: (id) => {
        if (id === this.chapterId) this.startFresh();
        else this.onLeaveToChapter?.(id);
      },
      onResume: () => this.resumeSave(),
      onSettings: () => this.openSettings(() => this.showStart()),
    });
  }

  /**
   * A fresh walk through this chapter.
   *
   * The start questions stay where they are, at the start of chapter 1. They
   * are asked once, about the player, not once per chapter.
   */
  private startFresh(): void {
    setChapterProgress(this.save, this.chapterId, { scene: 1, light: 0, completed: false });
    saveSave(this.save);
    this.checks.reset();
    this.enterScene(1, true);
  }

  private resumeSave(): void {
    const progress = chapterProgress(this.save, this.chapterId);
    this.light.set(progress.light);
    this.enterScene(progress.scene as Scene2Id, true);
  }

  /** `?chapter=2&scene=N` starts directly at a scene with the right light. */
  private jumpToScene(scene: Scene2Id): void {
    this.light.set(SCENE2_STARTS[scene].light);
    this.enterScene(scene, true);
  }

  private enterScene(scene: Scene2Id, place: boolean): void {
    this.scene = scene;
    // Light is not carried over from chapter 1: a chapter opens on the same
    // footing whichever way the player came to it.
    if (scene === 1) this.light.set(CHAPTER2.startLight);
    setChapterProgress(this.save, this.chapterId, { scene, light: this.light.get() });
    saveSave(this.save);
    this.phase = 'playing';
    this.panels.close();
    this.hud.setVisible(true);
    this.game.setPaused(false);

    if (place) {
      const start = SCENE2_STARTS[scene];
      this.game.world.placePlayer(start.x, start.z);
      this.game.camera.snapTo(this.game.world.playerPosition);
    }
    void this.audio.start();
  }

  /** Records how far the player has come. It only ever moves forward. */
  private advanceTo(scene: Scene2Id): void {
    if (scene <= this.scene) return;
    this.enterScene(scene, false);
  }

  private finishChapter(): void {
    this.checks.flushScene();
    setChapterProgress(this.save, this.chapterId, { completed: true });
    saveSave(this.save);
    this.phase = 'reflect';
    this.hud.setVisible(false);
    this.panels.reflect2(() => {
      this.phase = 'understand';
      this.panels.card(t().understand2.card, () => {
        this.phase = 'apply';
        this.panels.card(t().apply2.card, () => {
          // The end questions belong after the last chapter in the build, not
          // after every chapter.
          if (isLastChapter(this.chapterId)) {
            this.phase = 'endQuestions';
            this.panels.questions(this.save.endAnswers, (a) => {
              this.save.endAnswers = a;
              saveSave(this.save);
              this.showEnd();
            });
          } else {
            this.showEnd();
          }
        });
      });
    });
  }

  private showEnd(): void {
    this.phase = 'end';
    this.panels.chapterEnd({
      heading: t().end.heading2,
      next: nextChapter(this.chapterId),
      onAgain: () => window.location.reload(),
      onStart: () => {
        window.location.search = '';
      },
      onNext: () => {
        const next = nextChapter(this.chapterId);
        if (next) this.onLeaveToChapter?.(next);
      },
    });
  }

  /** The pause screen. In this chapter it says the player may stop here. */
  private openPause(): void {
    if (this.phase !== 'playing') return;
    this.game.setPaused(true);
    this.panels.pause(
      () => {
        this.panels.close();
        this.game.setPaused(false);
        this.hud.setVisible(true);
      },
      () => this.openSettings(() => this.openPause()),
      () => {
        saveSave(this.save);
        window.location.reload();
      },
      t().pause2.heading,
    );
  }

  private openSettings(back: () => void): void {
    this.panels.settings(
      this.settings,
      (next) => this.applySettings(next, true),
      () => back(),
    );
  }

  private applySettings(next: SettingsData, persist: boolean): void {
    this.settings = next;
    if (persist) saveSettings(next);
    this.breath.setPreset(next.rhythm);
    this.audio.setVolume(next.volume);
    this.audio.setMuted(next.muted);
    this.game.setReducedMotion(next.reducedMotion);
    this.hud.breathCircle.reducedMotion = next.reducedMotion;
    this.game.setAutoQuality(next.quality === 'auto');
    if (next.quality !== 'auto') this.game.setQuality(next.quality);
  }

  // ---------- per frame ----------

  update(dt: number): void {
    const walking = this.game.speed > 0.25;

    let inHeld = this.game.input.breathInHeld;
    let outHeld = this.game.input.breathOutHeld;
    if (this.game.flags.autobreathe && this.phase === 'playing') {
      const auto = this.autoBreathe(dt);
      inHeld = auto.inHeld;
      outHeld = auto.outHeld;
    }

    if (this.phase === 'playing' && !this.panels.isOpen) {
      this.game.worldInputBlocked = false;
      this.breath.update(dt, inHeld, outHeld, this.game.speed);
      this.calm.update(dt, walking);
      this.checks.update(dt);
    }

    this.updateHud();
    this.debug?.update({
      calm: this.calm.get(),
      light: this.light.get(),
      scene: this.scene,
      fps: this.game.fps.value,
      tier:
        this.game.qualityDrops > 0
          ? `${this.game.quality.tier} (-${String(this.game.qualityDrops)})`
          : this.game.quality.tier,
      fogStep: 0,
      seed: 'none',
      checks: this.checks.data,
    });

    this.game.calm = this.calm.get();
    this.game.light = this.light.get();
  }

  private autoBreathe(dt: number): { inHeld: boolean; outHeld: boolean } {
    const preset = this.breath.getPreset();
    const cycle = preset.inhale + preset.exhale;
    this.autoClock = (this.autoClock + dt) % cycle;
    const inHeld = this.autoClock < preset.inhale;
    return { inHeld, outHeld: !inHeld };
  }

  private updateHud(): void {
    this.hud.breathCircle.update(
      this.breath.targetRing,
      this.breath.playerRing,
      this.breath.playerPhase() === 'inhale',
      this.game.time,
    );
    this.hud.breathCircle.setVisible(this.phase === 'playing');
  }

  // ---------- tests ----------

  /** What the browser tests read. Only attached behind a debug flag. */
  testApi(): Record<string, (...args: never[]) => unknown> {
    return {
      snapshot: () => ({
        chapter: 2,
        scene: this.scene,
        phase: this.phase,
        calm: this.calm.get(),
        light: this.light.get(),
        breathsTotal: this.breathsTotal,
        breathsCalm: this.breathsCalm,
        fps: this.game.fps.value,
      }),
      finish: () => this.finishChapter(),
      advance: ((scene: Scene2Id) => this.advanceTo(scene)) as (...a: never[]) => unknown,
    };
  }
}

import * as THREE from 'three';
import {
  CALM,
  COLOR,
  HINTS,
  LAYOUT,
  MANIFEST,
  RECEIVE,
  SCENE_STARTS,
  THANKS,
  TRANSFORM,
} from './content/chapter1';
import type { SceneId } from './content/chapter1';
import { PALETTE } from './content/palette';
import { t } from './content/strings.en';
import { AudioEngine } from './audio/audio';
import type { Game } from './game';
import { clamp01, dist2d, smoothstep } from './core/math';
import type { SettingsData } from './core/save';
import { clearSave, loadSave, loadSettings, saveSave, saveSettings } from './core/save';
import { BreathSystem } from './systems/breath';
import { CalmSystem } from './systems/calm';
import { ChecksSystem } from './systems/checks';
import { HintSystem } from './systems/hints';
import { LightSystem } from './systems/light';
import { ManifestSystem } from './systems/manifest';
import { ReceiveSystem } from './systems/receive';
import { ThanksSystem } from './systems/thanks';
import { TransformSystem } from './systems/transform';
import { Butterfly, FogVolume, MoteFlow, Sprout, SpringGlow, buildBird } from './world/effects';
import { terrainHeight } from './world/terrain';
import { DebugPanel } from './ui/debug';
import { Hud } from './ui/hud';
import { Panels } from './ui/panels';

type Phase =
  | 'start'
  | 'startQuestions'
  | 'playing'
  | 'reflect'
  | 'understand'
  | 'apply'
  | 'endQuestions'
  | 'end';

/** How many calm breaths scene 1 needs before the glow appears. */
const WAKE_BREATHS = 3;

/**
 * Chapter 1 "Receive". This class owns the flow: the start screen, the six
 * scenes, and the learning cycle after the play.
 */
export class Chapter1 {
  private readonly bus;
  private readonly breath: BreathSystem;
  private readonly calm: CalmSystem;
  private readonly light: LightSystem;
  private readonly receive: ReceiveSystem;
  private readonly transform: TransformSystem;
  private readonly manifest: ManifestSystem;
  private readonly thanks: ThanksSystem;
  private readonly hints: HintSystem;
  private readonly checks = new ChecksSystem();
  private readonly audio: AudioEngine;
  private readonly hud: Hud;
  private readonly panels = new Panels();
  private readonly debug: DebugPanel | null;

  private readonly motes: MoteFlow;
  private readonly springGlows = new Map<string, SpringGlow>();
  private readonly fogVolume: FogVolume;
  private readonly sprout = new Sprout();
  private readonly bird = buildBird();
  private readonly butterfly = new Butterfly();

  private phase: Phase = 'start';
  private scene: SceneId = 1;
  private settings: SettingsData;
  private save = loadSave();
  private wakeBreaths = 0;
  private movementLocked = true;
  /** Automatic calm breathing for the browser tests. */
  private autoClock = 0;
  private autoHeld = false;
  /** Counters the browser tests read. They are never shown to the player. */
  private breathsTotal = 0;
  private breathsCalm = 0;
  private lastDt = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly game: Game) {
    this.bus = game.bus;
    this.settings = loadSettings();

    this.breath = new BreathSystem(this.bus);
    this.breath.setPreset(this.settings.rhythm);
    this.calm = new CalmSystem(this.bus);
    this.light = new LightSystem(this.bus);
    this.receive = new ReceiveSystem(this.bus, [
      { id: 'spring1', ...LAYOUT.spring1 },
      { id: 'spring2', ...LAYOUT.spring2 },
      { id: 'spring3', ...LAYOUT.spring3 },
    ]);
    this.transform = new TransformSystem(this.bus, LAYOUT.fog);
    this.manifest = new ManifestSystem(this.bus, LAYOUT.seedSpot);
    this.thanks = new ThanksSystem(this.bus, LAYOUT.bridge);
    this.hints = new HintSystem(this.bus);
    this.audio = new AudioEngine(this.bus);

    this.hud = new Hud(
      this.game.input,
      () => this.openPause(),
      () => this.onPush(),
      () => this.onInteract(),
    );
    this.hud.breathCircle.reducedMotion = this.settings.reducedMotion;
    this.debug = game.flags.debug ? new DebugPanel(() => this.checks.toJson()) : null;

    this.motes = new MoteFlow(24);
    this.fogVolume = new FogVolume(LAYOUT.fog.radius);
    this.buildSceneObjects();
    this.mountUi();
    this.wireEvents();
    this.applySettings(this.settings, false);
  }

  // ---------- setup ----------

  private buildSceneObjects(): void {
    const scene = this.game.world.scene;
    scene.add(
      this.motes.group,
      this.fogVolume.group,
      this.sprout.group,
      this.bird,
      this.butterfly.group,
    );

    this.fogVolume.group.position.set(
      LAYOUT.fog.x,
      terrainHeight(LAYOUT.fog.x, LAYOUT.fog.z),
      LAYOUT.fog.z,
    );
    this.sprout.group.position.set(
      LAYOUT.seedSpot.x,
      terrainHeight(LAYOUT.seedSpot.x, LAYOUT.seedSpot.z),
      LAYOUT.seedSpot.z,
    );
    this.bird.position.set(
      LAYOUT.bird.x,
      terrainHeight(LAYOUT.bird.x, LAYOUT.bird.z) + 0.17,
      LAYOUT.bird.z,
    );

    for (const spring of this.receive.springs) {
      const glow = new SpringGlow();
      const anchor = this.game.world.springAnchors.get(spring.config.id);
      if (anchor) {
        anchor.visible = spring.revealed;
        glow.mesh.position.set(anchor.position.x, anchor.position.y + 1, anchor.position.z);
      }
      scene.add(glow.mesh);
      this.springGlows.set(spring.config.id, glow);
    }
  }

  private mountUi(): void {
    this.game.root.append(this.hud.root, this.panels.root);
    if (this.debug) this.game.root.append(this.debug.root);
    this.game.input.attach(this.game.canvas, this.hud.joystickZone);
    // A panel is always a pause. The player can stop at any point.
    this.panels.onOpenChanged = (open): void => {
      this.game.setPaused(open);
      this.game.worldInputBlocked = open;
      this.hud.setVisible(!open && this.phase === 'playing');
    };
    this.panels.onSelect = (): void => {
      void this.audio.start();
      this.bus.emit('cue', { id: 'uiSelect' });
    };
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.phase === 'playing' && !this.panels.isOpen) this.openPause();
    });
  }

  private wireEvents(): void {
    this.bus.on('breathCompleted', ({ calm }) => {
      this.breathsTotal++;
      if (calm) this.breathsCalm++;
      this.onBreathCompleted(calm);
    });
    this.bus.on('zoneAdded', ({ x, z, radius }) => this.game.world.color.addZone(x, z, radius));
    this.bus.on('lightCollected', ({ from, amount }) => this.onLightCollected(from, amount));
    this.bus.on('springRevealed', ({ id }) => {
      const anchor = this.game.world.springAnchors.get(id);
      if (anchor) anchor.visible = true;
      this.bus.emit('cue', { id: 'spring' });
    });
    this.bus.on('fogPushed', () => this.checks.set('pushCount', this.transform.pushCount));
    this.bus.on('fogFled', () => this.checks.set('leftFogCount', this.transform.fleeCount));
    this.bus.on('bridgeComplete', () => this.game.world.setBridgeRise(0.001));
    this.bus.on('thanksComplete', () => {
      this.game.world.color.setGlobalTarget(1, THANKS.colorSeconds);
    });
    this.bus.on('hintShown', ({ id }) => {
      if (id === 'bird') this.bird.visible = true;
      if (id === 'butterfly') {
        this.butterfly.fly(
          LAYOUT.butterflyPath.map(
            (p) => new THREE.Vector3(p.x, terrainHeight(p.x, p.z) + 1.3, p.z),
          ),
        );
      }
    });
  }

  // ---------- flow ----------

  /** Opens the start screen. */
  begin(): void {
    this.phase = 'start';
    this.hud.setVisible(false);
    this.game.setPaused(true);
    if (this.game.flags.startScene !== null) {
      this.jumpToScene(this.game.flags.startScene);
      return;
    }
    this.showStart();
  }

  private showStart(): void {
    this.panels.startScreen(
      () => this.startFresh(),
      () => this.openSettings(() => this.showStart()),
      this.save.scene > 1 && !this.save.completed,
      () => this.resumeSave(),
    );
  }

  private startFresh(): void {
    clearSave();
    this.save = loadSave();
    this.checks.reset();
    this.phase = 'startQuestions';
    this.panels.questions(this.save.startAnswers, (a) => {
      this.save.startAnswers = a;
      saveSave(this.save);
      this.enterScene(1, true);
    });
  }

  private resumeSave(): void {
    this.light.set(this.save.light);
    this.enterScene(this.save.scene, true);
  }

  /** `?scene=N` starts directly at a scene with the right amount of light. */
  private jumpToScene(scene: SceneId): void {
    const start = SCENE_STARTS[scene];
    this.light.set(start.light);
    // Everything before this scene counts as already done.
    for (const spring of this.receive.springs) {
      const order = spring.config.id === 'spring1' ? 2 : spring.config.id === 'spring2' ? 3 : 5;
      if (order < scene) {
        spring.remaining = 0;
        spring.revealed = true;
        this.game.world.color.addZone(spring.config.x, spring.config.z, RECEIVE.zoneRadius);
      }
    }
    if (scene > 4) {
      this.transform.step = 4;
      this.transform.dissolveTime = TRANSFORM.dissolveSeconds;
      this.game.world.color.addZone(LAYOUT.fog.x, LAYOUT.fog.z, TRANSFORM.zoneRadius);
    }
    if (scene > 5) {
      this.manifest.plant(true, 1);
      this.manifest.state = 'complete';
      this.manifest.riseTime = MANIFEST.bridgeRiseSeconds;
      // The bridgeComplete handler starts the rise from zero, so raise the
      // bridge after it, not before.
      this.bus.emit('bridgeComplete');
      this.game.world.setBridgeRise(1);
    }
    if (scene >= 3) this.calm.set(CALM.heartThreshold + 0.05);
    this.enterScene(scene, true);
  }

  private enterScene(scene: SceneId, place: boolean): void {
    this.scene = scene;
    this.save.scene = scene;
    this.save.light = this.light.get();
    saveSave(this.save);
    this.checks.enterScene(scene);
    this.phase = 'playing';
    this.panels.close();
    this.hud.setVisible(true);
    this.game.setPaused(false);
    this.movementLocked = scene === 1;
    if (scene === 1) this.wakeBreaths = 0;
    if (place) {
      const start = SCENE_STARTS[scene];
      this.game.world.placePlayer(start.x, start.z);
      this.game.camera.snapTo(this.game.world.playerPosition);
    }
    this.bus.emit('sceneChanged', { scene });
    void this.audio.start();
  }

  private advanceTo(scene: SceneId): void {
    if (scene <= this.scene) return;
    this.enterScene(scene, false);
  }

  private finishChapter(): void {
    this.checks.flushScene();
    this.save.completed = true;
    saveSave(this.save);
    this.phase = 'reflect';
    this.hud.setVisible(false);
    this.panels.reflect(() => {
      this.phase = 'understand';
      this.panels.card(t().understand.card, () => {
        this.phase = 'apply';
        this.panels.card(t().apply.card, () => {
          this.phase = 'endQuestions';
          this.panels.questions(this.save.endAnswers, (a) => {
            this.save.endAnswers = a;
            saveSave(this.save);
            this.showEnd();
          });
        });
      });
    });
  }

  private showEnd(): void {
    this.phase = 'end';
    this.panels.chapterEnd(
      () => window.location.reload(),
      () => {
        clearSave();
        window.location.reload();
      },
    );
  }

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
    if (next.quality !== 'auto') this.game.setQuality(next.quality);
  }

  // ---------- actions ----------

  private onPush(): void {
    if (this.scene !== 4 || !this.transform.pushAvailable) return;
    this.transform.push();
    this.game.camera.addShake(0.5);
  }

  private onInteract(): void {
    if (this.scene !== 5 || this.manifest.state !== 'none') return;
    const p = this.game.world.playerPosition;
    if (dist2d(p.x, p.z, LAYOUT.seedSpot.x, LAYOUT.seedSpot.z) > 4) return;
    this.panels.seedChoice(
      this.light.canAfford(MANIFEST.cost),
      () => {
        const paid = this.light.spend(MANIFEST.cost);
        this.manifest.plant(paid, this.calm.get());
        this.panels.close();
        this.game.setPaused(false);
        this.hud.setVisible(true);
      },
      () => {
        this.panels.close();
        this.game.setPaused(false);
        this.hud.setVisible(true);
      },
    );
  }

  private onBreathCompleted(calm: boolean): void {
    const p = this.game.world.playerPosition;
    if (calm) {
      this.bus.emit('cue', { id: 'calmBreath' });
      this.hud.breathCircle.pulse();
    }

    if (this.scene === 1 && calm) {
      this.wakeBreaths++;
      if (this.wakeBreaths >= WAKE_BREATHS) {
        this.movementLocked = false;
        this.advanceTo(2);
      }
    }

    const spring = this.receive.onBreath(calm, p.x, p.z);
    if (spring) {
      const anchor = this.game.world.springAnchors.get(spring.config.id);
      if (anchor) {
        this.motes.send(
          this.tmp.set(anchor.position.x, anchor.position.y + 0.8, anchor.position.z).clone(),
          RECEIVE.moteFlightSeconds,
          () => this.light.add(1),
        );
      }
    }

    this.transform.onBreath(calm, p.x, p.z);
    this.thanks.onBreath(calm, p.x, p.z);
  }

  private onLightCollected(from: 'spring' | 'fog', amount: number): void {
    if (from !== 'fog') return;
    // The fog dissolves into motes that flow into the player.
    for (let i = 0; i < amount * 6; i++) {
      const start = this.fogVolume.randomPoint(new THREE.Vector3());
      this.motes.send(
        start,
        TRANSFORM.dissolveSeconds * (0.5 + Math.random() * 0.5),
        i < amount ? () => this.light.add(1) : null,
      );
    }
  }

  // ---------- per frame ----------

  update(dt: number): void {
    this.lastDt = dt;
    const p = this.game.world.playerPosition;
    const walking = this.game.speed > 0.25;

    // Automatic calm breathing for the browser tests.
    let held = this.game.input.breathHeld;
    if (this.game.flags.autobreathe && this.phase === 'playing') held = this.autoBreathe(dt);

    if (this.phase === 'playing' && !this.panels.isOpen) {
      this.game.worldInputBlocked = this.movementLocked;
      this.breath.update(dt, held, this.game.speed);
      this.calm.update(dt, walking);
      this.checks.update(dt);
      this.runScene(dt, p.x, p.z);
    }

    // Visuals that always run so a paused screen still looks alive.
    this.motes.update(dt, this.game.world.player.chestWorld(this.tmp));
    this.fogVolume.update(dt);
    this.sprout.update(dt);
    this.butterfly.update(dt);
    for (const glow of this.springGlows.values()) glow.update(dt);

    this.updateHud(dt, p.x, p.z);
    this.updateAudio();
    this.debug?.update({
      calm: this.calm.get(),
      light: this.light.get(),
      scene: this.scene,
      fps: this.game.fps.value,
      tier: this.game.quality.tier,
      fogStep: this.transform.step,
      seed: this.manifest.state,
      checks: this.checks.data,
    });

    // The world needs the calm value and the light count to draw them.
    this.game.calm = this.calm.get();
    this.game.light = this.light.get();
  }

  private autoBreathe(dt: number): boolean {
    const preset = this.breath.getPreset();
    const cycle = preset.inhale + preset.exhale;
    this.autoClock = (this.autoClock + dt) % cycle;
    this.autoHeld = this.autoClock < preset.inhale;
    return this.autoHeld;
  }

  private runScene(dt: number, px: number, pz: number): void {
    switch (this.scene) {
      case 1:
      case 2: {
        const spring1 = this.receive.get('spring1');
        if (spring1?.empty) this.advanceTo(3);
        break;
      }
      case 3: {
        const spring2 = this.receive.get('spring2');
        this.hints.updateScene3(dt, spring2?.revealed ?? false);
        if (spring2?.revealed && !this.hints.birdShown) {
          this.checks.set('stoppedWithoutHint', true);
        }
        if (spring2?.empty) this.advanceTo(4);
        break;
      }
      case 4: {
        this.transform.update(dt, px, pz);
        if (this.transform.done && this.transform.dissolveTime >= TRANSFORM.dissolveSeconds) {
          this.advanceTo(5);
        }
        break;
      }
      case 5: {
        this.manifest.update(dt, px, pz);
        this.hints.updateScene5(dt, px, pz, LAYOUT.seedSpot.x, LAYOUT.seedSpot.z);
        if (this.manifest.hasBeenAway && !this.hints.butterflyShown) {
          this.checks.set('walkedAwayFromSeed', true);
        }
        if (this.manifest.state === 'complete') {
          this.game.world.setBridgeRise(
            clamp01(this.manifest.riseTime / MANIFEST.bridgeRiseSeconds),
          );
          if (this.manifest.riseTime >= MANIFEST.bridgeRiseSeconds) this.advanceTo(6);
        }
        break;
      }
      case 6: {
        this.thanks.update(dt);
        if (this.thanks.complete && this.game.world.color.globalColor >= 0.999)
          this.finishChapter();
        break;
      }
    }

    // Scene 5's third spring and scene 4's fog keep running once reached.
    if (this.scene >= 4) this.transform.update(dt, px, pz);
    if (this.scene >= 5 && this.manifest.state === 'growing') this.manifest.update(dt, px, pz);
  }

  private updateHud(dt: number, px: number, pz: number): void {
    const fogDistance = this.transform.distanceTo(px, pz);
    const inFog = !this.transform.done && fogDistance <= this.transform.radius;

    // Step 1: the thought appears inside the fog and cannot be skipped.
    this.hud.setFogText(
      t().fog.thought,
      this.transform.step >= 1 && !this.transform.done ? this.transform.seeProgress : 0,
    );

    // Step 2: the breath circle trembles a little and the wind bends the grass.
    const feeling = this.transform.step >= 2 && !this.transform.done;
    this.hud.breathCircle.setTremble(feeling ? clamp01(1 - fogDistance / TRANSFORM.feelRadius) : 0);
    this.game.wind.x = this.transform.x;
    this.game.wind.z = this.transform.z;
    this.game.wind.radius = this.transform.radius * 2.4;
    this.game.wind.strength = feeling ? 0.5 + Math.sin(this.game.time * 1.3) * 0.22 : 0;

    // Step 3: the screen darkens softly while the player stands in the middle.
    const darkTarget = inFog && this.transform.step >= 3 ? 0.72 : 0;
    this.game.setDarken(darkTarget, dt);

    this.fogVolume.setDensity(
      this.transform.done
        ? Math.max(0, 1 - this.transform.dissolveTime / TRANSFORM.dissolveSeconds)
        : 1 + this.transform.pushExtra * 0.35,
      this.transform.radius / LAYOUT.fog.radius,
    );
    this.fogVolume.group.position.x = this.transform.x;
    this.fogVolume.group.position.z = this.transform.z;

    this.hud.setPushVisible(
      this.scene === 4 && this.transform.pushAvailable && !this.transform.done,
    );
    this.hud.setInteractVisible(
      this.scene === 5 &&
        this.manifest.state === 'none' &&
        dist2d(px, pz, LAYOUT.seedSpot.x, LAYOUT.seedSpot.z) <= 4,
    );

    // Spring glows: bright while they still hold light, gentle once empty.
    for (const spring of this.receive.springs) {
      const glow = this.springGlows.get(spring.config.id);
      if (!glow) continue;
      if (!spring.revealed) {
        glow.setStrength(0, 1);
        continue;
      }
      const d = spring.distanceTo(px, pz);
      const near = d <= RECEIVE.drawRadius;
      // A spring that still holds light shimmers a little when the player is
      // close. An empty one keeps only a gentle glow.
      const strength = spring.empty ? 0.5 : near ? 1.1 : 0.55;
      // The halo fades with distance, so it never reads as a marker from afar.
      const fade = clamp01(1 - (d - RECEIVE.drawRadius) / 26);
      glow.setStrength(
        strength * (0.35 + 0.65 * fade),
        spring.empty ? 2.2 : 1.9 + (near ? 0.4 : 0),
      );
    }

    this.sprout.setState(
      this.manifest.state === 'growing',
      this.manifest.progress,
      this.manifest.paused,
    );

    // The bridge turns golden when the player gives thanks on it.
    if (this.thanks.golden > 0) {
      this.game.world.bridge.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const mat = mesh.material as THREE.MeshLambertMaterial | undefined;
        if (mat?.color)
          mat.color.lerp(new THREE.Color(PALETTE.receiveGold), this.thanks.golden * 0.04);
      });
    }

    this.hud.breathCircle.update(
      this.breath.targetRing,
      this.breath.playerRing,
      this.breath.targetPhase() === 'inhale',
      this.game.time,
    );
    this.hud.breathCircle.setVisible(this.phase === 'playing');
    this.hud.showHint(this.currentHint(px, pz));
  }

  /** Short control hints only. They never explain what anything means. */
  private currentHint(px: number, pz: number): string | null {
    if (this.phase !== 'playing') return null;
    if (
      this.scene === 5 &&
      this.manifest.state === 'none' &&
      dist2d(px, pz, LAYOUT.seedSpot.x, LAYOUT.seedSpot.z) <= 4
    ) {
      return t().seed.plant;
    }
    return null;
  }

  private updateAudio(): void {
    const p = this.game.world.playerPosition;
    const fogDistance = this.transform.distanceTo(p.x, p.z);
    const drone = this.transform.done
      ? 0
      : clamp01(1 - smoothstep(this.transform.radius, TRANSFORM.seeRadius * 1.6, fogDistance));
    const muffle =
      !this.transform.done && fogDistance <= this.transform.radius && this.transform.step >= 3
        ? 0.75
        : 0;
    const warmth = Math.max(
      this.game.world.color.globalColor,
      clamp01(this.game.world.color.zones.length / 4),
    );
    this.audio.update(
      this.breath.playerRing,
      this.breath.phase === 'inhale',
      warmth,
      drone,
      muffle,
    );
  }

  /** Used by the browser tests to read the state without a debug panel. */
  snapshot(): Record<string, unknown> {
    return {
      phase: this.phase,
      scene: this.scene,
      breathPhase: this.breath.phase,
      breathsTotal: this.breathsTotal,
      breathsCalm: this.breathsCalm,
      wakeBreaths: this.wakeBreaths,
      speed: Number(this.game.speed.toFixed(3)),
      autoHeld: this.autoHeld,
      autoClock: Number(this.autoClock.toFixed(2)),
      preset: this.breath.getPreset().id,
      fps: this.game.fps.value,
      lastDt: Number(this.lastDt.toFixed(4)),
      worstMs: Math.round(this.game.fps.worstMs),
      paused: this.game.paused,
      calm: Number(this.calm.get().toFixed(3)),
      light: this.light.get(),
      fogStep: this.transform.step,
      pushCount: this.transform.pushCount,
      fleeCount: this.transform.fleeCount,
      seed: this.manifest.state,
      seedRemaining: Number(this.manifest.remaining.toFixed(1)),
      thanks: this.thanks.breaths,
      globalColor: Number(this.game.world.color.globalColor.toFixed(3)),
      zones: this.game.world.color.zones.length,
      springs: this.receive.springs.map((s) => ({
        id: s.config.id,
        left: s.remaining,
        revealed: s.revealed,
      })),
      birdShown: this.hints.birdShown,
      butterflyShown: this.hints.butterflyShown,
      maxZones: COLOR.maxZones,
      hintSeconds: HINTS.birdAfterSeconds,
    };
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  /** Test helpers, only reachable through `window.__lw` behind a debug flag. */
  testApi(): Record<string, (...args: any[]) => unknown> {
    return {
      walkTo: ((x: number, z: number) => {
        this.game.autoWalk = { x, z };
      }) as (...args: any[]) => unknown,
      walking: (() => this.game.autoWalk !== null) as (...args: any[]) => unknown,
      stopWalking: (() => {
        this.game.autoWalk = null;
      }) as (...args: any[]) => unknown,
      teleport: ((x: number, z: number) => {
        this.game.world.placePlayer(x, z);
        this.game.camera.snapTo(this.game.world.playerPosition);
      }) as (...args: any[]) => unknown,
      push: (() => this.onPush()) as (...args: any[]) => unknown,
      interact: (() => this.onInteract()) as (...args: any[]) => unknown,
      plantNow: (() => {
        const paid = this.light.spend(MANIFEST.cost);
        return this.manifest.plant(paid, this.calm.get());
      }) as (...args: any[]) => unknown,
      setCalm: ((v: number) => this.calm.set(v)) as (...args: any[]) => unknown,
      setGlobalColor: ((v: number) => {
        this.game.world.color.setGlobalTarget(v, 0.001);
      }) as (...args: any[]) => unknown,
      revealSpring: ((id: string) => {
        const spring = this.receive.get(id);
        if (!spring) return false;
        spring.revealed = true;
        const anchor = this.game.world.springAnchors.get(id);
        if (anchor) anchor.visible = true;
        return true;
      }) as (...args: any[]) => unknown,
      lookAt: ((yaw: number, pitch: number) => {
        this.game.camera.yaw = yaw;
        this.game.camera.pitch = pitch;
        this.game.camera.snapTo(this.game.world.playerPosition);
      }) as (...args: any[]) => unknown,
      addLight: ((v: number) => this.light.add(v)) as (...args: any[]) => unknown,
      snapshot: (() => this.snapshot()) as (...args: any[]) => unknown,
      answers: (() => ({ start: this.save.startAnswers, end: this.save.endAnswers })) as (
        ...args: any[]
      ) => unknown,
    };
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

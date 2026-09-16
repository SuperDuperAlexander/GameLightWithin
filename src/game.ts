import * as THREE from 'three';
import { CAMERA, PLAYER, SCENE_STARTS, WORLD } from './content/chapter1';
import { FollowCamera } from './core/camera';
import type { DebugFlags } from './core/debugFlags';
import { EventBus } from './core/events';
import { InputState } from './core/input';
import { clamp01, damp } from './core/math';
import {
  FpsMeter,
  QualityProbe,
  QualityWatchdog,
  pixelRatioCap,
  settingsFor,
} from './core/quality';
import type { QualitySettings, QualityTier } from './core/quality';
import { loadSettings } from './core/save';
import { PainterlyRenderer } from './render/painterly';
import { borderAmount } from './world/terrain';

/** The fixed simulation step, in seconds. */
const FIXED_STEP = 1 / 60;
/** The most real time a single frame may catch up on, in seconds. */
const MAX_CATCHUP = 1;
/** A hard step limit, so one very slow frame cannot lock the page. */
const MAX_STEPS = 90;
import { World } from './world/world';

/**
 * The game loop and everything that ties the world, the systems and the UI
 * together. Chapter flow lives in `Chapter1`, which this class drives.
 */
export class Game {
  readonly bus = new EventBus();
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly input = new InputState();
  readonly fps = new FpsMeter();
  camera!: FollowCamera;
  world!: World;
  painter!: PainterlyRenderer;
  quality!: QualitySettings;

  private readonly probe = new QualityProbe();
  private readonly watchdog = new QualityWatchdog();
  /** True while the tier is chosen automatically. */
  private autoQuality = true;
  private last = 0;
  private accumulator = 0;
  private running = false;
  private rafId = 0;
  /** Metres per second the player moved on the last frame. */
  speed = 0;
  private facing = Math.PI;
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  paused = false;
  /** Set by the chapter while a panel is open. */
  worldInputBlocked = false;
  /** 0 to 1, how much the border mist pushes the player back. */
  borderPush = 0;
  onFrame: ((dt: number, time: number) => void) | null = null;
  time = 0;
  /** The chapter writes these each frame so the world can draw them. */
  calm = 0;
  light = 0;
  /**
   * A point the player walks to on their own. Only the browser tests set this,
   * through the debug test API. It drives the same movement and collision code
   * the player's own input does.
   */
  autoWalk: { x: number; z: number } | null = null;
  readonly wind = { x: 0, z: 0, strength: 0, radius: 1 };
  /** 0 to 1, how much of their walking speed the player currently has. */
  strideFactor = 1;

  constructor(
    readonly root: HTMLElement,
    readonly flags: DebugFlags,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'scene';
    this.root.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(pixelRatioCap());
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.setClearColor(0xcfd2d6, 1);
    // Soft shadow edges. The map itself is sized by the quality tier.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  async start(): Promise<void> {
    const settings = loadSettings();
    const tier: QualityTier =
      this.flags.quality ?? (settings.quality === 'auto' ? 'medium' : settings.quality);
    this.autoQuality = this.flags.quality === null && settings.quality === 'auto';
    this.quality = settingsFor(tier);

    this.world = new World(this.quality);
    this.camera = new FollowCamera(window.innerWidth / Math.max(1, window.innerHeight));
    this.camera.reducedMotion = settings.reducedMotion;
    this.world.color.reducedMotion = settings.reducedMotion;

    this.painter = new PainterlyRenderer(
      this.renderer,
      this.world.scene,
      this.camera.camera,
      !this.flags.noPaint,
    );
    this.painter.applyQuality(this.quality);

    const start = SCENE_STARTS[this.flags.startScene ?? 1];
    this.world.placePlayer(start.x, start.z);
    this.camera.snapTo(this.world.playerPosition);

    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.running = true;
    this.last = performance.now();
    this.loop(this.last);
  }

  /** Swaps the quality tier at runtime. */
  setQuality(tier: QualityTier): void {
    if (this.quality?.tier === tier) return;
    this.quality = settingsFor(tier);
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.painter.applyQuality(this.quality);
    this.world.applyQuality(this.quality);
    this.resize();
    // Give the new tier a fresh window before the watchdog judges again.
    this.watchdog.restart();
  }

  /** The settings panel calls this when the player picks a tier by hand. */
  setAutoQuality(on: boolean): void {
    this.autoQuality = on;
    if (on) this.watchdog.restart();
  }

  /** How many times the watchdog has stepped the tier down. */
  get qualityDrops(): number {
    return this.watchdog.steps;
  }

  setReducedMotion(on: boolean): void {
    this.camera.reducedMotion = on;
    this.world.color.reducedMotion = on;
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.resize(w, h);
    this.painter.setSize(w, h);
  }

  private loop = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);

    const real = Math.max(0.0001, (now - this.last) / 1000);
    this.last = now;
    this.fps.update(real);

    // The start probe picks a tier once; the watchdog keeps checking during
    // play, because the probe runs before the player has walked anywhere.
    if (this.flags.quality === null && this.autoQuality) {
      const picked = this.probe.sample(real);
      if (picked) this.setQuality(picked);
      else if (this.probe.finished) {
        const drop = this.watchdog.sample(real, this.quality.tier);
        if (drop) this.setQuality(drop);
      }
    }

    // The world runs in fixed steps, so a slow frame does not make the breath
    // rhythm or the seed timer run slow with it. The catch-up is capped, so a
    // hidden tab cannot jump the world forward when it comes back.
    this.accumulator = Math.min(this.accumulator + real, MAX_CATCHUP);
    let steps = 0;
    while (this.accumulator >= FIXED_STEP && steps < MAX_STEPS) {
      this.accumulator -= FIXED_STEP;
      steps++;
      this.simulate(FIXED_STEP);
    }
    if (steps === MAX_STEPS) this.accumulator = 0;

    this.painter.render(real, this.time);
  };

  /** One fixed simulation step. */
  private simulate(dt: number): void {
    this.time += dt;
    this.input.sample();
    if (!this.paused) this.moveAndAim(dt);
    // The chapter runs every step, even while a panel is open, so the world
    // keeps drawing behind it. The chapter itself decides what may advance.
    this.onFrame?.(dt, this.time);
    this.world.playerSpeed = this.speed;
    this.world.update(
      dt,
      this.calm,
      this.light,
      this.wind.strength,
      this.wind.radius,
      this.wind.x,
      this.wind.z,
    );
    this.camera.update(dt, this.world.playerPosition);
    this.input.endFrame();
  }

  /** Camera and player movement. Skipped while the game is paused. */
  private moveAndAim(dt: number): void {
    this.camera.rotate(this.input.yawDelta, this.input.pitchDelta);
    this.movePlayer(dt);
  }

  private movePlayer(dt: number): void {
    const p = this.world.playerPosition;
    let mx = 0;
    let mz = 0;
    if (!this.worldInputBlocked && this.autoWalk) {
      const dx = this.autoWalk.x - p.x;
      const dz = this.autoWalk.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.8) this.autoWalk = null;
      else {
        mx = dx / d;
        mz = dz / d;
      }
    } else if (!this.worldInputBlocked && (this.input.moveX !== 0 || this.input.moveY !== 0)) {
      this.camera.forward(this.forward);
      this.camera.right(this.right);
      mx = this.forward.x * this.input.moveY + this.right.x * this.input.moveX;
      mz = this.forward.z * this.input.moveY + this.right.z * this.input.moveX;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len;
      mz /= len;
    }

    // The border mist turns the player back gently. There are no invisible walls.
    this.borderPush = borderAmount(p.x, p.z);
    if (this.borderPush > 0.01) {
      const inwardX = -Math.sign(p.x - 0) * 0.35;
      const inwardZ = p.z > WORLD.lengthStart ? -1 : p.z < WORLD.lengthEnd ? 1 : 0;
      mx += inwardX * this.borderPush * 1.6;
      mz += inwardZ * this.borderPush * 1.6;
    }

    const step = PLAYER.walkSpeed * this.strideFactor * dt;
    const moved = this.world.ground.resolveMove(p.x, p.z, mx * step, mz * step);
    const dx = moved.x - p.x;
    const dz = moved.z - p.z;
    this.speed = Math.hypot(dx, dz) / dt;

    const y = this.world.groundAt(moved.x, moved.z);
    this.world.player.setPosition(moved.x, y ?? p.y, moved.z);

    if (this.speed > 0.05) {
      const want = Math.atan2(dx, dz);
      let delta = want - this.facing;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.facing += delta * clamp01(PLAYER.turnSpeed * dt);
      this.world.player.setFacing(this.facing);
    }
  }

  /** Used by the pause screen and by panels that take over the screen. */
  setPaused(on: boolean): void {
    this.paused = on;
    this.input.setEnabled(!on);
  }

  /** Smoothly darkens the screen, for example inside the fog. */
  setDarken(target: number, dt: number): void {
    const current = this.darken;
    this.darken = damp(current, target, 2.2, dt);
    this.painter.setDarken(this.darken);
  }
  private darken = 0;

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.input.dispose();
    this.painter.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }
}

export { CAMERA };

import * as THREE from 'three';
import { PLAYER, SHADOW, TIERS } from '../content/chapter1';
import { PALETTE } from '../content/palette';
import type { QualitySettings } from '../core/quality';
import { ColorRestoreState, colorUniforms } from '../render/colorRestore';
import { buildAtmosphere, updateAtmosphere } from './atmosphere';
import { buildGrass, setGrassDensity, updateGrass } from './grass';
import { Ground } from './ground';
import { place } from './place';
import type { Place } from './place';
import { PlayerFigure } from './player';
import { buildBridge } from './props';
import { buildSky, setSkyDay, setSkyNight, updateSky } from './sky';

const GOLD = new THREE.Color(PALETTE.receiveGold);
const COLD_RIM = new THREE.Color(PALETTE.skyGrey);
const WARM_RIM = new THREE.Color(PALETTE.warmSky);
const HAZE_WARM = new THREE.Color(PALETTE.farHillsViolet).lerp(
  new THREE.Color(PALETTE.warmSky),
  0.55,
);
const NIGHT_HAZE = new THREE.Color(PALETTE.night);

/**
 * Builds and holds the valley: terrain, sky, props, grass, the player figure
 * and the ground checks. It knows nothing about the chapter flow.
 */
export class World {
  readonly scene = new THREE.Scene();
  readonly ground: Ground;
  readonly player = new PlayerFigure();
  readonly color = new ColorRestoreState();
  /** Named things that stand in this place, looked up by the chapter. */
  readonly anchors = new Map<string, THREE.Group>();
  readonly bridge: THREE.Group | null = null;
  /** The place this world is built from. */
  readonly place: Place;
  private readonly sky: THREE.Mesh;
  private readonly grass: THREE.Mesh;
  private readonly atmosphere: THREE.Points;
  private readonly terrainMesh: THREE.Mesh;
  private readonly bridgeDeck: THREE.Mesh | null = null;
  /** The bridge's own colours, kept so the golden blend stays reversible. */
  private readonly bridgeColors: { material: THREE.MeshStandardMaterial; base: THREE.Color }[] = [];
  private bridgeGold = -1;
  private clock = 0;
  private readonly haze: THREE.Fog;
  private readonly sun: THREE.DirectionalLight;
  /** The direction the light comes from, kept so the shadow box can follow. */
  private readonly sunDir = new THREE.Vector3(38, 44, -62).normalize();
  private shadowTexelSize = 0;
  private pmrem: THREE.PMREMGenerator | null = null;
  private envScene: THREE.Scene | null = null;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private envColorAtBuild = -1;
  private envNightAtBuild = -1;
  /** The chapter writes the player's ground speed here for the walk cycle. */
  playerSpeed = 0;
  /** 0 day, 1 night. Chapter 2 turns this up for its last scene. */
  private night = 0;
  /** 0 morning, 1 evening. */
  private day = 0;
  /** The sun's full strength in daylight, kept so night can dim it back. */
  private readonly sunIntensity: number;

  constructor(quality: QualitySettings, renderer?: THREE.WebGLRenderer) {
    const here = place();
    this.place = here;
    const terrain = here.buildTerrain();
    this.terrainMesh = terrain.mesh;
    this.scene.add(terrain.mesh, ...terrain.extras);

    this.ground = new Ground(terrain.colliders);

    this.sky = buildSky(quality.skyStrokes);
    this.scene.add(this.sky);

    // One soft directional light plus an ambient fill.
    // The light stays near neutral so the valley reads grey at the start; the
    // warmth comes from the grey-to-colour system, not from the lamp.
    this.sun = new THREE.DirectionalLight(0xfff6e6, 1.7);
    this.sun.position.set(38, 44, -62);
    this.sunIntensity = this.sun.intensity;
    this.sun.castShadow = false;
    this.sun.shadow.bias = SHADOW.bias;
    this.sun.shadow.normalBias = SHADOW.normalBias;
    const cam = this.sun.shadow.camera;
    cam.near = SHADOW.near;
    cam.far = SHADOW.far;
    cam.left = -SHADOW.boxSize / 2;
    cam.right = SHADOW.boxSize / 2;
    cam.top = SHADOW.boxSize / 2;
    cam.bottom = -SHADOW.boxSize / 2;
    cam.updateProjectionMatrix();
    this.scene.add(this.sun, this.sun.target);
    // No ambient fill light. The environment map is the sky light now, and a
    // flat fill on top of it only washes the contrast out of everything.

    const props = here.buildProps(quality.treeBlobs);
    this.scene.add(props.group);
    for (const b of props.blockers) this.ground.addBlocker(b.x, b.z, b.radius);

    // The grass is always built at the highest count. The tier only decides
    // how many of those cards are drawn, so a quality change during play takes
    // effect at once instead of needing the world rebuilt.
    this.grass = buildGrass(TIERS.high.grassCards);
    this.scene.add(this.grass);

    this.atmosphere = buildAtmosphere(TIERS.high.particles);
    this.scene.add(this.atmosphere);
    this.applyQuality(quality);

    const fixtures = here.buildFixtures();
    this.scene.add(fixtures.group);
    for (const [id, anchor] of fixtures.anchors) this.anchors.set(id, anchor);
    for (const b of fixtures.blockers) this.ground.addBlocker(b.x, b.z, b.radius);

    if (here.bridge) {
      const bridge = buildBridge();
      bridge.position.set(
        here.bridge.x,
        here.height(here.bridge.x, here.bridge.deckZ) - 7,
        here.bridge.z,
      );
      bridge.visible = false;
      this.scene.add(bridge);
      this.bridge = bridge;
      this.bridgeDeck = bridge.getObjectByName('bridgeDeck') as THREE.Mesh;
      bridge.traverse((o) => {
        const material = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (material?.color && !this.bridgeColors.some((b) => b.material === material)) {
          this.bridgeColors.push({ material, base: material.color.clone() });
        }
      });
    }

    this.scene.add(this.player.group);

    // Who casts and who receives. The ground only receives, the props do both,
    // and the grass does neither: 60,000 alpha-tested cards in a shadow pass
    // would cost more than every other thing in the valley put together.
    terrain.mesh.receiveShadow = true;
    for (const extra of terrain.extras) {
      extra.traverse((o: THREE.Object3D) => (o.receiveShadow = true));
    }
    props.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    fixtures.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    this.bridge?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });

    if (renderer) this.initEnvironment(renderer);

    // Aerial perspective. Distant ground fades into the sky, which is what
    // gives an open valley its depth. The colour follows the sky as the valley
    // returns to colour, so the haze never stays a cold grey over warm hills.
    this.haze = new THREE.Fog(new THREE.Color(PALETTE.skyGrey), 38, 185);
    this.scene.fog = this.haze;
  }

  /**
   * The time of day.
   *
   * `night` is the whole amount, not a step, so a chapter can set it straight
   * to 1 or ease it and the result is the same. Everything that reads as
   * daylight follows it: the sun, the haze and the sky light itself, because
   * a night sky filtered into the environment map is what makes a moonlit
   * meadow read as moonlit rather than as a dark photograph of a day.
   */
  setNight(night: number): void {
    const n = Math.max(0, Math.min(1, night));
    if (Math.abs(n - this.night) < 0.001) return;
    this.night = n;
    setSkyNight(this.sky, n);
    colorUniforms.uNight.value = n;
    this.sun.intensity = this.sunIntensity * (1 - n * 0.55);
    this.sun.color.setHex(n > 0.5 ? 0xc9d6f2 : 0xfff6e6);
    // The sky light is what makes a moonlit meadow read as moonlit rather
    // than as a dark photograph of a day, so it is turned up, not down.
    this.scene.environmentIntensity = 0.35 + n * 0.75;
    // Re-filtering the sky is the single most expensive thing this class can
    // do. Night falls over several seconds, so refreshing on every step meant
    // one full PMREM pass per frame and the renderer stopped keeping up. It
    // is done in steps large enough to see, like the colour drift below.
    if (Math.abs(n - this.envNightAtBuild) > 0.12 || n === 0 || n === 1) {
      this.refreshEnvironment();
    }
  }

  /** 0 morning, 1 evening. The chapter 2 sky runs one slow day. */
  setDay(day: number): void {
    const d = Math.max(0, Math.min(1, day));
    if (Math.abs(d - this.day) < 0.004) return;
    this.day = d;
    setSkyDay(this.sky, d);
  }

  /**
   * Blends the bridge toward gold. `t` is the whole amount, not a step, so the
   * result is the same however many frames it took to get there and the bridge
   * can be put back by passing 0.
   */
  setBridgeGold(t: number): void {
    const amount = Math.max(0, Math.min(1, t));
    if (amount === this.bridgeGold) return;
    this.bridgeGold = amount;
    for (const entry of this.bridgeColors) {
      entry.material.color.copy(entry.base).lerp(GOLD, amount);
    }
  }

  /**
   * Builds the image-based light.
   *
   * A second copy of the sky, sharing the same material, is filtered into an
   * environment map. That map lights the shadowed side of every surface with
   * real sky light instead of a flat ambient guess, and because it comes from
   * the game's own sky it greys and warms with the valley for free.
   */
  private initEnvironment(renderer: THREE.WebGLRenderer): void {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(this.sky.geometry, this.sky.material));
    this.refreshEnvironment();
  }

  /** Re-filters the sky into the environment map. */
  private refreshEnvironment(): void {
    if (!this.pmrem || !this.envScene) return;
    this.envTarget?.dispose();
    this.envTarget = this.pmrem.fromScene(this.envScene, 0, 1, 400);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.35 + this.night * 0.75;
    this.envColorAtBuild = this.color.globalColor;
    this.envNightAtBuild = this.night;
  }

  /** Applies a quality tier to everything that can change during play. */
  applyQuality(quality: QualitySettings): void {
    setGrassDensity(this.grass, quality.grassCards * this.place.grassDensity, quality.grassFade);
    this.setShadows(quality.shadowMap);
    // The specks are drawn from the front of the buffer, so a lower tier just
    // draws fewer of them.
    this.atmosphere.geometry.setDrawRange(0, quality.particles);
  }

  /**
   * Turns real shadows on at the given map size, or off when it is zero.
   *
   * Shadows are what tell the eye where a thing sits on the ground. Without
   * them a tree is a shape floating in front of a meadow. The map covers only
   * a box around the player, so it stays sharp however big the valley is.
   */
  setShadows(mapSize: number): void {
    const on = mapSize > 0;
    this.sun.castShadow = on;
    // The blob shadow stands in for the real one on the cheapest tier.
    this.player.setBlobShadow(!on);
    if (!on) return;
    if (this.sun.shadow.mapSize.width !== mapSize) {
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.shadowTexelSize = SHADOW.boxSize / mapSize;
  }

  /**
   * Keeps the shadow box over the player.
   *
   * The centre is snapped to whole shadow texels. Without that the shadows
   * crawl and shimmer with every step, which is far more distracting than
   * having no shadows at all.
   */
  private followShadow(target: THREE.Vector3): void {
    if (!this.sun.castShadow) return;
    const step = this.shadowTexelSize || 1;
    const cx = Math.round(target.x / step) * step;
    const cz = Math.round(target.z / step) * step;
    this.sun.target.position.set(cx, target.y, cz);
    this.sun.position.set(
      cx + this.sunDir.x * SHADOW.distance,
      target.y + this.sunDir.y * SHADOW.distance,
      cz + this.sunDir.z * SHADOW.distance,
    );
    this.sun.target.updateMatrixWorld();
  }

  /** The height the player's feet rest at, or null where there is no ground. */
  groundAt(x: number, z: number): number | null {
    return this.ground.heightAt(x, z);
  }

  /** Raises the bridge into place over the gap. Places without one ignore it. */
  setBridgeRise(t: number): void {
    const spot = this.place.bridge;
    if (!this.bridge || !spot) return;
    const top = this.place.height(spot.x, spot.deckZ);
    this.bridge.visible = t > 0;
    const eased = t * t * (3 - 2 * t);
    this.bridge.position.y = top - 7 + eased * 7;
    if (t >= 1 && this.bridgeDeck) this.ground.addCollider(this.bridgeDeck);
  }

  update(
    dt: number,
    calm: number,
    light: number,
    windStrength: number,
    windRadius: number,
    fogX: number,
    fogZ: number,
  ): void {
    this.clock += dt;
    this.color.update(dt);
    // The rim light warms with the valley, so the edges pick up the returning
    // sun instead of staying a cold grey all the way to the end.
    (colorUniforms.uRimColor.value as THREE.Color)
      .copy(COLD_RIM)
      .lerp(WARM_RIM, this.color.globalColor);
    this.haze.color.copy(COLD_RIM).lerp(HAZE_WARM, this.color.globalColor);
    if (this.night > 0) this.haze.color.lerp(NIGHT_HAZE, this.night);
    // The sky changes slowly, so the environment map is only re-filtered when
    // it has drifted far enough to see. Doing it every frame would cost more
    // than everything else in the valley.
    if (Math.abs(this.color.globalColor - this.envColorAtBuild) > 0.08) {
      this.refreshEnvironment();
    }
    updateSky(this.sky, this.clock);
    updateGrass(this.grass, this.clock, windStrength, windRadius, fogX, fogZ);
    updateAtmosphere(this.atmosphere, this.clock, this.player.group.position);
    this.followShadow(this.player.group.position);
    this.player.setGlow(calm);
    this.player.setLight(light);
    const gy = this.groundAt(this.player.group.position.x, this.player.group.position.z);
    this.player.update(dt, gy ?? this.player.group.position.y, this.playerSpeed);
    // The sky dome follows the camera so it never runs out.
    this.sky.position.copy(this.player.group.position);
  }

  /** Puts the player on the ground at a point and returns the height used. */
  placePlayer(x: number, z: number): number {
    const y = this.groundAt(x, z) ?? this.place.height(x, z);
    this.player.setPosition(x, y, z);
    return y;
  }

  get playerPosition(): THREE.Vector3 {
    return this.player.group.position;
  }

  get playerEye(): THREE.Vector3 {
    return new THREE.Vector3(
      this.player.group.position.x,
      this.player.group.position.y + PLAYER.height * 0.5,
      this.player.group.position.z,
    );
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
    this.terrainMesh.geometry.disposeBoundsTree?.();
  }
}

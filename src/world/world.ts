import * as THREE from 'three';
import { LAYOUT, PLAYER, SHADOW, TIERS } from '../content/chapter1';
import { PALETTE } from '../content/palette';
import type { QualitySettings } from '../core/quality';
import { ColorRestoreState, colorUniforms } from '../render/colorRestore';
import { buildAtmosphere, updateAtmosphere } from './atmosphere';
import { buildGrass, setGrassDensity, updateGrass } from './grass';
import { Ground } from './ground';
import { PlayerFigure } from './player';
import { buildBridge, buildSignStone, buildSpringBasin, scatterProps } from './props';
import { buildSky, updateSky } from './sky';
import { buildTerrain, terrainHeight } from './terrain';

const GOLD = new THREE.Color(PALETTE.receiveGold);
const COLD_RIM = new THREE.Color(PALETTE.skyGrey);
const WARM_RIM = new THREE.Color(PALETTE.warmSky);
const HAZE_WARM = new THREE.Color(PALETTE.farHillsViolet).lerp(
  new THREE.Color(PALETTE.warmSky),
  0.55,
);

/**
 * Builds and holds the valley: terrain, sky, props, grass, the player figure
 * and the ground checks. It knows nothing about the chapter flow.
 */
export class World {
  readonly scene = new THREE.Scene();
  readonly ground: Ground;
  readonly player = new PlayerFigure();
  readonly color = new ColorRestoreState();
  readonly springAnchors = new Map<string, THREE.Group>();
  readonly bridge: THREE.Group;
  private readonly sky: THREE.Mesh;
  private readonly grass: THREE.Mesh;
  private readonly atmosphere: THREE.Points;
  private readonly terrainMesh: THREE.Mesh;
  private readonly bridgeDeck: THREE.Mesh;
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
  /** The chapter writes the player's ground speed here for the walk cycle. */
  playerSpeed = 0;

  constructor(quality: QualitySettings, renderer?: THREE.WebGLRenderer) {
    const terrain = buildTerrain();
    this.terrainMesh = terrain.mesh;
    this.scene.add(terrain.mesh, terrain.chasm);

    this.ground = new Ground(terrain.colliders);

    this.sky = buildSky(quality.skyStrokes);
    this.scene.add(this.sky);

    // One soft directional light plus an ambient fill.
    // The light stays near neutral so the valley reads grey at the start; the
    // warmth comes from the grey-to-colour system, not from the lamp.
    this.sun = new THREE.DirectionalLight(0xfff6e6, 1.7);
    this.sun.position.set(38, 44, -62);
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

    const props = scatterProps(quality.treeBlobs);
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

    for (const [id, spot] of [
      ['spring1', LAYOUT.spring1],
      ['spring2', LAYOUT.spring2],
      ['spring3', LAYOUT.spring3],
    ] as const) {
      const basin = buildSpringBasin();
      basin.position.set(spot.x, terrainHeight(spot.x, spot.z), spot.z);
      this.springAnchors.set(id, basin);
      this.scene.add(basin);
    }

    const stone = buildSignStone();
    stone.position.set(
      LAYOUT.signStone.x,
      terrainHeight(LAYOUT.signStone.x, LAYOUT.signStone.z),
      LAYOUT.signStone.z,
    );
    stone.rotation.y = -0.6;
    this.scene.add(stone);

    this.bridge = buildBridge();
    this.bridge.position.set(
      LAYOUT.bridge.x,
      terrainHeight(LAYOUT.bridge.x, LAYOUT.gap.z1 + 3) - 7,
      LAYOUT.bridge.z,
    );
    this.bridge.visible = false;
    this.scene.add(this.bridge);
    this.bridgeDeck = this.bridge.getObjectByName('bridgeDeck') as THREE.Mesh;
    this.bridge.traverse((o) => {
      const material = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (material?.color && !this.bridgeColors.some((b) => b.material === material)) {
        this.bridgeColors.push({ material, base: material.color.clone() });
      }
    });

    this.scene.add(this.player.group);

    // Who casts and who receives. The ground only receives, the props do both,
    // and the grass does neither: 60,000 alpha-tested cards in a shadow pass
    // would cost more than every other thing in the valley put together.
    terrain.mesh.receiveShadow = true;
    terrain.chasm.traverse((o) => (o.receiveShadow = true));
    props.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    for (const basin of this.springAnchors.values()) {
      basin.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
    }
    this.bridge.traverse((o) => {
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
    this.scene.environmentIntensity = 0.35;
    this.envColorAtBuild = this.color.globalColor;
  }

  /** Applies a quality tier to everything that can change during play. */
  applyQuality(quality: QualitySettings): void {
    setGrassDensity(this.grass, quality.grassCards, quality.grassFade);
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

  /** Raises the bridge into place over the gap. */
  setBridgeRise(t: number): void {
    const top = terrainHeight(LAYOUT.bridge.x, LAYOUT.gap.z1 + 3);
    this.bridge.visible = t > 0;
    const eased = t * t * (3 - 2 * t);
    this.bridge.position.y = top - 7 + eased * 7;
    if (t >= 1) this.ground.addCollider(this.bridgeDeck);
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
    const y = this.groundAt(x, z) ?? terrainHeight(x, z);
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

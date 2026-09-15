import * as THREE from 'three';
import { LAYOUT, PLAYER } from '../content/chapter1';
import { PALETTE } from '../content/palette';
import type { QualitySettings } from '../core/quality';
import { ColorRestoreState } from '../render/colorRestore';
import { buildGrass, updateGrass } from './grass';
import { Ground } from './ground';
import { PlayerFigure } from './player';
import { buildBridge, buildSignStone, buildSpringBasin, scatterProps } from './props';
import { buildSky, updateSky } from './sky';
import { buildTerrain, terrainHeight } from './terrain';

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
  private readonly terrainMesh: THREE.Mesh;
  private readonly bridgeDeck: THREE.Mesh;
  private clock = 0;

  constructor(quality: QualitySettings) {
    const terrain = buildTerrain();
    this.terrainMesh = terrain.mesh;
    this.scene.add(terrain.mesh, terrain.chasm);

    this.ground = new Ground(terrain.colliders);

    this.sky = buildSky(quality.skyStrokes);
    this.scene.add(this.sky);

    // One soft directional light plus an ambient fill. No shadow maps.
    // The light stays near neutral so the valley reads grey at the start; the
    // warmth comes from the grey-to-colour system, not from the lamp.
    const sun = new THREE.DirectionalLight(0xfff6e6, 1.9);
    sun.position.set(38, 44, -62);
    this.scene.add(sun);
    this.scene.add(
      new THREE.HemisphereLight(
        new THREE.Color(PALETTE.skyGrey),
        new THREE.Color(PALETTE.deepGreen),
        1.6,
      ),
    );

    const props = scatterProps(quality.treeBlobs);
    this.scene.add(props.group);
    for (const b of props.blockers) this.ground.addBlocker(b.x, b.z, b.radius);

    this.grass = buildGrass(quality.grassCards);
    this.scene.add(this.grass);

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

    this.scene.add(this.player.group);

    // Distance haze. It thickens at the valley borders so they turn the player
    // back softly instead of stopping them at a wall.
    this.scene.fog = new THREE.Fog(new THREE.Color(PALETTE.skyGrey), 55, 210);
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
    updateSky(this.sky, this.clock);
    updateGrass(this.grass, this.clock, windStrength, windRadius, fogX, fogZ);
    this.player.setGlow(calm);
    this.player.setLight(light);
    const gy = this.groundAt(this.player.group.position.x, this.player.group.position.z);
    this.player.update(dt, gy ?? this.player.group.position.y);
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

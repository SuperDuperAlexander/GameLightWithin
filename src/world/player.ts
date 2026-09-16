import * as THREE from 'three';
import { LIGHT, PLAYER } from '../content/chapter1';
import { BODY, BODY_POINTS } from '../content/chapter2';
import type { BodyPoint } from '../content/chapter2';
import { PALETTE } from '../content/palette';
import { clamp01 } from '../core/math';
import { worldMaterial } from '../render/materials';

/**
 * The player: a simple, soft, faceless figure. A rounded body, a small head and
 * a light cloak shape. The glow around them follows the calm value.
 */
export class PlayerFigure {
  readonly group = new THREE.Group();
  readonly motes = new THREE.Group();
  private readonly glow: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private readonly moteMeshes: THREE.Mesh[] = [];
  private moteTime = 0;
  private glowAmount = 0;
  /** Advances with distance walked, so the step never changes with frame rate. */
  private walkPhase = 0;
  /** 0 standing, 1 walking at full stride. */
  private gait = 0;
  private readonly body = new THREE.Group();
  private readonly hem: THREE.Mesh;

  constructor() {
    this.group.name = 'player';

    // The player carries the strongest rim in the world, so the figure always
    // reads clearly against the meadow behind them.
    const body = worldMaterial({ color: 0xe6e2dc, rim: 0.45 });
    const cloak = worldMaterial({ color: 0xcfd6dd, rim: 0.45 });

    // Rounded body, wider at the hem so it reads as a cloak.
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.52, 1.1, 12, 1), cloak);
    torso.position.y = 0.58;
    this.body.add(torso);

    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), cloak);
    shoulders.position.y = 1.12;
    shoulders.scale.set(1, 0.72, 0.9);
    this.body.add(shoulders);

    // A small, faceless head.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), body);
    head.position.y = 1.47;
    this.body.add(head);

    this.hem = new THREE.Mesh(new THREE.ConeGeometry(0.56, 0.42, 12, 1, true), cloak);
    this.hem.position.y = 0.21;
    this.body.add(this.hem);

    // The soft glow that shows calm. It is additive so it never darkens anything.
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        uniforms: {
          uColor: { value: new THREE.Color(PALETTE.receiveGold) },
          uStrength: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vNormalW;
          varying vec3 vViewDir;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vNormalW = normalize(mat3(modelMatrix) * normal);
            vViewDir = normalize(cameraPosition - world.xyz);
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          precision mediump float;
          varying vec3 vNormalW;
          varying vec3 vViewDir;
          uniform vec3 uColor;
          uniform float uStrength;
          void main() {
            float rim = 1.0 - abs(dot(normalize(vNormalW), normalize(vViewDir)));
            // A tight rim keeps the glow a halo around the figure.
            float a = pow(rim, 3.2) * uStrength;
            gl_FragColor = vec4(uColor, a * 0.16);
          }
        `,
      }),
    );
    this.group.add(this.body);
    for (const part of this.body.children) part.castShadow = true;

    this.glow.position.y = 0.9;
    this.glow.renderOrder = 2;
    this.group.add(this.glow);

    // A simple blob shadow instead of a real-time shadow map.
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 18),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {},
        vertexShader:
          'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader:
          'precision mediump float; varying vec2 vUv; void main(){ float d = distance(vUv, vec2(0.5)) * 2.0; gl_FragColor = vec4(0.13, 0.14, 0.17, (1.0 - smoothstep(0.25, 1.0, d)) * 0.42); }',
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.03;
    this.group.add(this.shadow);

    // One mote per light carried. Never a number.
    const moteGeo = new THREE.SphereGeometry(0.075, 8, 6);
    const moteMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(PALETTE.receiveGold),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (let i = 0; i < LIGHT.max; i++) {
      const mote = new THREE.Mesh(moteGeo, moteMat);
      mote.visible = false;
      this.moteMeshes.push(mote);
      this.motes.add(mote);
    }
    this.group.add(this.motes);
  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
  }

  /** The blob shadow is only used when the tier has no real shadows. */
  setBlobShadow(on: boolean): void {
    this.shadow.visible = on;
  }

  setFacing(angle: number): void {
    this.group.rotation.y = angle;
  }

  /** The calm value drives the glow brightness and size. */
  setGlow(calm: number): void {
    this.glowAmount = clamp01(calm);
    const r =
      PLAYER.glowRadiusMin + (PLAYER.glowRadiusMax - PLAYER.glowRadiusMin) * this.glowAmount;
    this.glow.scale.setScalar(r);
    const mat = this.glow.material as THREE.ShaderMaterial;
    const u = mat.uniforms.uStrength;
    if (u) u.value = 0.22 + this.glowAmount * 1.5;
  }

  /**
   * The four body points: feet, belly, heart, head.
   *
   * They are built once and left dark. Chapter 2 lights them one at a time as
   * the player breathes at each stone, and a point that is lit stays lit. No
   * other chapter touches them, so they cost one hidden group at the start.
   */
  private bodyGlows: Map<BodyPoint, THREE.Mesh> | null = null;

  /** Lights one body point, or dims it. `amount` is 0 to 1. */
  setBodyPoint(point: BodyPoint, amount: number): void {
    if (!this.bodyGlows) this.buildBodyGlows();
    const mesh = this.bodyGlows?.get(point);
    if (!mesh) return;
    const a = clamp01(amount);
    mesh.visible = a > 0.01;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = a * 0.85;
    mesh.scale.setScalar(0.1 + a * 0.075);
  }

  private buildBodyGlows(): void {
    this.bodyGlows = new Map();
    const geo = new THREE.SphereGeometry(1, 10, 8);
    for (const point of BODY_POINTS) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(PALETTE.receiveGold),
          transparent: true,
          opacity: 0,
          depthWrite: false,
          fog: false,
        }),
      );
      mesh.position.set(0, BODY.heights[point], 0.16);
      mesh.visible = false;
      mesh.name = `bodyGlow-${point}`;
      this.group.add(mesh);
      this.bodyGlows.set(point, mesh);
    }
  }

  setLight(count: number): void {
    for (let i = 0; i < this.moteMeshes.length; i++) {
      const mote = this.moteMeshes[i];
      if (mote) mote.visible = i < count;
    }
  }

  /**
   * @param speed the player's ground speed in metres per second
   */
  update(dt: number, groundY: number, speed = 0): void {
    this.animateWalk(dt, speed);
    this.moteTime += dt;
    const visible = this.moteMeshes.filter((m) => m.visible).length;
    for (let i = 0; i < visible; i++) {
      const mote = this.moteMeshes[i];
      if (!mote) continue;
      const a = this.moteTime * LIGHT.moteOrbitSpeed + (i / Math.max(1, visible)) * Math.PI * 2;
      const tilt = Math.sin(this.moteTime * 0.7 + i) * 0.35;
      mote.position.set(
        Math.cos(a) * LIGHT.moteOrbitRadius,
        1.0 + tilt + Math.sin(a * 2) * 0.12,
        Math.sin(a) * LIGHT.moteOrbitRadius,
      );
      mote.scale.setScalar(0.85 + Math.sin(this.moteTime * 2.4 + i) * 0.16);
    }
    this.shadow.position.y = groundY - this.group.position.y + 0.04;
  }

  /**
   * A walk, made from the movement itself rather than from a clip.
   *
   * The body rises and falls twice per stride, rolls a little from side to
   * side, and leans into the direction of travel. Without it the figure slides
   * over the ground like a chess piece, which undoes everything the rest of
   * the scene is doing.
   */
  private animateWalk(dt: number, speed: number): void {
    // The phase follows distance, not time, so the step matches the speed.
    this.walkPhase += speed * dt * 2.6;
    const want = clamp01(speed / 3);
    this.gait += (want - this.gait) * Math.min(1, dt * 8);

    const bob = Math.sin(this.walkPhase * 2) * 0.055 * this.gait;
    const roll = Math.sin(this.walkPhase) * 0.07 * this.gait;
    const lean = 0.1 * this.gait;

    this.body.position.y = bob;
    this.body.rotation.z = roll;
    this.body.rotation.x = lean;
    // The hem swings a beat behind the body, so the cloak has some weight.
    this.hem.rotation.z = -roll * 0.6;
    this.hem.position.x = Math.sin(this.walkPhase - 0.6) * 0.03 * this.gait;
  }

  /** Where a light mote should fly to. */
  chestWorld(target: THREE.Vector3): THREE.Vector3 {
    return target.set(this.group.position.x, this.group.position.y + 1.05, this.group.position.z);
  }
}

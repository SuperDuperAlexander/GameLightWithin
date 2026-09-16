import * as THREE from 'three';
import { LIGHT, PLAYER } from '../content/chapter1';
import { PALETTE } from '../content/palette';
import { clamp01 } from '../core/math';
import { toonMaterial } from '../render/materials';

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

  constructor() {
    this.group.name = 'player';

    // The player carries the strongest rim in the world, so the figure always
    // reads clearly against the meadow behind them.
    const body = toonMaterial({ color: 0xe6e2dc, rim: 1.1 });
    const cloak = toonMaterial({ color: 0xcfd6dd, rim: 1.1 });

    // Rounded body, wider at the hem so it reads as a cloak.
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.52, 1.1, 12, 1), cloak);
    torso.position.y = 0.58;
    this.group.add(torso);

    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), cloak);
    shoulders.position.y = 1.12;
    shoulders.scale.set(1, 0.72, 0.9);
    this.group.add(shoulders);

    // A small, faceless head.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), body);
    head.position.y = 1.47;
    this.group.add(head);

    const hem = new THREE.Mesh(new THREE.ConeGeometry(0.56, 0.42, 12, 1, true), cloak);
    hem.position.y = 0.21;
    this.group.add(hem);

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

  setLight(count: number): void {
    for (let i = 0; i < this.moteMeshes.length; i++) {
      const mote = this.moteMeshes[i];
      if (mote) mote.visible = i < count;
    }
  }

  update(dt: number, groundY: number): void {
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

  /** Where a light mote should fly to. */
  chestWorld(target: THREE.Vector3): THREE.Vector3 {
    return target.set(this.group.position.x, this.group.position.y + 1.05, this.group.position.z);
  }
}

import * as THREE from 'three';
import { PALETTE } from '../content/palette';
import { clamp01, makeRng } from '../core/math';
import { worldMaterial } from '../render/materials';
import { buildTree } from './props';

const GOLD = new THREE.Color(PALETTE.receiveGold);

/** A small additive point of light. Used for every mote in the game. */
export function makeMoteMaterial(color: THREE.Color): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

/**
 * Light motes that rise from a source and flow into the player.
 * One pool serves every spring and the fog.
 */
export class MoteFlow {
  readonly group = new THREE.Group();
  private readonly pool: THREE.Mesh[] = [];
  private readonly live: {
    mesh: THREE.Mesh;
    from: THREE.Vector3;
    rise: THREE.Vector3;
    time: number;
    duration: number;
    onArrive: (() => void) | null;
  }[] = [];

  constructor(size: number) {
    const geo = new THREE.SphereGeometry(0.11, 8, 6);
    const mat = makeMoteMaterial(GOLD);
    for (let i = 0; i < size; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.pool.push(mesh);
      this.group.add(mesh);
    }
    this.group.name = 'motes';
  }

  /** Sends one mote from a point to the player. */
  send(from: THREE.Vector3, duration: number, onArrive: (() => void) | null): void {
    const mesh = this.pool.find((m) => !m.visible);
    if (!mesh) {
      onArrive?.();
      return;
    }
    mesh.visible = true;
    mesh.position.copy(from);
    this.live.push({
      mesh,
      from: from.clone(),
      // It rises first, then curves toward the player.
      rise: from
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 1.4,
            1.9 + Math.random(),
            (Math.random() - 0.5) * 1.4,
          ),
        ),
      time: 0,
      duration,
      onArrive,
    });
  }

  update(dt: number, target: THREE.Vector3): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const m = this.live[i];
      if (!m) continue;
      m.time += dt;
      const t = Math.min(1, m.time / m.duration);
      // A simple curve: source, a point above it, then the player.
      const a = m.from.clone().lerp(m.rise, t);
      const b = m.rise.clone().lerp(target, t);
      m.mesh.position.copy(a.lerp(b, t));
      const s = 0.7 + Math.sin(t * Math.PI) * 0.8;
      m.mesh.scale.setScalar(s);
      if (t >= 1) {
        m.mesh.visible = false;
        m.onArrive?.();
        this.live.splice(i, 1);
      }
    }
  }

  get busy(): number {
    return this.live.length;
  }
}

/** The glow a spring shows. It stays gentle once the spring is empty. */
export class SpringGlow {
  readonly mesh: THREE.Mesh;
  private time = 0;

  constructor() {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        uniforms: { uColor: { value: GOLD.clone() }, uStrength: { value: 0 } },
        vertexShader: `
          varying vec3 vN; varying vec3 vV;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vN = normalize(mat3(modelMatrix) * normal);
            vV = normalize(cameraPosition - w.xyz);
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `,
        fragmentShader: `
          precision highp float;
          varying vec3 vN; varying vec3 vV;
          uniform vec3 uColor; uniform float uStrength;
          void main() {
            float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
            // A soft halo, never a solid dome: a tight rim and a low alpha.
            gl_FragColor = vec4(uColor, pow(rim, 3.4) * uStrength * 0.22);
          }
        `,
      }),
    );
    this.mesh.visible = false;
  }

  setStrength(value: number, radius: number): void {
    this.mesh.visible = value > 0.01;
    this.mesh.scale.setScalar(radius);
    const mat = this.mesh.material as THREE.ShaderMaterial;
    const u = mat.uniforms.uStrength;
    if (u) u.value = value;
  }

  update(dt: number): void {
    this.time += dt;
    const mat = this.mesh.material as THREE.ShaderMaterial;
    const u = mat.uniforms.uStrength;
    if (u && this.mesh.visible) {
      // A slow breath of its own, so it never looks like a hard marker.
      this.mesh.scale.multiplyScalar(1 + Math.sin(this.time * 0.9) * 0.0016);
    }
  }
}

/**
 * The fog on the narrow path. It is soft and melancholic: a slow drifting
 * cloud in the blockage blue, never sharp and never frightening.
 */
export class FogVolume {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly puffs: { mesh: THREE.Mesh; base: THREE.Vector3; phase: number }[] = [];
  private time = 0;

  constructor(radius: number) {
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(PALETTE.blockage) },
        uDensity: { value: 1 },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec3 vN; varying vec3 vV; varying vec3 vL;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - w.xyz);
          vL = position;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vN; varying vec3 vV; varying vec3 vL;
        uniform vec3 uColor; uniform float uDensity; uniform float uTime;
        void main() {
          // Soft at the rim, denser toward the middle. Nothing hard-edged.
          float facing = abs(dot(normalize(vN), normalize(vV)));
          float soft = pow(1.0 - facing, 0.6);
          float drift = 0.85 + 0.15 * sin(uTime * 0.5 + vL.y * 1.6 + vL.x);
          float a = (1.0 - soft) * 0.28 * uDensity * drift;
          // Lift the blockage blue toward a pale, melancholic haze.
          vec3 col = mix(uColor, vec3(0.52, 0.56, 0.72), 0.32) * (0.8 + 0.3 * facing);
          gl_FragColor = vec4(col, clamp(a, 0.0, 0.5));
        }
      `,
    });

    const geo = new THREE.SphereGeometry(1, 14, 10);
    const rng = makeRng(9091);
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(geo, this.material);
      const a = rng() * Math.PI * 2;
      const r = rng() * radius * 0.62;
      const base = new THREE.Vector3(Math.cos(a) * r, 0.9 + rng() * 1.5, Math.sin(a) * r);
      mesh.position.copy(base);
      const s = radius * (0.3 + rng() * 0.3);
      mesh.scale.set(s, s * 0.72, s);
      this.puffs.push({ mesh, base, phase: rng() * Math.PI * 2 });
      this.group.add(mesh);
    }
    this.group.name = 'fog';
  }

  /** 0 gone, 1 the starting fog, above 1 after the player has run away. */
  setDensity(value: number, scale: number): void {
    const u = this.material.uniforms.uDensity;
    if (u) u.value = value;
    this.group.scale.setScalar(scale);
    this.group.visible = value > 0.01;
  }

  update(dt: number): void {
    this.time += dt;
    const u = this.material.uniforms.uTime;
    if (u) u.value = this.time;
    for (const p of this.puffs) {
      p.mesh.position.set(
        p.base.x + Math.sin(this.time * 0.22 + p.phase) * 0.55,
        p.base.y + Math.sin(this.time * 0.31 + p.phase * 1.7) * 0.32,
        p.base.z + Math.cos(this.time * 0.19 + p.phase) * 0.55,
      );
    }
  }

  /** Where a dissolve mote should start from. */
  randomPoint(out: THREE.Vector3): THREE.Vector3 {
    const p = this.puffs[Math.floor(Math.random() * this.puffs.length)];
    if (!p) return out.copy(this.group.position);
    return out.copy(p.mesh.position).multiplyScalar(this.group.scale.x).add(this.group.position);
  }
}

/**
 * The mist the player wakes inside.
 *
 * The player is never stopped from walking. Instead they set off inside their
 * own weather: the valley is close and dim, their stride is short, and the
 * longer they push on without stopping the thicker it gets. One finished
 * breath clears it for good. The penalty is something you can see, which is
 * the only kind worth having in a game with no score and no failure.
 */
export class WakingMist {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly puffs: { mesh: THREE.Mesh; base: THREE.Vector3; phase: number }[] = [];
  private time = 0;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(PALETTE.skyGrey) },
        uStrength: { value: 1 },
        uTime: { value: 0 },
      },
      vertexShader: `
        precision highp float;
        varying vec3 vN; varying vec3 vV; varying vec3 vL;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - w.xyz);
          vL = position;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vN; varying vec3 vV; varying vec3 vL;
        uniform vec3 uColor; uniform float uStrength; uniform float uTime;
        void main() {
          // Soft everywhere and softest at the silhouette, so a bank of these
          // reads as mist instead of a row of bubbles.
          float facing = abs(dot(normalize(vN), normalize(vV)));
          float soft = pow(facing, 0.7);
          float roll = 0.84 + 0.16 * sin(uTime * 0.5 + vL.y * 1.7 + vL.x);
          gl_FragColor = vec4(uColor, clamp(soft * roll * uStrength * 0.3, 0.0, 0.5));
        }
      `,
    });

    // A ring of low puffs around the player, thickest at knee height, so the
    // sky stays open and the world ahead just goes soft.
    const geo = new THREE.SphereGeometry(1, 12, 9);
    const rng = makeRng(31337);
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(geo, this.material);
      const a = (i / 12) * Math.PI * 2 + rng() * 0.5;
      const r = 0.45 + rng() * 0.4;
      const base = new THREE.Vector3(Math.cos(a) * r, 0.1 + rng() * 0.28, Math.sin(a) * r);
      mesh.position.copy(base);
      const size = 0.34 + rng() * 0.26;
      mesh.scale.set(size, size * 0.6, size);
      this.puffs.push({ mesh, base, phase: rng() * Math.PI * 2 });
      this.group.add(mesh);
    }
    this.group.name = 'wakingMist';
  }

  /** @param value 0 clear, 1 thickest. */
  setStrength(value: number, radius: number): void {
    const strength = clamp01(value);
    this.group.visible = strength > 0.01;
    this.group.scale.setScalar(radius);
    const u = this.material.uniforms.uStrength;
    if (u) u.value = strength;
  }

  update(dt: number): void {
    this.time += dt;
    const u = this.material.uniforms.uTime;
    if (u) u.value = this.time;
    for (const p of this.puffs) {
      p.mesh.position.set(
        p.base.x + Math.sin(this.time * 0.2 + p.phase) * 0.07,
        p.base.y + Math.sin(this.time * 0.29 + p.phase * 1.4) * 0.03,
        p.base.z + Math.cos(this.time * 0.17 + p.phase) * 0.07,
      );
    }
  }
}

/** The seed: a small glowing sprout that grows into the bridge. */
export class Sprout {
  readonly group = new THREE.Group();
  private readonly stem: THREE.Mesh;
  private readonly glow: THREE.Mesh;
  private time = 0;

  constructor() {
    this.stem = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 1.05, 6),
      worldMaterial({ color: PALETTE.growthGreen, rim: 0.3 }),
    );
    this.stem.position.y = 0.52;
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), makeMoteMaterial(GOLD));
    this.glow.position.y = 1.0;
    this.group.add(this.stem, this.glow);
    this.group.visible = false;
    this.group.name = 'sprout';
  }

  /** A heart seed keeps a quiet warm glow. It dims a little while it pauses. */
  setState(visible: boolean, progress: number, paused: boolean): void {
    this.group.visible = visible;
    if (!visible) return;
    const s = 0.7 + progress * 0.9;
    this.group.scale.setScalar(s);
    const mat = this.glow.material as THREE.MeshBasicMaterial;
    mat.opacity = paused ? 0.34 : 0.85;
  }

  update(dt: number): void {
    this.time += dt;
    this.glow.scale.setScalar(1 + Math.sin(this.time * 1.7) * 0.12);
  }
}

/** The bird hint in scene 3. It lands near the hidden spring and sits still. */
export function buildBird(): THREE.Group {
  const group = new THREE.Group();
  const mat = worldMaterial({ color: 0xbfb3a4, rim: 0.3 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat);
  body.scale.set(1, 0.9, 1.35);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 6), mat);
  head.position.set(0, 0.15, 0.16);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 5), mat);
  tail.rotation.x = Math.PI / 2;
  tail.position.set(0, 0.02, -0.24);
  group.add(body, head, tail);
  group.position.y = 0.17;
  group.visible = false;
  group.name = 'bird';
  return group;
}

/** The butterfly hint in scene 5. It flies slowly along the side path. */
export class Butterfly {
  readonly group = new THREE.Group();
  private readonly wings: THREE.Mesh[] = [];
  private time = 0;
  private path: THREE.Vector3[] = [];
  private travel = 0;

  constructor() {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(PALETTE.heartRose),
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.CircleGeometry(0.17, 8), mat);
      wing.position.x = side * 0.11;
      wing.scale.set(1, 0.72, 1);
      this.wings.push(wing);
      this.group.add(wing);
    }
    this.group.visible = false;
    this.group.name = 'butterfly';
  }

  /** Starts the flight along a path of ground points. */
  fly(points: THREE.Vector3[]): void {
    this.path = points;
    this.travel = 0;
    this.group.visible = points.length > 1;
    if (points[0]) this.group.position.copy(points[0]);
  }

  update(dt: number): void {
    if (!this.group.visible || this.path.length < 2) return;
    this.time += dt;
    for (const [i, wing] of this.wings.entries()) {
      wing.rotation.y = Math.sin(this.time * 11) * 0.9 * (i === 0 ? 1 : -1);
    }
    // Slow, never hurried.
    this.travel = Math.min(this.path.length - 1.0001, this.travel + dt * 0.28);
    const i = Math.floor(this.travel);
    const a = this.path[i];
    const b = this.path[i + 1];
    if (!a || !b) return;
    this.group.position.lerpVectors(a, b, this.travel - i);
    this.group.position.y += Math.sin(this.time * 1.6) * 0.22;
    this.group.lookAt(b.x, this.group.position.y, b.z);
  }
}

/**
 * The tree a seed grows into.
 *
 * A heart tree rises over a couple of seconds and stays; the thanks given
 * under it turns it golden. A mind tree rises faster, stands brighter, and
 * then goes, which is the only place in the chapter where the two kinds of
 * seed are told apart — and it is told by what the player sees, not by text.
 */
export class GrownTree {
  readonly group = new THREE.Group();
  private readonly tree: THREE.Group;
  private readonly glow: THREE.Mesh;
  /** The tree's own colours, kept so the golden blend stays reversible. */
  private readonly colors: { material: THREE.MeshStandardMaterial; base: THREE.Color }[] = [];
  private rise = 0;
  private fade = 1;
  private golden = -1;
  private time = 0;
  private kind: 'heart' | 'mind' = 'heart';

  constructor(seed: number, blobCount: number) {
    this.tree = buildTree(seed, blobCount);
    this.tree.scale.setScalar(0.001);
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(1.6, 14, 12), makeMoteMaterial(GOLD));
    this.glow.position.y = 3.4;
    this.glow.visible = false;
    this.group.add(this.tree, this.glow);
    this.group.visible = false;
    this.group.name = 'grownTree';

    this.tree.traverse((o) => {
      const material = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (material?.color && !this.colors.some((c) => c.material === material)) {
        this.colors.push({ material, base: material.color.clone() });
      }
    });
  }

  /**
   * @param standing whether a tree stands here at all
   * @param kind which kind of seed grew it
   * @param fade 1 fully there, 0 gone. Only a mind tree ever leaves.
   */
  setState(standing: boolean, kind: 'heart' | 'mind', fade: number): void {
    this.group.visible = standing;
    this.kind = kind;
    this.fade = Math.max(0, Math.min(1, fade));
    if (!standing) this.rise = 0;
    // A mind tree stands brighter than a heart tree, and only while it lasts.
    this.glow.visible = standing && kind === 'mind';
  }

  /** Blends the tree toward gold, for the thanks at the end of the chapter. */
  setGold(t: number): void {
    const amount = Math.max(0, Math.min(1, t));
    if (amount === this.golden) return;
    this.golden = amount;
    for (const entry of this.colors) {
      entry.material.color.copy(entry.base).lerp(GOLD, amount * 0.75);
    }
  }

  update(dt: number): void {
    if (!this.group.visible) return;
    this.time += dt;
    // A mind tree comes up fast, a heart tree takes its time.
    const speed = this.kind === 'mind' ? 1.6 : 0.5;
    this.rise = Math.min(1, this.rise + dt * speed);
    const eased = this.rise * this.rise * (3 - 2 * this.rise);
    this.tree.scale.setScalar(Math.max(0.001, eased * this.fade));
    const mat = this.glow.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.5 * this.fade * (0.8 + Math.sin(this.time * 1.4) * 0.2);
  }
}

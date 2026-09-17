import * as THREE from 'three';
import { PALETTE } from '../content/palette';
import type { BodyPoint } from '../content/chapter2';
import { makeRng } from '../core/math';
import { colorUniforms } from '../render/colorRestore';
import { worldMaterial } from '../render/materials';

function stoneMaterial(tone = 0xada79d, rim = 0.3): THREE.Material {
  return worldMaterial({ color: tone, rim });
}

/**
 * The symbol carved into a body stone, drawn in code.
 *
 * Each one is a flat shape sunk a little into the stone face and cut from a
 * darker tone, the way a chisel leaves a shadow. The shapes stay simple
 * enough to read from the path: two prints, a full circle, a downward point,
 * a ringed circle.
 */
function carvedSymbol(point: BodyPoint): THREE.Group {
  const group = new THREE.Group();
  group.name = `symbol-${point}`;
  const cut = worldMaterial({ color: 0x6b6560, rim: 0 });
  const add = (geo: THREE.BufferGeometry, x: number, y: number, rot = 0): void => {
    const mesh = new THREE.Mesh(geo, cut);
    mesh.position.set(x, y, 0);
    mesh.rotation.z = rot;
    group.add(mesh);
  };

  if (point === 'feet') {
    // Two footprints, side by side.
    for (const x of [-0.12, 0.12]) add(new THREE.CircleGeometry(0.075, 14), x, 0);
    for (const x of [-0.12, 0.12]) add(new THREE.CircleGeometry(0.04, 10), x, 0.1);
  } else if (point === 'belly') {
    add(new THREE.CircleGeometry(0.17, 22), 0, 0);
  } else if (point === 'heart') {
    // A point turned downward: the simplest mark that is not a circle.
    add(new THREE.CircleGeometry(0.19, 3), 0, 0, Math.PI / 2);
  } else {
    add(new THREE.CircleGeometry(0.1, 20), 0, 0);
    add(new THREE.RingGeometry(0.16, 0.19, 24), 0, 0);
  }
  return group;
}

/**
 * A rounded standing stone with a symbol on its face.
 *
 * The stone leans a little and is never square: these are stones somebody set
 * upright a long time ago, not posts.
 */
export function buildStandingStone(point: BodyPoint, seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = `stone-${point}`;
  const rng = makeRng(seed);
  const height = 1.9 + rng() * 0.5;

  const geo = new THREE.CapsuleGeometry(0.42, height - 0.84, 3, 10);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // Wider at the base, narrower at the top, and rough all over.
    const taper = 1 - (y / height) * 0.22;
    const rough = 0.94 + rng() * 0.14;
    pos.setXYZ(i, pos.getX(i) * taper * rough, y, pos.getZ(i) * taper * rough * 0.66);
  }
  geo.computeVertexNormals();
  const stone = new THREE.Mesh(geo, stoneMaterial(0xb3ada2));
  stone.position.y = height / 2;
  group.add(stone);

  const symbol = carvedSymbol(point);
  symbol.position.set(0, height * 0.6, 0.28);
  symbol.scale.setScalar(1.25);
  group.add(symbol);

  // A soft halo, off until this is the stone the player is being led to.
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1, 14, 12),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(PALETTE.receiveGold),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    }),
  );
  glow.name = 'stoneGlow';
  glow.position.y = height * 0.62;
  glow.scale.setScalar(1.35);
  glow.visible = false;
  group.add(glow);

  group.rotation.z = (rng() - 0.5) * 0.09;
  return group;
}

/**
 * Lights the halo on a body stone.
 *
 * Only the next stone in the order is ever lit, which is the whole of the
 * guidance in that scene: no text, no marker, just the one stone that is
 * waiting. `amount` is 0 to 1.
 */
export function setStoneGlow(stone: THREE.Object3D, amount: number): void {
  const glow = stone.getObjectByName('stoneGlow') as THREE.Mesh | undefined;
  if (!glow) return;
  const a = Math.max(0, Math.min(1, amount));
  glow.visible = a > 0.01;
  const mat = glow.material as THREE.MeshBasicMaterial;
  mat.opacity = a * 0.3;
  glow.scale.setScalar(1.25 + a * 0.25);
}

/**
 * The tall stone that hums. It is the only thing in the meadows taller than a
 * tree, so the player can find it from anywhere on the ridge path.
 */
export function buildSingingStone(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'singingStone';
  const rng = makeRng(5150);
  const height = 5.2;

  const geo = new THREE.CylinderGeometry(0.34, 0.72, height, 7, 4);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const s = 0.9 + rng() * 0.2;
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i), pos.getZ(i) * s);
  }
  geo.computeVertexNormals();
  const stone = new THREE.Mesh(geo, stoneMaterial(0xa9a398));
  stone.position.y = height / 2;
  group.add(stone);

  // Three shallow bands around it, like the grooves a long hum would wear.
  for (let i = 0; i < 3; i++) {
    const r = 0.52 - i * 0.05;
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.035, 5, 18),
      worldMaterial({ color: 0x5f5b56, rim: 0 }),
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = height * (0.32 + i * 0.16);
    group.add(band);
  }
  return group;
}

/**
 * The light well: a low ring of stones around a small pool.
 *
 * It is deliberately plain. Nothing about it should read as a reward; it is
 * there so a player who spends their light cannot end up stuck.
 */
export function buildLightWell(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'lightWell';
  const rng = makeRng(8801);

  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const r = 1.25 + rng() * 0.12;
    const size = 0.2 + rng() * 0.16;
    const geo = new THREE.IcosahedronGeometry(size, 0);
    const stone = new THREE.Mesh(geo, stoneMaterial(0xb6b0a5));
    stone.position.set(Math.cos(a) * r, size * 0.6, Math.sin(a) * r);
    stone.rotation.set(rng(), rng(), rng());
    group.add(stone);
  }

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(1.15, 26),
    worldMaterial({ color: 0x9fb6c2, rim: 0.3, roughness: 0.42 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.06;
  group.add(water);
  return group;
}

/**
 * A ring of distant mountains in soft violet.
 *
 * They sit outside the walkable ground and never move, so they cost one draw
 * call and give the meadows a horizon that is not just haze. They are drawn
 * without the grey-to-colour shader on purpose: distance already takes their
 * colour away.
 */
export function buildMountains(): THREE.Mesh {
  const rng = makeRng(31337);
  const positions: number[] = [];
  const colors: number[] = [];
  const near = new THREE.Color(PALETTE.farHillsViolet).lerp(new THREE.Color(PALETTE.skyGrey), 0.3);
  const far = new THREE.Color(PALETTE.farHillsViolet).lerp(new THREE.Color(PALETTE.skyGrey), 0.72);
  const tmp = new THREE.Color();

  // Two bands at different distances, so the horizon has depth.
  for (const [radius, count, minH, maxH, mix] of [
    [250, 26, 26, 58, 0.85],
    [195, 22, 18, 40, 0.35],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng() * 0.12;
      const span = ((Math.PI * 2) / count) * (0.9 + rng() * 0.7);
      const h = minH + rng() * (maxH - minH);
      const cx = Math.cos(a) * radius;
      const cz = Math.sin(a) * radius;
      const lx = Math.cos(a + span / 2) * radius;
      const lz = Math.sin(a + span / 2) * radius;
      const rx = Math.cos(a - span / 2) * radius;
      const rz = Math.sin(a - span / 2) * radius;
      positions.push(lx, -20, lz, rx, -20, rz, cx, h, cz);
      tmp.copy(far).lerp(near, mix);
      for (let k = 0; k < 3; k++) {
        // Barely any shading. A mountain at this distance is a silhouette;
        // contrast on it only makes it look like a building.
        const shade = k === 2 ? 1.04 : 0.95;
        colors.push(tmp.r * shade, tmp.g * shade, tmp.b * shade);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      uNight: colorUniforms.uNight,
      uNightTint: colorUniforms.uNightTint,
      uGlobalColor: colorUniforms.uGlobalColor,
      uGreyTint: colorUniforms.uGreyTint,
    },
    vertexShader: /* glsl */ `
      precision highp float;
      varying vec3 vColor;
      void main() {
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vColor;
      uniform float uNight;
      uniform vec3 uNightTint;
      uniform float uGlobalColor;
      uniform vec3 uGreyTint;
      void main() {
        // Distance already takes most of a mountain's colour, so they only
        // follow the valley's own grey and the night, never a zone.
        float lum = dot(vColor, vec3(0.299, 0.587, 0.114));
        vec3 grey = mix(vec3(lum), uGreyTint * (0.6 + lum * 0.8), 0.4) * 0.9;
        vec3 col = mix(grey, vColor, clamp(uGlobalColor + 0.35, 0.0, 1.0));
        if (uNight > 0.001) {
          col = mix(col, mix(col, uNightTint * 1.6, 0.62) * 0.34, uNight);
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  material.vertexColors = true;
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'mountains';
  mesh.frustumCulled = false;
  return mesh;
}

/** A shallow stone basin, the one spring of the meadows. */
export function buildMeadowSpring(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'meadowSpring';
  const rng = makeRng(6120);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const size = 0.26 + rng() * 0.16;
    const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), stoneMaterial(0xbab3a7));
    stone.position.set(Math.cos(a) * 1.05, size * 0.5, Math.sin(a) * 1.05);
    stone.rotation.set(rng(), rng(), rng());
    group.add(stone);
  }
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(0.95, 24),
    worldMaterial({ color: 0xa8c0cc, rim: 0.32, roughness: 0.4 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.08;
  group.add(water);
  return group;
}

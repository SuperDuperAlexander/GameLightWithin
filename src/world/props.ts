import * as THREE from 'three';
import { LAYOUT, WORLD } from '../content/chapter1';
import { PALETTE } from '../content/palette';
import { makeRng } from '../core/math';
import { applyColorRestore } from '../render/colorRestore';
import { inGap, pathCenterX, terrainHeight, valleyHalfWidth } from './terrain';

/** A material every world prop shares, so they all follow the grey-to-colour rule. */
function propMaterial(color: THREE.ColorRepresentation, flat = true): THREE.Material {
  return applyColorRestore(new THREE.MeshLambertMaterial({ color, flatShading: flat }));
}

/** A rounded rock. Rocks are soft, never sharp. */
export function buildRock(radius: number, seed: number): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  const rng = makeRng(seed);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const s = 0.72 + rng() * 0.45;
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s * 0.72, pos.getZ(i) * s);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, propMaterial(0x8e8a84));
  mesh.name = 'rock';
  return mesh;
}

/** A stylised tree: a trunk plus clustered soft blobs. */
export function buildTree(seed: number, blobCount: number): THREE.Group {
  const rng = makeRng(seed);
  const group = new THREE.Group();
  group.name = 'tree';

  const height = 3.2 + rng() * 2.6;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.3, height, 6, 1),
    propMaterial(0x6e5a48),
  );
  trunk.position.y = height / 2;
  trunk.rotation.y = rng() * Math.PI;
  group.add(trunk);

  const leafGeo = new THREE.IcosahedronGeometry(1, 1);
  const leafMat = propMaterial(
    new THREE.Color(PALETTE.deepGreen).lerp(new THREE.Color(PALETTE.growthGreen), rng()),
  );
  for (let i = 0; i < blobCount; i++) {
    const blob = new THREE.Mesh(leafGeo, leafMat);
    const r = 0.85 + rng() * 0.75;
    const a = (i / blobCount) * Math.PI * 2 + rng();
    const spread = 0.5 + rng() * 1.1;
    blob.position.set(Math.cos(a) * spread, height + 0.2 + rng() * 1.2, Math.sin(a) * spread);
    blob.scale.set(r, r * 0.82, r);
    group.add(blob);
  }
  return group;
}

/** A stone spring basin. It holds the light until the player receives it. */
export function buildSpringBasin(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'spring';

  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.42, 6, 18), propMaterial(0x9a948c));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.32;
  ring.scale.y = 0.75;
  group.add(ring);

  const bowl = new THREE.Mesh(new THREE.CircleGeometry(1.5, 20), propMaterial(0x7d7a75, false));
  bowl.rotation.x = -Math.PI / 2;
  bowl.position.y = 0.2;
  group.add(bowl);

  for (let i = 0; i < 4; i++) {
    const rock = buildRock(0.5 + (i % 2) * 0.22, 100 + i);
    const a = (i / 4) * Math.PI * 2 + 0.5;
    rock.position.set(Math.cos(a) * 2.2, 0.15, Math.sin(a) * 2.2);
    group.add(rock);
  }
  return group;
}

/**
 * The stone next to the dry spring. It carries a carved symbol that means
 * "stop here". There is no text on it.
 */
export function buildSignStone(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'signStone';

  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.1, 0.34), propMaterial(0x9c968e));
  slab.position.y = 1.05;
  slab.rotation.z = 0.05;
  group.add(slab);

  // The carved symbol: a ring with a short line beneath it, cut a little proud
  // of the face so the light catches it.
  const carveMat = propMaterial(0x6f6a63, false);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.075, 5, 16), carveMat);
  ring.position.set(0, 1.32, 0.18);
  group.add(ring);

  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.1, 0.08), carveMat);
  bar.position.set(0, 0.62, 0.18);
  group.add(bar);

  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), carveMat);
  dot.position.set(0, 1.32, 0.2);
  group.add(dot);

  const base = buildRock(0.8, 7);
  base.position.y = 0.1;
  group.add(base);
  return group;
}

/** The bridge that grows from the seed. It starts sunk in the gap and rises. */
export function buildBridge(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'bridge';
  const g = LAYOUT.gap;
  const span = g.z1 - g.z0 + 7;

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.36, span, 1, 1, 14),
    propMaterial(0xa79274, false),
  );
  const pos = deck.geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    // A gentle arch across the gap.
    const t = pos.getZ(i) / (span / 2);
    pos.setY(i, pos.getY(i) + (1 - t * t) * 0.34);
  }
  deck.geometry.computeVertexNormals();
  deck.geometry.computeBoundsTree();
  deck.name = 'bridgeDeck';
  group.add(deck);

  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.1, 0.9, 5),
        propMaterial(0x8d7a60),
      );
      const t = (i / 6) * 2 - 1;
      post.position.set(side * 1.55, 0.62 + (1 - t * t) * 0.34, t * (span / 2 - 0.6));
      group.add(post);
    }
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, span - 1, 1, 1, 12),
      propMaterial(0x8d7a60),
    );
    const rp = rail.geometry.getAttribute('position');
    for (let i = 0; i < rp.count; i++) {
      const t = rp.getZ(i) / ((span - 1) / 2);
      rp.setY(i, rp.getY(i) + (1 - t * t) * 0.34);
    }
    rail.geometry.computeVertexNormals();
    rail.position.set(side * 1.55, 1.02, 0);
    group.add(rail);
  }
  return group;
}

export interface ScatterResult {
  group: THREE.Group;
  /** Circles the player cannot walk through. */
  blockers: { x: number; z: number; radius: number }[];
}

/** Scatters trees and rocks over the valley sides, well clear of the path. */
export function scatterProps(treeBlobs: number): ScatterResult {
  const group = new THREE.Group();
  group.name = 'scatter';
  const blockers: { x: number; z: number; radius: number }[] = [];
  const rng = makeRng(20260915);

  const keepClear: { x: number; z: number; r: number }[] = [
    { x: LAYOUT.spring1.x, z: LAYOUT.spring1.z, r: 8 },
    { x: LAYOUT.spring2.x, z: LAYOUT.spring2.z, r: 9 },
    { x: LAYOUT.spring3.x, z: LAYOUT.spring3.z, r: 8 },
    { x: LAYOUT.fog.x, z: LAYOUT.fog.z, r: 11 },
    { x: LAYOUT.seedSpot.x, z: LAYOUT.seedSpot.z, r: 10 },
    { x: LAYOUT.playerStart.x, z: LAYOUT.playerStart.z, r: 9 },
    { x: LAYOUT.signStone.x, z: LAYOUT.signStone.z, r: 4 },
  ];

  const treeGeoCache: THREE.Group[] = [];
  for (let i = 0; i < 8; i++) treeGeoCache.push(buildTree(300 + i, treeBlobs));

  let placed = 0;
  for (let i = 0; i < 1400 && placed < 210; i++) {
    const z = WORLD.lengthEnd + rng() * (WORLD.lengthStart - WORLD.lengthEnd);
    const half = valleyHalfWidth(z);
    const side = rng() < 0.5 ? -1 : 1;
    // Props live on the shoulders, not on the floor the player walks.
    const x = pathCenterX(z) + side * (half * (0.72 + rng() * 0.55));
    if (Math.abs(x) > WORLD.halfWidth - 3) continue;
    if (inGap(x, z)) continue;
    if (keepClear.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) continue;

    const y = terrainHeight(x, z);
    if (rng() < 0.62) {
      const source = treeGeoCache[Math.floor(rng() * treeGeoCache.length)];
      if (!source) continue;
      const tree = source.clone();
      const s = 0.72 + rng() * 0.7;
      tree.position.set(x, y, z);
      tree.scale.setScalar(s);
      tree.rotation.y = rng() * Math.PI * 2;
      group.add(tree);
      blockers.push({ x, z, radius: 0.55 * s });
    } else {
      const r = 0.5 + rng() * 1.4;
      const rock = buildRock(r, 400 + i);
      rock.position.set(x, y + r * 0.3, z);
      rock.rotation.y = rng() * Math.PI * 2;
      group.add(rock);
      if (r > 0.9) blockers.push({ x, z, radius: r * 0.7 });
    }
    placed++;
  }
  return { group, blockers };
}

import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { LAYOUT, WORLD } from '../content/chapter1';
import { PALETTE } from '../content/palette';
import { clamp01, fbm2d, smoothstep } from '../core/math';
import { applyColorRestore } from '../render/colorRestore';

// three-mesh-bvh drives both the ground checks and the prop collision.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/** The path wanders gently through the valley instead of running straight. */
export function pathCenterX(z: number): number {
  return Math.sin(z * 0.034) * 5.5 + Math.sin(z * 0.011 + 1.3) * 4;
}

/** Half width of the walkable floor at this point along the valley. */
export function valleyHalfWidth(z: number): number {
  let w = 21 + Math.sin(z * 0.045) * 4;
  // Scene 3 opens into a wide field.
  w += 16 * Math.exp(-Math.pow((z + 45) / 16, 2));
  // Scene 4 narrows to a path just wide enough for the fog.
  w -= 14 * Math.exp(-Math.pow((z - LAYOUT.fog.z) / 11, 2));
  // Scene 5 has a side path out to the third spring.
  w += 13 * Math.exp(-Math.pow((z + 79) / 9, 2));
  return Math.max(6, w);
}

/** True inside the gap that stops the path in scene 5. */
export function inGap(x: number, z: number): boolean {
  const g = LAYOUT.gap;
  return x > g.x0 && x < g.x1 && z > g.z0 && z < g.z1;
}

/**
 * Ground height at a point. Terrain, grass and props all read this, so the
 * world stays consistent without any outside height map.
 */
export function terrainHeight(x: number, z: number): number {
  const cx = pathCenterX(z);
  const d = Math.abs(x - cx);
  const half = valleyHalfWidth(z);

  // Soft rolling floor.
  let h = fbm2d(x * 0.028 + 40, z * 0.028 + 40, 4, 7) * 2.6 - 1.3;
  h += fbm2d(x * 0.11, z * 0.11, 3, 13) * 0.45;

  // The sides rise into hills. Never a wall, always a slope, and the tops
  // round off instead of cutting to a flat plateau.
  const over = Math.max(0, d - half);
  h += softCap(over * over * 0.032 + over * 0.28, 26);

  // Far hills close the valley at each end.
  const beyond = Math.max(0, z - WORLD.lengthStart, WORLD.lengthEnd - z);
  h += softCap(beyond * beyond * 0.05 + beyond * 0.5, 22);

  // The floor is flattened where the player has to stand still.
  h = flattenAround(h, x, z, LAYOUT.spring1.x, LAYOUT.spring1.z, 7);
  h = flattenAround(h, x, z, LAYOUT.spring2.x, LAYOUT.spring2.z, 8);
  h = flattenAround(h, x, z, LAYOUT.spring3.x, LAYOUT.spring3.z, 7);
  h = flattenAround(h, x, z, LAYOUT.fog.x, LAYOUT.fog.z, 9);
  h = flattenAround(h, x, z, LAYOUT.seedSpot.x, LAYOUT.seedSpot.z, 8);
  h = flattenAround(h, x, z, LAYOUT.playerStart.x, LAYOUT.playerStart.z, 8);
  return h;
}

/** Approaches a ceiling smoothly instead of cutting off at it. */
function softCap(value: number, ceiling: number): number {
  return ceiling * (1 - Math.exp(-value / ceiling));
}

/** Eases the ground toward its centre height inside a radius. */
function flattenAround(
  h: number,
  x: number,
  z: number,
  cx: number,
  cz: number,
  radius: number,
): number {
  const d = Math.hypot(x - cx, z - cz);
  const t = 1 - smoothstep(radius * 0.4, radius, d);
  if (t <= 0) return h;
  const centre = fbm2d(cx * 0.028 + 40, cz * 0.028 + 40, 4, 7) * 2.6 - 1.3;
  return h * (1 - t) + centre * t;
}

/** How far outside the soft border a point is, 0 inside, 1 fully outside. */
export function borderAmount(x: number, z: number): number {
  const half = valleyHalfWidth(z);
  const dx = Math.abs(x - pathCenterX(z)) - half;
  const outX = clamp01(dx / WORLD.borderSoftness);
  const outZ = clamp01(Math.max(z - WORLD.lengthStart, WORLD.lengthEnd - z) / WORLD.borderSoftness);
  const hardX = clamp01((Math.abs(x) - WORLD.halfWidth) / WORLD.borderSoftness + 1);
  return Math.max(outX, outZ, hardX);
}

export interface TerrainResult {
  mesh: THREE.Mesh;
  chasm: THREE.Mesh;
  /** Meshes the ground raycast tests against. */
  colliders: THREE.Mesh[];
}

/**
 * Builds the valley as one heightfield. Triangles inside the gap are left out,
 * so the ground raycast finds nothing there and the player cannot walk across
 * until the bridge is built.
 */
export function buildTerrain(): TerrainResult {
  const minZ = WORLD.lengthEnd - 18;
  const maxZ = WORLD.lengthStart + 18;
  const width = WORLD.halfWidth * 2;
  const depth = maxZ - minZ;
  const segX = WORLD.terrainSegments;
  const segZ = Math.round(segX * (depth / width));

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const cols = segX + 1;

  const green = new THREE.Color(PALETTE.growthGreen);
  const deep = new THREE.Color(PALETTE.deepGreen);
  const violet = new THREE.Color(PALETTE.farHillsViolet);
  const tmp = new THREE.Color();

  for (let iz = 0; iz <= segZ; iz++) {
    for (let ix = 0; ix <= segX; ix++) {
      const x = -WORLD.halfWidth + (ix / segX) * width;
      const z = minZ + (iz / segZ) * depth;
      const y = terrainHeight(x, z);
      positions.push(x, y, z);

      // Light is baked into the vertex colours instead of a shadow map.
      const slope = terrainHeight(x + 1, z) - y;
      const shade = clamp01(0.5 + slope * 0.55 + fbm2d(x * 0.07, z * 0.07, 3, 21) * 0.34);
      const height01 = clamp01((y + 2) / 16);
      tmp.copy(deep).lerp(green, clamp01(1 - height01 * 1.5));
      tmp.lerp(violet, clamp01((height01 - 0.45) * 1.6));
      tmp.multiplyScalar(shade);
      colors.push(tmp.r, tmp.g, tmp.b);
    }
  }

  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const x = -WORLD.halfWidth + (ix / segX) * width;
      const z = minZ + (iz / segZ) * depth;
      // Leave the gap open. No ground means the player cannot cross it.
      if (inGap(x, z) || inGap(x + width / segX, z + depth / segZ)) continue;
      const a = iz * cols + ix;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundsTree();

  const material = applyColorRestore(
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false }),
  );
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'terrain';
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();

  return { mesh, chasm: buildChasm(), colliders: [mesh] };
}

/** A dark, soft floor far below the gap so it does not read as a hole in space. */
function buildChasm(): THREE.Mesh {
  const g = LAYOUT.gap;
  const geo = new THREE.PlaneGeometry(g.x1 - g.x0 + 8, g.z1 - g.z0 + 8, 8, 8);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, -9 + fbm2d(pos.getX(i) * 0.2, pos.getZ(i) * 0.2, 2, 5) * 2);
  }
  geo.computeVertexNormals();
  const mat = applyColorRestore(
    new THREE.MeshLambertMaterial({ color: new THREE.Color(PALETTE.blockage).multiplyScalar(0.5) }),
  );
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((g.x0 + g.x1) / 2, 0, (g.z0 + g.z1) / 2);
  return mesh;
}

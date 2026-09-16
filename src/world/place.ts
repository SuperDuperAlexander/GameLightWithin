import type * as THREE from 'three';

export interface TerrainResult {
  mesh: THREE.Mesh;
  /** Anything else the ground is made of: a chasm, a cliff, a lake bed. */
  extras: THREE.Group[];
  /** Meshes the ground raycast tests against. */
  colliders: THREE.Mesh[];
}

export interface PropsResult {
  group: THREE.Group;
  blockers: { x: number; z: number; radius: number }[];
}

/**
 * One chapter's place: its ground, its shape and what stands in it.
 *
 * Grass, props, the ground checks and the border push all read the place
 * rather than one chapter's terrain, so a second chapter is a second place
 * and not a second copy of the world.
 */
export interface Place {
  readonly name: string;
  /** Ground height at a point. */
  height(x: number, z: number): number;
  /** How far outside the soft border a point is, 0 inside, 1 fully outside. */
  border(x: number, z: number): number;
  /** The centre line of the walkable floor at this point. */
  centerX(z: number): number;
  /** Half width of the walkable floor at this point. */
  halfWidth(z: number): number;
  /** How much of a walked track there is here, 0 none to 1 bare earth. */
  pathAmount(x: number, z: number): number;
  /** True where there is no ground at all. */
  isHole(x: number, z: number): boolean;
  /** The two ends of the place along z. */
  readonly zStart: number;
  readonly zEnd: number;
  readonly halfWidthMax: number;
  buildTerrain(): TerrainResult;
  buildProps(treeBlobs: number): PropsResult;
  /**
   * The named things that stand in this place: spring basins, standing
   * stones, a well. A chapter looks them up by name to light them, move them
   * or hide them.
   */
  buildFixtures(): FixturesResult;
  /** The bridge that grows over a gap, where the place has one. */
  readonly bridge: { x: number; z: number; deckZ: number } | null;
}

export interface FixturesResult {
  group: THREE.Group;
  anchors: Map<string, THREE.Group>;
  blockers: { x: number; z: number; radius: number }[];
}

/**
 * The place the game is standing in.
 *
 * One page load is one place: a chapter change reloads the page, so this is
 * set once, before the world is built, and never changes under anyone.
 */
let active: Place | null = null;

export function setPlace(p: Place): void {
  active = p;
}

export function place(): Place {
  if (!active) throw new Error('no place set');
  return active;
}

/** Ground height at a point, from the active place. */
export function height(x: number, z: number): number {
  return place().height(x, z);
}

/** How far outside the soft border a point is, from the active place. */
export function border(x: number, z: number): number {
  return place().border(x, z);
}

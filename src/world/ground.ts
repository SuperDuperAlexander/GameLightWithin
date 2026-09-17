import * as THREE from 'three';
import { PLAYER } from '../content/chapter1';
import { height } from './place';

const RAY_HEIGHT = 60;

/**
 * Ground and collision checks. Raycasts run against the three-mesh-bvh trees on
 * the terrain and on any extra collider, for example the finished bridge.
 */
export class Ground {
  private readonly raycaster = new THREE.Raycaster();
  private readonly origin = new THREE.Vector3();
  private readonly down = new THREE.Vector3(0, -1, 0);
  private readonly colliders: THREE.Mesh[] = [];
  /** Obstacles the player cannot walk through, as circles on the floor. */
  private readonly blockers: { x: number; z: number; radius: number }[] = [];

  constructor(colliders: THREE.Mesh[] = []) {
    this.colliders.push(...colliders);
    this.raycaster.firstHitOnly = true;
    this.raycaster.far = RAY_HEIGHT * 2;
  }

  addCollider(mesh: THREE.Mesh): void {
    if (!this.colliders.includes(mesh)) this.colliders.push(mesh);
  }

  removeCollider(mesh: THREE.Mesh): void {
    const i = this.colliders.indexOf(mesh);
    if (i >= 0) this.colliders.splice(i, 1);
  }

  addBlocker(x: number, z: number, radius: number): void {
    this.blockers.push({ x, z, radius });
  }

  clearBlockers(): void {
    this.blockers.length = 0;
  }

  /** Ground height at a point, or null when there is no ground, such as the gap. */
  heightAt(x: number, z: number): number | null {
    this.origin.set(x, RAY_HEIGHT, z);
    this.raycaster.set(this.origin, this.down);
    for (const mesh of this.colliders) {
      const hits = this.raycaster.intersectObject(mesh, false);
      const hit = hits[0];
      if (hit) return hit.point.y;
    }
    return null;
  }

  /** Surface steepness at a point, as the cosine between the normal and up. */
  slopeCosAt(x: number, z: number): number {
    const h = height(x, z);
    const dx = height(x + 0.6, z) - h;
    const dz = height(x, z + 0.6) - h;
    return 1 / Math.sqrt(1 + (dx / 0.6) ** 2 + (dz / 0.6) ** 2);
  }

  /** True when the player may stand at this point. */
  canStand(x: number, z: number): boolean {
    if (this.heightAt(x, z) === null) return false;
    if (this.slopeCosAt(x, z) < PLAYER.maxSlopeCos) return false;
    for (const b of this.blockers) {
      if (Math.hypot(x - b.x, z - b.z) < b.radius + PLAYER.radius) return false;
    }
    return true;
  }

  /**
   * Moves from a point by a step, sliding along whatever blocks the way instead
   * of stopping dead. Returns the point the player ends up at.
   */
  resolveMove(fromX: number, fromZ: number, dx: number, dz: number): { x: number; z: number } {
    if (this.canStand(fromX + dx, fromZ + dz)) return { x: fromX + dx, z: fromZ + dz };
    if (this.canStand(fromX + dx, fromZ)) return { x: fromX + dx, z: fromZ };
    if (this.canStand(fromX, fromZ + dz)) return { x: fromX, z: fromZ + dz };
    return { x: fromX, z: fromZ };
  }
}

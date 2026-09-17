import * as THREE from 'three';
import { CAMERA } from '../content/chapter1';
import { clamp, damp } from '../core/math';

/**
 * A third-person camera that follows gently. It never moves suddenly.
 * With reduced motion on there is no shake at all.
 */
export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  yaw = Math.PI;
  pitch: number = CAMERA.startPitch;
  private readonly position = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private shake = 0;
  reducedMotion = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, aspect, CAMERA.near, CAMERA.far);
    this.position.set(0, 6, 12);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  rotate(yawPixels: number, pitchPixels: number): void {
    this.yaw += yawPixels * CAMERA.dragSensitivity;
    this.pitch = clamp(
      this.pitch + pitchPixels * CAMERA.dragSensitivity,
      CAMERA.minPitch,
      CAMERA.maxPitch,
    );
  }

  /** A short soft shake. Ignored when reduced motion is on. */
  addShake(amount: number): void {
    if (this.reducedMotion) return;
    this.shake = Math.min(1, this.shake + amount);
  }

  /** The direction the player walks when they press forward. */
  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
  }

  /**
   * The direction the player walks when they press right.
   *
   * This is `forward` crossed with up, which in Three.js's right-handed
   * coordinates is (-cos yaw, 0, sin yaw). It used to be the negative of that,
   * so A walked right and D walked left.
   */
  right(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw)).normalize();
  }

  /** Snaps straight to the target. Used when a scene starts. */
  snapTo(target: THREE.Vector3): void {
    this.computeDesired(target, this.position);
    this.camera.position.copy(this.position);
    this.lookAt.copy(target).setY(target.y + 1.2);
    this.camera.lookAt(this.lookAt);
  }

  update(dt: number, target: THREE.Vector3): void {
    const desired = this.computeDesired(target, new THREE.Vector3());
    this.position.x = damp(this.position.x, desired.x, CAMERA.followLambda, dt);
    this.position.y = damp(this.position.y, desired.y, CAMERA.followLambda, dt);
    this.position.z = damp(this.position.z, desired.z, CAMERA.followLambda, dt);

    this.camera.position.copy(this.position);
    if (this.shake > 0.001) {
      const s = this.shake * 0.09;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 1.4);
    }

    const look = new THREE.Vector3(target.x, target.y + 1.25, target.z);
    this.lookAt.x = damp(this.lookAt.x, look.x, CAMERA.followLambda * 1.6, dt);
    this.lookAt.y = damp(this.lookAt.y, look.y, CAMERA.followLambda * 1.6, dt);
    this.lookAt.z = damp(this.lookAt.z, look.z, CAMERA.followLambda * 1.6, dt);
    this.camera.lookAt(this.lookAt);
  }

  private computeDesired(target: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const horizontal = Math.cos(this.pitch) * CAMERA.distance;
    return out.set(
      target.x - Math.sin(this.yaw) * horizontal,
      target.y + CAMERA.height + Math.sin(this.pitch) * CAMERA.distance,
      target.z - Math.cos(this.yaw) * horizontal,
    );
  }
}

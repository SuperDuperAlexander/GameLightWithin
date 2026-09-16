import * as THREE from 'three';
import { applyColorRestore } from './colorRestore';

/**
 * The shading model for the whole world.
 *
 * Light is banded into a few steps rather than blended smoothly, and every
 * surface carries a rim light. That is what gives the world clean, readable
 * shapes instead of soft mush, and it is what most reads as a stylised outdoor
 * game rather than an untextured 3D scene.
 */

/** Four light steps: deep shade, shade, light, highlight. */
function buildGradientMap(): THREE.DataTexture {
  const steps = new Uint8Array([72, 138, 205, 255]);
  const tex = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

let gradient: THREE.DataTexture | null = null;

export function toonGradient(): THREE.DataTexture {
  gradient ??= buildGradientMap();
  return gradient;
}

export interface ToonOptions {
  color?: THREE.ColorRepresentation;
  vertexColors?: boolean;
  /** How strong the rim light is on this surface, 0 to about 1.5. */
  rim?: number;
  transparent?: boolean;
  side?: THREE.Side;
}

/**
 * A world material: banded toon light, a rim light, and the shared
 * grey-to-colour chunk.
 */
export function toonMaterial(options: ToonOptions = {}): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    color: options.color ?? 0xffffff,
    gradientMap: toonGradient(),
    vertexColors: options.vertexColors ?? false,
    transparent: options.transparent ?? false,
    side: options.side ?? THREE.FrontSide,
  });
  applyColorRestore(material, options.rim ?? 0.55);
  return material;
}

import * as THREE from 'three';
import { applyColorRestore } from './colorRestore';

/**
 * The shading model for the whole world.
 *
 * Surfaces are lit properly: a directional sun with a real shadow, plus an
 * environment map generated from the game's own sky, which is what fills the
 * shadowed side of everything with sky light instead of a flat ambient guess.
 * On top of that every surface carries a rim light so its shape reads against
 * whatever is behind it.
 *
 * Nothing here is metal and everything is rough. This is a valley of grass,
 * bark and stone.
 */

export interface WorldMaterialOptions {
  color?: THREE.ColorRepresentation;
  vertexColors?: boolean;
  /** How strong the rim light is on this surface, 0 to about 1.5. */
  rim?: number;
  roughness?: number;
  /** Surface relief. Shared across the world so it tiles consistently. */
  normalMap?: THREE.Texture | null;
  normalScale?: number;
  flatShading?: boolean;
  side?: THREE.Side;
}

/**
 * A world material: physically based, rim lit, and taking part in the
 * grey-to-colour system.
 */
export function worldMaterial(options: WorldMaterialOptions = {}): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: options.color ?? 0xffffff,
    vertexColors: options.vertexColors ?? false,
    roughness: options.roughness ?? 0.94,
    metalness: 0,
    flatShading: options.flatShading ?? false,
    side: options.side ?? THREE.FrontSide,
  });
  if (options.normalMap) {
    material.normalMap = options.normalMap;
    const s = options.normalScale ?? 0.6;
    material.normalScale = new THREE.Vector2(s, s);
  }
  applyColorRestore(material, options.rim ?? 0.55);
  return material;
}

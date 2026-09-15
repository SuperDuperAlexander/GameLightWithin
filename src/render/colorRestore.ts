import * as THREE from 'three';
import { COLOR } from '../content/chapter1';
import { PALETTE } from '../content/palette';

/**
 * The grey-to-colour system.
 *
 * Every world material shares one shader chunk and one set of uniforms. A
 * uniform array holds the restored zones as (centre x, centre z, radius,
 * strength). Inside a zone the material shows full colour. Outside it shows a
 * desaturated, slightly blue-grey version. The global value lifts the whole
 * valley into colour at the end of the chapter.
 */

export interface ColorZone {
  x: number;
  z: number;
  /** Target radius in metres. */
  radius: number;
  /** Current radius, grown over 2 to 4 seconds. */
  current: number;
  strength: number;
  growSeconds: number;
}

export const colorUniforms = {
  /** x, z, radius, strength. */
  uZones: { value: Array.from({ length: COLOR.maxZones }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uZoneCount: { value: 0 },
  uGlobalColor: { value: 0 },
  uGreyTint: { value: new THREE.Color(PALETTE.startGrey) },
};

const VERT_HEAD = /* glsl */ `
varying vec3 vLwWorld;
`;

const VERT_BODY = /* glsl */ `
vLwWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FRAG_HEAD = /* glsl */ `
varying vec3 vLwWorld;
uniform vec4 uZones[${COLOR.maxZones}];
uniform int uZoneCount;
uniform float uGlobalColor;
uniform vec3 uGreyTint;

/** How much colour this world point has, 0 grey to 1 full. */
float lwColorAmount(vec3 worldPos) {
  float amount = uGlobalColor;
  for (int i = 0; i < ${COLOR.maxZones}; i++) {
    if (i >= uZoneCount) break;
    vec4 zone = uZones[i];
    if (zone.z <= 0.001) continue;
    float d = distance(worldPos.xz, zone.xy);
    // Full colour in the middle, soft falloff at the rim.
    float inside = 1.0 - smoothstep(zone.z * 0.55, zone.z, d);
    amount = max(amount, inside * zone.w);
  }
  return clamp(amount, 0.0, 1.0);
}
`;

const FRAG_BODY = /* glsl */ `
{
  float lwAmount = lwColorAmount(vLwWorld);
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  // The grey side is desaturated and pulled slightly toward blue-grey.
  vec3 greyed = mix(vec3(lum), uGreyTint * (0.6 + lum * 0.8), 0.52);
  diffuseColor.rgb = mix(greyed, diffuseColor.rgb, lwAmount);
}
`;

/**
 * Makes a material take part in the grey-to-colour system.
 * Call this on every world material.
 */
export function applyColorRestore(material: THREE.Material): THREE.Material {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uZones = colorUniforms.uZones;
    shader.uniforms.uZoneCount = colorUniforms.uZoneCount;
    shader.uniforms.uGlobalColor = colorUniforms.uGlobalColor;
    shader.uniforms.uGreyTint = colorUniforms.uGreyTint;

    shader.vertexShader =
      VERT_HEAD +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' + VERT_BODY,
      );
    shader.fragmentShader =
      FRAG_HEAD +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n' + FRAG_BODY,
      );
  };
  // Materials with the same program must not be shared with untouched ones.
  material.customProgramCacheKey = () => 'lw-color-restore';
  return material;
}

/** Holds the live zones and grows them smoothly. */
export class ColorRestoreState {
  readonly zones: ColorZone[] = [];
  globalColor = 0;
  private globalTarget = 0;
  private globalSeconds = 1;
  reducedMotion = false;

  private get motionFactor(): number {
    return this.reducedMotion ? COLOR.reducedMotionFactor : 1;
  }

  addZone(x: number, z: number, radius: number, strength = 1): void {
    if (this.zones.length >= COLOR.maxZones) {
      // Drop the oldest zone. The global value carries the valley at the end anyway.
      this.zones.shift();
    }
    const spread = COLOR.zoneGrowSecondsMax - COLOR.zoneGrowSecondsMin;
    const grow = COLOR.zoneGrowSecondsMin + Math.random() * spread;
    this.zones.push({ x, z, radius, current: 0, strength, growSeconds: grow * this.motionFactor });
  }

  /** Animates the whole valley to full colour. */
  setGlobalTarget(value: number, seconds: number): void {
    this.globalTarget = value;
    this.globalSeconds = Math.max(0.001, seconds * this.motionFactor);
  }

  update(dt: number): void {
    for (const zone of this.zones) {
      if (zone.current < zone.radius) {
        zone.current = Math.min(zone.radius, zone.current + (zone.radius / zone.growSeconds) * dt);
      }
    }
    if (this.globalColor !== this.globalTarget) {
      const step = dt / this.globalSeconds;
      this.globalColor =
        this.globalColor < this.globalTarget
          ? Math.min(this.globalTarget, this.globalColor + step)
          : Math.max(this.globalTarget, this.globalColor - step);
    }
    this.writeUniforms();
  }

  private writeUniforms(): void {
    const arr = colorUniforms.uZones.value;
    for (let i = 0; i < COLOR.maxZones; i++) {
      const zone = this.zones[i];
      if (zone) arr[i]?.set(zone.x, zone.z, zone.current, zone.strength);
      else arr[i]?.set(0, 0, 0, 0);
    }
    colorUniforms.uZoneCount.value = Math.min(this.zones.length, COLOR.maxZones);
    colorUniforms.uGlobalColor.value = this.globalColor;
  }

  reset(): void {
    this.zones.length = 0;
    this.globalColor = 0;
    this.globalTarget = 0;
    this.writeUniforms();
  }
}

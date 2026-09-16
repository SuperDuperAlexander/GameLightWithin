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
  /** How much darker the grey side is than the restored one. */
  uGreyDim: { value: 0.8 },
  /** The colour of the rim light. It warms as the valley returns to colour. */
  uRimColor: { value: new THREE.Color(PALETTE.skyGrey) },
  /**
   * 0 day, 1 night. Chapter 2's last scene turns this up.
   *
   * Moonlight is not darkness. Night here keeps the colours the meadows have
   * won and cools them toward the night blue, so a restored meadow still
   * reads as restored under the moon.
   */
  uNight: { value: 0 },
  uNightTint: { value: new THREE.Color(PALETTE.night) },
};

const VERT_HEAD = /* glsl */ `
varying vec3 vLwWorld;
`;

const VERT_BODY = /* glsl */ `
vLwWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FRAG_HEAD = /* glsl */ `
varying vec3 vLwWorld;
uniform float uRimStrength;
uniform vec3 uRimColor;
uniform vec4 uZones[${COLOR.maxZones}];
uniform int uZoneCount;
uniform float uGlobalColor;
uniform vec3 uGreyTint;
uniform float uGreyDim;
uniform float uNight;
uniform vec3 uNightTint;

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
  vec3 greyed = mix(vec3(lum), uGreyTint * (0.6 + lum * 0.8), 0.4);
  // Colour alone is not a safe cue, so a restored area must also read as
  // brighter to someone who cannot see the colour change. The blue-grey tint
  // lifts dark colours, which would put the grey side *above* the restored one,
  // so the grey side is held to a fixed fraction of the original brightness.
  // It is only ever pulled down, never up, so pale areas keep their soft look.
  float greyLum = dot(greyed, vec3(0.299, 0.587, 0.114));
  greyed *= min(1.0, (lum * uGreyDim) / max(greyLum, 1e-4));
  diffuseColor.rgb = mix(greyed, diffuseColor.rgb, lwAmount);
  // Night: cooler and dimmer, but never flat. The colour that is there stays
  // there, so a moonlit meadow is a moonlit meadow and not a grey one.
  if (uNight > 0.001) {
    vec3 moonlit = mix(diffuseColor.rgb, uNightTint * 2.2, 0.38) * 0.92;
    diffuseColor.rgb = mix(diffuseColor.rgb, moonlit, uNight);
  }
}
`;

/**
 * A rim light, added after the surface has been lit.
 *
 * It is what separates a shape from what is behind it. Without it an untextured
 * world reads as flat blocks; with it every hill, tree and rock keeps a clear
 * edge against the sky.
 */
const FRAG_RIM = /* glsl */ `
{
  vec3 lwN = normalize(normal);
  vec3 lwV = normalize(vViewPosition);
  float lwRim = 1.0 - clamp(dot(lwN, lwV), 0.0, 1.0);
  lwRim = pow(lwRim, 2.6) * uRimStrength;
  // Brighter where the surface also faces up, so the light reads as coming
  // from the sky rather than from the camera.
  lwRim *= 0.45 + 0.55 * clamp(lwN.y * 0.5 + 0.5, 0.0, 1.0);
  gl_FragColor.rgb += uRimColor * lwRim;
}
`;

/**
 * Makes a material take part in the grey-to-colour system, and gives it a rim
 * light. Call this on every world material.
 */
export function applyColorRestore(material: THREE.Material, rim = 0): THREE.Material {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uZones = colorUniforms.uZones;
    shader.uniforms.uZoneCount = colorUniforms.uZoneCount;
    shader.uniforms.uGlobalColor = colorUniforms.uGlobalColor;
    shader.uniforms.uGreyTint = colorUniforms.uGreyTint;
    shader.uniforms.uGreyDim = colorUniforms.uGreyDim;
    shader.uniforms.uRimColor = colorUniforms.uRimColor;
    shader.uniforms.uRimStrength = { value: rim };

    shader.vertexShader =
      VERT_HEAD +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' + VERT_BODY,
      );

    let frag =
      FRAG_HEAD +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n' + FRAG_BODY,
      );
    // The rim goes on after the lighting but before the distance haze, so a
    // far-off hill cannot rim-light its way back out of the mist.
    if (rim > 0 && frag.includes('#include <fog_fragment>')) {
      frag = frag.replace('#include <fog_fragment>', FRAG_RIM + '\n#include <fog_fragment>');
    }
    shader.fragmentShader = frag;
  };
  // Materials with the same program must not be shared with untouched ones.
  material.customProgramCacheKey = () => `lw-color-restore-${rim > 0 ? 'rim' : 'flat'}`;
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

import * as THREE from 'three';
import { PALETTE } from '../content/palette';
import { colorUniforms } from '../render/colorRestore';

/**
 * A large sky dome with a painted gradient and soft cloud strokes from noise.
 * It warms up as the valley returns to colour.
 */
export function buildSky(strokes: number): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uGlobalColor: colorUniforms.uGlobalColor,
      uTime: { value: 0 },
      // Colours are THREE.Color, so they arrive in linear light like the rest
      // of the scene. The final pass converts the whole picture to sRGB.
      uGreySky: { value: new THREE.Color(PALETTE.skyGrey) },
      uWarmSky: { value: new THREE.Color(PALETTE.warmSky) },
      uViolet: { value: new THREE.Color(PALETTE.farHillsViolet) },
      uSun: { value: new THREE.Color(PALETTE.sun) },
      uStrokes: { value: strokes },
      /** 0 day, 1 night. Chapter 2 turns this up for its last scene. */
      uNight: { value: 0 },
      /** 0 morning, 1 evening. Moves the sun and warms the light. */
      uDay: { value: 0 },
      uNightSky: { value: new THREE.Color(PALETTE.night) },
      uStars: { value: new THREE.Color(PALETTE.stars) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vDir;
      uniform float uGlobalColor;
      uniform float uTime;
      uniform vec3 uGreySky;
      uniform vec3 uWarmSky;
      uniform vec3 uViolet;
      uniform vec3 uSun;
      uniform float uStrokes;
      uniform float uNight;
      uniform float uDay;
      uniform vec3 uNightSky;
      uniform vec3 uStars;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { s += noise(p) * a; p *= 2.03; a *= 0.5; }
        return s;
      }

      void main() {
        float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
        // Painted gradient: darker at the top, pale at the horizon.
        vec3 grey = mix(uGreySky * 0.82, uGreySky * 1.04, pow(h, 0.7));
        vec3 warm = mix(uWarmSky, uViolet * 1.05, pow(h, 1.3));
        vec3 sky = mix(grey, warm, uGlobalColor);
        // The day runs from morning to evening: the horizon warms and the
        // dome above it deepens, without the whole sky changing hue at once.
        sky = mix(sky, mix(uWarmSky * 1.06, uViolet * 0.86, pow(h, 0.9)), uDay * 0.55);

        // Soft cloud strokes. Strokes are stretched sideways like brush marks.
        vec2 p = vec2(atan(vDir.z, vDir.x) * 1.6, vDir.y * 3.4);
        // Two layers: broad banks that drift, and finer strokes on top of them.
        float bank = fbm(p * vec2(0.55, 1.5) + vec2(uTime * 0.004, 0.0));
        float detail = fbm(p * vec2(1.6, 3.2) + vec2(uTime * 0.011, 0.0));
        float clouds = bank * 0.65 + detail * 0.35;
        clouds = smoothstep(0.44, 0.78, clouds) * smoothstep(0.0, 0.35, h) * (uStrokes / 12.0 * 0.6 + 0.5);
        vec3 cloudCol = mix(vec3(0.84), mix(vec3(1.0), uSun, 0.28), uGlobalColor);
        sky = mix(sky, cloudCol, clouds * 0.66);

        // One soft sun. It sinks toward the horizon as the day runs on.
        vec3 sunDir = normalize(vec3(0.45, mix(0.42, 0.08, uDay), -0.79));
        float d = max(dot(vDir, sunDir), 0.0);
        sky += uSun * pow(d, 40.0) * (0.12 + uGlobalColor * 0.4) * (1.0 - uNight);
        sky += uSun * pow(d, 6.0) * 0.035 * (0.3 + uGlobalColor) * (1.0 - uNight);

        if (uNight > 0.001) {
          // Night: one deep blue, darkest overhead, with stars above the haze.
          vec3 night = mix(uNightSky * 1.35, uNightSky * 0.7, pow(h, 0.8));
          // Stars are points of a coarse hash, so they hold still while the
          // clouds drift. They fade out near the horizon, where the haze is.
          vec2 sp = vDir.xz / max(abs(vDir.y) + 0.15, 0.15) * 5.0;
          vec2 cell = floor(sp * 2.2);
          // Only about one cell in eight holds a star, and the star sits
          // somewhere inside it, so the sky is not a regular grid of dots.
          float pick = hash(cell);
          float star = 0.0;
          if (pick > 0.86) {
            vec2 at = vec2(hash(cell + 3.1), hash(cell + 7.7));
            // Not named d: the sun's d is still in scope, and a shadowed
            // variable is the kind of thing a stricter driver refuses.
            float inCell = length(fract(sp * 2.2) - at);
            star = smoothstep(0.09, 0.0, inCell) * (0.5 + hash(cell + 11.3));
          }
          star *= smoothstep(0.05, 0.4, h);
          night += uStars * star * 1.5;
          // A moon, opposite where the sun went down.
          vec3 moonDir = normalize(vec3(-0.35, 0.5, 0.82));
          // The moon is a disc measured by angle, not a power falloff. A
          // pow() with an exponent in the hundreds is at the mercy of the
          // driver: some clamp it, some return inf, and an inf here turns the
          // whole sky black. An angle and two smoothsteps cannot do that.
          float ang = acos(clamp(dot(vDir, moonDir), -1.0, 1.0));
          night += uStars * (1.0 - smoothstep(0.030, 0.038, ang)) * 1.4;
          night += uStars * (1.0 - smoothstep(0.0, 0.45, ang)) * 0.05;
          sky = mix(sky, night, uNight);
        }

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(320, 32, 20), material);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  return mesh;
}

export function updateSky(sky: THREE.Mesh, time: number): void {
  const mat = sky.material as THREE.ShaderMaterial;
  const u = mat.uniforms.uTime;
  if (u) u.value = time;
}

/** 0 day, 1 night. Everything else in the sky follows this one number. */
export function setSkyNight(sky: THREE.Mesh, night: number): void {
  const mat = sky.material as THREE.ShaderMaterial;
  const u = mat.uniforms.uNight;
  if (u) u.value = Math.max(0, Math.min(1, night));
}

/** 0 morning, 1 evening. */
export function setSkyDay(sky: THREE.Mesh, day: number): void {
  const mat = sky.material as THREE.ShaderMaterial;
  const u = mat.uniforms.uDay;
  if (u) u.value = Math.max(0, Math.min(1, day));
}

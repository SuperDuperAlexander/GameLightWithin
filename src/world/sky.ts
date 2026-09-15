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
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      varying vec3 vDir;
      uniform float uGlobalColor;
      uniform float uTime;
      uniform vec3 uGreySky;
      uniform vec3 uWarmSky;
      uniform vec3 uViolet;
      uniform vec3 uSun;
      uniform float uStrokes;

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

        // Soft cloud strokes. Strokes are stretched sideways like brush marks.
        vec2 p = vec2(atan(vDir.z, vDir.x) * 1.6, vDir.y * 3.4);
        float clouds = fbm(p * vec2(1.0, 2.6) + vec2(uTime * 0.006, 0.0));
        clouds = smoothstep(0.55, 0.92, clouds) * smoothstep(0.02, 0.45, h) * (uStrokes / 12.0 * 0.5 + 0.3);
        vec3 cloudCol = mix(vec3(0.78), mix(vec3(0.92), uSun, 0.35), uGlobalColor);
        sky = mix(sky, cloudCol, clouds * 0.45);

        // One soft sun, warmer as colour returns.
        vec3 sunDir = normalize(vec3(0.45, 0.42, -0.79));
        float d = max(dot(vDir, sunDir), 0.0);
        sky += uSun * pow(d, 40.0) * (0.12 + uGlobalColor * 0.4);
        sky += uSun * pow(d, 6.0) * 0.035 * (0.3 + uGlobalColor);

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

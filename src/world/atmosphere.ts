import * as THREE from 'three';
import { PALETTE } from '../content/palette';
import { makeRng } from '../core/math';
import { colorUniforms } from '../render/colorRestore';

/** Side of the box of motes that follows the camera, in metres. */
const BOX = 44;

/**
 * Pollen and dust drifting in the air.
 *
 * Empty air is the thing that most gives away a made world: light with nothing
 * in it looks like light in a vacuum. A few hundred slow specks catching the
 * sun are cheap and do more for the feeling of a real outdoor place than
 * almost anything else on screen.
 *
 * The specks live in a box that repeats around the camera, so the player never
 * walks out of the weather and nothing has to be moved on the processor.
 */
export function buildAtmosphere(count: number): THREE.Points {
  const rng = makeRng(5150);
  const positions = new Float32Array(count * 3);
  const params = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = rng() * BOX;
    positions[i * 3 + 1] = rng() * BOX;
    positions[i * 3 + 2] = rng() * BOX;
    // size, rise speed, phase
    params[i * 3] = 0.5 + rng() * 1.6;
    params[i * 3 + 1] = 0.12 + rng() * 0.4;
    params[i * 3 + 2] = rng() * Math.PI * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aParams', new THREE.BufferAttribute(params, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uAnchor: { value: new THREE.Vector3() },
      uGlobalColor: colorUniforms.uGlobalColor,
      uCold: { value: new THREE.Color(PALETTE.skyGrey) },
      uWarm: { value: new THREE.Color(PALETTE.receiveGold) },
      uScale: { value: 1 },
    },
    vertexShader: /* glsl */ `
      precision highp float;
      attribute vec3 aParams;
      uniform float uTime;
      uniform vec3 uAnchor;
      uniform float uScale;
      varying float vFade;
      varying float vPhase;

      void main() {
        // Drift, then wrap the whole box around the camera.
        vec3 p = position;
        p.y += uTime * aParams.y;
        p.x += sin(uTime * 0.21 + aParams.z) * 1.4;
        p.z += cos(uTime * 0.17 + aParams.z) * 1.4;

        float box = ${BOX.toFixed(1)};
        vec3 rel = mod(p - uAnchor + box * 0.5, box) - box * 0.5;
        vec3 world = uAnchor + rel;

        vec4 view = viewMatrix * vec4(world, 1.0);
        // Fade in at the far edge of the box and out very close to the eye, so
        // nothing pops in and nothing sits on the lens.
        float d = length(view.xyz);
        vFade = smoothstep(box * 0.5, box * 0.32, d) * smoothstep(0.6, 3.0, d);
        vPhase = aParams.z;
        gl_PointSize = aParams.x * uScale * (14.0 / max(d, 0.6));
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      // Must match the vertex stage: uTime is declared in both, and a uniform
      // with two different precisions fails to link.
      precision highp float;
      varying float vFade;
      varying float vPhase;
      uniform float uGlobalColor;
      uniform vec3 uCold;
      uniform vec3 uWarm;
      uniform float uTime;

      void main() {
        // A soft round speck, brightest in the middle.
        float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
        float a = (1.0 - smoothstep(0.25, 1.0, d)) * vFade;
        if (a < 0.01) discard;
        // Each speck turns slowly in the light, so the air never looks static.
        float twinkle = 0.55 + 0.45 * sin(uTime * 1.3 + vPhase * 3.1);
        vec3 col = mix(uCold, uWarm, uGlobalColor * 0.85);
        gl_FragColor = vec4(col, a * twinkle * 0.5);
      }
    `,
  });

  const points = new THREE.Points(geo, material);
  points.name = 'atmosphere';
  points.frustumCulled = false;
  points.renderOrder = 3;
  return points;
}

export function updateAtmosphere(points: THREE.Points, time: number, anchor: THREE.Vector3): void {
  const mat = points.material as THREE.ShaderMaterial;
  const t = mat.uniforms.uTime;
  if (t) t.value = time;
  const a = mat.uniforms.uAnchor;
  if (a) (a.value as THREE.Vector3).copy(anchor);
}

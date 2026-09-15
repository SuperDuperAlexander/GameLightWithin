import * as THREE from 'three';
import { LAYOUT, WORLD } from '../content/chapter1';
import { PALETTE } from '../content/palette';
import { makeRng } from '../core/math';
import { colorUniforms } from '../render/colorRestore';
import { inGap, pathCenterX, terrainHeight, valleyHalfWidth } from './terrain';

/**
 * Grass and flowers as camera-facing cards with a brush-stroke alpha made in
 * the shader. The cards bend in the wind, and bend harder near the fog.
 */
export function buildGrass(count: number): THREE.Mesh {
  const rng = makeRng(77001);
  const base = new THREE.PlaneGeometry(1, 1, 1, 2);
  base.translate(0, 0.5, 0);

  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.attributes.position = base.attributes.position as THREE.BufferAttribute;
  geo.attributes.uv = base.attributes.uv as THREE.BufferAttribute;

  const offsets = new Float32Array(count * 3);
  const params = new Float32Array(count * 4);
  let placed = 0;

  for (let i = 0; i < count * 6 && placed < count; i++) {
    const z = WORLD.lengthEnd + rng() * (WORLD.lengthStart - WORLD.lengthEnd);
    const half = valleyHalfWidth(z);
    const x = pathCenterX(z) + (rng() * 2 - 1) * half * 1.15;
    if (Math.abs(x) > WORLD.halfWidth - 2) continue;
    if (inGap(x, z)) continue;
    const y = terrainHeight(x, z);
    offsets[placed * 3] = x;
    offsets[placed * 3 + 1] = y;
    offsets[placed * 3 + 2] = z;
    // width, height, kind (0 grass, 1 flower), phase
    const flower = rng() < 0.13 ? 1 : 0;
    params[placed * 4] = flower ? 0.13 + rng() * 0.08 : 0.09 + rng() * 0.09;
    params[placed * 4 + 1] = flower ? 0.3 + rng() * 0.2 : 0.34 + rng() * 0.46;
    params[placed * 4 + 2] = flower;
    params[placed * 4 + 3] = rng() * Math.PI * 2;
    placed++;
  }

  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets.slice(0, placed * 3), 3));
  geo.setAttribute('aParams', new THREE.InstancedBufferAttribute(params.slice(0, placed * 4), 4));
  geo.instanceCount = placed;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -50), 260);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    alphaToCoverage: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uZones: colorUniforms.uZones,
      uZoneCount: colorUniforms.uZoneCount,
      uGlobalColor: colorUniforms.uGlobalColor,
      uGreyTint: colorUniforms.uGreyTint,
      uGreyDim: colorUniforms.uGreyDim,
      uGreen: { value: new THREE.Color(PALETTE.growthGreen) },
      uDeep: { value: new THREE.Color(PALETTE.deepGreen) },
      uRose: { value: new THREE.Color(PALETTE.heartRose) },
      uGold: { value: new THREE.Color(PALETTE.receiveGold) },
      /** Fog centre and strength, so grass bends away from the blockage. */
      uWind: { value: new THREE.Vector4(LAYOUT.fog.x, LAYOUT.fog.z, 0, 0) },
      uFadeStart: { value: 48 },
      uFadeEnd: { value: 64 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aOffset;
      attribute vec4 aParams;
      uniform float uTime;
      uniform vec4 uWind;
      uniform float uFadeStart;
      uniform float uFadeEnd;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vKind;
      varying float vPhase;

      void main() {
        vUv = uv;
        vKind = aParams.z;
        vPhase = aParams.w;

        // Grass far from the camera collapses to nothing. Distant cards are
        // almost invisible anyway, and they are what costs the most to draw.
        float camDist = distance(cameraPosition.xz, aOffset.xz);
        float near = 1.0 - smoothstep(uFadeStart, uFadeEnd, camDist);
        if (near <= 0.001) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }

        // Camera-facing card.
        vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
        vec3 up = vec3(0.0, 1.0, 0.0);
        vec3 local = (right * position.x * aParams.x + up * position.y * aParams.y) * near;

        // Each blade leans a little in its own direction.
        float lean = sin(vPhase * 3.7) * 0.5;
        float bend = uv.y * uv.y;
        local.x += lean * bend * aParams.y;
        float sway = sin(uTime * 1.35 + vPhase + aOffset.x * 0.35) * 0.12;
        // A soft wind pushes out from the fog while the player feels it.
        vec2 away = aOffset.xz - uWind.xy;
        float d = length(away);
        float push = uWind.z * smoothstep(uWind.w, 0.0, d);
        sway += push * 0.42;
        local.xz += normalize(away + vec2(0.001)) * push * bend * aParams.y * 0.5;
        local.x += sway * bend * aParams.y;

        vec3 world = aOffset + local;
        vWorld = world;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vKind;
      varying float vPhase;
      uniform vec4 uZones[8];
      uniform int uZoneCount;
      uniform float uGlobalColor;
      uniform vec3 uGreyTint;
      uniform float uGreyDim;
      uniform vec3 uGreen;
      uniform vec3 uDeep;
      uniform vec3 uRose;
      uniform vec3 uGold;

      float lwColorAmount(vec3 p) {
        float amount = uGlobalColor;
        for (int i = 0; i < 8; i++) {
          if (i >= uZoneCount) break;
          vec4 zone = uZones[i];
          if (zone.z <= 0.001) continue;
          float d = distance(p.xz, zone.xy);
          amount = max(amount, (1.0 - smoothstep(zone.z * 0.55, zone.z, d)) * zone.w);
        }
        return clamp(amount, 0.0, 1.0);
      }

      void main() {
        // Procedural brush-stroke alpha. The stroke is widest a third of the
        // way up and closes to a point at the tip, like a painted blade.
        float y = vUv.y;
        float taper = pow(1.0 - y, 0.7) * (0.45 + 0.35 * sin(vPhase));
        float edge = abs(vUv.x - 0.5) * 2.0;
        float blade = smoothstep(taper, taper * 0.35, edge) * smoothstep(1.0, 0.86, y);
        // A flower is a soft round stroke on a thin stem.
        float head = 1.0 - smoothstep(0.2, 0.46, distance(vUv, vec2(0.5, 0.76)));
        float stem = smoothstep(0.22, 0.06, edge) * step(y, 0.76);
        float alpha = mix(blade, max(head, stem), vKind);
        // A little noise so the stroke edge is not perfectly clean.
        alpha *= 0.72 + 0.46 * fract(sin(vPhase + y * 9.0) * 43758.5453);
        if (alpha < 0.5) discard;

        vec3 col = mix(uDeep, uGreen, vUv.y * 0.8 + 0.2);
        vec3 petal = mix(uRose, uGold, fract(vPhase * 0.37));
        col = mix(col, petal * 0.55, vKind * head);
        // Light is baked in, the same way the terrain bakes it into its
        // vertex colours: darker at the root, a soft lift toward the sun.
        col *= 0.4 + vUv.y * 0.44;
        col *= 0.72 + 0.56 * fract(sin(vPhase * 12.9898) * 43758.5453);
        vec3 sunDir = normalize(vec3(0.45, 0.42, -0.79));
        col *= 0.78 + 0.34 * max(dot(normalize(vec3(0.0, 1.0, 0.0)), sunDir), 0.0);

        float amount = lwColorAmount(vWorld);
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        // Same rule as every other world material: the grey side is held below
        // the restored one in brightness, so the change reads without colour.
        vec3 greyed = mix(vec3(lum), uGreyTint * (0.6 + lum * 0.8), 0.4);
        float greyLum = dot(greyed, vec3(0.299, 0.587, 0.114));
        greyed *= min(1.0, (lum * uGreyDim) / max(greyLum, 1e-4));
        gl_FragColor = vec4(mix(greyed, col, amount), 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'grass';
  mesh.frustumCulled = false;
  // The full count is kept so a quality change can raise the density again.
  mesh.userData.maxInstances = placed;
  return mesh;
}

/**
 * Sets how much grass is drawn, without rebuilding anything.
 *
 * The cards were placed in a random order, so drawing the first `count` of
 * them thins the meadow evenly instead of clearing one end of the valley.
 * This is what makes a quality change take effect during play.
 */
export function setGrassDensity(grass: THREE.Mesh, count: number, fadeMetres: number): void {
  const geo = grass.geometry as THREE.InstancedBufferGeometry;
  const max = (grass.userData.maxInstances as number | undefined) ?? geo.instanceCount;
  geo.instanceCount = Math.max(0, Math.min(max, Math.round(count)));
  const mat = grass.material as THREE.ShaderMaterial;
  const start = mat.uniforms.uFadeStart;
  const end = mat.uniforms.uFadeEnd;
  if (start) start.value = fadeMetres;
  if (end) end.value = fadeMetres * 1.35;
}

/** Drives the sway and the wind that blows out of the fog. */
export function updateGrass(
  grass: THREE.Mesh,
  time: number,
  windStrength: number,
  windRadius: number,
  fogX: number,
  fogZ: number,
): void {
  const mat = grass.material as THREE.ShaderMaterial;
  const t = mat.uniforms.uTime;
  if (t) t.value = time;
  const w = mat.uniforms.uWind;
  if (w) (w.value as THREE.Vector4).set(fogX, fogZ, windStrength, windRadius);
}

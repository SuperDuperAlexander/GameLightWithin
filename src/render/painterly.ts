import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { QualitySettings } from '../core/quality';

/**
 * A Kuwahara-style filter. It smooths areas into brush-like patches while it
 * keeps the edges, which gives the painted look.
 *
 * The kernel keeps a fixed tap count and widens its step instead, so a lower
 * quality tier runs the filter at a coarser resolution without costing more.
 */
const KuwaharaShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    /** Sampling step in pixels. Larger means bigger brush patches. */
    uStep: { value: 1.3 },
    /** 0 turns the filter off, 1 is the full painted look. */
    uAmount: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    uniform float uStep;
    uniform float uAmount;

    // Four overlapping sectors of a 5 by 5 window. The sector with the lowest
    // variance wins, so flat areas smooth out and edges stay sharp. The window
    // is kept small and the step is widened instead, because the cost grows
    // with the square of the window but only the step sets the patch size.
    void sector(int sx, int sy, out vec3 mean, out float variance) {
      vec3 sum = vec3(0.0);
      vec3 sumSq = vec3(0.0);
      const int R = 2;
      for (int j = 0; j <= R; j++) {
        for (int i = 0; i <= R; i++) {
          vec2 off = vec2(float(i * sx), float(j * sy)) * uTexel * uStep;
          vec3 c = texture2D(tDiffuse, vUv + off).rgb;
          sum += c;
          sumSq += c * c;
        }
      }
      float n = float((R + 1) * (R + 1));
      mean = sum / n;
      vec3 v = abs(sumSq / n - mean * mean);
      variance = v.r + v.g + v.b;
    }

    void main() {
      vec3 original = texture2D(tDiffuse, vUv).rgb;

      vec3 m0, m1, m2, m3;
      float v0, v1, v2, v3;
      sector(-1, -1, m0, v0);
      sector( 1, -1, m1, v1);
      sector(-1,  1, m2, v2);
      sector( 1,  1, m3, v3);

      vec3 best = m0;
      float bestV = v0;
      if (v1 < bestV) { bestV = v1; best = m1; }
      if (v2 < bestV) { bestV = v2; best = m2; }
      if (v3 < bestV) { bestV = v3; best = m3; }

      gl_FragColor = vec4(mix(original, best, uAmount), 1.0);
    }
  `,
};

/**
 * The last pass: a subtle procedural paper grain, soft edge darkening
 * (a vignette) and the soft screen darkening used inside the fog.
 */
const PaperShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uGrain: { value: 0.035 },
    uVignette: { value: 0.34 },
    uExposure: { value: 0.85 },
    /** 0 normal, 1 fully darkened. Used when the player stands inside the fog. */
    uDarken: { value: 0 },
    uResolution: { value: new THREE.Vector2(1280, 720) },
  },
  vertexShader: KuwaharaShader.vertexShader,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uExposure;
    uniform float uDarken;
    uniform vec2 uResolution;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    // Tone mapping, then the linear to sRGB conversion. Both belong here
    // rather than in the materials: the sky, the grass and the pollen are raw
    // shaders that would otherwise be left out and drift away from everything
    // else. ACES keeps highlights from clipping to flat white.
    vec3 aces(vec3 x) {
      const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    vec3 toSRGB(vec3 c) {
      c = clamp(c, 0.0, 1.0);
      return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, step(c, vec3(0.0031308)));
    }

    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;

      // Everything above this point is in linear light.
      col = toSRGB(aces(col * uExposure));

      // Paper grain: a fixed fibre pattern plus a very slow drift, so the
      // picture looks like paint on paper and never like video noise.
      vec2 p = vUv * uResolution;
      float fibre = hash(floor(p)) * 0.55 + hash(floor(p * 0.21) + 11.0) * 0.45;
      float drift = hash(floor(p * 0.5) + floor(uTime * 1.5)) * 0.2;
      col += (fibre + drift - 0.62) * uGrain;

      // Soft edge darkening.
      float d = distance(vUv, vec2(0.5));
      col *= 1.0 - smoothstep(0.32, 0.86, d) * uVignette;

      // Inside the fog the screen darkens softly. Never to black.
      vec3 dim = mix(col, col * 0.42 + vec3(0.03, 0.035, 0.055), uDarken);
      col = mix(col, dim, 1.0);
      col *= 1.0 - uDarken * 0.18;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

export class PainterlyRenderer {
  readonly composer: EffectComposer;
  private readonly kuwahara: ShaderPass;
  private readonly paper: ShaderPass;
  private renderScale = 1;
  private width = 1;
  private height = 1;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    enabled: boolean,
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.kuwahara = new ShaderPass(KuwaharaShader);
    this.kuwahara.enabled = enabled;
    this.composer.addPass(this.kuwahara);

    this.paper = new ShaderPass(PaperShader);
    this.paper.renderToScreen = true;
    this.composer.addPass(this.paper);
  }

  setCamera(camera: THREE.Camera): void {
    const pass = this.composer.passes[0];
    if (pass instanceof RenderPass) pass.camera = camera;
  }

  applyQuality(q: QualitySettings): void {
    // A lower tier widens the brush step and drops the post-processing
    // resolution, which is where most of the cost sits.
    const step = q.paintScale >= 1 ? 1.9 : q.paintScale >= 0.75 ? 2.8 : 3.6;
    const u = this.kuwahara.uniforms.uStep;
    if (u) u.value = step;
    this.renderScale = q.paintScale >= 1 ? 1 : q.paintScale >= 0.75 ? 0.85 : 0.5;
    this.setSize(this.width, this.height);
  }

  setPaintEnabled(on: boolean): void {
    this.kuwahara.enabled = on;
  }

  /** 0 normal, 1 the muffled look inside the fog. */
  setDarken(value: number): void {
    const u = this.paper.uniforms.uDarken;
    if (u) u.value = value;
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const pr = this.renderer.getPixelRatio();
    const w = Math.max(2, Math.round(width * this.renderScale));
    const h = Math.max(2, Math.round(height * this.renderScale));
    this.composer.setSize(w, h);
    const texel = this.kuwahara.uniforms.uTexel;
    if (texel) (texel.value as THREE.Vector2).set(1 / (w * pr), 1 / (h * pr));
    const res = this.paper.uniforms.uResolution;
    if (res) (res.value as THREE.Vector2).set(w * pr, h * pr);
  }

  render(dt: number, time: number): void {
    const t = this.paper.uniforms.uTime;
    if (t) t.value = time;
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
  }
}

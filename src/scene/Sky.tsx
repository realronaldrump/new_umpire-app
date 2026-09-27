import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'

const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`

const fragment = /* glsl */ `
uniform float uNight;
uniform float uTime;
uniform vec3 uSunDir;
varying vec3 vDir;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(vec3(i, 1.0));
  float b = hash(vec3(i + vec2(1.0, 0.0), 1.0));
  float c = hash(vec3(i + vec2(0.0, 1.0), 1.0));
  float d = hash(vec3(i + vec2(1.0, 1.0), 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  float up = clamp(h, 0.0, 1.0);
  vec3 col;

  if (uNight > 0.5) {
    vec3 zenith = vec3(0.004, 0.008, 0.022);
    vec3 mid = vec3(0.012, 0.024, 0.055);
    vec3 horizon = vec3(0.06, 0.085, 0.13);
    col = mix(horizon, mid, smoothstep(0.0, 0.18, up));
    col = mix(col, zenith, smoothstep(0.15, 0.75, up));
    // Stadium light spill: a warm dome of haze over the park.
    float spill = exp(-up * 7.0);
    col += vec3(0.10, 0.085, 0.06) * spill * 0.65;
    // Stars (hashed on a direction lattice), twinkling.
    vec3 cell = floor(dir * 520.0);
    float s = hash(cell);
    float star = smoothstep(0.9975, 1.0, s);
    float tw = 0.65 + 0.35 * sin(uTime * (1.5 + s * 5.0) + s * 60.0);
    col += vec3(0.9, 0.95, 1.0) * star * tw * smoothstep(0.08, 0.4, up) * 1.8;
    // Moon, high over third base.
    vec3 moonDir = normalize(vec3(-0.55, 0.55, -0.62));
    float md = dot(dir, moonDir);
    col += vec3(1.0, 0.97, 0.9) * smoothstep(0.99955, 0.9997, md) * 2.4;
    col += vec3(0.25, 0.3, 0.4) * pow(max(md, 0.0), 700.0) * 0.8;
    // Thin moonlit cloud streaks.
    vec2 cp = dir.xz / (h + 0.25) * 1.6 + vec2(uTime * 0.004, 0.0);
    float cl = smoothstep(0.55, 0.85, fbm(cp * 1.4));
    col = mix(col, col + vec3(0.03, 0.04, 0.06), cl * smoothstep(0.02, 0.3, up));
  } else {
    vec3 zenith = vec3(0.06, 0.2, 0.55);
    vec3 horizon = vec3(0.62, 0.76, 0.9);
    col = mix(horizon, zenith, pow(smoothstep(-0.02, 0.9, up), 0.6));
    float sd = max(dot(dir, uSunDir), 0.0);
    col += vec3(1.0, 0.85, 0.6) * pow(sd, 12.0) * 0.35;
    col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, sd) * 6.0;
    // Drifting fair-weather cumulus.
    vec2 cp = dir.xz / (h + 0.18) * 1.2 + vec2(uTime * 0.006, uTime * 0.002);
    float c = fbm(cp * 1.1);
    float cloud = smoothstep(0.5, 0.78, c) * smoothstep(0.0, 0.25, up);
    vec3 cloudCol = mix(vec3(0.78, 0.82, 0.88), vec3(1.0), smoothstep(0.5, 0.9, c) * 0.8 + pow(sd, 4.0) * 0.3);
    col = mix(col, cloudCol, cloud * 0.85);
  }

  // Below the horizon: fade into the ground haze.
  float below = smoothstep(0.0, -0.08, h);
  col = mix(col, uNight > 0.5 ? vec3(0.03, 0.04, 0.06) : vec3(0.5, 0.58, 0.64), below);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export const SUN_DIR = new THREE.Vector3(0.45, 0.62, 0.64).normalize()

/** Procedural sky dome: gradient, stars + moon at night, sun + clouds by day. */
export function Sky({ night }: { night: boolean }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uNight: { value: night ? 1 : 0 },
          uTime: { value: 0 },
          uSunDir: { value: SUN_DIR },
        },
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  material.uniforms.uNight.value = night ? 1 : 0

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <mesh material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[2000, 48, 24]} />
    </mesh>
  )
}

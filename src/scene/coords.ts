import * as THREE from 'three'
import type { Vec3 } from '../game/physics'

/**
 * Game coords: origin at the center of the plate's front edge, +y toward the
 * mound, +x to the umpire's right, +z up. Scene (three.js): x right, y up,
 * z toward the viewer — so the mound sits at negative scene-z.
 */
export const S = (x: number, y: number, z: number): [number, number, number] => [x, z, -y]

export const toScene = (v: Vec3, out: THREE.Vector3): THREE.Vector3 =>
  out.set(v.x, v.z, -v.y)

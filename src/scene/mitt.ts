import * as THREE from 'three'

/** The catcher's mitt, in scene space — written by <Catcher>, read by <Ball>. */
export const mitt = {
  pos: new THREE.Vector3(0, 1.6, 2.6),
  valid: false,
}

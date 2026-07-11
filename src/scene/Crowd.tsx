import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createRng } from '../game/rng'
import type { Quality } from '../store/settings'

const PALETTE = [
  '#3d4653', '#2f3a4a', '#4a3f3a', '#5a5148', '#333d35', '#463a52',
  '#565f6e', '#3fd9c4', '#ff7a45', '#8a2c3b', '#2c4a6e', '#6e6046',
]

const COUNTS: Record<Quality, number> = { low: 900, med: 2400, high: 4600 }
const PHONES: Record<Quality, number> = { low: 90, med: 220, high: 420 }

interface Seat {
  x: number
  y: number
  z: number
  s: number
}

function buildSeats(count: number): Seat[] {
  const rng = createRng('crowd-cosmetic')
  const seats: Seat[] = []
  // Tiers: [innerRadius, outerRadius, baseY, topY, thetaCenter, thetaSpan]
  const tiers: Array<[number, number, number, number, number, number]> = [
    [402, 515, 4, 56, Math.PI, Math.PI * 1.9],
    [434, 555, 55, 115, Math.PI, Math.PI * 0.78],
  ]
  let placed = 0
  let guard = 0
  while (placed < count && guard++ < count * 4) {
    const tier = tiers[rng.chance(0.68) ? 0 : 1]
    const [r0, r1, y0, y1, thC, thSpan] = tier
    const f = rng.next()
    const r = r0 + (r1 - r0) * f
    const y = y0 + (y1 - y0) * f + rng.range(0, 1.4)
    const th = thC + (rng.next() - 0.5) * thSpan
    // Seats sit on the bowl ring, which is centered on the origin.
    const x = Math.sin(th) * r
    const zScene = -Math.cos(th) * r + (y > 55 ? 10 : 0)
    seats.push({ x, y, z: zScene, s: 0.8 + rng.next() * 0.5 })
    placed++
  }
  return seats
}

export function Crowd({ quality, night }: { quality: Quality; night: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const count = COUNTS[quality]
  const seats = useMemo(() => buildSeats(count), [count])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const color = new THREE.Color()
    const rng = createRng('crowd-colors')
    seats.forEach((seat, i) => {
      q.setFromAxisAngle(up, Math.atan2(-seat.x, -seat.z))
      m.compose(
        new THREE.Vector3(seat.x, seat.y, seat.z),
        q,
        new THREE.Vector3(seat.s, seat.s, seat.s),
      )
      mesh.setMatrixAt(i, m)
      color.set(PALETTE[rng.int(PALETTE.length)])
      color.lerp(new THREE.Color('#232a36'), night ? 0.55 : 0.15)
      color.multiplyScalar(night ? 0.6 : 1)
      mesh.setColorAt(i, color)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [seats, night])

  const phones = useMemo(() => {
    const rng = createRng('crowd-phones')
    const n = PHONES[quality]
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const seat = seats.length ? seats[rng.int(seats.length)] : { x: 0, y: 20, z: -430 }
      pos[i * 3] = seat.x + rng.range(-0.4, 0.4)
      pos[i * 3 + 1] = seat.y + 2.4
      pos[i * 3 + 2] = seat.z
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return geo
  }, [seats, quality])

  useEffect(() => () => phones.dispose(), [phones])

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <capsuleGeometry args={[0.85, 1.7, 3, 6]} />
        <meshLambertMaterial />
      </instancedMesh>
      {night && (
        <points geometry={phones}>
          <pointsMaterial
            color="#bcd9ff"
            size={1.6}
            sizeAttenuation
            transparent
            opacity={0.85}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      )}
    </group>
  )
}

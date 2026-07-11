import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { DIFFICULTY, PLATE_DEPTH_FT, PLATE_HALF_WIDTH_FT } from '../game/constants'
import { zoneFor } from '../game/strikeZone'
import { useGame } from '../store/game'
import { useSettings, zoneGhostVisible } from '../store/settings'
import { multiplayerRole, useMultiplayer } from '../multiplayer/store'

/**
 * Faint in-world rulebook volume over the exact pentagonal plate footprint.
 * Sized to the active batter's stance; hidden when the call window closes.
 */
export function ZoneGhost() {
  const groupRef = useRef<THREE.Group>(null)
  const frameRef = useRef<THREE.LineSegments>(null)
  const volumeGeometry = useMemo(() => {
    // Unit-height prism over the exact pentagonal footprint of home plate.
    const footprint = [
      [-PLATE_HALF_WIDTH_FT, 0],
      [PLATE_HALF_WIDTH_FT, 0],
      [PLATE_HALF_WIDTH_FT, PLATE_HALF_WIDTH_FT],
      [0, PLATE_DEPTH_FT],
      [-PLATE_HALF_WIDTH_FT, PLATE_HALF_WIDTH_FT],
    ] as const
    const positions: number[] = []
    for (const y of [-0.5, 0.5]) {
      for (const [x, z] of footprint) positions.push(x, y, z)
    }
    const indices = [
      0, 2, 1, 0, 4, 2, 2, 4, 3,
      5, 6, 7, 5, 7, 9, 7, 8, 9,
    ]
    for (let i = 0; i < 5; i++) {
      const j = (i + 1) % 5
      indices.push(i, j, i + 5, j, j + 5, i + 5)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  }, [])
  const edgeGeometry = useMemo(() => new THREE.EdgesGeometry(volumeGeometry, 20), [volumeGeometry])

  useFrame(() => {
    const group = groupRef.current
    if (!group) return
    const g = useGame.getState()
    const s = useSettings.getState()
    const batter = g.active?.batter ?? g.lineup[g.sit.batterIdx]
    const live = g.phase === 'prePitch' || g.phase === 'windup' || g.phase === 'flight' || g.phase === 'call'
    const multiplayer = useMultiplayer.getState()
    const multiplayerVisible = g.mode === 'multiplayer' && multiplayer.snapshot
      ? DIFFICULTY[multiplayer.snapshot.difficulty].zoneVisibleDuringPitch && multiplayerRole(multiplayer.snapshot, multiplayer.playerId) === 'umpire'
      : false
    const configuredVisible = g.mode === 'multiplayer' ? multiplayerVisible : zoneGhostVisible(s)
    const show = Boolean(batter) && ((configuredVisible && live && !g.paused) || g.debugOpen)
    group.visible = show
    if (!show || !batter) return
    const zone = zoneFor(batter)
    const h = zone.topFt - zone.botFt
    group.position.set(0, zone.botFt + h / 2, 0)
    group.scale.set(1, h, 1)
    if (frameRef.current) {
      const mat = frameRef.current.material as THREE.LineBasicMaterial
      mat.opacity = g.debugOpen ? 0.85 : 0.5
    }
  })

  return (
    <group ref={groupRef} visible={false}>
      <mesh geometry={volumeGeometry}>
        <meshBasicMaterial color="#9fd8ff" transparent opacity={0.06} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments ref={frameRef} geometry={edgeGeometry}>
        <lineBasicMaterial color="#7fd4e8" transparent opacity={0.5} depthWrite={false} toneMapped={false} />
      </lineSegments>
    </group>
  )
}

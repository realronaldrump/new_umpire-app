import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { DIFFICULTY, PLATE_DEPTH_FT, PLATE_HALF_WIDTH_FT } from '../game/constants'
import { zoneFor } from '../game/strikeZone'
import { useGame } from '../store/game'
import { useSettings, zoneGhostVisible } from '../store/settings'
import { multiplayerRole, useMultiplayer } from '../multiplayer/store'

const LIVE_COLOR = new THREE.Color('#7fd4e8')
const GOOD = new THREE.Color('#3fd9c4')
const BAD = new THREE.Color('#ff7a45')
const GOOD_CB = new THREE.Color('#5aa8ff')
const BAD_CB = new THREE.Color('#ffd23f')

/**
 * In-world rulebook volume over the exact pentagonal plate footprint, sized
 * to the batter's stance. Shown during the pitch when the difficulty allows,
 * and always after a call as the broadcast "K-zone" reveal — tinted by
 * whether you got it right.
 */
export function ZoneGhost() {
  const groupRef = useRef<THREE.Group>(null)
  const frameRef = useRef<THREE.LineSegments>(null)
  const fillRef = useRef<THREE.Mesh>(null)
  const volumeGeometry = useMemo(() => {
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
    const frame = frameRef.current
    const fill = fillRef.current
    if (!group || !frame || !fill) return
    const g = useGame.getState()
    const s = useSettings.getState()
    const batter = g.active?.batter ?? g.lineup[g.sit.batterIdx]
    const live = g.phase === 'prePitch' || g.phase === 'windup' || g.phase === 'flight' || g.phase === 'call'
    const multiplayer = useMultiplayer.getState()
    const multiplayerVisible = g.mode === 'multiplayer' && multiplayer.snapshot
      ? DIFFICULTY[multiplayer.snapshot.difficulty].zoneVisibleDuringPitch && multiplayerRole(multiplayer.snapshot, multiplayer.playerId) === 'umpire'
      : false
    const configuredVisible = g.mode === 'multiplayer' ? multiplayerVisible : zoneGhostVisible(s)
    const revealing = g.phase === 'reveal' && Boolean(g.reveal) && !g.active?.hitTraj
    const show = Boolean(batter) && ((configuredVisible && live && !g.paused) || revealing || g.debugOpen)
    group.visible = show
    if (!show || !batter) return
    const zone = zoneFor(batter)
    const h = zone.topFt - zone.botFt
    group.position.set(0, zone.botFt + h / 2, 0)
    group.scale.set(1, h, 1)
    const lineMat = frame.material as THREE.LineBasicMaterial
    const fillMat = fill.material as THREE.MeshBasicMaterial
    if (revealing && g.reveal) {
      const rec = g.reveal.record
      const ok = rec.correct
      const c = s.colorblind ? (ok ? GOOD_CB : BAD_CB) : ok ? GOOD : BAD
      const since = performance.now() - g.phaseStart
      const inT = Math.min(1, since / 350)
      lineMat.color.copy(c)
      lineMat.opacity = 0.95 * inT
      fillMat.color.copy(c)
      fillMat.opacity = (0.1 + Math.max(0, 1 - since / 500) * 0.2) * inT
    } else {
      lineMat.color.copy(LIVE_COLOR)
      lineMat.opacity = g.debugOpen ? 0.85 : 0.5
      fillMat.color.copy(LIVE_COLOR)
      fillMat.opacity = 0.06
    }
  })

  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={fillRef} geometry={volumeGeometry} renderOrder={2}>
        <meshBasicMaterial color="#9fd8ff" transparent opacity={0.06} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <lineSegments ref={frameRef} geometry={edgeGeometry} renderOrder={3}>
        <lineBasicMaterial color="#7fd4e8" transparent opacity={0.5} depthWrite={false} toneMapped={false} />
      </lineSegments>
    </group>
  )
}

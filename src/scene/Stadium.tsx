import { useMemo } from 'react'
import * as THREE from 'three'
import { S } from './coords'
import { skyTexture } from './textures'

const WALL_R = 385

function LightTower({ angleDeg, night }: { angleDeg: number; night: boolean }) {
  const a = (angleDeg * Math.PI) / 180
  // Angle measured from straightaway center field; towers ring the park.
  const x = Math.sin(a) * 470
  const zGame = Math.cos(a) * 470 - 40
  const head = useMemo(() => {
    const geo = new THREE.PlaneGeometry(24, 12)
    return geo
  }, [])
  return (
    <group position={S(x, zGame, 0)}>
      <mesh position={[0, 65, 0]}>
        <cylinderGeometry args={[1.6, 2.6, 130, 8]} />
        <meshStandardMaterial color="#232a36" roughness={0.9} metalness={0.4} />
      </mesh>
      <group position={[0, 138, 0]} rotation={[0, Math.atan2(-x, zGame), 0]}>
        <mesh>
          <boxGeometry args={[26, 14, 2]} />
          <meshStandardMaterial color="#1a2029" roughness={0.9} />
        </mesh>
        <mesh geometry={head} position={[0, 0, 1.15]}>
          <meshBasicMaterial
            color={night ? '#fff7e0' : '#5a6474'}
            toneMapped={false}
            opacity={night ? 1 : 0.6}
            transparent={!night}
          />
        </mesh>
      </group>
    </group>
  )
}

export function Stadium({ night }: { night: boolean }) {
  const sky = skyTexture(night)

  return (
    <group>
      {/* Sky dome */}
      <mesh>
        <sphereGeometry args={[1400, 24, 16]} />
        <meshBasicMaterial map={sky} side={THREE.BackSide} fog={false} toneMapped={false} />
      </mesh>

      {/* Outfield wall (arc facing home) */}
      <mesh position={[0, 6, 0]}>
        <cylinderGeometry args={[WALL_R, WALL_R, 12, 64, 1, true, Math.PI * 0.72, Math.PI * 0.56]} />
        <meshStandardMaterial color="#173225" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {/* Yellow line atop the wall */}
      <mesh position={[0, 12.2, 0]}>
        <cylinderGeometry args={[WALL_R + 0.2, WALL_R + 0.2, 0.45, 64, 1, true, Math.PI * 0.72, Math.PI * 0.56]} />
        <meshBasicMaterial color="#e7c84f" side={THREE.DoubleSide} toneMapped={false} />
      </mesh>

      {/* Lower bowl — a raked ring all the way around, base at field level */}
      <mesh position={[0, 30, 0]}>
        <cylinderGeometry args={[400, 520, 55, 48, 1, true]} />
        <meshStandardMaterial color={night ? '#141a26' : '#2c3648'} roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {/* Upper deck facing the infield */}
      <mesh position={[0, 86, 10]}>
        <cylinderGeometry args={[430, 560, 62, 48, 1, true, Math.PI * 0.6, Math.PI * 0.8]} />
        <meshStandardMaterial color={night ? '#10151f' : '#242d3d'} roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {/* Roof lip over the upper deck */}
      <mesh position={[0, 122, 10]}>
        <cylinderGeometry args={[452, 470, 6, 48, 1, true, Math.PI * 0.62, Math.PI * 0.76]} />
        <meshStandardMaterial color="#0b0f16" roughness={1} side={THREE.DoubleSide} />
      </mesh>

      {/* Backstop pad, a proper ~45 ft behind the plate */}
      <mesh position={[0, 8, 75]}>
        <cylinderGeometry args={[30, 30, 16, 24, 1, true, Math.PI * 0.7, Math.PI * 0.6]} />
        <meshStandardMaterial color="#10365c" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>

      {/* Light towers */}
      {[-118, -62, -20, 20, 62, 118].map((a) => (
        <LightTower key={a} angleDeg={a} night={night} />
      ))}
    </group>
  )
}

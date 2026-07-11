import { useMemo } from 'react'
import * as THREE from 'three'
import { MOUND_CENTER_Y_FT, MOUND_HEIGHT_FT, MOUND_RADIUS_FT, RUBBER_Y_FT } from '../game/constants'
import { S } from './coords'
import { dirtTexture, grassTexture } from './textures'

const CHALK = '#e8e4da'

/** Home plate pentagon: 17" front edge at game y=0, point toward the catcher. */
function plateGeometry(): THREE.ExtrudeGeometry {
  const w = 17 / 12 / 2
  const shape = new THREE.Shape()
  // Shape XY; after rotateX(-90°), shape +y maps to scene −z (= game +y).
  shape.moveTo(-w, 0)
  shape.lineTo(w, 0)
  shape.lineTo(w, -8.5 / 12)
  shape.lineTo(0, -17 / 12)
  shape.lineTo(-w, -8.5 / 12)
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2)
  return geo
}

function boxOutline(cx: number, cz: number, w: number, l: number, t = 0.25): THREE.Vector3[] {
  // Returns centers for 4 chalk strips (game coords x, y): left, right, front, back.
  return [
    new THREE.Vector3(cx - w / 2, cz, l),
    new THREE.Vector3(cx + w / 2, cz, l),
    new THREE.Vector3(cx, cz + l / 2 - t / 2, w),
    new THREE.Vector3(cx, cz - l / 2 + t / 2, w),
  ]
}

export function Field() {
  const plateGeo = useMemo(plateGeometry, [])
  const grass = grassTexture()
  const dirt = dirtTexture()

  const chalkMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: CHALK, roughness: 0.9 }),
    [],
  )

  const foulLineLen = 320
  const foulAngle = Math.PI / 4

  return (
    <group>
      {/* Outfield grass */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -60]} receiveShadow>
        <planeGeometry args={[900, 900]} />
        <meshStandardMaterial map={grass} roughness={0.95} />
      </mesh>

      {/* Home-plate dirt circle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={S(0, -0.5, 0.015)}>
        <circleGeometry args={[13, 40]} />
        <meshStandardMaterial map={dirt} roughness={1} />
      </mesh>

      {/* Infield dirt fan between the foul lines (arc bisector points at the mound) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[102, 48, Math.PI / 4, Math.PI / 2]} />
        <meshStandardMaterial map={dirt} roughness={1} />
      </mesh>

      {/* Infield grass diamond (inset from the base paths) */}
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]} position={[0, 0.02, -63.64]}>
        <planeGeometry args={[76, 76]} />
        <meshStandardMaterial map={grass} roughness={0.95} />
      </mesh>

      {/* Mound */}
      <mesh position={S(0, MOUND_CENTER_Y_FT, 0)} scale={[1, MOUND_HEIGHT_FT / MOUND_RADIUS_FT, 1]} castShadow receiveShadow>
        <sphereGeometry args={[MOUND_RADIUS_FT, 28, 14]} />
        <meshStandardMaterial map={dirt} roughness={1} />
      </mesh>
      {/* Rubber */}
      <mesh position={S(0, RUBBER_Y_FT, MOUND_HEIGHT_FT + 0.02)}>
        <boxGeometry args={[2, 0.04, 0.5]} />
        <meshStandardMaterial color={CHALK} roughness={0.85} />
      </mesh>

      {/* Home plate (white pentagon on a dark rubber base) */}
      <mesh geometry={plateGeo} position={[0, 0.028, 0]}>
        <meshStandardMaterial color="#f2efe6" roughness={0.55} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={S(0, -0.71, 0.022)}>
        <planeGeometry args={[1.75, 1.75]} />
        <meshStandardMaterial color="#26201a" roughness={1} />
      </mesh>

      {/* Foul lines */}
      {[1, -1].map((s) => (
        <mesh
          key={s}
          position={[s * Math.sin(foulAngle) * (foulLineLen / 2 + 6), 0.035, -Math.cos(foulAngle) * (foulLineLen / 2 + 6)]}
          rotation={[-Math.PI / 2, 0, s * -foulAngle]}
        >
          <planeGeometry args={[0.35, foulLineLen]} />
          <meshStandardMaterial color={CHALK} roughness={0.9} />
        </mesh>
      ))}

      {/* Base paths (dirt strips to 1B / 3B) */}
      {[1, -1].map((s) => (
        <mesh
          key={`path${s}`}
          position={[s * Math.sin(foulAngle) * 45, 0.012, -Math.cos(foulAngle) * 45]}
          rotation={[-Math.PI / 2, 0, s * -foulAngle]}
        >
          <planeGeometry args={[7, 96]} />
          <meshStandardMaterial map={dirt} roughness={1} />
        </mesh>
      ))}

      {/* Bases */}
      {[
        S(63.64, 63.64, 0.1),
        S(0, 127.28, 0.1),
        S(-63.64, 63.64, 0.1),
      ].map((p, i) => (
        <mesh key={i} position={p} castShadow>
          <boxGeometry args={[1.25, 0.2, 1.25]} />
          <meshStandardMaterial color="#e9e5da" roughness={0.8} />
        </mesh>
      ))}

      {/* Batter's boxes (4' × 6', 6" off the plate) + catcher's box */}
      {[-1, 1].map((side) =>
        boxOutline(side * 3.208, 0, 4, 6).map((v, i) => (
          <mesh
            key={`bb${side}-${i}`}
            material={chalkMat}
            position={[v.x, 0.032, -v.y]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={i < 2 ? [0.22, v.z] : [v.z, 0.22]} />
          </mesh>
        )),
      )}
      {/* Catcher's box: two rails + back line behind the plate */}
      {[-1.79, 1.79].map((x) => (
        <mesh key={`cb${x}`} material={chalkMat} position={S(x, -4.4, 0.032)} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.22, 6]} />
        </mesh>
      ))}
      <mesh material={chalkMat} position={S(0, -7.4, 0.032)} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.8, 0.22]} />
      </mesh>
    </group>
  )
}

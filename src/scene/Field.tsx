import { RoundedBox } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { MOUND_CENTER_Y_FT, MOUND_HEIGHT_FT, MOUND_RADIUS_FT, RUBBER_Y_FT } from '../game/constants'
import type { Quality } from '../store/settings'
import { S } from './coords'
import { FIRST_BASE, FOUL_ANGLE, SECOND_BASE, THIRD_BASE, polarScene, wallR } from './park'
import {
  FIELD_MAP, HOME_CIRCLE_R, dirtDetailTexture, fieldPaintTexture, grassDetailTexture,
  homeCircleTexture, moundTexture,
} from './textures'

/**
 * A standard material whose albedo is multiplied by a tiling neutral-gray
 * detail map, so the painted field stays crisp at the umpire's feet and calm
 * in the distance.
 */
function detailMaterial(
  map: THREE.Texture,
  detail: THREE.Texture,
  repeat: [number, number],
  strength: number,
  params: THREE.MeshStandardMaterialParameters = {},
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.94, metalness: 0, ...params })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.detailMap = { value: detail }
    shader.uniforms.detailRepeat = { value: new THREE.Vector2(...repeat) }
    shader.uniforms.detailStrength = { value: strength }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_pars_fragment>',
        '#include <map_pars_fragment>\nuniform sampler2D detailMap;\nuniform vec2 detailRepeat;\nuniform float detailStrength;',
      )
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n  diffuseColor.rgb *= mix(vec3(1.0), texture2D(detailMap, vMapUv * detailRepeat).rgb * 2.0, detailStrength);',
      )
  }
  mat.customProgramCacheKey = () => `detail-${strength}`
  return mat
}

/** Home plate pentagon: 17" front edge at game y=0, point toward the catcher. */
function plateGeometry(): THREE.ExtrudeGeometry {
  const w = 17 / 12 / 2
  const shape = new THREE.Shape()
  shape.moveTo(-w, 0)
  shape.lineTo(w, 0)
  shape.lineTo(w, -8.5 / 12)
  shape.lineTo(0, -17 / 12)
  shape.lineTo(-w, -8.5 / 12)
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
  })
  geo.rotateX(-Math.PI / 2)
  return geo
}

/** Smooth mound: a lathe profile with a flat table around the rubber. */
function moundGeometry(): THREE.BufferGeometry {
  const h = MOUND_HEIGHT_FT
  const r = MOUND_RADIUS_FT
  const pts: THREE.Vector2[] = []
  const n = 18
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * (r + 0.4)
    const t = Math.min(1, Math.max(0, (x - 2.2) / (r - 2.2)))
    const y = x < 2.2 ? h : h * (1 - t * t * (3 - 2 * t)) - (x > r ? 0.02 : 0)
    pts.push(new THREE.Vector2(x, y))
  }
  const geo = new THREE.LatheGeometry(pts.reverse(), 48)
  // Planar UVs so the top-down mound texture maps cleanly.
  const pos = geo.getAttribute('position')
  const uv = geo.getAttribute('uv')
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / 20 + 0.5, 0.5 - pos.getZ(i) / 20)
  }
  geo.computeVertexNormals()
  return geo
}

export function Field({ quality }: { quality: Quality }) {
  const ppf = quality === 'low' ? 2 : quality === 'med' ? 3 : 4
  const fieldMat = useMemo(() => {
    const w = FIELD_MAP.x1 - FIELD_MAP.x0
    const h = FIELD_MAP.y1 - FIELD_MAP.y0
    return detailMaterial(fieldPaintTexture(ppf), grassDetailTexture(), [w / 2.4, h / 2.4], 0.75)
  }, [ppf])
  const homeMat = useMemo(() => {
    const m = detailMaterial(homeCircleTexture(), dirtDetailTexture(), [22, 22], 0.6, {
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      roughness: 1,
    })
    return m
  }, [])
  const moundMat = useMemo(
    () => detailMaterial(moundTexture(), dirtDetailTexture(), [16, 16], 0.55, { roughness: 1 }),
    [],
  )
  const outerMat = useMemo(() => {
    const tex = grassDetailTexture().clone()
    tex.repeat.set(600, 600)
    tex.needsUpdate = true
    return new THREE.MeshStandardMaterial({ color: '#2f5a2c', map: tex, roughness: 1 })
  }, [])
  useEffect(() => () => {
    fieldMat.dispose()
    homeMat.dispose()
    moundMat.dispose()
    outerMat.dispose()
  }, [fieldMat, homeMat, moundMat, outerMat])

  const plateGeo = useMemo(plateGeometry, [])
  const moundGeo = useMemo(moundGeometry, [])
  const half = HOME_CIRCLE_R + 0.6
  const mapW = FIELD_MAP.x1 - FIELD_MAP.x0
  const mapH = FIELD_MAP.y1 - FIELD_MAP.y0
  const polePos = [-1, 1].map((s) => polarScene(s * FOUL_ANGLE, wallR(FOUL_ANGLE) + 0.5, 0))

  return (
    <group>
      {/* Everything beyond the painted map (mostly under the stands). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, -150]} material={outerMat} receiveShadow>
        <planeGeometry args={[3200, 3200]} />
      </mesh>

      {/* Painted playing surface */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={S((FIELD_MAP.x0 + FIELD_MAP.x1) / 2, (FIELD_MAP.y0 + FIELD_MAP.y1) / 2, 0)}
        material={fieldMat}
        receiveShadow
      >
        <planeGeometry args={[mapW, mapH]} />
      </mesh>

      {/* Hi-res home-plate circle with the batter's and catcher's boxes */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={S(0, -0.7, 0.012)} material={homeMat} receiveShadow renderOrder={1}>
        <planeGeometry args={[half * 2, half * 2]} />
      </mesh>

      {/* Mound + rubber + rosin bag */}
      <mesh geometry={moundGeo} material={moundMat} position={S(0, MOUND_CENTER_Y_FT, 0)} castShadow receiveShadow />
      <mesh position={S(0, RUBBER_Y_FT + 0.25, MOUND_HEIGHT_FT + 0.03)} receiveShadow>
        <boxGeometry args={[2, 0.08, 0.5]} />
        <meshStandardMaterial color="#f4f1e8" roughness={0.7} />
      </mesh>
      <mesh position={S(-1.6, RUBBER_Y_FT + 5.2, MOUND_HEIGHT_FT * 0.4)} scale={[1, 0.45, 0.8]}>
        <sphereGeometry args={[0.22, 10, 8]} />
        <meshStandardMaterial color="#eeeae0" roughness={1} />
      </mesh>

      {/* Home plate: white rubber slab set in a black base */}
      <mesh geometry={plateGeo} position={[0, 0.018, 0]} receiveShadow>
        <meshStandardMaterial color="#f5f3ec" roughness={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={S(0, -17 / 24, 0.014)} renderOrder={2}>
        <circleGeometry args={[1.05, 5, -Math.PI / 2]} />
        <meshStandardMaterial color="#26211c" roughness={1} transparent opacity={0.55} depthWrite={false} />
      </mesh>

      {/* Bases */}
      {[FIRST_BASE, SECOND_BASE, THIRD_BASE].map((b, i) => (
        <RoundedBox
          key={i}
          args={[1.25, 0.25, 1.25]}
          radius={0.06}
          smoothness={3}
          position={S(b.x, b.y, 0.12)}
          rotation={[0, Math.PI / 4, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#f3f1ea" roughness={0.75} />
        </RoundedBox>
      ))}

      {/* Foul poles with fan screens */}
      {polePos.map((p, i) => (
        <group key={i} position={p}>
          <mesh position={[0, 42, 0]} castShadow>
            <cylinderGeometry args={[0.55, 0.7, 84, 10]} />
            <meshStandardMaterial color="#f2d027" roughness={0.45} emissive="#f2d027" emissiveIntensity={0.08} />
          </mesh>
          <mesh position={[(i === 0 ? 1 : -1) * 1.8, 50, 0]} rotation={[0, (i === 0 ? -1 : 1) * FOUL_ANGLE, 0]}>
            <planeGeometry args={[3.2, 60]} />
            <meshStandardMaterial color="#f2d027" roughness={0.6} transparent opacity={0.55} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

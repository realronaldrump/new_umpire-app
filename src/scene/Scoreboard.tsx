import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { AWAY_TEAM, HOME_TEAM, teamFullName } from '../game/roster'
import { useGame } from '../store/game'
import { S } from './coords'

const W = 1024
const H = 448

export function Scoreboard() {
  const canvas = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    return c
  }, [])
  const texRef = useRef<THREE.CanvasTexture | null>(null)
  if (!texRef.current) {
    texRef.current = new THREE.CanvasTexture(canvas)
    texRef.current.colorSpace = THREE.SRGBColorSpace
    texRef.current.anisotropy = 4
  }

  useEffect(() => {
    const draw = () => {
      const s = useGame.getState()
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#05070c'
      ctx.fillRect(0, 0, W, H)
      ctx.strokeStyle = '#1d2836'
      ctx.lineWidth = 10
      ctx.strokeRect(5, 5, W - 10, H - 10)

      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.font = '700 44px "Archivo", sans-serif'
      ctx.fillStyle = '#8fa4bd'
      ctx.fillText(`${HOME_TEAM.name.toUpperCase()} PARK`, 48, 62)
      ctx.textAlign = 'right'
      ctx.font = '600 34px "Archivo", sans-serif'
      ctx.fillText(`${s.sit.half === 'top' ? 'TOP' : 'BOT'} ${s.sit.inning}`, W - 48, 62)

      const row = (y: number, abbr: string, color: string, score: number) => {
        ctx.textAlign = 'left'
        ctx.fillStyle = color
        ctx.font = '86px "Bebas Neue", sans-serif'
        ctx.fillText(abbr, 48, y)
        ctx.textAlign = 'right'
        ctx.fillStyle = '#f4f7fa'
        ctx.fillText(String(score), 400, y)
      }
      row(160, AWAY_TEAM.abbr, AWAY_TEAM.accent, s.sit.awayScore)
      row(268, HOME_TEAM.abbr, HOME_TEAM.accent, s.sit.homeScore)

      // Count lamps.
      const lamp = (x: number, y: number, on: boolean, color: string) => {
        ctx.beginPath()
        ctx.arc(x, y, 17, 0, Math.PI * 2)
        ctx.fillStyle = on ? color : '#1c2531'
        ctx.fill()
      }
      ctx.textAlign = 'left'
      ctx.font = '600 40px "Archivo", sans-serif'
      ctx.fillStyle = '#8fa4bd'
      ctx.fillText('B', 560, 150)
      for (let i = 0; i < 3; i++) lamp(625 + i * 52, 150, s.sit.balls > i, '#43d17c')
      ctx.fillText('S', 560, 226)
      for (let i = 0; i < 2; i++) lamp(625 + i * 52, 226, s.sit.strikes > i, '#e8543f')
      ctx.fillText('O', 560, 302)
      for (let i = 0; i < 2; i++) lamp(625 + i * 52, 302, s.sit.outs > i, '#f5b942')

      ctx.textAlign = 'right'
      ctx.font = '500 30px "Archivo", sans-serif'
      ctx.fillStyle = '#5d7188'
      ctx.fillText(`P ${s.sit.totalPitches}`, W - 48, 150)
      ctx.fillStyle = '#42556c'
      ctx.font = '500 26px "Archivo", sans-serif'
      ctx.fillText(`SEED ${s.seedText || '—'}`, W - 48, 392)

      ctx.textAlign = 'left'
      ctx.fillStyle = '#42556c'
      ctx.fillText(
        `${teamFullName(AWAY_TEAM)} at ${teamFullName(HOME_TEAM)}`.toUpperCase(),
        48,
        392,
      )

      // The big board goes red while the robot zone reviews a challenge.
      if (s.phase === 'challenge' || s.phase === 'absReveal') {
        const blink = Math.floor(Date.now() / 450) % 2 === 0
        ctx.fillStyle = blink ? '#8f1f1f' : '#6e1717'
        ctx.fillRect(430, 340, W - 478, 72)
        ctx.strokeStyle = '#e8543f'
        ctx.lineWidth = 3
        ctx.strokeRect(430, 340, W - 478, 72)
        ctx.fillStyle = '#ffe9e2'
        ctx.font = '700 40px "Archivo", sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('⚠ ABS CHALLENGE — PLAY UNDER REVIEW', 430 + (W - 478) / 2, 377)
      }

      if (texRef.current) texRef.current.needsUpdate = true
    }
    draw()
    let blinkTimer: number | null = null
    const unsub = useGame.subscribe((state, prev) => {
      const review = state.phase === 'challenge' || state.phase === 'absReveal'
      const wasReview = prev.phase === 'challenge' || prev.phase === 'absReveal'
      if (state.sit !== prev.sit || state.seedText !== prev.seedText || review !== wasReview) draw()
      if (review && blinkTimer === null) {
        blinkTimer = window.setInterval(draw, 450)
      } else if (!review && blinkTimer !== null) {
        window.clearInterval(blinkTimer)
        blinkTimer = null
      }
    })
    return () => {
      if (blinkTimer !== null) window.clearInterval(blinkTimer)
      unsub()
    }
  }, [canvas])

  useEffect(() => {
    const tex = texRef.current
    return () => tex?.dispose()
  }, [])

  // Keep the board inside the 385-foot wall; beyond 400 feet it intersects the lower bowl.
  return (
    <group position={S(0, 380, 52)} rotation={[0, 0, 0]}>
      <mesh>
        <boxGeometry args={[114, 52, 3]} />
        <meshStandardMaterial color="#0a0e15" roughness={0.9} />
      </mesh>
      {/*
        Keep the display comfortably in front of the cabinet. At center-field
        distance, the old 0.1-unit separation was smaller than the camera's
        effective depth precision and the cabinet won the depth test, making
        the scoreboard flicker or disappear.
      */}
      <mesh position={[0, 0, 4]} renderOrder={1}>
        <planeGeometry args={[108, 47]} />
        <meshBasicMaterial
          map={texRef.current}
          toneMapped={false}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      {/* Support pylons */}
      {[-38, 38].map((x) => (
        <mesh key={x} position={[x, -28, 0]}>
          <boxGeometry args={[3, 24, 2.5]} />
          <meshStandardMaterial color="#161c26" roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

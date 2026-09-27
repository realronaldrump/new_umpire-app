import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { PITCH_TYPES } from '../game/pitchTypes'
import { AWAY_TEAM, HOME_TEAM, teamFullName } from '../game/roster'
import { useGame } from '../store/game'
import { DEG, polarScene } from './park'
import { LOWER_BOWL } from './Stadium'

const inningOrdinal = (n: number): string => `${n}${n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH'}`

const W = 1600
const H = 720

type Msg = { text: string; bg: string; fg: string; blink: boolean } | null

function boardMessage(s: ReturnType<typeof useGame.getState>): Msg {
  if (s.phase === 'challenge' || s.phase === 'absReveal') {
    return { text: 'ABS CHALLENGE · PLAY UNDER REVIEW', bg: '#8f1f1f', fg: '#ffe9e2', blink: true }
  }
  if (s.sit.walkOff && (s.phase === 'swingResult' || s.phase === 'reveal' || s.phase === 'inningOver')) {
    return { text: `WALK-OFF! ${HOME_TEAM.name.toUpperCase()} WIN!`, bg: '#f5b942', fg: '#1c1204', blink: true }
  }
  const headline = s.banner?.title ?? ''
  if (s.phase === 'swingResult' && /HOME RUN|HOMER/.test(headline)) {
    return { text: headline, bg: '#f5b942', fg: '#1c1204', blink: true }
  }
  if ((s.phase === 'swingResult' || s.phase === 'reveal') && /STRIKEOUT|STRUCK HIM OUT/.test(headline)) {
    return { text: 'K', bg: '#10151f', fg: '#e8543f', blink: false }
  }
  if (s.phase === 'newBatter') {
    const b = s.lineup[s.sit.batterIdx]
    if (b) return { text: `NOW BATTING · #${b.number} ${b.name.toUpperCase()}`, bg: HOME_TEAM.primary, fg: '#f2f6f9', blink: false }
  }
  return null
}

/**
 * The center-field video board — a live canvas, redrawn when the game state
 * it shows changes (and on a blink clock during big moments).
 */
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
    texRef.current.anisotropy = 8
  }

  useEffect(() => {
    let blinkOn = true
    const draw = () => {
      const s = useGame.getState()
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      // Board face.
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#0a0f18')
      bg.addColorStop(1, '#05080d')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // Header bar.
      ctx.fillStyle = HOME_TEAM.primary
      ctx.fillRect(0, 0, W, 96)
      ctx.fillStyle = HOME_TEAM.accent
      ctx.fillRect(0, 96, W, 6)
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.fillStyle = '#f2f6f9'
      ctx.font = '400 70px "Bebas Neue", "Arial Narrow", sans-serif'
      ctx.fillText(`${HOME_TEAM.name.toUpperCase()} PARK`, 40, 52)
      ctx.textAlign = 'right'
      ctx.fillStyle = '#f5b942'
      ctx.fillText(`${s.sit.half === 'top' ? '▲' : '▼'} ${inningOrdinal(s.sit.inning)}`, W - 40, 52)

      // Line score.
      const row = (y: number, abbr: string, color: string, name: string, score: number) => {
        ctx.fillStyle = color
        ctx.fillRect(40, y - 52, 14, 104)
        ctx.textAlign = 'left'
        ctx.fillStyle = '#f2f6f9'
        ctx.font = '400 120px "Bebas Neue", "Arial Narrow", sans-serif'
        ctx.fillText(abbr, 80, y + 6)
        ctx.fillStyle = '#7f93ab'
        ctx.font = '600 28px "Archivo", sans-serif'
        ctx.fillText(name.toUpperCase(), 84, y + 58)
        ctx.textAlign = 'right'
        ctx.fillStyle = '#ffffff'
        ctx.font = '400 150px "Bebas Neue", "Arial Narrow", sans-serif'
        ctx.fillText(String(score), 620, y + 8)
      }
      row(200, AWAY_TEAM.abbr, AWAY_TEAM.accent, teamFullName(AWAY_TEAM), s.sit.awayScore)
      row(360, HOME_TEAM.abbr, HOME_TEAM.accent, teamFullName(HOME_TEAM), s.sit.homeScore)

      // Divider.
      ctx.fillStyle = '#1b2533'
      ctx.fillRect(680, 130, 4, 330)

      // Count lamps.
      const lamp = (x: number, y: number, on: boolean, color: string) => {
        ctx.beginPath()
        ctx.arc(x, y, 26, 0, Math.PI * 2)
        ctx.fillStyle = on ? color : '#18212d'
        ctx.shadowColor = on ? color : 'transparent'
        ctx.shadowBlur = on ? 30 : 0
        ctx.fill()
        ctx.shadowBlur = 0
      }
      ctx.textAlign = 'left'
      ctx.font = '400 64px "Bebas Neue", "Arial Narrow", sans-serif'
      const labels: Array<[string, number, number, string]> = [
        ['BALL', s.sit.balls, 3, '#43d17c'],
        ['STRIKE', s.sit.strikes, 2, '#e8543f'],
        ['OUT', s.sit.outs, 2, '#f5b942'],
      ]
      labels.forEach(([label, n, of, color], i) => {
        const y = 185 + i * 110
        ctx.fillStyle = '#7f93ab'
        ctx.fillText(label, 730, y + 4)
        for (let k = 0; k < of; k++) lamp(960 + k * 74, y, n > k, color)
      })

      // Batter + last pitch.
      const batter = s.active?.batter ?? s.lineup[s.sit.batterIdx]
      ctx.textAlign = 'left'
      ctx.fillStyle = '#7f93ab'
      ctx.font = '600 28px "Archivo", sans-serif'
      ctx.fillText('AT BAT', 1230, 150)
      if (batter) {
        ctx.fillStyle = '#f2f6f9'
        ctx.font = '400 64px "Bebas Neue", "Arial Narrow", sans-serif'
        const last = batter.name.split(' ').slice(-1)[0].toUpperCase()
        ctx.fillText(`#${batter.number} ${last}`, 1230, 204)
        ctx.fillStyle = '#9fb3c9'
        ctx.font = '600 30px "Archivo", sans-serif'
        ctx.fillText(`AVG ${batter.avgLabel} · BATS ${batter.hand}`, 1230, 252)
      }
      const pitch = s.active?.pitch
      const showPitch = pitch && s.phase !== 'prePitch' && s.phase !== 'windup' && s.phase !== 'flight'
      ctx.fillStyle = '#7f93ab'
      ctx.font = '600 28px "Archivo", sans-serif'
      ctx.fillText('PITCH', 1230, 318)
      ctx.fillStyle = '#f5b942'
      ctx.font = '400 110px "Bebas Neue", "Arial Narrow", sans-serif'
      ctx.fillText(showPitch ? `${Math.round(pitch.mph)}` : '--', 1230, 392)
      ctx.fillStyle = '#9fb3c9'
      ctx.font = '400 44px "Bebas Neue", "Arial Narrow", sans-serif'
      ctx.fillText(showPitch ? `MPH · ${PITCH_TYPES[pitch.typeKey].short}` : 'MPH', 1360, 404)
      ctx.fillStyle = '#56687f'
      ctx.font = '600 26px "Archivo", sans-serif'
      ctx.fillText(`PITCHES ${s.sit.totalPitches}`, 1230, 450)

      // Message band.
      const msg = boardMessage(s)
      const bandY = 500
      if (msg) {
        const on = !msg.blink || blinkOn
        ctx.fillStyle = on ? msg.bg : '#10151f'
        ctx.fillRect(0, bandY, W, H - bandY)
        ctx.fillStyle = on ? msg.fg : msg.bg
        ctx.textAlign = 'center'
        ctx.font = `400 ${msg.text.length > 26 ? 120 : 170}px "Bebas Neue", "Arial Narrow", sans-serif`
        ctx.fillText(msg.text, W / 2, bandY + (H - bandY) / 2 + 8)
      } else {
        ctx.fillStyle = '#0d131d'
        ctx.fillRect(0, bandY, W, H - bandY)
        ctx.textAlign = 'center'
        ctx.fillStyle = '#3d4f66'
        ctx.font = '400 72px "Bebas Neue", "Arial Narrow", sans-serif'
        ctx.fillText(`${teamFullName(AWAY_TEAM)} at ${teamFullName(HOME_TEAM)}`.toUpperCase(), W / 2, bandY + 80)
        ctx.fillStyle = '#2c3a4d'
        ctx.font = '600 30px "Archivo", sans-serif'
        ctx.fillText(`SEED ${s.seedText || '—'} · BIG BEAUTIFUL UMPIRE APP`, W / 2, bandY + 160)
      }

      // LED grid.
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      for (let x = 0; x < W; x += 5) ctx.fillRect(x, 0, 1, H)
      for (let y = 0; y < H; y += 5) ctx.fillRect(0, y, W, 1)

      if (texRef.current) texRef.current.needsUpdate = true
    }
    draw()
    void document.fonts?.ready.then(draw)

    let blinkTimer: number | null = null
    const unsub = useGame.subscribe((state, prev) => {
      const changed = state.sit !== prev.sit || state.seedText !== prev.seedText || state.phase !== prev.phase || state.banner !== prev.banner
      if (changed) draw()
      const wantsBlink = Boolean(boardMessage(state)?.blink)
      if (wantsBlink && blinkTimer === null) {
        blinkTimer = window.setInterval(() => {
          blinkOn = !blinkOn
          draw()
        }, 420)
      } else if (!wantsBlink && blinkTimer !== null) {
        window.clearInterval(blinkTimer)
        blinkTimer = null
        blinkOn = true
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

  const phi = 27 * DEG
  const r = LOWER_BOWL.r0(phi) + LOWER_BOWL.depth(phi) + 26
  const pos = polarScene(phi, r, 0)
  const yaw = Math.atan2(-pos[0], -pos[2])
  const bw = 128
  const bh = bw * (H / W)

  return (
    <group position={pos} rotation={[0, yaw, 0]}>
      <group position={[0, 70 + bh / 2, 0]} rotation={[-0.06, 0, 0]}>
        <mesh>
          <boxGeometry args={[bw + 6, bh + 6, 4]} />
          <meshStandardMaterial color="#10151d" roughness={0.7} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0, 2.05]}>
          <planeGeometry args={[bw, bh]} />
          <meshBasicMaterial map={texRef.current} toneMapped={false} />
        </mesh>
        {/* Crown */}
        <mesh position={[0, bh / 2 + 9, 0]}>
          <boxGeometry args={[bw * 0.55, 12, 3]} />
          <meshStandardMaterial color={HOME_TEAM.primary} roughness={0.6} />
        </mesh>
        <mesh position={[0, bh / 2 + 9, 1.6]}>
          <planeGeometry args={[bw * 0.52, 9]} />
          <meshBasicMaterial color={HOME_TEAM.accent} toneMapped={false} />
        </mesh>
      </group>
      {[-bw * 0.32, bw * 0.32].map((x) => (
        <mesh key={x} position={[x, 36, -2]}>
          <boxGeometry args={[5, 72, 4]} />
          <meshStandardMaterial color="#1b222d" roughness={0.9} metalness={0.3} />
        </mesh>
      ))}
    </group>
  )
}

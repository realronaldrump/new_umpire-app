import * as THREE from 'three'
import { AWAY_TEAM, HOME_TEAM } from '../game/roster'
import { createRng } from '../game/rng'
import { DEG, FOUL_ANGLE, wallR } from './park'

/*
 * Every texture in the park is painted procedurally on a canvas — nothing is
 * fetched. Textures are cached module-wide so remounts are free.
 */

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  return [c, ctx]
}

function finish(c: HTMLCanvasElement, opts: { repeat?: [number, number]; aniso?: number; srgb?: boolean } = {}): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c)
  if (opts.repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(opts.repeat[0], opts.repeat[1])
  }
  tex.anisotropy = opts.aniso ?? 8
  if (opts.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/* ------------------------------------------------------------------ noise */

/** Tileable value noise on a `period`-cell lattice (0..1). */
function makeNoise(seed: string, period: number): (x: number, y: number) => number {
  const rng = createRng(seed)
  const lattice = new Float32Array(period * period)
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next()
  const at = (ix: number, iy: number) => lattice[((iy % period + period) % period) * period + ((ix % period + period) % period)]
  return (x, y) => {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const fx = x - ix
    const fy = y - iy
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const a = at(ix, iy)
    const b = at(ix + 1, iy)
    const c = at(ix, iy + 1)
    const d = at(ix + 1, iy + 1)
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
  }
}

/** Fractal noise, tileable over a `size`-px canvas. */
function fbmField(size: number, seed: string, octaves: Array<[number, number]>): Float32Array {
  const out = new Float32Array(size * size)
  const layers = octaves.map(([cells], i) => makeNoise(`${seed}:${i}`, cells))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0
      let norm = 0
      for (let o = 0; o < octaves.length; o++) {
        const [cells, weight] = octaves[o]
        v += layers[o]((x / size) * cells, (y / size) * cells) * weight
        norm += weight
      }
      out[y * size + x] = v / norm
    }
  }
  return out
}

/* ------------------------------------------------------------ detail maps */

let grassDetailTex: THREE.CanvasTexture | null = null
/** Neutral-gray (≈0.5) tileable blade grain; multiplied ×2 over the field paint. */
export function grassDetailTexture(): THREE.CanvasTexture {
  if (grassDetailTex) return grassDetailTex
  const size = 256
  const [c, ctx] = makeCanvas(size, size)
  const n = fbmField(size, 'grass-detail', [[8, 0.5], [32, 0.35], [128, 0.3]])
  const img = ctx.createImageData(size, size)
  const rng = createRng('grass-blades')
  for (let i = 0; i < size * size; i++) {
    const v = 0.5 + (n[i] - 0.5) * 0.55 + (rng.next() - 0.5) * 0.16
    const g = Math.max(0, Math.min(255, v * 255))
    img.data[i * 4] = g * 0.96
    img.data[i * 4 + 1] = g
    img.data[i * 4 + 2] = g * 0.94
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  // Blade flecks.
  for (let i = 0; i < 2600; i++) {
    const x = rng.next() * size
    const y = rng.next() * size
    ctx.strokeStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + rng.range(-1.2, 1.2), y - rng.range(1.5, 4))
    ctx.stroke()
  }
  grassDetailTex = finish(c, { repeat: [1, 1], srgb: false })
  return grassDetailTex
}

let dirtDetailTex: THREE.CanvasTexture | null = null
/** Neutral-gray clay grain with pebbles; used as a detail multiplier. */
export function dirtDetailTexture(): THREE.CanvasTexture {
  if (dirtDetailTex) return dirtDetailTex
  const size = 256
  const [c, ctx] = makeCanvas(size, size)
  const n = fbmField(size, 'dirt-detail', [[4, 0.4], [16, 0.35], [64, 0.35]])
  const img = ctx.createImageData(size, size)
  const rng = createRng('dirt-grain')
  for (let i = 0; i < size * size; i++) {
    const v = 0.5 + (n[i] - 0.5) * 0.5 + (rng.next() - 0.5) * 0.14
    const g = Math.max(0, Math.min(255, v * 255))
    img.data[i * 4] = g
    img.data[i * 4 + 1] = g
    img.data[i * 4 + 2] = g
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  for (let i = 0; i < 380; i++) {
    const x = rng.next() * size
    const y = rng.next() * size
    const r = rng.range(0.5, 1.6)
    ctx.fillStyle = rng.chance(0.6) ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.22)'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  dirtDetailTex = finish(c, { repeat: [1, 1], srgb: false })
  return dirtDetailTex
}

/* -------------------------------------------------------------- the field */

/** Region of the field paint map, game coords (ft). */
export const FIELD_MAP = { x0: -300, x1: 300, y0: -110, y1: 430 }

const GRASS_LIGHT: [number, number, number] = [74, 138, 63]
const GRASS_DARK: [number, number, number] = [58, 117, 52]
const CLAY = '#a86d44'
const CLAY_DARK = '#8f5a36'
const TRACK = '#7d5a3e'
const CHALK = 'rgba(246, 243, 234, 0.96)'

let fieldTex: THREE.CanvasTexture | null = null
let fieldTexPpf = 0
/**
 * One painted map for the whole playing surface: checkerboard mowing, the
 * infield skin, base paths, cutouts, warning track and chalk. `ppf` is canvas
 * pixels per foot.
 */
export function fieldPaintTexture(ppf: number): THREE.CanvasTexture {
  if (fieldTex && fieldTexPpf === ppf) return fieldTex
  fieldTex?.dispose()
  const { x0, x1, y0, y1 } = FIELD_MAP
  const W = Math.round((x1 - x0) * ppf)
  const H = Math.round((y1 - y0) * ppf)
  const [c, ctx] = makeCanvas(W, H)
  const px = (x: number) => (x - x0) * ppf
  const py = (y: number) => (y1 - y) * ppf

  // 1. Grass with a diamond checkerboard aligned to the foul lines.
  const img = ctx.createImageData(W, H)
  const noise = makeNoise('field-mottle', 64)
  const noise2 = makeNoise('field-mottle-2', 256)
  const band = 15
  for (let j = 0; j < H; j++) {
    const gy = y1 - j / ppf
    for (let i = 0; i < W; i++) {
      const gx = x0 + i / ppf
      const u = (gx + gy) * Math.SQRT1_2
      const v = (gy - gx) * Math.SQRT1_2
      // Soft-edged checker: the mower's pass blends at the band seams.
      const sv = Math.sin((u / band) * Math.PI) * Math.sin((v / band) * Math.PI)
      const check = Math.min(1, Math.max(0, sv * 3.2 + 0.5))
      const m = noise(gx / 26, gy / 26) * 0.6 + noise2(gx / 5, gy / 5) * 0.4
      const shade = 0.9 + m * 0.2
      const k = (j * W + i) * 4
      img.data[k] = (GRASS_DARK[0] + (GRASS_LIGHT[0] - GRASS_DARK[0]) * check) * shade
      img.data[k + 1] = (GRASS_DARK[1] + (GRASS_LIGHT[1] - GRASS_DARK[1]) * check) * shade
      img.data[k + 2] = (GRASS_DARK[2] + (GRASS_LIGHT[2] - GRASS_DARK[2]) * check) * shade
      img.data[k + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  const dirtFill = (color: string) => {
    ctx.fillStyle = color
    ctx.fill()
  }
  const arcPath = (cx: number, cy: number, r: number) => {
    ctx.beginPath()
    ctx.arc(px(cx), py(cy), r * ppf, 0, Math.PI * 2)
  }

  // 2. Warning track: a 15 ft clay band inside the fence, foul pole to foul pole.
  ctx.beginPath()
  const steps = 120
  for (let s = 0; s <= steps; s++) {
    const phi = -FOUL_ANGLE - 6 * DEG + ((FOUL_ANGLE + 6 * DEG) * 2 * s) / steps
    const r = wallR(phi) + 2
    const x = r * Math.sin(phi)
    const y = r * Math.cos(phi)
    if (s === 0) ctx.moveTo(px(x), py(y))
    else ctx.lineTo(px(x), py(y))
  }
  for (let s = steps; s >= 0; s--) {
    const phi = -FOUL_ANGLE - 6 * DEG + ((FOUL_ANGLE + 6 * DEG) * 2 * s) / steps
    const r = wallR(phi) - 15
    ctx.lineTo(px(r * Math.sin(phi)), py(r * Math.cos(phi)))
  }
  ctx.closePath()
  dirtFill(TRACK)
  // Foul-territory track strip along the stands.
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(px(0), py(0))
    ctx.rotate(side * FOUL_ANGLE)
    ctx.fillStyle = TRACK
    ctx.fillRect(side > 0 ? 44 * ppf : -58 * ppf, -335 * ppf, 14 * ppf, 300 * ppf)
    ctx.restore()
  }

  // 3. Infield skin: the 95 ft arc around the front of the rubber, closed by
  //    the foul lines (the arc meets the lines at ~70° either side), then the
  //    infield grass is cut back in from the untouched grass pixels.
  const moundY = 59 - 17 / 12
  ctx.beginPath()
  ctx.moveTo(px(0), py(0))
  for (let s = 0; s <= 96; s++) {
    const a = -72 * DEG + (144 * DEG * s) / 96
    ctx.lineTo(px(95 * Math.sin(a)), py(moundY + 95 * Math.cos(a)))
  }
  ctx.closePath()
  dirtFill(CLAY)

  const grassOnly = document.createElement('canvas')
  grassOnly.width = W
  grassOnly.height = H
  grassOnly.getContext('2d')?.putImageData(img, 0, 0)
  const inset = 4.5
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(px(0), py(9.5))
  ctx.lineTo(px(63.64 - inset * 1.6), py(63.64 - inset * 0.3))
  ctx.quadraticCurveTo(px(28), py(116), px(0), py(127.28 - 11))
  ctx.quadraticCurveTo(px(-28), py(116), px(-63.64 + inset * 1.6), py(63.64 - inset * 0.3))
  ctx.closePath()
  ctx.clip()
  ctx.drawImage(grassOnly, 0, 0)
  ctx.restore()

  // Base paths (dirt running lanes home→1B / home→3B), 3 ft each side.
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(px(0), py(0))
    ctx.rotate(side * FOUL_ANGLE)
    ctx.fillStyle = CLAY
    ctx.fillRect(-3.2 * ppf, -92 * ppf, 6.4 * ppf, 88 * ppf)
    ctx.restore()
  }

  // Cutouts: home plate circle (13 ft), mound (9 ft), base circles.
  arcPath(0, -0.7, 13.2)
  dirtFill(CLAY)
  arcPath(0, moundY, 9.2)
  dirtFill(CLAY_DARK)
  for (const b of [{ x: 63.64, y: 63.64 }, { x: 0, y: 127.28 }, { x: -63.64, y: 63.64 }]) {
    arcPath(b.x, b.y, 13)
    dirtFill(CLAY)
  }

  // On-deck circles (5 ft diameter, 37 ft off the plate).
  for (const side of [-1, 1]) {
    const cx = side * 36
    const cy = -18
    arcPath(cx, cy, 2.6)
    ctx.fillStyle = side < 0 ? HOME_TEAM.primary : AWAY_TEAM.primary
    ctx.fill()
    ctx.lineWidth = 0.25 * ppf
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'
    ctx.stroke()
  }

  // Clay mottling over all dirt: paint dark/light blotches clipped to clay-ish pixels.
  const blot = createRng('clay-blotch')
  ctx.globalCompositeOperation = 'source-atop'
  for (let i = 0; i < 520; i++) {
    const gx = blot.range(-110, 110)
    const gy = blot.range(-20, 150)
    const r = blot.range(2, 9)
    const g = ctx.createRadialGradient(px(gx), py(gy), 0, px(gx), py(gy), r * ppf)
    g.addColorStop(0, blot.chance(0.5) ? 'rgba(70,40,20,0.08)' : 'rgba(200,150,110,0.07)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(px(gx - r), py(gy + r), 2 * r * ppf, 2 * r * ppf)
  }
  ctx.globalCompositeOperation = 'source-over'

  // 4. Chalk: foul lines to the poles, coach's boxes, running lane.
  ctx.strokeStyle = CHALK
  ctx.lineCap = 'butt'
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(px(0), py(0))
    ctx.rotate(side * FOUL_ANGLE)
    ctx.fillStyle = CHALK
    ctx.fillRect(-0.16 * ppf, -335 * ppf, 0.32 * ppf, 331 * ppf)
    ctx.restore()
    // Coach's box (10 × 20 ft), 15 ft beyond the base, 8 ft off the line.
    ctx.save()
    ctx.translate(px(side * 63.64), py(63.64))
    ctx.rotate(side * FOUL_ANGLE)
    ctx.lineWidth = 0.3 * ppf
    ctx.strokeRect(side * 8 * ppf + (side < 0 ? -10 * ppf : 0), -12 * ppf, 10 * ppf, 20 * ppf)
    ctx.restore()
  }
  // First-base running lane (3 ft wide, last 45 ft).
  ctx.save()
  ctx.translate(px(0), py(0))
  ctx.rotate(FOUL_ANGLE)
  ctx.lineWidth = 0.3 * ppf
  ctx.beginPath()
  ctx.moveTo(3 * ppf, -45 * ppf)
  ctx.lineTo(3 * ppf, -90 * ppf)
  ctx.stroke()
  ctx.restore()

  fieldTex = finish(c, { aniso: 16 })
  fieldTexPpf = ppf
  return fieldTex
}

/** Home-plate circle radius (ft) and the hi-res map's half extent. */
export const HOME_CIRCLE_R = 13.2

let homeTex: THREE.CanvasTexture | null = null
/**
 * High-resolution home-plate dirt (the camera lives ~6 ft from it): batter's
 * boxes, catcher's box, the start of the foul lines, rake lines and cleat
 * scuffs. Transparent outside the dirt circle.
 */
export function homeCircleTexture(): THREE.CanvasTexture {
  if (homeTex) return homeTex
  const size = 2048
  const half = HOME_CIRCLE_R + 0.6
  const ppf = size / (half * 2)
  const [c, ctx] = makeCanvas(size, size)
  // Circle centred at game (0, -0.7); canvas top = +y (toward the mound).
  const cx0 = 0
  const cy0 = -0.7
  const px = (x: number) => (x - cx0 + half) * ppf
  const py = (y: number) => (cy0 + half - y) * ppf

  ctx.save()
  ctx.beginPath()
  ctx.arc(px(cx0), py(cy0), HOME_CIRCLE_R * ppf, 0, Math.PI * 2)
  ctx.clip()

  // Clay base with fractal mottling.
  const n = makeNoise('home-clay', 32)
  const n2 = makeNoise('home-clay-2', 128)
  const img = ctx.createImageData(size, size)
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const m = n((i / size) * 12, (j / size) * 12) * 0.55 + n2((i / size) * 60, (j / size) * 60) * 0.45
      const shade = 0.86 + m * 0.26
      const k = (j * size + i) * 4
      img.data[k] = 170 * shade
      img.data[k + 1] = 110 * shade
      img.data[k + 2] = 70 * shade
      img.data[k + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  // putImageData ignores the clip; re-clip by erasing outside the circle later.

  const rng = createRng('home-scuffs')
  // Rake arcs.
  ctx.lineWidth = 1.2
  for (let r = 3; r < HOME_CIRCLE_R; r += 0.42) {
    ctx.strokeStyle = `rgba(80,48,26,${0.05 + rng.next() * 0.05})`
    ctx.beginPath()
    ctx.arc(px(cx0), py(cy0), r * ppf, 0, Math.PI * 2)
    ctx.stroke()
  }
  // Worn, darker (watered) clay in the boxes and around the plate.
  for (const bx of [-3.2, 3.2, 0]) {
    const g = ctx.createRadialGradient(px(bx), py(bx === 0 ? -3.8 : 0.3), 0, px(bx), py(bx === 0 ? -3.8 : 0.3), 4.2 * ppf)
    g.addColorStop(0, 'rgba(70,38,18,0.35)')
    g.addColorStop(1, 'rgba(70,38,18,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  // Cleat scuffs and divots in the boxes.
  for (let i = 0; i < 420; i++) {
    const side = rng.chance(0.5) ? -1 : 1
    const x = side * rng.range(2.1, 4.8)
    const y = rng.range(-2.6, 3.2)
    ctx.fillStyle = rng.chance(0.55) ? 'rgba(60,32,16,0.28)' : 'rgba(215,170,130,0.22)'
    ctx.save()
    ctx.translate(px(x), py(y))
    ctx.rotate(rng.range(-0.8, 0.8))
    ctx.beginPath()
    ctx.ellipse(0, 0, rng.range(0.06, 0.24) * ppf, rng.range(0.03, 0.1) * ppf, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  // Fine pebbles.
  for (let i = 0; i < 9000; i++) {
    const a = rng.next() * Math.PI * 2
    const r = Math.sqrt(rng.next()) * HOME_CIRCLE_R
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(255,230,200,0.22)' : 'rgba(40,20,8,0.25)'
    ctx.fillRect(px(cx0 + Math.cos(a) * r), py(cy0 + Math.sin(a) * r), 1.6, 1.6)
  }

  // Chalk — slightly irregular, like a real liner.
  const chalkRect = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = CHALK
    ctx.fillRect(px(x), py(y + h), w * ppf, h * ppf)
    // Powder bleed.
    ctx.fillStyle = 'rgba(246,243,234,0.18)'
    ctx.fillRect(px(x) - 3, py(y + h) - 3, w * ppf + 6, h * ppf + 6)
  }
  const t = 0.24
  for (const side of [-1, 1]) {
    // Batter's box: 4 ft × 6 ft, inner line 6" off the plate, centred on the plate.
    const inner = 17 / 24 + 0.5
    const xIn = side > 0 ? inner : -inner - 4
    const yb = -17 / 24 - 3
    chalkRect(xIn, yb, 4, t) // back line
    chalkRect(xIn, yb + 6 - t, 4, t) // front line
    chalkRect(xIn, yb, t, 6) // inner
    chalkRect(xIn + 4 - t, yb, t, 6) // outer
  }
  // Catcher's box: 43" wide lines running back 8 ft from the batter's boxes.
  const cbx = 43 / 24
  chalkRect(-cbx - t / 2, -17 / 24 - 3 - 8, t, 8)
  chalkRect(cbx - t / 2, -17 / 24 - 3 - 8, t, 8)
  chalkRect(-cbx - t / 2, -17 / 24 - 3 - 8, cbx * 2 + t, t)
  // Foul lines leaving the box corners.
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(px(0), py(0))
    ctx.rotate(side * FOUL_ANGLE)
    ctx.fillStyle = CHALK
    ctx.fillRect(-0.16 * ppf, -20 * ppf, 0.32 * ppf, 15.7 * ppf)
    ctx.restore()
  }
  // Scuff some chalk away where hitters dig in.
  ctx.globalCompositeOperation = 'source-atop'
  for (let i = 0; i < 70; i++) {
    const side = rng.chance(0.5) ? -1 : 1
    ctx.fillStyle = 'rgba(150,95,60,0.55)'
    ctx.beginPath()
    ctx.ellipse(px(side * rng.range(1.2, 5.2)), py(rng.range(-3.6, 2.4)), rng.range(3, 14), rng.range(2, 6), rng.range(0, 3), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
  ctx.restore()

  // Soft circular alpha edge.
  ctx.globalCompositeOperation = 'destination-in'
  const edge = ctx.createRadialGradient(px(cx0), py(cy0), (HOME_CIRCLE_R - 0.35) * ppf, px(cx0), py(cy0), HOME_CIRCLE_R * ppf)
  edge.addColorStop(0, 'rgba(0,0,0,1)')
  edge.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = edge
  ctx.fillRect(0, 0, size, size)
  ctx.globalCompositeOperation = 'source-over'

  homeTex = finish(c, { aniso: 16 })
  return homeTex
}

let moundTex: THREE.CanvasTexture | null = null
/** Mound clay: landing-area wear in front of the rubber. Top-down, 20 ft square. */
export function moundTexture(): THREE.CanvasTexture {
  if (moundTex) return moundTex
  const size = 512
  const [c, ctx] = makeCanvas(size, size)
  const n = makeNoise('mound', 24)
  const img = ctx.createImageData(size, size)
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const s = 0.84 + n((i / size) * 10, (j / size) * 10) * 0.3
      const k = (j * size + i) * 4
      img.data[k] = 160 * s
      img.data[k + 1] = 102 * s
      img.data[k + 2] = 64 * s
      img.data[k + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const rng = createRng('mound-wear')
  // Landing holes toward home (canvas bottom).
  for (let i = 0; i < 140; i++) {
    const x = size / 2 + rng.range(-40, 40)
    const y = size / 2 + rng.range(40, 150)
    ctx.fillStyle = rng.chance(0.6) ? 'rgba(60,32,14,0.25)' : 'rgba(210,160,120,0.16)'
    ctx.beginPath()
    ctx.ellipse(x, y, rng.range(3, 12), rng.range(2, 6), rng.range(0, 3), 0, Math.PI * 2)
    ctx.fill()
  }
  moundTex = finish(c, { aniso: 8 })
  return moundTex
}

/* ----------------------------------------------------------------- stands */

let seatsTex: THREE.CanvasTexture | null = null
/**
 * One tile = 16 seats across × one row. v ∈ [0, 0.78] is the tread (seat
 * cushion + back), the rest is the concrete riser. Seats 15–16 are the aisle.
 */
export function seatsTexture(): THREE.CanvasTexture {
  if (seatsTex) return seatsTex
  const W = 512
  const H = 64
  const [c, ctx] = makeCanvas(W, H)
  const seatW = W / 16
  ctx.fillStyle = '#5b606a'
  ctx.fillRect(0, 0, W, H)
  // Riser (top of the canvas = v 1).
  ctx.fillStyle = '#3e434b'
  ctx.fillRect(0, 0, W, H * 0.22)
  const seat = new THREE.Color(HOME_TEAM.primary).lerp(new THREE.Color('#1e5a8c'), 0.35)
  const seatCss = `#${seat.getHexString()}`
  const seatLight = `#${seat.clone().lerp(new THREE.Color('#ffffff'), 0.18).getHexString()}`
  for (let s = 0; s < 14; s++) {
    const x = s * seatW
    ctx.fillStyle = seatCss
    ctx.fillRect(x + 2, H * 0.3, seatW - 4, H * 0.6)
    ctx.fillStyle = seatLight
    ctx.fillRect(x + 3, H * 0.3, seatW - 6, H * 0.12)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(x + 2, H * 0.86, seatW - 4, 3)
  }
  // Aisle steps.
  ctx.fillStyle = '#747a84'
  ctx.fillRect(14 * seatW, H * 0.22, seatW * 2, H * 0.78)
  ctx.fillStyle = '#e8c84f'
  ctx.fillRect(14 * seatW, H * 0.22, seatW * 2, 3)
  seatsTex = finish(c, { repeat: [1, 1], aniso: 8 })
  return seatsTex
}

let concreteTex: THREE.CanvasTexture | null = null
export function concreteTexture(): THREE.CanvasTexture {
  if (concreteTex) return concreteTex
  const size = 256
  const [c, ctx] = makeCanvas(size, size)
  const n = fbmField(size, 'concrete', [[6, 0.5], [24, 0.35], [96, 0.25]])
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < size * size; i++) {
    const g = 150 + (n[i] - 0.5) * 70
    img.data[i * 4] = g
    img.data[i * 4 + 1] = g * 1.01
    img.data[i * 4 + 2] = g * 1.04
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  concreteTex = finish(c, { repeat: [1, 1] })
  return concreteTex
}

let wallTex: THREE.CanvasTexture | null = null
/**
 * Outfield fence padding, unrolled from the left-field pole (u = 0) to the
 * right-field pole (u = 1): padded panels, sponsor boards, distance markers.
 */
export function outfieldWallTexture(): THREE.CanvasTexture {
  if (wallTex) return wallTex
  const W = 4096
  const H = 128
  const [c, ctx] = makeCanvas(W, H)
  const pad = '#1c4a37'
  ctx.fillStyle = pad
  ctx.fillRect(0, 0, W, H)
  // Pad seams.
  for (let x = 0; x < W; x += 40) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.fillRect(x, 0, 2, H)
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    ctx.fillRect(x + 2, 0, 2, H)
  }
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, 'rgba(255,255,255,0.08)')
  g.addColorStop(0.5, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.3)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // Sponsor panels in the alleys.
  const ads: Array<[number, string, string, string]> = [
    [0.18, '#f2f2ee', '#123b5c', 'BIG BEAUTIFUL'],
    [0.32, HOME_TEAM.accent, '#06121c', `${HOME_TEAM.abbr} NATION`],
    [0.68, '#f5b942', '#1a1206', 'UMPIRE SUPPLY CO'],
    [0.82, '#f2f2ee', '#8a2c3b', 'HOT DOGS · $2'],
  ]
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const [u, bg, fg, text] of ads) {
    const w = 360
    const x = u * W - w / 2
    ctx.fillStyle = bg
    ctx.fillRect(x, 28, w, 72)
    ctx.fillStyle = fg
    ctx.font = '700 44px "Bebas Neue", "Arial Narrow", sans-serif'
    ctx.fillText(text, u * W, 66)
  }
  // Distance markers: poles, alleys, center.
  const marks: Array<[number, string]> = [[0.035, '330'], [0.25, '375'], [0.5, '400'], [0.75, '375'], [0.965, '330']]
  for (const [u, text] of marks) {
    ctx.fillStyle = '#f7f4ea'
    ctx.font = '400 84px "Bebas Neue", "Arial Narrow", sans-serif'
    ctx.fillText(text, u * W, 68)
  }
  wallTex = finish(c, { aniso: 8 })
  return wallTex
}

let ribbonTex: THREE.CanvasTexture | null = null
/** LED ribbon board strip (scrolled at runtime via texture offset). */
export function ribbonTexture(): THREE.CanvasTexture {
  if (ribbonTex) return ribbonTex
  const W = 2048
  const H = 64
  const [c, ctx] = makeCanvas(W, H)
  const segs: Array<[string, string, string]> = [
    [HOME_TEAM.primary, HOME_TEAM.accent, `${HOME_TEAM.city} ${HOME_TEAM.name}`.toUpperCase()],
    ['#0b0f16', '#f5b942', 'BOTTOM OF THE 9TH'],
    [HOME_TEAM.accent, '#06121c', 'MAKE SOME NOISE'],
    ['#0b0f16', '#f2f6f9', 'BIG BEAUTIFUL UMPIRE APP'],
  ]
  const segW = W / segs.length
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  segs.forEach(([bg, fg, text], i) => {
    ctx.fillStyle = bg
    ctx.fillRect(i * segW, 0, segW, H)
    ctx.fillStyle = fg
    ctx.font = '400 46px "Bebas Neue", "Arial Narrow", sans-serif'
    ctx.fillText(text, i * segW + segW / 2, H / 2 + 3)
  })
  // LED pixel grid.
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  for (let x = 0; x < W; x += 4) ctx.fillRect(x, 0, 1, H)
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1)
  ribbonTex = finish(c, { repeat: [1, 1], aniso: 8 })
  return ribbonTex
}

let windowsTex: THREE.CanvasTexture | null = null
/** Skyline facade: lit/unlit window grid (emissive at night). */
export function windowsTexture(): THREE.CanvasTexture {
  if (windowsTex) return windowsTex
  const W = 256
  const H = 512
  const [c, ctx] = makeCanvas(W, H)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, W, H)
  const rng = createRng('windows')
  for (let y = 4; y < H; y += 12) {
    for (let x = 4; x < W; x += 10) {
      if (!rng.chance(0.22)) continue
      const warm = rng.chance(0.7)
      const b = rng.range(0.45, 1)
      ctx.fillStyle = warm ? `rgba(255,${190 + b * 40},${120 + b * 50},${b})` : `rgba(170,210,255,${b * 0.8})`
      ctx.fillRect(x, y, 6, 7)
    }
  }
  windowsTex = finish(c, { repeat: [1, 1] })
  return windowsTex
}

/* ------------------------------------------------------------------- misc */

let ballTex: THREE.CanvasTexture | null = null
/** Baseball skin: cowhide + the figure-eight seam with stitch chevrons. */
export function ballTexture(): THREE.CanvasTexture {
  if (ballTex) return ballTex
  const W = 512
  const H = 256
  const [c, ctx] = makeCanvas(W, H)
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#f6f3ec')
  g.addColorStop(1, '#ebe6db')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  const rng = createRng('ball-hide')
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)'
    ctx.fillRect(rng.next() * W, rng.next() * H, 2, 2)
  }
  // Seam curve on the equirect map: the classic tennis-ball curve.
  const seamY = (x: number, phase: number) => {
    const t = (x / W) * Math.PI * 2
    return H / 2 + Math.sin(t * 2 + phase) * H * 0.26
  }
  for (const phase of [0, Math.PI]) {
    ctx.strokeStyle = 'rgba(160,20,36,0.45)'
    ctx.lineWidth = 7
    ctx.beginPath()
    for (let x = 0; x <= W; x += 2) {
      const y = seamY(x, phase)
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    // Stitch chevrons.
    ctx.strokeStyle = '#c42135'
    ctx.lineWidth = 2.6
    for (let x = 0; x < W; x += 9) {
      const y = seamY(x, phase)
      const y2 = seamY(x + 1, phase)
      const ang = Math.atan2(y2 - y, 1)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(ang)
      ctx.beginPath()
      ctx.moveTo(-3, -6)
      ctx.lineTo(1, 0)
      ctx.lineTo(-3, 6)
      ctx.stroke()
      ctx.restore()
    }
  }
  ballTex = finish(c, { aniso: 8 })
  return ballTex
}

let glowTex: THREE.CanvasTexture | null = null
/** Soft radial falloff for glows, flares and particles. */
export function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex
  const size = 128
  const [c, ctx] = makeCanvas(size, size)
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(255,255,255,0.75)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.18)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  glowTex = finish(c, { srgb: false })
  return glowTex
}

let flareTex: THREE.CanvasTexture | null = null
/** Stadium-lamp star flare: hot core with horizontal/vertical streaks. */
export function flareTexture(): THREE.CanvasTexture {
  if (flareTex) return flareTex
  const size = 256
  const [c, ctx] = makeCanvas(size, size)
  const m = size / 2
  const core = ctx.createRadialGradient(m, m, 0, m, m, m)
  core.addColorStop(0, 'rgba(255,255,255,1)')
  core.addColorStop(0.08, 'rgba(255,250,235,0.85)')
  core.addColorStop(0.3, 'rgba(255,235,200,0.16)')
  core.addColorStop(1, 'rgba(255,235,200,0)')
  ctx.fillStyle = core
  ctx.fillRect(0, 0, size, size)
  ctx.globalCompositeOperation = 'lighter'
  for (const [w, h] of [[size, 5], [5, size * 0.6]] as const) {
    const g = ctx.createRadialGradient(m, m, 0, m, m, Math.max(w, h) / 2)
    g.addColorStop(0, 'rgba(255,245,225,0.55)')
    g.addColorStop(1, 'rgba(255,245,225,0)')
    ctx.fillStyle = g
    ctx.fillRect(m - w / 2, m - h / 2, w, h)
  }
  flareTex = finish(c, { srgb: false })
  return flareTex
}

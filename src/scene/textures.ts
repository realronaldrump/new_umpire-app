import * as THREE from 'three'

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  return [c, ctx]
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number): void {
  for (let i = 0; i < n; i++) {
    const v = Math.random()
    ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`
    ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5)
  }
}

let grassTex: THREE.CanvasTexture | null = null
export function grassTexture(): THREE.CanvasTexture {
  if (grassTex) return grassTex
  const [c, ctx] = makeCanvas(512, 512)
  ctx.fillStyle = '#2a6839'
  ctx.fillRect(0, 0, 512, 512)
  // Mowing stripes.
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.055)' : 'rgba(0,20,0,0.075)'
    ctx.fillRect(i * 64, 0, 64, 512)
  }
  speckle(ctx, 512, 512, 5200, 0.05)
  grassTex = new THREE.CanvasTexture(c)
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping
  grassTex.repeat.set(9, 9)
  grassTex.anisotropy = 8
  grassTex.colorSpace = THREE.SRGBColorSpace
  return grassTex
}

let dirtTex: THREE.CanvasTexture | null = null
export function dirtTexture(): THREE.CanvasTexture {
  if (dirtTex) return dirtTex
  const [c, ctx] = makeCanvas(512, 512)
  ctx.fillStyle = '#84603f'
  ctx.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 60; i++) {
    const g = ctx.createRadialGradient(
      Math.random() * 512, Math.random() * 512, 4,
      Math.random() * 512, Math.random() * 512, 90,
    )
    g.addColorStop(0, 'rgba(60,40,22,0.10)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 512, 512)
  }
  // Rake lines.
  ctx.strokeStyle = 'rgba(50,34,18,0.16)'
  ctx.lineWidth = 1.5
  for (let i = 0; i < 46; i++) {
    ctx.beginPath()
    ctx.moveTo(0, i * 11.5 + Math.random() * 4)
    ctx.lineTo(512, i * 11.5 + Math.random() * 4)
    ctx.stroke()
  }
  speckle(ctx, 512, 512, 4200, 0.06)
  dirtTex = new THREE.CanvasTexture(c)
  dirtTex.wrapS = dirtTex.wrapT = THREE.RepeatWrapping
  dirtTex.repeat.set(5, 5)
  dirtTex.anisotropy = 8
  dirtTex.colorSpace = THREE.SRGBColorSpace
  return dirtTex
}

let ballTex: THREE.CanvasTexture | null = null
/** Equirect-ish baseball skin: white leather + two red seam loops. */
export function ballTexture(): THREE.CanvasTexture {
  if (ballTex) return ballTex
  const [c, ctx] = makeCanvas(256, 128)
  ctx.fillStyle = '#f4f1ea'
  ctx.fillRect(0, 0, 256, 128)
  speckle(ctx, 256, 128, 320, 0.035)
  ctx.strokeStyle = '#c9273a'
  ctx.lineWidth = 4
  const seam = (phase: number) => {
    ctx.beginPath()
    for (let x = 0; x <= 256; x += 2) {
      const t = (x / 256) * Math.PI * 2
      const y = 64 + Math.sin(t * 2 + phase) * 34
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  seam(0)
  seam(Math.PI)
  // Stitch ticks.
  ctx.strokeStyle = '#a01727'
  ctx.lineWidth = 1.6
  for (let x = 0; x < 256; x += 7) {
    for (const phase of [0, Math.PI]) {
      const t = (x / 256) * Math.PI * 2
      const y = 64 + Math.sin(t * 2 + phase) * 34
      ctx.beginPath()
      ctx.moveTo(x - 2, y - 3)
      ctx.lineTo(x + 2, y + 3)
      ctx.stroke()
    }
  }
  ballTex = new THREE.CanvasTexture(c)
  ballTex.colorSpace = THREE.SRGBColorSpace
  ballTex.anisotropy = 4
  return ballTex
}

let skyNightTex: THREE.CanvasTexture | null = null
let skyDayTex: THREE.CanvasTexture | null = null
export function skyTexture(night: boolean): THREE.CanvasTexture {
  const cached = night ? skyNightTex : skyDayTex
  if (cached) return cached
  const [c, ctx] = makeCanvas(64, 512)
  const g = ctx.createLinearGradient(0, 0, 0, 512)
  if (night) {
    g.addColorStop(0, '#04070f')
    g.addColorStop(0.55, '#0a1424')
    g.addColorStop(0.82, '#15263e')
    g.addColorStop(1, '#1d3350')
  } else {
    g.addColorStop(0, '#3f7fd0')
    g.addColorStop(0.6, '#7db2e8')
    g.addColorStop(1, '#c8e0f4')
  }
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 512)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  if (night) skyNightTex = tex
  else skyDayTex = tex
  return tex
}

export interface RNG {
  next(): number
  range(min: number, max: number): number
  gauss(mean: number, sd: number): number
  int(maxExclusive: number): number
  pick<T>(items: readonly T[]): T
  chance(p: number): boolean
  /** Weighted pick: entries of [item, weight]. */
  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T
  fork(label: string): RNG
}

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createRng(seedText: string): RNG {
  const next = mulberry32(xmur3(seedText)())
  const rng: RNG = {
    next,
    range: (min, max) => min + (max - min) * next(),
    gauss: (mean, sd) => {
      const u = Math.max(next(), 1e-9)
      const v = next()
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    },
    int: (n) => Math.min(Math.max(0, n - 1), Math.floor(next() * n)),
    pick: (items) => items[rng.int(items.length)],
    chance: (p) => next() < p,
    weighted: (entries) => {
      let total = 0
      for (const [, w] of entries) total += Math.max(0, w)
      if (total <= 0) return entries[0][0]
      let roll = next() * total
      for (const [item, w] of entries) {
        roll -= Math.max(0, w)
        if (roll <= 0) return item
      }
      return entries[entries.length - 1][0]
    },
    fork: (label) => createRng(seedText + '::' + label),
  }
  return rng
}

export function randomSeedText(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v))

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Piecewise-linear interpolation over sorted [x, y] control points. */
export function plerp(points: ReadonlyArray<readonly [number, number]>, x: number): number {
  if (x <= points[0][0]) return points[0][1]
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1]
      const [x1, y1] = points[i]
      return lerp(y0, y1, (x - x0) / Math.max(1e-9, x1 - x0))
    }
  }
  return points[points.length - 1][1]
}

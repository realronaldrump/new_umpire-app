/**
 * All SFX are synthesized with the Web Audio API — nothing is fetched.
 * Every public method is safe to call before init() (it just no-ops).
 */

type NoiseColor = 'white' | 'pink'

class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private sfx: GainNode | null = null
  private crowdBus: GainNode | null = null
  private crowdBase: GainNode | null = null
  private tension = 0.25
  private vols = { master: 0.9, sfx: 0.9, crowd: 0.7, muted: false }
  private whooshStop: (() => void) | null = null
  private started = false

  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    try {
      const ctx = new AudioContext()
      this.ctx = ctx
      this.master = ctx.createGain()
      this.master.connect(ctx.destination)
      this.sfx = ctx.createGain()
      this.sfx.connect(this.master)
      this.crowdBus = ctx.createGain()
      this.crowdBus.connect(this.master)
      this.applyVolumes()
      this.startCrowd()
      this.started = true
    } catch {
      this.ctx = null
    }
  }

  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend()
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume()
  }

  setVolumes(master: number, sfx: number, crowd: number, muted: boolean): void {
    this.vols = { master, sfx, crowd, muted }
    this.applyVolumes()
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.sfx || !this.crowdBus) return
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(this.vols.muted ? 0 : this.vols.master, t, 0.05)
    this.sfx.gain.setTargetAtTime(this.vols.sfx, t, 0.05)
    this.crowdBus.gain.setTargetAtTime(this.vols.crowd, t, 0.05)
  }

  private noiseBuffer(seconds: number, color: NoiseColor): AudioBuffer | null {
    if (!this.ctx) return null
    const rate = this.ctx.sampleRate
    const buf = this.ctx.createBuffer(1, Math.max(1, Math.floor(seconds * rate)), rate)
    const data = buf.getChannelData(0)
    if (color === 'white') {
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    } else {
      // Paul Kellet pink noise approximation.
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
      for (let i = 0; i < data.length; i++) {
        const w = Math.random() * 2 - 1
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.969 * b2 + w * 0.153852
        b3 = 0.8665 * b3 + w * 0.3104856
        b4 = 0.55 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.016898
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
        b6 = w * 0.115926
      }
    }
    return buf
  }

  private startCrowd(): void {
    if (!this.ctx || !this.crowdBus) return
    const buf = this.noiseBuffer(6, 'pink')
    if (!buf) return
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 900
    lp.Q.value = 0.4
    const hp = this.ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 180
    this.crowdBase = this.ctx.createGain()
    this.crowdBase.gain.value = 0.16
    src.connect(lp)
    lp.connect(hp)
    hp.connect(this.crowdBase)
    this.crowdBase.connect(this.crowdBus)
    src.start()

    // Slow breathing so the murmur never sounds like a fan hum.
    const lfoOsc = this.ctx.createOscillator()
    lfoOsc.frequency.value = 0.09
    const lfoGain = this.ctx.createGain()
    lfoGain.gain.value = 0.03
    lfoOsc.connect(lfoGain)
    lfoGain.connect(this.crowdBase.gain)
    lfoOsc.start()
  }

  /** 0..1 — baseline crowd energy (leverage of the moment). */
  setTension(level: number): void {
    this.tension = Math.min(1, Math.max(0, level))
    if (!this.ctx || !this.crowdBase) return
    const target = 0.13 + this.tension * 0.14
    this.crowdBase.gain.setTargetAtTime(target, this.ctx.currentTime, 0.8)
  }

  /** A crowd surge: cheer for hits, roar for big moments. */
  swell(amount: number, seconds = 2.2): void {
    if (!this.ctx || !this.crowdBus) return
    const buf = this.noiseBuffer(seconds + 0.5, 'pink')
    if (!buf) return
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1200
    bp.Q.value = 0.5
    const g = this.ctx.createGain()
    const t = this.ctx.currentTime
    const peak = 0.1 + amount * 0.45
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + seconds * 0.25)
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds)
    src.connect(bp)
    bp.connect(g)
    g.connect(this.crowdBus)
    src.start()
    src.stop(t + seconds + 0.4)
  }

  /** Disappointed grumble for a call the park doesn't like. */
  grumble(): void {
    if (!this.ctx || !this.crowdBus) return
    const buf = this.noiseBuffer(1.8, 'pink')
    if (!buf) return
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 420
    const g = this.ctx.createGain()
    const t = this.ctx.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.35)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
    src.connect(lp)
    lp.connect(g)
    g.connect(this.crowdBus)
    src.start()
    src.stop(t + 1.8)
  }

  mittPop(mph: number): void {
    if (!this.ctx || !this.sfx) return
    const t = this.ctx.currentTime
    const vel = Math.min(1.25, Math.max(0.6, mph / 95))

    const noise = this.ctx.createBufferSource()
    const nb = this.noiseBuffer(0.09, 'white')
    if (!nb) return
    noise.buffer = nb
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 850 + vel * 500
    bp.Q.value = 0.9
    const ng = this.ctx.createGain()
    ng.gain.setValueAtTime(0.9 * vel, t)
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08)
    noise.connect(bp)
    bp.connect(ng)
    ng.connect(this.sfx)
    noise.start(t)

    const thump = this.ctx.createOscillator()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(150 * vel, t)
    thump.frequency.exponentialRampToValueAtTime(55, t + 0.09)
    const tg = this.ctx.createGain()
    tg.gain.setValueAtTime(0.8 * vel, t)
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.11)
    thump.connect(tg)
    tg.connect(this.sfx)
    thump.start(t)
    thump.stop(t + 0.13)
  }

  batCrack(quality: 'weak' | 'medium' | 'hard'): void {
    if (!this.ctx || !this.sfx) return
    const t = this.ctx.currentTime
    const amt = quality === 'hard' ? 1 : quality === 'medium' ? 0.75 : 0.5

    const nb = this.noiseBuffer(0.05, 'white')
    if (!nb) return
    const noise = this.ctx.createBufferSource()
    noise.buffer = nb
    const hp = this.ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1400
    const ng = this.ctx.createGain()
    ng.gain.setValueAtTime(1.0 * amt, t)
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.045)
    noise.connect(hp)
    hp.connect(ng)
    ng.connect(this.sfx)
    noise.start(t)

    const knock = this.ctx.createOscillator()
    knock.type = 'triangle'
    knock.frequency.setValueAtTime(950, t)
    knock.frequency.exponentialRampToValueAtTime(380, t + 0.05)
    const kg = this.ctx.createGain()
    kg.gain.setValueAtTime(0.55 * amt, t)
    kg.gain.exponentialRampToValueAtTime(0.001, t + 0.07)
    knock.connect(kg)
    kg.connect(this.sfx)
    knock.start(t)
    knock.stop(t + 0.08)
  }

  /** Rising air as the pitch approaches; auto-fades at the catch. */
  whoosh(flightSeconds: number): void {
    if (!this.ctx || !this.sfx) return
    this.whooshStop?.()
    const dur = Math.min(1.4, Math.max(0.25, flightSeconds))
    const nb = this.noiseBuffer(dur + 0.1, 'white')
    if (!nb) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = nb
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.6
    bp.frequency.setValueAtTime(500, t)
    bp.frequency.exponentialRampToValueAtTime(2600, t + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.9)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(bp)
    bp.connect(g)
    g.connect(this.sfx)
    src.start(t)
    src.stop(t + dur + 0.05)
    this.whooshStop = () => {
      try {
        g.gain.cancelScheduledValues(this.ctx?.currentTime ?? 0)
        g.gain.value = 0
        src.stop()
      } catch { /* already stopped */ }
      this.whooshStop = null
    }
  }

  stopWhoosh(): void {
    this.whooshStop?.()
  }

  /** Stylized umpire bark. Not a voice sample — a shaped vocal grunt. */
  umpCall(kind: 'ball' | 'strike', enabled: boolean): void {
    if (!enabled || !this.ctx || !this.sfx) return
    const t = this.ctx.currentTime + 0.05
    const mk = (start: number, dur: number, f0: number, f1: number, formant: number, gain: number) => {
      if (!this.ctx || !this.sfx) return
      const osc = this.ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(f0, start)
      osc.frequency.exponentialRampToValueAtTime(f1, start + dur)
      const bp = this.ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = formant
      bp.Q.value = 1.1
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(gain, start + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      osc.connect(bp)
      bp.connect(g)
      g.connect(this.sfx)
      osc.start(start)
      osc.stop(start + dur + 0.02)
    }
    if (kind === 'strike') {
      // "HEE-YAH!" — two sharp barks.
      mk(t, 0.11, 180, 130, 900, 0.34)
      mk(t + 0.12, 0.2, 150, 82, 640, 0.42)
    } else {
      mk(t, 0.22, 120, 88, 480, 0.3)
    }
  }

  uiClick(): void {
    if (!this.ctx || !this.sfx) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(1250, t)
    osc.frequency.exponentialRampToValueAtTime(720, t + 0.05)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.18, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
    osc.connect(g)
    g.connect(this.sfx)
    osc.start(t)
    osc.stop(t + 0.07)
  }

  stinger(kind: 'walkoff' | 'over'): void {
    if (!this.ctx || !this.sfx) return
    const t = this.ctx.currentTime
    const notes = kind === 'walkoff' ? [220, 277.18, 329.63, 440] : [196, 233.08, 293.66]
    notes.forEach((f, i) => {
      if (!this.ctx || !this.sfx) return
      const osc = this.ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = f
      const g = this.ctx.createGain()
      const start = t + i * (kind === 'walkoff' ? 0.09 : 0.16)
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(0.22, start + 0.04)
      g.gain.exponentialRampToValueAtTime(0.0001, start + (kind === 'walkoff' ? 1.6 : 1.1))
      osc.connect(g)
      g.connect(this.sfx)
      osc.start(start)
      osc.stop(start + 1.8)
    })
    if (kind === 'walkoff') this.swell(1, 4.5)
  }

  /**
   * The park realizes a challenge is on: a fast murmur swell with an "ooooh"
   * bend, settling into held-breath tension.
   */
  challengeBuzz(): void {
    if (!this.ctx || !this.crowdBus) return
    const buf = this.noiseBuffer(2.6, 'pink')
    if (!buf) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 0.7
    bp.frequency.setValueAtTime(500, t)
    bp.frequency.exponentialRampToValueAtTime(1500, t + 0.5)
    bp.frequency.exponentialRampToValueAtTime(750, t + 2.2)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.4)
    g.gain.exponentialRampToValueAtTime(0.12, t + 2.4)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6)
    src.connect(bp)
    bp.connect(g)
    g.connect(this.crowdBus)
    src.start(t)
    src.stop(t + 2.7)
  }

  /** Hawk-eye style tracking blips while the ABS graphic measures the pitch. */
  absTracking(): void {
    if (!this.ctx || !this.sfx) return
    const t = this.ctx.currentTime
    for (let i = 0; i < 3; i++) {
      const start = t + 0.35 + i * 0.62
      const osc = this.ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(920 + i * 120, start)
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(0.16, start + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.22)
      osc.connect(g)
      g.connect(this.sfx)
      osc.start(start)
      osc.stop(start + 0.25)
    }
  }

  /** The ruling lands: home crowd erupts on an overturn, boos a lost challenge. */
  absVerdict(overturned: boolean): void {
    if (!this.ctx || !this.sfx) return
    const t = this.ctx.currentTime
    // Verdict thunk — a low stamp under either reaction.
    const thump = this.ctx.createOscillator()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(180, t)
    thump.frequency.exponentialRampToValueAtTime(62, t + 0.16)
    const tg = this.ctx.createGain()
    tg.gain.setValueAtTime(0.5, t)
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
    thump.connect(tg)
    tg.connect(this.sfx)
    thump.start(t)
    thump.stop(t + 0.22)

    if (overturned) {
      // Free baseball for the home side — roar plus a bright little fanfare.
      this.swell(0.95, 3.6)
      const notes = [261.63, 329.63, 392]
      notes.forEach((f, i) => {
        if (!this.ctx || !this.sfx) return
        const osc = this.ctx.createOscillator()
        osc.type = 'triangle'
        osc.frequency.value = f
        const g = this.ctx.createGain()
        const start = t + 0.1 + i * 0.07
        g.gain.setValueAtTime(0.0001, start)
        g.gain.exponentialRampToValueAtTime(0.16, start + 0.03)
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.9)
        osc.connect(g)
        g.connect(this.sfx)
        osc.start(start)
        osc.stop(start + 1)
      })
    } else {
      this.boo()
    }
  }

  /** Full-throated boos: descending vocal formants over a low rumble. */
  boo(): void {
    if (!this.ctx || !this.crowdBus) return
    const t = this.ctx.currentTime
    const buf = this.noiseBuffer(2.4, 'pink')
    if (buf) {
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      const lp = this.ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 360
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.34, t + 0.4)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3)
      src.connect(lp)
      lp.connect(g)
      g.connect(this.crowdBus)
      src.start(t)
      src.stop(t + 2.4)
    }
    // A few overlapping "boooo" voices, slightly detuned, all sinking.
    for (let i = 0; i < 4; i++) {
      const osc = this.ctx.createOscillator()
      osc.type = 'sawtooth'
      const f0 = 165 + i * 14
      const start = t + 0.12 + i * 0.09
      osc.frequency.setValueAtTime(f0, start)
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.72, start + 1.6)
      const bp = this.ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 340
      bp.Q.value = 1.4
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(0.075, start + 0.2)
      g.gain.exponentialRampToValueAtTime(0.0001, start + 1.7)
      osc.connect(bp)
      bp.connect(g)
      g.connect(this.crowdBus)
      osc.start(start)
      osc.stop(start + 1.8)
    }
  }

  get isStarted(): boolean {
    return this.started
  }
}

export const audio = new AudioEngine()

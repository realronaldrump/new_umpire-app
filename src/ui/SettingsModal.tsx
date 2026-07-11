import { audio } from '../audio/engine'
import { useGame } from '../store/game'
import { useSettings } from '../store/settings'
import { useUi } from '../store/ui'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="setrow">
      <span className="setrow__label">{label}</span>
      <span className="setrow__ctl">{children}</span>
    </label>
  )
}

function Slider({
  value, min, max, step, onChange, format,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  return (
    <>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <em className="setrow__val">{format ? format(value) : value}</em>
    </>
  )
}

export function SettingsModal() {
  const open = useUi((s) => s.settingsOpen)
  const s = useSettings()
  const phase = useGame((p) => p.phase)
  if (!open) return null

  const close = () => {
    audio.uiClick()
    useUi.getState().set({ settingsOpen: false })
    if (phase !== 'menu' && phase !== 'inningOver') useGame.getState().setPaused(false)
  }

  const inGame = phase !== 'menu' && phase !== 'inningOver'

  return (
    <div className="veil veil--settings" onClick={(e) => { if (e.target === e.currentTarget) close() }}>
      <div className="settings panel" onKeyDown={(e) => e.stopPropagation()}>
        <header className="settings__head">
          <span>SETTINGS</span>
          <button className="icon-btn" onClick={close} title="Close">✕</button>
        </header>

        <div className="settings__cols">
          <section>
            <h3>GAME</h3>
            <Row label="Difficulty">
              <select value={s.difficulty} onChange={(e) => s.set({ difficulty: e.target.value as typeof s.difficulty })}>
                <option value="rookie">Rookie</option>
                <option value="pro">Pro</option>
                <option value="legend">Legend</option>
              </select>
            </Row>
            <Row label="Pitch speed">
              <select
                value={s.pitchSpeed === 'auto' ? 'auto' : 'custom'}
                onChange={(e) => s.set({ pitchSpeed: e.target.value === 'auto' ? 'auto' : 0.85 })}
              >
                <option value="auto">Auto (difficulty)</option>
                <option value="custom">Custom</option>
              </select>
            </Row>
            {s.pitchSpeed !== 'auto' && (
              <Row label="× real speed">
                <Slider value={s.pitchSpeed} min={0.55} max={1} step={0.05} onChange={(v) => s.set({ pitchSpeed: v })} format={(v) => `${Math.round(v * 100)}%`} />
              </Row>
            )}
            <Row label="Call window">
              <select
                value={s.callWindow === 'auto' ? 'auto' : 'custom'}
                onChange={(e) => s.set({ callWindow: e.target.value === 'auto' ? 'auto' : 1400 })}
              >
                <option value="auto">Auto (difficulty)</option>
                <option value="custom">Custom</option>
              </select>
            </Row>
            {s.callWindow !== 'auto' && (
              <Row label="Window (s)">
                <Slider value={s.callWindow} min={600} max={3000} step={100} onChange={(v) => s.set({ callWindow: v })} format={(v) => `${(v / 1000).toFixed(1)}s`} />
              </Row>
            )}
            <Row label="Zone ghost">
              <select value={s.zoneVisibility} onChange={(e) => s.set({ zoneVisibility: e.target.value as typeof s.zoneVisibility })}>
                <option value="auto">Auto (difficulty)</option>
                <option value="always">Always visible</option>
                <option value="never">Never visible</option>
              </select>
            </Row>
            <Row label="No-call policy">
              <select value={s.hesitationPolicy} onChange={(e) => s.set({ hesitationPolicy: e.target.value as typeof s.hesitationPolicy })}>
                <option value="miss">Counts as a miss</option>
                <option value="penalty">Grade penalty only</option>
              </select>
            </Row>
          </section>

          <section>
            <h3>CAMERA</h3>
            <Row label="Eye height">
              <Slider value={s.camHeight} min={3.1} max={4.8} step={0.05} onChange={(v) => s.set({ camHeight: v })} format={(v) => `${v.toFixed(2)} ft`} />
            </Row>
            <Row label="Setback">
              <Slider value={s.camBack} min={4.5} max={8.5} step={0.1} onChange={(v) => s.set({ camBack: v })} format={(v) => `${v.toFixed(1)} ft`} />
            </Row>
            <Row label="Field of view">
              <Slider value={s.camFov} min={45} max={62} step={1} onChange={(v) => s.set({ camFov: v })} format={(v) => `${v}°`} />
            </Row>
            <Row label="Slot offset">
              <Slider value={s.slotOffset} min={0} max={1.5} step={0.05} onChange={(v) => s.set({ slotOffset: v })} format={(v) => `${v.toFixed(2)} ft`} />
            </Row>

            <h3>VIDEO</h3>
            <Row label="Quality">
              <select value={s.quality} onChange={(e) => s.set({ quality: e.target.value as typeof s.quality })}>
                <option value="low">Low — no post FX</option>
                <option value="med">Medium</option>
                <option value="high">High — full cinematic</option>
              </select>
            </Row>
            <Row label="Time of day">
              <select value={s.nightGame ? 'night' : 'day'} onChange={(e) => s.set({ nightGame: e.target.value === 'night' })}>
                <option value="night">Night game</option>
                <option value="day">Day game</option>
              </select>
            </Row>
            <Row label="High-contrast verdicts">
              <input type="checkbox" checked={s.colorblind} onChange={(e) => s.set({ colorblind: e.target.checked })} />
            </Row>
          </section>

          <section>
            <h3>AUDIO</h3>
            <Row label="Master">
              <Slider value={s.masterVol} min={0} max={1} step={0.05} onChange={(v) => s.set({ masterVol: v })} format={(v) => `${Math.round(v * 100)}`} />
            </Row>
            <Row label="Effects">
              <Slider value={s.sfxVol} min={0} max={1} step={0.05} onChange={(v) => s.set({ sfxVol: v })} format={(v) => `${Math.round(v * 100)}`} />
            </Row>
            <Row label="Crowd">
              <Slider value={s.crowdVol} min={0} max={1} step={0.05} onChange={(v) => s.set({ crowdVol: v })} format={(v) => `${Math.round(v * 100)}`} />
            </Row>
            <Row label="Mute all">
              <input type="checkbox" checked={s.muted} onChange={(e) => s.set({ muted: e.target.checked })} />
            </Row>
            <Row label="Umpire voice">
              <input type="checkbox" checked={s.umpVoice} onChange={(e) => s.set({ umpVoice: e.target.checked })} />
            </Row>

            {inGame && (
              <>
                <h3>GAME CONTROL</h3>
                <div className="settings__gamebtns">
                  <button className="btn btn--gold" onClick={close}>RESUME</button>
                  <button
                    className="btn"
                    onClick={() => {
                      const seed = useGame.getState().seedText
                      useUi.getState().set({ settingsOpen: false })
                      useGame.getState().newGame(seed)
                      useGame.getState().playBall()
                    }}
                  >
                    RESTART INNING
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      useUi.getState().set({ settingsOpen: false })
                      useGame.getState().newGame()
                    }}
                  >
                    QUIT TO TITLE
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

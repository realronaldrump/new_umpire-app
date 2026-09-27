import { useState, type ReactNode } from 'react'
import { audio } from '../audio/engine'
import { DIFFICULTY } from '../game/constants'
import { useGame } from '../store/game'
import { useSettings } from '../store/settings'
import { useUi } from '../store/ui'

type Tab = 'game' | 'video' | 'camera' | 'audio'

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="setrow">
      <span className="setrow__label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className="setrow__ctl">{children}</span>
    </div>
  )
}

function Slider({
  value, min, max, step, onChange, format, label,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
  label: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--fill': `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <em className="setrow__val">{format ? format(value) : value}</em>
    </>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle ${on ? 'toggle--on' : ''}`}
      onClick={() => {
        audio.uiClick()
        onChange(!on)
      }}
    >
      <i />
    </button>
  )
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented segmented--sm" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          className={value === v ? 'on' : ''}
          onClick={() => {
            audio.uiClick()
            onChange(v)
          }}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

export function SettingsModal() {
  const open = useUi((s) => s.settingsOpen)
  const s = useSettings()
  const phase = useGame((p) => p.phase)
  const mode = useGame((p) => p.mode)
  const [tab, setTab] = useState<Tab>('game')
  if (!open) return null

  const inGame = phase !== 'menu' && phase !== 'inningOver'
  const close = () => {
    audio.uiClick()
    useUi.getState().set({ settingsOpen: false })
    // From the pause menu, go back to it; from the gear button, resume play.
    const g = useGame.getState()
    if (mode !== 'multiplayer' && inGame && !g.pauseMenuOpen) g.setPaused(false)
  }

  const tabs: Array<[Tab, string]> = [['game', 'GAME'], ['video', 'VIDEO'], ['camera', 'CAMERA'], ['audio', 'AUDIO']]

  return (
    <div className="veil veil--settings" onClick={(e) => { if (e.target === e.currentTarget) close() }}>
      <div className="settings panel" role="dialog" aria-label="Settings" onKeyDown={(e) => e.stopPropagation()}>
        <header className="settings__head">
          <span>SETTINGS</span>
          <button className="icon-btn" onClick={close} aria-label="Close settings">✕</button>
        </header>
        <nav className="tabs" role="tablist">
          {tabs.map(([key, text]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
              {text}
            </button>
          ))}
        </nav>

        <div className="settings__body">
          {tab === 'game' && (
            <section>
              <Row label="Difficulty" hint={DIFFICULTY[s.difficulty].tagline}>
                <Seg
                  label="Difficulty"
                  value={s.difficulty}
                  options={[['rookie', 'ROOKIE'], ['pro', 'PRO'], ['legend', 'LEGEND']]}
                  onChange={(v) => s.set({ difficulty: v })}
                />
              </Row>
              <Row label="Pitch speed" hint="Auto follows the difficulty">
                <Seg
                  label="Pitch speed"
                  value={s.pitchSpeed === 'auto' ? 'auto' : 'custom'}
                  options={[['auto', 'AUTO'], ['custom', 'CUSTOM']]}
                  onChange={(v) => s.set({ pitchSpeed: v === 'auto' ? 'auto' : 0.85 })}
                />
              </Row>
              {s.pitchSpeed !== 'auto' && (
                <Row label="× real speed">
                  <Slider label="Pitch speed" value={s.pitchSpeed} min={0.55} max={1} step={0.05} onChange={(v) => s.set({ pitchSpeed: v })} format={(v) => `${Math.round(v * 100)}%`} />
                </Row>
              )}
              <Row label="Call window" hint="Time to make the call">
                <Seg
                  label="Call window"
                  value={s.callWindow === 'auto' ? 'auto' : 'custom'}
                  options={[['auto', 'AUTO'], ['custom', 'CUSTOM']]}
                  onChange={(v) => s.set({ callWindow: v === 'auto' ? 'auto' : 1400 })}
                />
              </Row>
              {s.callWindow !== 'auto' && (
                <Row label="Window">
                  <Slider label="Call window" value={s.callWindow} min={600} max={3000} step={100} onChange={(v) => s.set({ callWindow: v })} format={(v) => `${(v / 1000).toFixed(1)}s`} />
                </Row>
              )}
              <Row label="Zone ghost" hint="The strike zone drawn during the pitch">
                <Seg
                  label="Zone ghost"
                  value={s.zoneVisibility}
                  options={[['auto', 'AUTO'], ['always', 'ALWAYS'], ['never', 'NEVER']]}
                  onChange={(v) => s.set({ zoneVisibility: v })}
                />
              </Row>
              <Row label="No-call policy" hint="When the window closes without a call">
                <Seg
                  label="No-call policy"
                  value={s.hesitationPolicy}
                  options={[['miss', 'MISS'], ['penalty', 'PENALTY ONLY']]}
                  onChange={(v) => s.set({ hesitationPolicy: v })}
                />
              </Row>
              <Row label="Coaching tips" hint="Hints during your first ninth">
                <Toggle label="Coaching tips" on={s.showTips} onChange={(v) => s.set({ showTips: v })} />
              </Row>
            </section>
          )}

          {tab === 'video' && (
            <section>
              <Row label="Quality" hint="Low turns off post effects for older devices">
                <Seg
                  label="Quality"
                  value={s.quality}
                  options={[['low', 'LOW'], ['med', 'MEDIUM'], ['high', 'HIGH']]}
                  onChange={(v) => s.set({ quality: v })}
                />
              </Row>
              <Row label="Time of day">
                <Seg
                  label="Time of day"
                  value={s.nightGame ? 'night' : 'day'}
                  options={[['night', 'NIGHT'], ['day', 'DAY']]}
                  onChange={(v) => s.set({ nightGame: v === 'night' })}
                />
              </Row>
              <Row label="High-contrast verdicts" hint="Blue / yellow instead of teal / ember">
                <Toggle label="High-contrast verdicts" on={s.colorblind} onChange={(v) => s.set({ colorblind: v })} />
              </Row>
              <Row label="Camera shake" hint="A small kick on the mitt pop and bat crack">
                <Toggle label="Camera shake" on={s.cameraShake} onChange={(v) => s.set({ cameraShake: v })} />
              </Row>
            </section>
          )}

          {tab === 'camera' && (
            <section>
              <Row label="Eye height">
                <Slider label="Eye height" value={s.camHeight} min={3.1} max={4.8} step={0.05} onChange={(v) => s.set({ camHeight: v })} format={(v) => `${v.toFixed(2)} ft`} />
              </Row>
              <Row label="Setback">
                <Slider label="Setback" value={s.camBack} min={4.5} max={8.5} step={0.1} onChange={(v) => s.set({ camBack: v })} format={(v) => `${v.toFixed(1)} ft`} />
              </Row>
              <Row label="Field of view">
                <Slider label="Field of view" value={s.camFov} min={45} max={62} step={1} onChange={(v) => s.set({ camFov: v })} format={(v) => `${v}°`} />
              </Row>
              <Row label="Slot offset" hint="How far into the slot over the catcher">
                <Slider label="Slot offset" value={s.slotOffset} min={0} max={1.5} step={0.05} onChange={(v) => s.set({ slotOffset: v })} format={(v) => `${v.toFixed(2)} ft`} />
              </Row>
              <button
                className="btn btn--ghost settings__reset"
                onClick={() => {
                  audio.uiClick()
                  s.set({ camHeight: 3.65, camBack: 6.0, camFov: 55, slotOffset: 0.8 })
                }}
              >
                RESET CAMERA
              </button>
            </section>
          )}

          {tab === 'audio' && (
            <section>
              <Row label="Master">
                <Slider label="Master volume" value={s.masterVol} min={0} max={1} step={0.05} onChange={(v) => s.set({ masterVol: v })} format={(v) => `${Math.round(v * 100)}`} />
              </Row>
              <Row label="Effects">
                <Slider label="Effects volume" value={s.sfxVol} min={0} max={1} step={0.05} onChange={(v) => s.set({ sfxVol: v })} format={(v) => `${Math.round(v * 100)}`} />
              </Row>
              <Row label="Crowd">
                <Slider label="Crowd volume" value={s.crowdVol} min={0} max={1} step={0.05} onChange={(v) => s.set({ crowdVol: v })} format={(v) => `${Math.round(v * 100)}`} />
              </Row>
              <Row label="Mute all">
                <Toggle label="Mute all" on={s.muted} onChange={(v) => s.set({ muted: v })} />
              </Row>
              <Row label="Umpire voice">
                <Toggle label="Umpire voice" on={s.umpVoice} onChange={(v) => s.set({ umpVoice: v })} />
              </Row>
            </section>
          )}
        </div>

        <footer className="settings__foot">
          <span>Settings save automatically.</span>
          <button className="btn btn--gold" onClick={close}>{inGame && mode !== 'multiplayer' ? 'BACK TO THE GAME' : 'DONE'}</button>
        </footer>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { DIFFICULTY, type Difficulty } from '../game/constants'
import { PITCH_TYPES } from '../game/pitchTypes'
import { useMultiplayer, multiplayerRole } from './store'
import { TARGET_LIMIT, type RoomSnapshot, type RoundSummary } from './protocol'
import {
  evaluatePitchGesture, GESTURE_LOAD_Y, GESTURE_RELEASE, GESTURE_START,
  normalizedPointer, type GesturePoint,
} from './pitching'

const DIFFICULTIES: Difficulty[] = ['rookie', 'pro', 'legend']
const SPECIAL_PITCHES = ['knuckleball', 'eephus'] as const

export function MultiplayerSurface() {
  const open = useMultiplayer((state) => state.open)
  const connection = useMultiplayer((state) => state.connection)
  const snapshot = useMultiplayer((state) => state.snapshot)
  const error = useMultiplayer((state) => state.error)
  if (!open) return null

  if (!snapshot || snapshot.status === 'lobby') {
    return <LobbyScreen snapshot={snapshot} connection={connection} error={error} />
  }
  if (snapshot.status === 'betweenRounds') return <RoleSwapScreen snapshot={snapshot} />
  if (snapshot.status === 'seriesComplete') return <SeriesScreen snapshot={snapshot} />
  if (snapshot.status === 'abandoned') return <AbandonedScreen />

  return (
    <>
      <MultiplayerHud snapshot={snapshot} />
      <PitcherControls snapshot={snapshot} />
      <PitcherChallengePrompt snapshot={snapshot} />
      {snapshot.status === 'disconnectPaused' && <ReconnectScreen snapshot={snapshot} />}
    </>
  )
}

function LobbyScreen({
  snapshot, connection, error,
}: {
  snapshot: RoomSnapshot | null
  connection: ReturnType<typeof useMultiplayer.getState>['connection']
  error: string | null
}) {
  const storedName = useMultiplayer((state) => state.name)
  const prefilledCode = useMultiplayer((state) => state.roomCode)
  const playerId = useMultiplayer((state) => state.playerId)
  const [name, setName] = useState(storedName)
  const [code, setCode] = useState(prefilledCode)
  const [difficulty, setDifficulty] = useState<Difficulty>('pro')
  const [copied, setCopied] = useState(false)
  const createRoom = useMultiplayer((state) => state.createRoom)
  const joinRoom = useMultiplayer((state) => state.joinRoom)
  const configure = useMultiplayer((state) => state.configure)
  const ready = useMultiplayer((state) => state.ready)
  const leave = useMultiplayer((state) => state.leave)

  useEffect(() => setCode(prefilledCode), [prefilledCode])

  if (!snapshot) {
    return (
      <div className="overlay mp-overlay">
        <div className="mp-entry panel">
          <button className="mp-close" onClick={leave} aria-label="Close multiplayer">×</button>
          <header className="mp-entry__head">
            <span className="start__kicker">LIVE CLUBHOUSE LINK</span>
            <h2>PITCHER <em>VS.</em> BLUE</h2>
            <p>Two players. Two mirrored ninths. Then the roles swap.</p>
          </header>

          <label className="mp-field">
            <span>YOUR NAME</span>
            <input value={name} maxLength={20} autoComplete="nickname" placeholder="Player name" onChange={(event) => setName(event.target.value)} />
          </label>

          {error && <div className="mp-error" role="alert">{error}</div>}

          <div className="mp-entry__choices">
            <section className="mp-choice">
              <span className="mp-choice__number">01</span>
              <h3>CREATE A SERIES</h3>
              <p>Open a room, pick the difficulty, and send the invite link.</p>
              <div className="mp-difficulty" role="radiogroup" aria-label="Series difficulty">
                {DIFFICULTIES.map((key) => (
                  <button key={key} className={difficulty === key ? 'on' : ''} onClick={() => setDifficulty(key)}>
                    {DIFFICULTY[key].label}
                  </button>
                ))}
              </div>
              <button className="btn btn--gold" disabled={!name.trim() || connection === 'connecting'} onClick={() => createRoom(name, difficulty)}>
                {connection === 'connecting' && !prefilledCode ? 'OPENING…' : 'CREATE ROOM'}
              </button>
            </section>

            <div className="mp-entry__or">OR</div>

            <section className="mp-choice">
              <span className="mp-choice__number">02</span>
              <h3>JOIN THE OTHER DEVICE</h3>
              <p>Paste the six-character code from your friend’s screen.</p>
              <label className="mp-field mp-field--code">
                <span>ROOM CODE</span>
                <input value={code} maxLength={6} placeholder="ABC234" onChange={(event) => setCode(event.target.value.toUpperCase())} />
              </label>
              <button className="btn" disabled={!name.trim() || code.trim().length !== 6 || connection === 'connecting'} onClick={() => joinRoom(code, name)}>
                {connection === 'connecting' ? 'CONNECTING…' : 'JOIN ROOM'}
              </button>
            </section>
          </div>
          <p className="mp-entry__foot">No login · works across different networks · invite claims the first open seat</p>
        </div>
      </div>
    )
  }

  const me = snapshot.players.find((player) => player?.id === playerId)
  const isHost = snapshot.hostId === playerId
  const invite = `${location.origin}${location.pathname}?mode=multiplayer&room=${snapshot.roomCode}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard may be unavailable on local HTTP */ }
  }

  return (
    <div className="overlay mp-overlay">
      <div className="mp-lobby">
        <header className="mp-lobby__head">
          <span className="start__kicker">PRIVATE TWO-PLAYER ROOM</span>
          <h2>CLUBHOUSE <em>{snapshot.roomCode}</em></h2>
          <button className="mp-copy" onClick={copy}>{copied ? 'LINK COPIED' : 'COPY INVITE LINK'}</button>
        </header>

        <div className="mp-dugouts">
          {snapshot.players.map((player, index) => (
            <article key={player?.id ?? index} className={`mp-seat panel ${player?.connected ? 'mp-seat--online' : ''}`}>
              <span className="mp-seat__label">{index === 0 ? 'HOME DEVICE' : 'AWAY DEVICE'}</span>
              <strong>{player?.name ?? 'WAITING FOR PLAYER…'}</strong>
              <span className="mp-seat__status">{player ? (player.connected ? '● CONNECTED' : '○ OFFLINE') : 'SEND THE INVITE'}</span>
              {player?.ready && <span className="mp-ready-stamp">READY</span>}
            </article>
          ))}
        </div>

        <section className="mp-lobby__rules panel">
          <div><b>{snapshot.difficulty === 'legend' ? 'TOP 8TH THROUGH THE 9TH' : 'MIRRORED NINTHS'}</b><span>{snapshot.difficulty === 'legend' ? 'One complete game with four half-innings.' : 'Same score, runners, lineup, and closer.'}</span></div>
          <div><b>COIN-FLIP ROLES</b><span>{snapshot.difficulty === 'legend' ? 'Pitcher and umpire switch every three outs.' : 'One pitches. One calls. Then you swap.'}</span></div>
          <div><b>BALANCED SERIES</b><span>Pitching and umpiring count equally.</span></div>
        </section>

        <div className="mp-lobby__difficulty">
          <span>SHARED DIFFICULTY</span>
          <div className="mp-difficulty">
            {DIFFICULTIES.map((key) => (
              <button
                key={key}
                disabled={!isHost || Boolean(me?.ready)}
                className={snapshot.difficulty === key ? 'on' : ''}
                onClick={() => configure(key)}
              >
                {DIFFICULTY[key].label}
              </button>
            ))}
          </div>
          {!isHost && <small>Room host controls this setting.</small>}
        </div>

        {error && <div className="mp-error" role="alert">{error}</div>}
        <div className="mp-lobby__actions">
          <button className="btn" onClick={leave}>LEAVE ROOM</button>
          <button className="btn btn--gold btn--play" disabled={!snapshot.players.every(Boolean) || Boolean(me?.ready)} onClick={ready}>
            {me?.ready ? 'WAITING FOR OPPONENT' : 'READY UP'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MultiplayerHud({ snapshot }: { snapshot: RoomSnapshot }) {
  const playerId = useMultiplayer((state) => state.playerId)
  const latency = useMultiplayer((state) => state.latencyMs)
  const connection = useMultiplayer((state) => state.connection)
  const role = multiplayerRole(snapshot, playerId)
  const opponent = snapshot.players.find((player) => player && player.id !== playerId)
  return (
    <aside className={`mp-rolehud panel mp-rolehud--${role ?? 'waiting'}`}>
      <span className="mp-rolehud__round">{snapshot.difficulty === 'legend' ? `${snapshot.sit.half.toUpperCase()} ${snapshot.sit.inning} · SIDE ${Math.min(4, Math.floor(snapshot.sit.totalOuts / 3) + 1)} / 4` : `ROUND ${snapshot.round} / 2`}</span>
      <strong>{role === 'pitcher' ? 'ON THE MOUND' : role === 'umpire' ? 'BEHIND THE PLATE' : 'WAITING'}</strong>
      <span>{opponent?.name ?? 'Opponent'} · {connection === 'connected' ? 'LIVE' : connection.toUpperCase()} {latency === null ? '' : `· ${latency}ms`}</span>
    </aside>
  )
}

function PitcherControls({ snapshot }: { snapshot: RoomSnapshot }) {
  const playerId = useMultiplayer((state) => state.playerId)
  const offset = useMultiplayer((state) => state.serverOffsetMs)
  const choosePitch = useMultiplayer((state) => state.choosePitch)
  const release = useMultiplayer((state) => state.release)
  const role = multiplayerRole(snapshot, playerId)
  const [pitch, setPitch] = useState(snapshot.pitcher.arsenal[0][0])
  const [target, setTarget] = useState({ u: 0, v: 0 })
  const selectedSpecial = SPECIAL_PITCHES.includes(pitch as typeof SPECIAL_PITCHES[number])
  const selectedAvailable = snapshot.pitcher.arsenal.some(([key]) => key === pitch) ||
    (selectedSpecial && !snapshot.specialPitchesUsed.includes(pitch as typeof SPECIAL_PITCHES[number]))

  useEffect(() => {
    if (!selectedAvailable) setPitch(snapshot.pitcher.arsenal[0][0])
  }, [selectedAvailable, snapshot.pitcher.arsenal])

  if (role !== 'pitcher' || (snapshot.phase !== 'pitchSelect' && snapshot.phase !== 'command')) return null

  return (
    <section className={`pitch-console panel ${snapshot.phase === 'command' ? 'pitch-console--command' : ''}`}>
      {snapshot.phase === 'pitchSelect' ? (
        <>
          <div className="pitch-console__head">
            <span>CALL YOUR PITCH</span>
            <b>{Math.max(0, Math.ceil(((snapshot.phaseDeadline ?? 0) - (Date.now() + offset)) / 1000))}</b>
          </div>
          <div className="pitch-console__body">
            <div className="pitch-arsenal">
              {[...snapshot.pitcher.arsenal.map(([key]) => key), ...SPECIAL_PITCHES].map((key) => {
                const special = SPECIAL_PITCHES.includes(key as typeof SPECIAL_PITCHES[number])
                const spent = special && snapshot.specialPitchesUsed.includes(key as typeof SPECIAL_PITCHES[number])
                return (
                  <button key={key} disabled={spent} className={`${pitch === key ? 'on' : ''} ${special ? 'special' : ''}`} onClick={() => setPitch(key)}>
                    <b>{PITCH_TYPES[key].short}</b><span>{PITCH_TYPES[key].name}</span>{special && <em>{spent ? 'USED' : '1× / AB'}</em>}
                  </button>
                )
              })}
            </div>
            <ContinuousTarget snapshot={snapshot} pitch={pitch} target={target} onTarget={setTarget} />
          </div>
          <button className="btn btn--gold pitch-console__set" onClick={() => choosePitch(pitch, target)}>SET · START DELIVERY</button>
        </>
      ) : (
        <DeliveryGesture onRelease={release} />
      )}
    </section>
  )
}

function ContinuousTarget({
  snapshot, pitch, target, onTarget,
}: {
  snapshot: RoomSnapshot
  pitch: keyof typeof PITCH_TYPES
  target: { u: number; v: number }
  onTarget: (target: { u: number; v: number }) => void
}) {
  const def = PITCH_TYPES[pitch]
  const profile = snapshot.pitcher.pitchProfiles?.[pitch]
  const armSideBreak = profile?.hbIn ?? (def.hb[0] + def.hb[1]) / 2
  const verticalBreak = profile?.ivbIn ?? (def.ivb[0] + def.ivb[1]) / 2
  const catcherBreak = (snapshot.pitcher.hand === 'R' ? -1 : 1) * armSideBreak
  const left = (target.u / (TARGET_LIMIT * 2) + 0.5) * 100
  const top = (0.5 - target.v / (TARGET_LIMIT * 2)) * 100
  const endLeft = Math.max(3, Math.min(97, left + catcherBreak / 18 * 13))
  const endTop = Math.max(3, Math.min(97, top - verticalBreak / 18 * 11))
  const uncertaintyX = Math.min(25, 9 + def.wildness * snapshot.pitcher.commandMult * 6)
  const uncertaintyY = uncertaintyX * 1.1

  const targetFromPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    onTarget({
      u: Math.max(-TARGET_LIMIT, Math.min(TARGET_LIMIT, ((event.clientX - rect.left) / rect.width - 0.5) * TARGET_LIMIT * 2)),
      v: Math.max(-TARGET_LIMIT, Math.min(TARGET_LIMIT, (0.5 - (event.clientY - rect.top) / rect.height) * TARGET_LIMIT * 2)),
    })
  }
  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    targetFromPointer(event)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 0.15 : 0.05
    const delta = {
      ArrowLeft: { u: -step, v: 0 }, ArrowRight: { u: step, v: 0 },
      ArrowUp: { u: 0, v: step }, ArrowDown: { u: 0, v: -step },
    }[event.key]
    if (!delta) return
    event.preventDefault()
    onTarget({
      u: Math.max(-TARGET_LIMIT, Math.min(TARGET_LIMIT, target.u + delta.u)),
      v: Math.max(-TARGET_LIMIT, Math.min(TARGET_LIMIT, target.v + delta.v)),
    })
  }

  return (
    <div className="pitch-target-wrap">
      <div className="pitch-target__readout">
        <span>LIVE TARGET</span><b>{target.u.toFixed(2)} · {target.v.toFixed(2)}</b>
      </div>
      <button
        type="button"
        className="pitch-target"
        aria-label="Continuous pitch target. Click or drag anywhere. Use arrow keys for fine adjustment and Shift plus arrows for larger adjustment."
        onPointerDown={handlePointerDown}
        onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) targetFromPointer(event) }}
        onKeyDown={handleKeyDown}
      >
        <span className="pitch-target__chase-label pitch-target__chase-label--top">CHASE</span>
        <span className="pitch-target__chase-label pitch-target__chase-label--side">CHASE</span>
        <span className="pitch-target__zone" aria-hidden />
        <span
          className="pitch-target__uncertainty"
          style={{ left: `${left}%`, top: `${top}%`, width: `${uncertaintyX}%`, height: `${uncertaintyY}%` }}
          aria-hidden
        />
        <svg className="pitch-target__break" viewBox="0 0 100 100" aria-hidden>
          <line x1={left} y1={top} x2={endLeft} y2={endTop} />
          <circle cx={endLeft} cy={endTop} r="1.5" />
        </svg>
        <span className="pitch-target__reticle" style={{ left: `${left}%`, top: `${top}%` }} aria-hidden />
      </button>
      <div className="pitch-target__legend"><span>RING · COMMAND WINDOW</span><span>VECTOR · {def.short} BREAK</span></div>
    </div>
  )
}

function DeliveryGesture({ onRelease }: { onRelease: ReturnType<typeof useMultiplayer.getState>['release'] }) {
  const pointsRef = useRef<GesturePoint[]>([])
  const [points, setPoints] = useState<GesturePoint[]>([])
  const [dragging, setDragging] = useState(false)
  const [feedback, setFeedback] = useState('PRESS · PULL DOWN · DRIVE UP · RELEASE')
  const [keyboardRelease, setKeyboardRelease] = useState<{ x: number; y: number }>({ ...GESTURE_RELEASE })
  const loaded = points.some((point) => point.y >= GESTURE_LOAD_Y)
  const cursor = points[points.length - 1] ?? GESTURE_START
  const trace = points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')

  const begin = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = normalizedPointer(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
    pointsRef.current = [point]
    setPoints([point])
    setDragging(true)
    setFeedback('PULL INTO THE LOAD BAND')
  }
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const point = normalizedPointer(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
    pointsRef.current = [...pointsRef.current.slice(-79), point]
    setPoints(pointsRef.current)
    if (point.y >= GESTURE_LOAD_Y) setFeedback('LOADED · DRIVE UP AND RELEASE')
  }
  const finish = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const point = normalizedPointer(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
    const complete = [...pointsRef.current, point]
    const execution = evaluatePitchGesture(complete)
    event.currentTarget.releasePointerCapture(event.pointerId)
    setDragging(false)
    if (execution) onRelease(execution)
    else {
      setFeedback(complete.some((sample) => sample.y >= GESTURE_LOAD_Y) ? 'FINISH HIGHER · TRY AGAIN' : 'LOAD THE DELIVERY FIRST · TRY AGAIN')
      pointsRef.current = []
      setPoints([])
    }
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === ' ') {
      event.preventDefault()
      const loadedPoints = [
        { ...GESTURE_START, t: performance.now() },
        { x: 0.5, y: 0.84, t: performance.now() + 1 },
      ]
      pointsRef.current = loadedPoints
      setPoints(loadedPoints)
      setFeedback('LOADED · AIM WITH ARROWS · ENTER TO RELEASE')
      return
    }
    if (pointsRef.current.length < 2) return
    const step = event.shiftKey ? 0.05 : 0.02
    const delta = {
      ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step },
    }[event.key]
    if (delta) {
      event.preventDefault()
      setKeyboardRelease((current) => ({
        x: Math.max(0.05, Math.min(0.95, current.x + delta.x)),
        y: Math.max(0.06, Math.min(0.4, current.y + delta.y)),
      }))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const releasePoint = { ...keyboardRelease, t: performance.now() }
      const execution = evaluatePitchGesture([...pointsRef.current, { x: 0.5, y: 0.48, t: releasePoint.t - 1 }, releasePoint])
      if (execution) onRelease(execution)
    }
  }

  return (
    <div className="delivery">
      <div className="delivery__head"><span>MANUAL DELIVERY</span><b>{loaded ? 'ARMED' : dragging ? 'LOADING' : 'READY'}</b></div>
      <button
        type="button"
        className="delivery__surface"
        aria-label="Delivery gesture. Drag down to load, then drive upward and release. Keyboard: Space to load, arrow keys to shape the release, Enter to deliver."
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={() => { pointsRef.current = []; setPoints([]); setDragging(false) }}
        onKeyDown={handleKeyDown}
      >
        <span className="delivery__release-window" style={{ left: `${keyboardRelease.x * 100}%`, top: `${keyboardRelease.y * 100}%` }} aria-hidden />
        <span className="delivery__load-band" aria-hidden>LOAD</span>
        <svg className="delivery__trace" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <path d="M 50 62 L 50 84 L 50 16" className="delivery__guide" />
          {trace && <polyline points={trace} />}
        </svg>
        <span className={`delivery__ball ${dragging ? 'delivery__ball--live' : ''}`} style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }} aria-hidden>●</span>
      </button>
      <div className="delivery__feedback">{feedback}</div>
      <small>Release left/right moves the miss. A smooth drive tightens command. Keyboard: Space · arrows · Enter.</small>
    </div>
  )
}

function PitcherChallengePrompt({ snapshot }: { snapshot: RoomSnapshot }) {
  const playerId = useMultiplayer((state) => state.playerId)
  const offset = useMultiplayer((state) => state.serverOffsetMs)
  const challenge = useMultiplayer((state) => state.challenge)
  const [remaining, setRemaining] = useState(0)
  const role = multiplayerRole(snapshot, playerId)

  useEffect(() => {
    if (snapshot.phase !== 'challengeWindow' || snapshot.phaseDeadline === null) return
    let frame = 0
    const update = () => {
      const ms = Math.max(0, snapshot.phaseDeadline! - (Date.now() + offset))
      setRemaining(ms)
      if (ms > 0) frame = requestAnimationFrame(update)
    }
    update()
    return () => cancelAnimationFrame(frame)
  }, [offset, snapshot.phase, snapshot.phaseDeadline])

  if (role !== 'pitcher' || snapshot.phase !== 'challengeWindow') return null
  return (
    <section className="pitch-challenge panel" role="dialog" aria-label="Pitcher ABS challenge window">
      <span className="pitch-challenge__kicker">CALLED BALL · {Math.ceil(remaining / 100) / 10}s</span>
      <strong>THINK IT CAUGHT THE ZONE?</strong>
      <span>{snapshot.pitcherChallengesLeft} of {snapshot.pitcherChallengesMax} challenges remaining · successful challenges are retained</span>
      <button className="btn btn--gold" onClick={challenge}>CHALLENGE WITH ABS</button>
    </section>
  )
}

function RoleSwapScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const playerId = useMultiplayer((state) => state.playerId)
  const ready = useMultiplayer((state) => state.ready)
  const me = snapshot.players.find((player) => player?.id === playerId)
  const summary = snapshot.roundSummaries[0]
  const nextRole = snapshot.firstPitcherId === playerId ? 'UMPIRE' : 'PITCHER'
  return (
    <div className="overlay mp-overlay mp-results">
      <div className="mp-results__inner">
        <span className="start__kicker">ROUND ONE IN THE BOOKS</span>
        <h2>SWITCH <em>SIDES</em></h2>
        <p className="mp-results__next">YOU’RE THE <b>{nextRole}</b> NEXT</p>
        {summary && <RoundScore summary={summary} snapshot={snapshot} />}
        <div className="mp-results__players">
          {snapshot.players.map((player) => <span key={player?.id}>{player?.name ?? '—'} {player?.ready ? '✓ READY' : '· REVIEWING'}</span>)}
        </div>
        <button className="btn btn--gold btn--play" disabled={Boolean(me?.ready)} onClick={ready}>
          {me?.ready ? 'WAITING FOR OPPONENT' : 'READY FOR ROUND TWO'}
        </button>
      </div>
    </div>
  )
}

function RoundScore({ summary, snapshot }: { summary: RoundSummary; snapshot: RoomSnapshot }) {
  const pitcher = snapshot.players.find((player) => player?.id === summary.pitcherId)?.name ?? 'Pitcher'
  const umpire = snapshot.players.find((player) => player?.id === summary.umpireId)?.name ?? 'Umpire'
  return (
    <div className="mp-roundscore">
      <article className="panel"><span>{pitcher.toUpperCase()} · PITCHING</span><b>{summary.pitching.score.toFixed(1)}</b><small>{summary.pitching.runsAllowed} R · {summary.pitching.outsRecorded}/{summary.pitching.outsRequired} OUTS · {Math.round(summary.pitching.averageCommand * 100)}% CMD</small></article>
      <article className="panel"><span>{umpire.toUpperCase()} · UMPIRING</span><b>{summary.umpiring.grade}</b><small>{Math.round(summary.umpiring.weightedPct)}% WEIGHTED · {summary.umpiring.correctCalls}/{summary.umpiring.totalCalls} CORRECT</small></article>
    </div>
  )
}

function SeriesScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const playerId = useMultiplayer((state) => state.playerId)
  const leave = useMultiplayer((state) => state.leave)
  const result = snapshot.seriesResult
  const scores = useMemo(() => [...(result?.scores ?? [])].sort((a, b) => b.overallScore - a.overallScore), [result])
  const nameOf = (id: string) => snapshot.players.find((player) => player?.id === id)?.name ?? 'Player'
  const champion = result?.overallChampionIds.includes(playerId ?? '')
  const newSeries = () => {
    leave()
    useMultiplayer.getState().openEntry()
  }
  return (
    <div className="overlay mp-overlay mp-results mp-series">
      <div className="mp-results__inner">
        <span className="start__kicker">{snapshot.difficulty === 'legend' ? 'FINAL GAME REPORT' : 'FINAL SERIES REPORT'}</span>
        <h2>{champion ? 'YOU WIN' : snapshot.difficulty === 'legend' ? 'GAME COMPLETE' : 'SERIES COMPLETE'}</h2>
        <div className="mp-podium">
          {scores.map((score, index) => (
            <article key={score.playerId} className={`panel ${index === 0 ? 'mp-podium__winner' : ''}`}>
              <span>{index === 0 ? snapshot.difficulty === 'legend' ? 'GAME CHAMPION' : 'SERIES CHAMPION' : 'RUNNER-UP'}</span>
              <h3>{nameOf(score.playerId)}</h3>
              <b>{score.overallScore.toFixed(1)}</b>
              <div><small>PITCHING</small><strong>{score.pitchScore.toFixed(1)}</strong></div>
              <div><small>UMPIRING</small><strong>{score.umpScore.toFixed(1)}</strong></div>
            </article>
          ))}
        </div>
        {result && (
          <div className="mp-awards">
            <span>⚾ BEST PITCHER · {result.pitchingChampionIds.map(nameOf).join(' & ')}</span>
            <span>◇ BEST UMPIRE · {result.umpiringChampionIds.map(nameOf).join(' & ')}</span>
          </div>
        )}
        <div className="mp-results__actions">
          <button className="btn" onClick={leave}>TITLE SCREEN</button>
          <button className="btn btn--gold" onClick={newSeries}>{snapshot.difficulty === 'legend' ? 'NEW GAME' : 'NEW SERIES'}</button>
        </div>
      </div>
    </div>
  )
}

function ReconnectScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const playerId = useMultiplayer((state) => state.playerId)
  const connection = useMultiplayer((state) => state.connection)
  const resumeReady = useMultiplayer((state) => state.resumeReady)
  const me = snapshot.players.find((player) => player?.id === playerId)
  const missing = snapshot.players.find((player) => player && !player.connected)
  return (
    <div className="veil mp-reconnect">
      <div className="veil__box panel">
        <span className="veil__title">GAME PAUSED</span>
        <p>{missing ? `Waiting for ${missing.name} to reconnect.` : 'Both devices are back. Ready when you are.'}</p>
        <button className="btn btn--gold" disabled={connection !== 'connected' || Boolean(me?.ready) || Boolean(missing)} onClick={resumeReady}>
          {me?.ready ? 'WAITING FOR OPPONENT' : 'READY TO RESUME'}
        </button>
      </div>
    </div>
  )
}

function AbandonedScreen() {
  const leave = useMultiplayer((state) => state.leave)
  return (
    <div className="overlay mp-overlay mp-results">
      <div className="mp-results__inner">
        <span className="start__kicker">CONNECTION WINDOW EXPIRED</span>
        <h2>SERIES <em>ABANDONED</em></h2>
        <p>The other device did not reconnect within 90 seconds.</p>
        <button className="btn btn--gold" onClick={leave}>RETURN TO TITLE</button>
      </div>
    </div>
  )
}

import { Canvas } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { audio } from './audio/engine'
import { installFxDirector } from './scene/fx'
import { SceneRoot } from './scene/SceneRoot'
import { useGame } from './store/game'
import { useSettings } from './store/settings'
import { CoachTips } from './ui/CoachTips'
import { DebugPanel } from './ui/DebugPanel'
import { EndScreen, playAgain } from './ui/EndScreen'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { HowToPlay } from './ui/HowToPlay'
import { Hud, toggleFullscreen } from './ui/Hud'
import { Loader } from './ui/Loader'
import { SettingsModal } from './ui/SettingsModal'
import { StartScreen, startSolo } from './ui/StartScreen'
import { useUi } from './store/ui'
import { MultiplayerSurface } from './multiplayer/MultiplayerSurface'
import { useMultiplayer } from './multiplayer/store'

declare global {
  interface Window {
    __ump?: { game: typeof useGame; settings: typeof useSettings }
  }
}

export default function App() {
  const colorblind = useSettings((s) => s.colorblind)
  const mode = useGame((s) => s.mode)
  const [canvasKey, setCanvasKey] = useState(0)

  // Boot: prepare the first ninth.
  useEffect(() => {
    installFxDirector()
    useGame.getState().newGame()
    window.__ump = { game: useGame, settings: useSettings }
    const params = new URLSearchParams(location.search)
    if (params.get('mode') === 'multiplayer') {
      const code = (params.get('room') ?? '').toUpperCase()
      const multiplayer = useMultiplayer.getState()
      multiplayer.openEntry(code)
      if (code && multiplayer.name && sessionStorage.getItem(`umpire-room-token:${code}`)) {
        multiplayer.joinRoom(code, multiplayer.name)
      }
    }
  }, [])

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return
      const g = useGame.getState()
      const ui = useUi.getState()
      const overlayOpen = ui.settingsOpen || ui.howToOpen || useMultiplayer.getState().open
      switch (e.key) {
        case 'b': case 'B': case 'ArrowLeft':
          e.preventDefault()
          if (g.mode === 'multiplayer') useMultiplayer.getState().call('ball')
          else g.makeCall('ball')
          break
        case 's': case 'S': case 'ArrowRight':
          e.preventDefault()
          if (g.mode === 'multiplayer') useMultiplayer.getState().call('strike')
          else g.makeCall('strike')
          break
        case ' ':
          e.preventDefault()
          if (g.mode === 'multiplayer' || overlayOpen) break
          if (g.phase === 'menu') startSolo()
          else g.hurry()
          break
        case 'Enter':
          if (g.mode === 'multiplayer' || overlayOpen) break
          if (target?.tagName === 'BUTTON') break
          if (g.phase === 'menu') {
            e.preventDefault()
            startSolo()
          } else if (g.phase === 'inningOver') {
            e.preventDefault()
            playAgain(false)
          }
          break
        case 'Escape': {
          if (ui.howToOpen) {
            ui.set({ howToOpen: false })
          } else if (ui.settingsOpen) {
            ui.set({ settingsOpen: false })
            if (g.mode !== 'multiplayer' && g.phase !== 'menu' && g.phase !== 'inningOver' && !g.pauseMenuOpen) g.setPaused(false)
          } else if (g.mode !== 'multiplayer' && g.phase !== 'menu' && g.phase !== 'inningOver') {
            g.setPaused(!g.paused, true)
          }
          break
        }
        case '`':
          g.toggleDebug()
          break
        case 't': case 'T':
          g.setDebug({ slowMo: !g.slowMo })
          break
        case 'o': case 'O':
          g.setDebug({ orbit: !g.orbit })
          break
        case 'f': case 'F':
          void toggleFullscreen()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Pause when the tab hides.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        const g = useGame.getState()
        if (g.mode !== 'multiplayer' && g.phase !== 'menu' && g.phase !== 'inningOver') g.setPaused(true, true)
        audio.suspend()
      } else if (!useGame.getState().paused) {
        audio.resume()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Volumes follow settings.
  useEffect(() => {
    const apply = () => {
      const s = useSettings.getState()
      audio.setVolumes(s.masterVol, s.sfxVol, s.crowdVol, s.muted)
    }
    apply()
    return useSettings.subscribe(apply)
  }, [])

  // Tap / click the field to skip the between-pitch beats (like SPACE).
  const onStagePointer = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).tagName !== 'CANVAS') return
    const g = useGame.getState()
    if (g.mode === 'single' && !g.paused) g.hurry()
  }

  return (
    <div className={`app ${mode === 'multiplayer' ? 'app--multiplayer' : ''} ${colorblind ? 'cb' : ''}`}>
      <ErrorBoundary>
        <div className="stage" onPointerDown={onStagePointer}>
          <Canvas
            key={canvasKey}
            onCreated={({ gl }) => {
              // If the browser drops the GPU context, rebuild the scene
              // (same full-quality graphics) instead of leaving a black screen.
              gl.domElement.addEventListener('webglcontextlost', (e) => {
                e.preventDefault()
                window.setTimeout(() => setCanvasKey((k) => k + 1), 300)
              }, { once: true })
            }}
            shadows="percentage"
            dpr={[1, 2]}
            camera={{ fov: 44, near: 0.06, far: 4200, position: [0, 120, 300] }}
            gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
          >
            <SceneRoot />
          </Canvas>
        </div>
      </ErrorBoundary>
      <Hud />
      <CoachTips />
      <StartScreen />
      <EndScreen />
      <HowToPlay />
      <SettingsModal />
      <DebugPanel />
      <MultiplayerSurface />
      <Loader />
    </div>
  )
}

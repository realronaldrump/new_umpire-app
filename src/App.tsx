import { Canvas } from '@react-three/fiber'
import { useEffect } from 'react'
import { audio } from './audio/engine'
import { SceneRoot } from './scene/SceneRoot'
import { useGame } from './store/game'
import { useSettings, type Quality } from './store/settings'
import { DebugPanel } from './ui/DebugPanel'
import { EndScreen } from './ui/EndScreen'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { Hud, toggleFullscreen } from './ui/Hud'
import { SettingsModal } from './ui/SettingsModal'
import { StartScreen } from './ui/StartScreen'
import { useUi } from './store/ui'

const DPR_CAP: Record<Quality, number> = { low: 1.25, med: 1.5, high: 2 }

declare global {
  interface Window {
    __ump?: { game: typeof useGame; settings: typeof useSettings }
  }
}

export default function App() {
  const quality = useSettings((s) => s.quality)

  // Boot: prepare the first ninth.
  useEffect(() => {
    useGame.getState().newGame()
    window.__ump = { game: useGame, settings: useSettings }
  }, [])

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return
      const g = useGame.getState()
      switch (e.key) {
        case 'b': case 'B': case 'ArrowLeft':
          e.preventDefault()
          g.makeCall('ball')
          break
        case 's': case 'S': case 'ArrowRight':
          e.preventDefault()
          g.makeCall('strike')
          break
        case ' ':
          e.preventDefault()
          if (g.phase === 'menu') {
            g.playBall()
          } else g.hurry()
          break
        case 'Escape': {
          const ui = useUi.getState()
          if (ui.settingsOpen) {
            ui.set({ settingsOpen: false })
            if (g.phase !== 'menu' && g.phase !== 'inningOver') g.setPaused(false)
          } else if (g.phase !== 'menu' && g.phase !== 'inningOver') {
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
        if (g.phase !== 'menu' && g.phase !== 'inningOver') g.setPaused(true, true)
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

  return (
    <div className="app">
      <ErrorBoundary>
        <Canvas
          className="stage"
          shadows={quality !== 'low'}
          dpr={[1, DPR_CAP[quality]]}
          camera={{ fov: 55, near: 0.06, far: 2600, position: [0, 3.65, 6] }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <SceneRoot />
        </Canvas>
      </ErrorBoundary>
      <Hud />
      <StartScreen />
      <EndScreen />
      <SettingsModal />
      <DebugPanel />
    </div>
  )
}

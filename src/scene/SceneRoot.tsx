import { OrbitControls } from '@react-three/drei'
import { useGame } from '../store/game'
import { useSettings } from '../store/settings'
import { Ball } from './Ball'
import { Batter } from './Batter'
import { CameraRig } from './CameraRig'
import { Catcher } from './Catcher'
import { Crowd } from './Crowd'
import { Effects } from './Effects'
import { Field } from './Field'
import { GameDirector } from './GameDirector'
import { Pitcher } from './Pitcher'
import { Scoreboard } from './Scoreboard'
import { Stadium } from './Stadium'
import { ZoneGhost } from './ZoneGhost'

export function SceneRoot() {
  const night = useSettings((s) => s.nightGame)
  const quality = useSettings((s) => s.quality)
  const orbit = useGame((s) => s.orbit)
  const mode = useGame((s) => s.mode)
  const batter = useGame((s) => (s.lineup.length ? s.lineup[s.sit.batterIdx] : null))
  const pitcherHand = useGame((s) => s.pitcher.hand)
  const shadows = quality !== 'low'

  return (
    <>
      <fog attach="fog" args={night ? ['#0a1522', 190, 1100] : ['#c3d4e6', 320, 1600]} />

      <ambientLight color={night ? '#42536f' : '#dde6f2'} intensity={night ? 0.55 : 0.62} />
      <hemisphereLight
        color={night ? '#33455f' : '#bcd9f5'}
        groundColor={night ? '#0e131b' : '#43503e'}
        intensity={night ? 0.55 : 0.65}
      />
      {/* Key light (stadium bank / sun) */}
      <directionalLight
        castShadow={shadows}
        color={night ? '#e9f1ff' : '#fff2d8'}
        intensity={night ? 1.5 : 2.1}
        position={night ? [-120, 200, -60] : [160, 240, 60]}
        shadow-mapSize={quality === 'high' ? [2048, 2048] : [1024, 1024]}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
        shadow-camera-near={30}
        shadow-camera-far={600}
        shadow-bias={-0.0004}
      />
      {/* Fill + rim from center field so the ball pops against the night */}
      <directionalLight color={night ? '#8fa8d0' : '#cfe0f0'} intensity={0.5} position={[110, 130, 80]} />
      <directionalLight color="#cfe4ff" intensity={night ? 0.55 : 0.3} position={[0, 70, -400]} />
      {/* Front fill from behind home so the pitcher and catcher read at night */}
      <directionalLight color="#dce8fa" intensity={night ? 0.75 : 0.35} position={[30, 90, 220]} />

      <Stadium night={night} />
      <Field />
      <Crowd quality={quality} night={night} />
      {mode !== 'practice' && <Scoreboard />}

      <Catcher />
      {mode !== 'practice' && batter && <Batter key={batter.id} batter={batter} />}
      <Pitcher hand={pitcherHand} />
      <Ball />
      <ZoneGhost />

      <CameraRig />
      <GameDirector />
      {orbit && <OrbitControls target={[0, 3, -8]} />}
      <Effects />
    </>
  )
}

import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, useRef } from 'react'
import { useGame } from '../store/game'
import { useSettings } from '../store/settings'
import { useUi } from '../store/ui'
import { Ball } from './Ball'
import { Batter } from './Batter'
import { CameraRig } from './CameraRig'
import { Catcher } from './Catcher'
import { Crowd } from './Crowd'
import { Effects } from './Effects'
import { Field } from './Field'
import { GameDirector } from './GameDirector'
import { Particles } from './Particles'
import { Pitcher } from './Pitcher'
import { Players } from './Players'
import { Scoreboard } from './Scoreboard'
import { SUN_DIR, Sky } from './Sky'
import { Stadium } from './Stadium'
import { ZoneGhost } from './ZoneGhost'

/** Reflections for helmets, bats and the ball: stadium banks by night, sky by day. */
function Reflections({ night }: { night: boolean }) {
  return (
    <Environment key={night ? 'night' : 'day'} frames={1} resolution={128} background={false} environmentIntensity={night ? 0.55 : 0.8}>
      <color attach="background" args={[night ? '#070b12' : '#8fb4d8']} />
      {night ? (
        <>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * Math.PI * 2
            return (
              <Lightformer
                key={i}
                form="rect"
                intensity={5}
                color="#fff3dc"
                scale={[10, 3, 1]}
                position={[Math.sin(a) * 20, 12, Math.cos(a) * 20]}
                target={[0, 0, 0]}
              />
            )
          })}
          <Lightformer form="rect" intensity={0.6} color="#2b4a2c" scale={[60, 60, 1]} position={[0, -10, 0]} rotation={[Math.PI / 2, 0, 0]} />
        </>
      ) : (
        <>
          <Lightformer form="circle" intensity={12} color="#fff4df" scale={6} position={[SUN_DIR.x * 30, SUN_DIR.y * 30, SUN_DIR.z * 30]} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={1.2} color="#dbe9f7" scale={[80, 80, 1]} position={[0, 30, 0]} rotation={[Math.PI / 2, 0, 0]} />
          <Lightformer form="rect" intensity={0.8} color="#4b6b3b" scale={[80, 80, 1]} position={[0, -10, 0]} rotation={[-Math.PI / 2, 0, 0]} />
        </>
      )}
    </Environment>
  )
}

/** Flags the DOM loader once the park has actually drawn a few frames. */
function SceneReady() {
  const frames = useRef(0)
  useFrame(() => {
    if (frames.current > 4) return
    frames.current++
    if (frames.current === 4) useUi.getState().set({ sceneReady: true })
  })
  return null
}

export function SceneRoot() {
  const night = useSettings((s) => s.nightGame)
  const orbit = useGame((s) => s.orbit)
  const batter = useGame((s) => (s.lineup.length ? s.lineup[s.sit.batterIdx] : null))
  const pitcherHand = useGame((s) => s.pitcher.hand)
  const shadows = true
  const shadowMap = 2048

  return (
    <>
      <fog attach="fog" args={night ? ['#0b1523', 420, 2900] : ['#b9cde2', 600, 3400]} />
      <Sky night={night} />
      <Reflections night={night} />

      {night ? (
        <>
          <hemisphereLight color="#40557a" groundColor="#16241a" intensity={0.55} />
          {/* Key bank high over the third-base side: casts the shadows. */}
          <directionalLight
            castShadow={shadows}
            color="#f2f5ff"
            intensity={2.7}
            position={[-130, 230, 150]}
            shadow-mapSize={[shadowMap, shadowMap]}
            shadow-camera-left={-70}
            shadow-camera-right={70}
            shadow-camera-top={80}
            shadow-camera-bottom={-80}
            shadow-camera-near={50}
            shadow-camera-far={700}
            shadow-bias={-0.0002}
            shadow-normalBias={0.03}
          />
          {/* Cross banks from first base and center field. */}
          <directionalLight color="#fff0d8" intensity={1.25} position={[160, 210, 110]} />
          <directionalLight color="#cfe0ff" intensity={0.8} position={[0, 160, -420]} />
          <directionalLight color="#dce8fa" intensity={0.45} position={[20, 70, 260]} />
        </>
      ) : (
        <>
          <hemisphereLight color="#cfe4fb" groundColor="#4a5b3c" intensity={0.95} />
          <directionalLight
            castShadow={shadows}
            color="#fff1d6"
            intensity={3.1}
            position={[SUN_DIR.x * 400, SUN_DIR.y * 400, SUN_DIR.z * 400]}
            shadow-mapSize={[shadowMap, shadowMap]}
            shadow-camera-left={-70}
            shadow-camera-right={70}
            shadow-camera-top={80}
            shadow-camera-bottom={-80}
            shadow-camera-near={50}
            shadow-camera-far={900}
            shadow-bias={-0.0002}
            shadow-normalBias={0.03}
          />
          <directionalLight color="#dfeaff" intensity={0.5} position={[-120, 90, -200]} />
        </>
      )}

      <Suspense fallback={null}>
        <Stadium night={night} />
        <Field />
        <Crowd night={night} />
        <Scoreboard />
        <Players />

        <Catcher />
        {batter && <Batter key={batter.id} batter={batter} />}
        <Pitcher hand={pitcherHand} />
        <Ball />
        <ZoneGhost />
        <Particles />
        <SceneReady />
      </Suspense>

      <CameraRig />
      <GameDirector />
      {orbit && <OrbitControls target={[0, 3, -8]} />}
      <Effects />
    </>
  )
}

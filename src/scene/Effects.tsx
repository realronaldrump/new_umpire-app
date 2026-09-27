import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { ReactElement } from 'react'
import { useSettings } from '../store/settings'

/**
 * Post chain. Everything renders into a linear HDR buffer, so bloom works on
 * real highlights (lamps, flares, fireworks), then ACES maps it to the screen
 * — the same curve the Low preset gets straight from the renderer, so all
 * quality levels share one look. (DepthOfField in @react-three/postprocessing
 * 3.0.x renders black on a fresh mount with three 0.185, so it stays out.)
 */
export function Effects() {
  const quality = useSettings((s) => s.quality)
  const night = useSettings((s) => s.nightGame)
  if (quality === 'low') return null

  const chain: ReactElement[] = []
  if (quality === 'high') {
    chain.push(<N8AO key="ao" halfRes aoRadius={2.2} distanceFalloff={0.6} intensity={1.6} aoSamples={12} denoiseSamples={6} color="#05070a" />)
  }
  chain.push(
    <Bloom
      key="bloom"
      intensity={night ? 0.9 : 0.45}
      luminanceThreshold={night ? 0.78 : 0.9}
      luminanceSmoothing={0.22}
      mipmapBlur
      radius={0.72}
    />,
  )
  chain.push(<ToneMapping key="tone" mode={ToneMappingMode.ACES_FILMIC} />)
  if (quality === 'med') chain.push(<SMAA key="smaa" />)
  chain.push(<Vignette key="vig" eskil={false} offset={0.32} darkness={night ? 0.55 : 0.4} />)

  return (
    <EffectComposer multisampling={quality === 'high' ? 4 : 0} enableNormalPass={false}>
      {chain}
    </EffectComposer>
  )
}

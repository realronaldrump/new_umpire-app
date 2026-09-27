import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { ReactElement } from 'react'
import { useSettings } from '../store/settings'

/**
 * Post chain — one fixed, full-quality look on every device. Everything
 * renders into a linear HDR buffer so bloom works on real highlights (lamps,
 * flares, fireworks), then ACES maps it to the screen and SMAA smooths edges.
 * (SMAA rather than MSAA, and no N8AO: multisampled half-float targets and
 * N8AO can render black in iOS Safari. DepthOfField in
 * @react-three/postprocessing 3.0.x renders black on a fresh mount with
 * three 0.185, so it stays out.)
 */
export function Effects() {
  const night = useSettings((s) => s.nightGame)

  const chain: ReactElement[] = []
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
  chain.push(<SMAA key="smaa" />)
  chain.push(<Vignette key="vig" eskil={false} offset={0.32} darkness={night ? 0.55 : 0.4} />)

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {chain}
    </EffectComposer>
  )
}

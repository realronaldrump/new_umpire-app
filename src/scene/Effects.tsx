import { Bloom, EffectComposer, Noise, Vignette } from '@react-three/postprocessing'
import { useSettings } from '../store/settings'

/**
 * Post chain: bloom for the stadium lights, vignette + grain for the
 * broadcast feel. (DepthOfField in @react-three/postprocessing 3.0.x renders
 * black on a fresh mount with three 0.185, so it stays out of the chain.)
 */
export function Effects() {
  const quality = useSettings((s) => s.quality)
  if (quality === 'low') return null

  return (
    <EffectComposer multisampling={quality === 'high' ? 4 : 0}>
      <Bloom
        intensity={quality === 'high' ? 0.62 : 0.5}
        luminanceThreshold={0.72}
        luminanceSmoothing={0.25}
        mipmapBlur
      />
      <Vignette eskil={false} offset={0.26} darkness={0.6} />
      <Noise opacity={quality === 'high' ? 0.05 : 0.03} />
    </EffectComposer>
  )
}

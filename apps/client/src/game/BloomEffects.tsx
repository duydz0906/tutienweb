import { Bloom, EffectComposer } from '@react-three/postprocessing';

/**
 * Loaded only on desktop-class devices; mobile/reduced-motion saves a postprocess pass entirely.
 *
 * `resolutionScale` renders the composer at half resolution: bloom is a blur, so it cannot show the
 * difference, while the full-screen pass costs a quarter of the pixels. That pass runs after every
 * frame, so halving it is one of the cheapest wins available when the scene itself is heavy.
 */
export default function BloomEffects() {
  return <EffectComposer multisampling={0} enableNormalPass={false} resolutionScale={0.5}>
    <Bloom mipmapBlur intensity={0.67} luminanceThreshold={1.15} luminanceSmoothing={0.28} />
  </EffectComposer>;
}

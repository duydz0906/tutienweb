import { Bloom, EffectComposer } from '@react-three/postprocessing';

/** Loaded only on desktop-class devices; mobile/reduced-motion saves a postprocess pass. */
export default function BloomEffects() {
  return <EffectComposer multisampling={0} enableNormalPass={false}>
    <Bloom mipmapBlur intensity={0.67} luminanceThreshold={1.15} luminanceSmoothing={0.28} />
  </EffectComposer>;
}

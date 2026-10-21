import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

/** CanvasTexture on a THREE.Sprite: text always faces the camera in 3D space. */
export function labelTexture(text: string, color: string, critical = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 160;
  const context = canvas.getContext('2d')!;
  context.font = `${critical ? '900' : '700'} ${critical ? 60 : 48}px 'Be Vietnam Pro', sans-serif`;
  context.textAlign = 'center'; context.textBaseline = 'middle';
  context.shadowColor = critical ? '#ff1e3c' : '#031d23';
  context.shadowBlur = 18;
  context.lineWidth = 10; context.strokeStyle = '#0a2228';
  context.strokeText(text, 320, 80, 610);
  context.fillStyle = color;
  context.fillText(text, 320, 80, 610);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function BillboardLabel({ text, position, color = '#f7e5bb', width = 3.4 }: {
  text: string; position: [number, number, number]; color?: string; width?: number;
}) {
  const texture = useMemo(() => labelTexture(text, color), [text, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <sprite position={position} scale={[width, width / 4, 1]} renderOrder={8}>
    <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
  </sprite>;
}

import { useRef, useState, type RefObject, type PointerEvent } from 'react';

/** HTML touch control over the R3F Canvas; sends direction, never a world position. */
export function TouchJoystick({ movement }: { movement: RefObject<{ right: number; forward: number }> }) {
  const activePointer = useRef<number | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const read = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const radius = bounds.width / 2;
    const dx = (event.clientX - bounds.left - radius) / radius;
    const dy = (event.clientY - bounds.top - radius) / radius;
    const length = Math.max(1, Math.hypot(dx, dy));
    const x = dx / length;
    const y = dy / length;
    movement.current.right = x;
    movement.current.forward = -y;
    setOffset({ x: x * 29, y: y * 29 });
  };
  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    movement.current.right = 0;
    movement.current.forward = 0;
    setOffset({ x: 0, y: 0 });
  };
  return <div className="touch-pad-wrap">
    <div className="touch-pad" role="application" aria-label="Cần điều khiển di chuyển nhân vật"
      onPointerDown={(event) => { event.preventDefault(); if (activePointer.current !== null) return; activePointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); read(event); }}
      onPointerMove={(event) => { if (activePointer.current === event.pointerId) { event.preventDefault(); read(event); } }}
      onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
      <div className="touch-pad-ring" /><div className="touch-pad-thumb" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }} />
    </div>
    <span>DI CHUYỂN</span>
  </div>;
}

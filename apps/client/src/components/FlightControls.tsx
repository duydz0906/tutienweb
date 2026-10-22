import { ArrowDown, ArrowUp } from 'lucide-react';
import { clearFlightInput, setFlightInput } from '../game/flightInput';

/**
 * Altitude for touch and mouse. On a keyboard Space climbs and Shift descends; without this the
 * only way to fly higher on a phone would be a hardware keyboard.
 */
export function FlightControls() {
  const hold = (direction: 'up' | 'down') => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setFlightInput(direction, true);
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      clearFlightInput();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: () => clearFlightInput(),
    onPointerLeave: () => clearFlightInput(),
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  });
  return <div className="fly-controls" aria-label="Điều khiển độ cao">
    <button type="button" className="fly-btn" aria-label="Lên cao (Space)" title="Lên cao (Space)" {...hold('up')}><ArrowUp size={18} /></button>
    <button type="button" className="fly-btn" aria-label="Hạ thấp (Shift)" title="Hạ thấp (Shift)" {...hold('down')}><ArrowDown size={18} /></button>
  </div>;
}

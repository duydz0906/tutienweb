/**
 * Held flight input, shared by three writers that must agree: the keyboard (Space / Shift), the
 * on-screen buttons (touch and mouse), and the scene loop that turns it into altitude.
 *
 * It is a plain module-level object on purpose — the HUD lives in React, the altitude lives in
 * `SceneEngine`, and threading a ref through both only to end up with a boolean pair is noise.
 */
export type FlightInput = { up: boolean; down: boolean };

export const flightInput: FlightInput = { up: false, down: false };

export function setFlightInput(direction: keyof FlightInput, pressed: boolean): void {
  flightInput[direction] = pressed;
}

export function clearFlightInput(): void {
  flightInput.up = false;
  flightInput.down = false;
}

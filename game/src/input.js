// Valley Run — keyboard and mouse. The stick is the arrow keys (or WASD),
// throttle is W/S plus the mouse wheel, and moving the mouse steers like a
// yoke: push forward to descend, pull back to climb, left and right to bank.
// Click or Enter confirms on the title and end screens; P pauses; C swaps
// the chase camera for the cockpit.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CAMERA = 4;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let wheelDelta = 0;
  let mouseX = 0; // -1..1 from screen centre, 0 when the mouse is still
  let mouseY = 0;
  let mouseActive = false;
  let mouseSeenAt = 0;

  function keyOf(event) {
    return event.key.length === 1 ? event.key.toLowerCase() : event.key;
  }

  function onKeyDown(event) {
    const key = keyOf(event);
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) event.preventDefault();
    if (event.repeat) return;
    keys.add(key);
    if (key === ' ' || key === 'Enter') actions |= ACTION_CONFIRM;
    if (key === 'p' || key === 'Escape') actions |= ACTION_PAUSE;
    if (key === 'c') actions |= ACTION_CAMERA;
  }

  function onKeyUp(event) {
    keys.delete(keyOf(event));
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    mouseActive = true;
    mouseSeenAt = performance.now();
  }

  function onWheel(event) {
    event.preventDefault();
    wheelDelta += event.deltaY < 0 ? 0.08 : -0.08;
  }

  function onMouseDown() {
    actions |= ACTION_CONFIRM;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('mousedown', onMouseDown);

  /** Stick position this frame: keyboard wins, the mouse yoke fades in after it moves. */
  function stick() {
    let pitch = 0;
    let roll = 0;
    if (keys.has('ArrowUp') || keys.has('w')) pitch += 1;
    if (keys.has('ArrowDown') || keys.has('s')) pitch -= 1;
    if (keys.has('ArrowLeft') || keys.has('a')) roll -= 1;
    if (keys.has('ArrowRight') || keys.has('d')) roll += 1;
    if (pitch === 0 && roll === 0 && mouseActive && performance.now() - mouseSeenAt < 2500) {
      // Mouse yoke: up on screen is climb, so invert the vertical axis.
      roll = Math.max(-1, Math.min(1, mouseX * 1.4));
      pitch = Math.max(-1, Math.min(1, -mouseY * 1.4));
    }
    return { pitch, roll };
  }

  /** Throttle delta from keys and wheel since the last read. */
  function throttleDelta() {
    let delta = wheelDelta;
    wheelDelta = 0;
    if (keys.has('Shift')) delta += 0.02;
    if (keys.has('Control')) delta -= 0.02;
    return delta;
  }

  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  return { stick, throttleDelta, takeActions };
}

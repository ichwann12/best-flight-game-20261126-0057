// Valley Run — the screenshot scenes behind ?shot=start|play|rings|land.
// Each one flies the real rules forward from a fresh flight, steered by a
// simple autopilot (bank toward the next ring, pitch toward its height,
// throttle back on final approach), so every frame is what a short game
// really looks like — and the same seed always gives the same frame.
import { STEP } from './config.js';
import { EVENT_CRASHED, EVENT_LANDED, PHASE_FLYING, PHASE_LANDED, PHASE_TAXI } from './flight.js';
import { SCREEN_LANDED, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './hud.js';
import { terrainHeight } from './terrain.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * The autopilot: full throttle on the takeoff roll, then bank toward the
 * target, pitch toward its height, and ease off on final approach so the
 * wheels kiss the runway instead of slamming it. It also watches the ground
 * ahead: if the valley wall rises faster than the climb, it pulls up and
 * powers through rather than flying into the hillside.
 */
export function autopilot(flight) {
  const target = flight.currentTarget();
  const state = flight.state;
  if (state.phase === PHASE_TAXI) {
    return { pitch: state.speed > 24 ? 0.5 : 0, roll: 0, throttle: 1 };
  }
  let roll;
  let wantAlt;
  let throttle = 0.78;
  if (target.runway) {
    // The return leg: climb high, fly past the runway to a fix south of it
    // over the valley, turn around there, then come back northbound down
    // the glide slope. Landing into the same heading as take-off, with a
    // long straight final, is the only approach this autopilot can hold.
    const fix = { x: -80, y: 120, z: -1100 };
    if (!state.onFinal) {
      const dFix = Math.hypot(fix.x - state.x, fix.y - state.y, fix.z - state.z);
      if (dFix < 320) state.onFinal = true;
    }
    if (!state.onFinal) {
      const wantHeading = Math.atan2(fix.x - state.x, fix.z - state.z);
      const headingErr = wrapAngle(wantHeading - state.heading);
      roll = clamp(headingErr * 2.2, -0.7, 0.7);
      wantAlt = 120;
      throttle = 0.65;
    } else if (state.z > 420 && state.y > 25) {
      // Missed approach: past the runway and still high — go around and
      // fly the pattern again instead of chasing the threshold in circles.
      state.onFinal = false;
      roll = 0;
      wantAlt = 120;
      throttle = 0.65;
    } else {
      // Final: track the extended centreline, not a point — the heading is
      // north plus a correction for how far off the line the aircraft is,
      // so the correction fades as it lines up instead of flipping past
      // the threshold. Descend only once lined up; never below 0.35
      // throttle on final, or the wing stalls.
      const headingCmd = clamp(-state.x * 0.004, -0.5, 0.5);
      const headingErr = wrapAngle(headingCmd - state.heading);
      roll = clamp(headingErr * 2.2, -0.7, 0.7);
      const dThreshold = Math.hypot(state.x, state.z - 180);
      if (Math.abs(state.x) < 100) {
        wantAlt = 4 + Math.max(0, dThreshold - 80) * 0.055 + Math.min(dThreshold, 80) * 0.02;
      } else {
        wantAlt = 120;
      }
      throttle = dThreshold > 400 ? 0.4 : 0.35;
    }
  } else {
    const dx = target.x - state.x;
    const dz = target.z - state.z;
    const dist = Math.hypot(dx, dz);
    const wantHeading = Math.atan2(dx, dz);
    const headingErr = wrapAngle(wantHeading - state.heading);
    roll = clamp(headingErr * 2.2, -0.7, 0.7);
    wantAlt = target.y;
    if (dist < 500) throttle = 0.6;
    if (dist < 300 && state.speed > 45) throttle = 0.45;
    if (state.speed < 30) throttle = 1;
  }
  const altErr = wantAlt - state.y;
  let pitch = clamp(altErr * 0.045 + (state.phase === PHASE_FLYING && state.speed < 24 ? 0.15 : 0), -1, 1);
  // Terrain avoidance: sample the ground 200 m ahead and climb over it.
  // It never runs on final approach: there the glide slope aims at a flat
  // runway and the rising ground past its far end would fight the descent
  // all the way down. The landing check itself handles the ground there.
  if (!(state.onFinal && target.runway)) {
    const aheadX = state.x + Math.sin(state.heading) * 200;
    const aheadZ = state.z + Math.cos(state.heading) * 200;
    const groundAhead = terrainHeight(aheadX, aheadZ);
    if (state.y < groundAhead + 25) {
      pitch = Math.max(pitch, 0.7);
      throttle = 1;
    }
    if (state.y < terrainHeight(state.x, state.z) + 12) pitch = Math.max(pitch, 0.8);
  }
  return { pitch, roll, throttle };
}

/**
 * Fly the flight forward until `stop` says so (or the step budget runs
 * out), then report the screen to draw over it. Returns the camera mode
 * the scene wants, too.
 */
function flyUntil(flight, stop, maxSeconds, camera = 'chase') {
  const limit = Math.floor(maxSeconds / STEP);
  for (let i = 0; i < limit; i += 1) {
    const events = flight.step(STEP, autopilot(flight));
    if (events & EVENT_CRASHED) return { screen: SCREEN_OVER, camera };
    if (events & EVENT_LANDED) return { screen: SCREEN_LANDED, camera };
    if (stop(flight.state)) return { screen: SCREEN_PLAY, camera };
  }
  return { screen: SCREEN_PLAY, camera };
}

/**
 * Set `flight` to the named scene and return the screen and camera to draw.
 * start: the aircraft idles on the runway under the title.
 * play: mid-course, just past the third ring.
 * rings: cockpit view, closing on the fourth ring.
 * land: the full sortie, wheels down on the runway.
 */
export function stageShot(name, flight) {
  flight.reset();
  if (name === 'start') {
    for (let i = 0; i < 2 / STEP; i += 1) flight.step(STEP, { pitch: 0, roll: 0, throttle: 0.25 });
    return { screen: SCREEN_TITLE, camera: 'chase', best: 0 };
  }
  if (name === 'play') {
    const scene = flyUntil(flight, (s) => s.ringsHit >= 3, 90);
    return { ...scene, best: flight.state.score };
  }
  if (name === 'rings') {
    const scene = flyUntil(
      flight,
      (s) => {
        if (s.nextRing >= flight.rings.length) return false;
        const ring = flight.rings[s.nextRing];
        return Math.hypot(ring.x - s.x, ring.y - s.y, ring.z - s.z) < 260;
      },
      120,
      'cockpit',
    );
    return { ...scene, best: flight.state.score };
  }
  // land: the whole sortie, flown by the autopilot.
  const scene = flyUntil(flight, () => false, 300);
  if (scene.screen === SCREEN_LANDED || flight.state.phase === PHASE_LANDED) {
    return { screen: SCREEN_LANDED, camera: 'chase', best: flight.state.score };
  }
  return { ...scene, best: flight.state.score };
}

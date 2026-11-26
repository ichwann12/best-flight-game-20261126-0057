// Valley Run — flight model and mission state. An arcade model with real
// trade-offs: throttle sets speed, pitch sets climb, bank turns the aircraft,
// and below stall speed the wing gives up. The mission is one sortie: take
// off, fly the six rings up the valley, then land on the runway before the
// fuel runs out.
import { MISSION, PLANE, WORLD } from './config.js';
import { onRunway, ringCourse, terrainHeight } from './terrain.js';

export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASHED = 4;
export const EVENT_FUEL_EMPTY = 8;

export const PHASE_TAXI = 'taxi';
export const PHASE_FLYING = 'flying';
export const PHASE_LANDED = 'landed';
export const PHASE_CRASHED = 'crashed';

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createFlight() {
  const rings = ringCourse();
  const state = freshState();

  function freshState() {
    return {
      x: WORLD.start.x,
      y: WORLD.start.y,
      z: WORLD.start.z,
      heading: WORLD.start.heading,
      pitch: 0,
      roll: 0,
      speed: 0,
      throttle: 0,
      fuel: MISSION.fuelStart,
      verticalSpeed: 0,
      phase: PHASE_TAXI,
      ringsHit: 0,
      nextRing: 0,
      score: 0,
      time: 0,
      crashReason: '',
      landed: false,
      onFinal: false, // autopilot latch: the final approach has begun
      fuelEmptyAnnounced: false,
    };
  }

  function reset() {
    Object.assign(state, freshState());
  }

  /**
   * One fixed step. `input` is { pitch: -1..1 (up positive), roll: -1..1
   * (right positive), throttle: 0..1 }. Returns an event bitmask.
   */
  function step(dt, input) {
    if (state.phase === PHASE_LANDED || state.phase === PHASE_CRASHED) return 0;
    let events = 0;
    state.time += dt;

    // Fuel: empty tank forces the throttle closed; the aircraft glides.
    if (state.fuel > 0) {
      state.fuel = Math.max(0, state.fuel - (MISSION.fuelBurnBase + MISSION.fuelBurnThrottle * state.throttle) * dt);
      if (state.fuel === 0 && !state.fuelEmptyAnnounced) {
        state.fuelEmptyAnnounced = true;
        events |= EVENT_FUEL_EMPTY;
      }
    }
    const throttle = state.fuel > 0 ? clamp(input.throttle, 0, 1) : 0;
    state.throttle = throttle;

    // Speed chases the throttle's target; climbing steep costs speed.
    const targetSpeed = throttle * PLANE.maxSpeed;
    const climbPenalty = Math.max(0, state.pitch) * 14;
    state.speed += ((targetSpeed - climbPenalty - state.speed) * dt) / PLANE.accelTime;
    if (state.speed < 0) state.speed = 0;

    // Attitude follows the stick, rate-limited so the aircraft feels weighty.
    const wantPitch = clamp(input.pitch, -1, 1) * PLANE.maxPitch;
    const wantRoll = clamp(input.roll, -1, 1) * PLANE.maxRoll;
    state.pitch += clamp(wantPitch - state.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);
    state.roll += clamp(wantRoll - state.roll, -PLANE.rollRate * dt, PLANE.rollRate * dt);

    // Stall: too slow and the nose drops on its own, whatever the stick says.
    const stalled = state.speed < PLANE.stallSpeed && state.phase === PHASE_FLYING;
    if (stalled) state.pitch += (-0.28 - state.pitch) * Math.min(1, dt * 1.6);

    // Bank turns the aircraft: turn rate grows with bank and shrinks with speed.
    const turnRate = (PLANE.gravity * Math.tan(state.roll)) / Math.max(state.speed, 12);
    state.heading = wrapAngle(state.heading + turnRate * dt);

    // Move along the nose.
    const forwardX = Math.sin(state.heading);
    const forwardZ = Math.cos(state.heading);
    const climb = state.speed * Math.sin(state.pitch);
    const sink = stalled ? 6 : 0;
    state.verticalSpeed = climb - sink;
    state.x += forwardX * state.speed * Math.cos(state.pitch) * dt;
    state.z += forwardZ * state.speed * Math.cos(state.pitch) * dt;
    state.y += state.verticalSpeed * dt;

    // Lift-off: rolling fast enough on the strip becomes flying.
    if (state.phase === PHASE_TAXI) {
      state.y = Math.max(state.y, terrainHeight(state.x, state.z) + PLANE.groundClearance);
      if (state.speed > 26 && state.pitch > 0.06) state.phase = PHASE_FLYING;
    }

    // Rings: passing the centre within its radius scores and lights the next.
    if (state.nextRing < rings.length) {
      const ring = rings[state.nextRing];
      const dx = state.x - ring.x;
      const dy = state.y - ring.y;
      const dz = state.z - ring.z;
      if (dx * dx + dy * dy + dz * dz < ring.radius * ring.radius) {
        state.ringsHit += 1;
        state.nextRing += 1;
        state.score += MISSION.ringScore;
        events |= EVENT_RING;
      }
    }

    // Ground contact: a gentle, slow, level arrival on the strip is a landing.
    const ground = terrainHeight(state.x, state.z);
    if (state.y <= ground + PLANE.groundClearance) {
      state.y = ground + PLANE.groundClearance;
      const gentle = state.verticalSpeed > -4.5 && state.speed < 48;
      const level = Math.abs(state.roll) < 0.28 && state.pitch > -0.18 && state.pitch < 0.3;
      if (onRunway(state.x, state.z) && gentle && level && state.phase !== PHASE_TAXI) {
        state.phase = PHASE_LANDED;
        state.landed = true;
        state.score += MISSION.landingScore + Math.round(state.fuel) * 2;
        events |= EVENT_LANDED;
      } else if (state.phase === PHASE_FLYING) {
        // A takeoff roll is ground contact too, but only a flying aircraft
        // can crash into the ground: on the strip it is just rolling.
        state.phase = PHASE_CRASHED;
        state.crashReason = onRunway(state.x, state.z)
          ? (gentle ? 'You came down sideways on the runway.' : 'You hit the runway too hard.')
          : (state.y < 4 ? 'You ditched in the river.' : 'You flew into the mountainside.');
        events |= EVENT_CRASHED;
      }
    }
    return events;
  }

  /** Where the pilot should aim next: the next ring, or the runway once all are flown. */
  function currentTarget() {
    if (state.nextRing < rings.length) return rings[state.nextRing];
    return { x: 0, y: 6, z: 180, radius: 0, index: -1, runway: true };
  }

  return { state, rings, reset, step, currentTarget };
}

/** Knots and feet for the HUD: the instruments read imperial, as real ones do. */
export function toKnots(ms) {
  return Math.round(ms * 1.94384);
}
export function toFeet(m) {
  return Math.round(m * 3.28084);
}
export function headingDegrees(heading) {
  const deg = Math.round(((heading * 180) / Math.PI) % 360);
  return deg < 0 ? deg + 360 : deg;
}

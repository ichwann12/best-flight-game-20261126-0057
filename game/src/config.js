// Valley Run — tuning constants. One place for every number that shapes how the
// aircraft feels: speeds, turn authority, fuel burn, the ring course and scoring.
export const STEP = 1 / 60;

export const PLANE = {
  maxSpeed: 72, // m/s at full throttle (about 140 knots)
  stallSpeed: 19, // m/s: below this the nose drops and the wing stops lifting
  cruiseSpeed: 46,
  accelTime: 4.5, // seconds for speed to close most of the gap to its target
  pitchRate: 1.05, // rad/s toward the commanded pitch
  maxPitch: 0.55,
  rollRate: 1.9, // rad/s toward the commanded bank
  maxRoll: 0.85,
  gravity: 9.81,
  groundClearance: 1.4, // metres of gear below the reference point
};

export const MISSION = {
  ringCount: 6,
  ringRadius: 17, // metres: passing the centre within this counts
  ringScore: 100,
  landingScore: 500,
  fuelStart: 100,
  // Fuel burn per second: a base trickle plus a throttle term. A full sortie
  // (take-off, six rings, landing) costs roughly half a tank, so fuel is a
  // decision — firewalling the throttle the whole way leaves little margin.
  fuelBurnBase: 0.13,
  fuelBurnThrottle: 0.3,
  timeLimit: 360, // seconds; the sortie is scored, not failed, past this
};

export const WORLD = {
  waterLevel: 2,
  runway: { x0: -18, x1: 18, z0: -60, z1: 420 }, // flat strip, heading north
  start: { x: 0, y: 5.4, z: 60, heading: 0 },
  fogNear: 900, // metres: terrain fades into haze beyond this
  fogFar: 1900,
};

export const BEST_KEY = 'valley-run-best';

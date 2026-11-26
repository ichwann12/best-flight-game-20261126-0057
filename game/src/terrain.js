// Valley Run — the world: a mountain valley with a river, a flat runway strip
// and a course of six golden rings. The valley winds gently north; the runway
// sits at its mouth and the rings climb up the valley to a high lake.
import { WORLD } from './config.js';
import { createRandom, fbmNoise } from './random.js';

const SEED = 20261126;

/** The valley's centre line: a slow S-curve the rings follow. */
export function courseX(z) {
  return 130 * Math.sin(z * 0.00085) + 55 * Math.sin(z * 0.0021 + 1.7);
}

function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function smoothstep(a, b, t) {
  return clamp01((t - a) / (b - a));
}

/** Height of the runway strip: the valley floor is graded to this. */
export const RUNWAY_Y = 4;

/** Height of the ground in metres at world (x, z). */
export function terrainHeight(x, z) {
  // Ridged hills: two octaves of fractal noise, sharpened so ridges read.
  const n = fbmNoise(x * 0.0016, z * 0.0016, SEED, 3);
  const ridge = 1 - Math.abs(2 * n - 1);
  let h = 10 + ridge * ridge * 260 + fbmNoise(x * 0.006, z * 0.006, SEED + 7, 2) * 18;

  // Carve the valley floor along the course line so the route stays flyable.
  const dCourse = Math.abs(x - courseX(z));
  const valley = smoothstep(420, 90, dCourse); // 1 on the course, 0 far away
  h = h * (1 - valley * 0.7) + 4 * valley;

  // Flatten the runway strip and its approach so a landing is possible.
  const r = WORLD.runway;
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  const dRunway = Math.hypot(dx, dz);
  const flat = smoothstep(130, 10, dRunway);
  h = h * (1 - flat) + RUNWAY_Y * flat;
  return h;
}

/** True when (x, z) is on the paved runway strip. */
export function onRunway(x, z) {
  const r = WORLD.runway;
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

/** The six rings of the course, in flying order. */
export function ringCourse() {
  const rng = createRandom(SEED + 55);
  const zs = [520, 980, 1450, 1950, 2480, 3050];
  return zs.map((z, i) => {
    const x = courseX(z);
    const ground = terrainHeight(x, z);
    return {
      x,
      y: ground + 52 + 14 * Math.sin(i * 1.3) + rng.range(-6, 6),
      z,
      radius: 17,
      index: i,
    };
  });
}

/** Scattered clouds: fixed positions the renderer draws as soft billboards. */
export function cloudField() {
  const rng = createRandom(SEED + 91);
  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    const z = rng.range(-400, 3600);
    clouds.push({
      x: courseX(z) + rng.range(-900, 900),
      y: rng.range(240, 380),
      z,
      size: rng.range(90, 210),
    });
  }
  return clouds;
}

/** Colour of the ground at a height, before slope and haze shading. */
export function groundColour(h) {
  if (h < WORLD.waterLevel) return [38, 110, 168]; // river and lake
  if (h < 40) return [96, 148, 74]; // valley grass
  if (h < 95) return [74, 116, 62]; // forest slopes
  if (h < 170) return [122, 98, 70]; // bare rock
  return [228, 232, 238]; // snow on the high ridges
}

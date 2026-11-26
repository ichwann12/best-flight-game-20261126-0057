// Valley Run — the 3D view: sky, sun and clouds, the terrain grid, the runway
// and the golden rings, the aircraft itself and the cockpit frame. All of it
// is drawn on one 2D canvas with a small perspective projector: no library,
// no assets, nothing loaded from anywhere.
import { WORLD } from './config.js';
import { RUNWAY_Y, cloudField, groundColour, terrainHeight } from './terrain.js';

const FOV = (68 * Math.PI) / 180;
const GRID_ROWS = 34; // forward cells, 55 m each: about 1.9 km of valley
const GRID_COLS = 26; // cells each side of the course
const GRID_STEP = 55;
const SUN_DIR = [-0.72, 0.34, -0.42]; // low evening sun in the west

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mix(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function rgb(c, alpha = 1) {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`;
}

function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const clouds = cloudField();
  // Smoothed chase camera: it lags the aircraft a touch so the view never snaps.
  const cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, ready: false };
  const SKY_TOP = [38, 68, 128];
  const SKY_HORIZON = [246, 178, 118];
  const HAZE = [214, 196, 178];

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  /** Camera basis vectors from yaw (heading), pitch and roll. */
  function cameraBasis(yaw, pitch, roll) {
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const forward = [Math.sin(yaw) * cp, sp, Math.cos(yaw) * cp];
    let right = [Math.cos(yaw), 0, -Math.sin(yaw)];
    // up = forward x right
    let up = [
      forward[1] * right[2] - forward[2] * right[1],
      forward[2] * right[0] - forward[0] * right[2],
      forward[0] * right[1] - forward[1] * right[0],
    ];
    if (roll !== 0) {
      const cr = Math.cos(roll);
      const sr = Math.sin(roll);
      const r2 = [
        right[0] * cr + up[0] * sr,
        right[1] * cr + up[1] * sr,
        right[2] * cr + up[2] * sr,
      ];
      const u2 = [
        up[0] * cr - right[0] * sr,
        up[1] * cr - right[1] * sr,
        up[2] * cr - right[2] * sr,
      ];
      right = r2;
      up = u2;
    }
    return { forward, right, up };
  }

  function makeProjector(camPos, basis, w, h) {
    const f = h / 2 / Math.tan(FOV / 2);
    const cx = w / 2;
    const cy = h / 2;
    return function project(x, y, z) {
      const vx = x - camPos[0];
      const vy = y - camPos[1];
      const vz = z - camPos[2];
      const px = vx * basis.right[0] + vy * basis.right[1] + vz * basis.right[2];
      const py = vx * basis.up[0] + vy * basis.up[1] + vz * basis.up[2];
      const pz = vx * basis.forward[0] + vy * basis.forward[1] + vz * basis.forward[2];
      if (pz < 2) return null;
      return { x: cx + (px / pz) * f, y: cy - (py / pz) * f, d: pz };
    };
  }

  function drawSky(w, h, basis) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, rgb(SKY_TOP));
    grad.addColorStop(0.55, rgb(mix(SKY_TOP, SKY_HORIZON, 0.55)));
    grad.addColorStop(0.72, rgb(SKY_HORIZON));
    grad.addColorStop(1, rgb([70, 60, 66]));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // The sun: project its fixed world direction as a far point.
    const f = h / 2 / Math.tan(FOV / 2);
    const d = SUN_DIR;
    const px = d[0] * basis.right[0] + d[1] * basis.right[1] + d[2] * basis.right[2];
    const py = d[0] * basis.up[0] + d[1] * basis.up[1] + d[2] * basis.up[2];
    const pz = d[0] * basis.forward[0] + d[1] * basis.forward[1] + d[2] * basis.forward[2];
    if (pz > 0.05) {
      const sx = w / 2 + (px / pz) * f;
      const sy = h / 2 - (py / pz) * f;
      const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 130);
      glow.addColorStop(0, 'rgba(255, 236, 180, 0.95)');
      glow.addColorStop(0.25, 'rgba(255, 196, 110, 0.55)');
      glow.addColorStop(1, 'rgba(255, 180, 90, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, 130, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff3cf';
      ctx.beginPath();
      ctx.arc(sx, sy, 17, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawClouds(project, camPos) {
    ctx.save();
    for (const cloud of clouds) {
      const p = project(cloud.x, cloud.y, cloud.z);
      if (!p || p.d > 3200) continue;
      const s = (cloud.size / p.d) * (canvas.height / 2 / Math.tan(FOV / 2));
      const alpha = clamp01(1.2 - p.d / 3200) * 0.85;
      ctx.fillStyle = `rgba(255, 248, 240, ${alpha})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, s, s * 0.32, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x - s * 0.5, p.y + s * 0.06, s * 0.6, s * 0.24, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x + s * 0.55, p.y + s * 0.05, s * 0.65, s * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTerrain(project, flight) {
    const { x: px, z: pz, heading } = flight;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const rx = Math.cos(heading);
    const rz = -Math.sin(heading);
    // Sample a grid anchored on the aircraft, rows running forward.
    const pts = [];
    for (let i = 0; i <= GRID_ROWS; i += 1) {
      const row = [];
      const d = i * GRID_STEP;
      for (let j = -GRID_COLS; j <= GRID_COLS; j += 1) {
        const lat = j * GRID_STEP;
        const wx = px + fx * d + rx * lat;
        const wz = pz + fz * d + rz * lat;
        const h = terrainHeight(wx, wz);
        row.push({ p: project(wx, h, wz), h, wx, wz, d });
      }
      pts.push(row);
    }
    // Painter's order: far rows first.
    for (let i = GRID_ROWS - 1; i >= 0; i -= 1) {
      for (let j = 0; j < GRID_COLS * 2; j += 1) {
        const a = pts[i][j];
        const b = pts[i][j + 1];
        const c = pts[i + 1][j + 1];
        const d = pts[i + 1][j];
        if (!a.p || !b.p || !c.p || !d.p) continue;
        const midH = (a.h + b.h + c.h + d.h) / 4;
        const midD = (a.d + b.d + c.d + d.d) / 4;
        let colour = groundColour(midH);
        // Slope shading: steep ground goes darker, flat valley stays bright,
        // but never so dark the hillside reads as a hole.
        const slope = Math.abs(a.h - c.h) + Math.abs(b.h - d.h);
        const shade = Math.max(0.45, 1 - slope * 0.012);
        colour = [colour[0] * shade, colour[1] * shade, colour[2] * shade];
        // Haze with distance so far ridges melt into the evening sky.
        const haze = clamp01((midD - WORLD.fogNear) / (WORLD.fogFar - WORLD.fogNear));
        colour = mix(colour, HAZE, haze * 0.85);
        ctx.fillStyle = rgb(colour);
        ctx.beginPath();
        ctx.moveTo(a.p.x, a.p.y);
        ctx.lineTo(b.p.x, b.p.y);
        ctx.lineTo(c.p.x, c.p.y);
        ctx.lineTo(d.p.x, d.p.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawRunway(project) {
    const r = WORLD.runway;
    const y = RUNWAY_Y + 0.35;
    // Asphalt strip, drawn in short segments so the part behind the camera
    // never hides the part ahead of it.
    for (let z = r.z0; z < r.z1; z += 30) {
      const z1 = Math.min(z + 30, r.z1);
      const corners = [
        project(r.x0, y, z),
        project(r.x1, y, z),
        project(r.x1, y, z1),
        project(r.x0, y, z1),
      ];
      if (!corners.every(Boolean)) continue;
      ctx.fillStyle = '#2c2f36';
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (const c of corners.slice(1)) ctx.lineTo(c.x, c.y);
      ctx.closePath();
      ctx.fill();
    }
    // White edge lines.
    ctx.strokeStyle = 'rgba(240, 240, 230, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const x of [r.x0 + 1.5, r.x1 - 1.5]) {
      const p0 = project(x, y + 0.05, r.z0 + 4);
      const p1 = project(x, y + 0.05, r.z1 - 4);
      if (p0 && p1) {
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
      }
    }
    ctx.stroke();
    // Centreline dashes.
    ctx.fillStyle = 'rgba(240, 240, 230, 0.9)';
    for (let z = r.z0 + 18; z < r.z1 - 10; z += 30) {
      const p0 = project(-1.2, y + 0.05, z);
      const p1 = project(1.2, y + 0.05, z);
      const p2 = project(1.2, y + 0.05, z + 14);
      const p3 = project(-1.2, y + 0.05, z + 14);
      if (p0 && p1 && p2 && p3) {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Threshold bars at both ends.
    for (const zt of [r.z0 + 6, r.z1 - 14]) {
      for (let x = -10; x <= 10; x += 5) {
        const p0 = project(x - 1.6, y + 0.05, zt);
        const p1 = project(x + 1.6, y + 0.05, zt);
        const p2 = project(x + 1.6, y + 0.05, zt + 8);
        const p3 = project(x - 1.6, y + 0.05, zt + 8);
        if (p0 && p1 && p2 && p3) {
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  function drawRings(project, flight, rings, time) {
    // Far rings first so a near ring overlaps one behind it.
    const order = [...rings].sort((a, b) => {
      const da = Math.hypot(a.x - flight.x, a.y - flight.y, a.z - flight.z);
      const db = Math.hypot(b.x - flight.x, b.y - flight.y, b.z - flight.z);
      return db - da;
    });
    for (const ring of order) {
      const p = project(ring.x, ring.y, ring.z);
      if (!p) continue;
      const f = canvas.height / 2 / Math.tan(FOV / 2);
      const radius = (ring.radius / p.d) * f;
      if (radius < 2) continue;
      const done = ring.index < flight.nextRing;
      const next = ring.index === flight.nextRing;
      const pulse = next ? 0.75 + 0.25 * Math.sin(time * 4) : 1;
      ctx.save();
      ctx.globalAlpha = done ? 0.25 : next ? 0.98 : 0.6;
      if (next) {
        ctx.shadowColor = '#ffd34d';
        ctx.shadowBlur = 26 * pulse;
      }
      ctx.strokeStyle = next ? '#ffd34d' : done ? '#8fae7a' : '#e8b64c';
      ctx.lineWidth = Math.max(3, radius * 0.16);
      ctx.beginPath();
      // The ring faces the course: squash it by the viewing angle.
      const squash = 0.92;
      ctx.ellipse(p.x, p.y, radius, radius * squash, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = next ? '#fff2b8' : '#e8b64c';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2.5, radius * 0.07), 0, Math.PI * 2);
      ctx.fill();
      if (next && radius > 14) {
        ctx.fillStyle = '#ffe9a8';
        ctx.font = `bold ${Math.max(13, Math.min(20, radius * 0.35))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`RING ${ring.index + 1}`, p.x, p.y - radius - 10);
      }
      ctx.restore();
    }
  }

  /** The aircraft from behind, banked with its roll, wings level with the horizon. */
  function drawPlane(w, h, flight, time) {
    const cx = w / 2;
    const cy = h * 0.56;
    const span = Math.min(w, h) * 0.42;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(flight.roll * 0.9);
    const bob = Math.sin(time * 2.2) * 1.5;
    ctx.translate(0, bob);
    // Wings: warm cream with red tips, dihedral upward at the ends.
    ctx.fillStyle = '#f2e6c8';
    ctx.beginPath();
    ctx.moveTo(-span / 2, 6);
    ctx.lineTo(-span * 0.08, -2);
    ctx.lineTo(span * 0.08, -2);
    ctx.lineTo(span / 2, 6);
    ctx.lineTo(span * 0.42, 14);
    ctx.lineTo(-span * 0.42, 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c8442e';
    ctx.beginPath();
    ctx.moveTo(-span / 2, 6);
    ctx.lineTo(-span * 0.42, 7);
    ctx.lineTo(-span * 0.42, 14);
    ctx.lineTo(-span * 0.36, 14);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(span / 2, 6);
    ctx.lineTo(span * 0.42, 7);
    ctx.lineTo(span * 0.42, 14);
    ctx.lineTo(span * 0.36, 14);
    ctx.closePath();
    ctx.fill();
    // Fuselage: red tail cone tapering to the tail, cream cabin.
    ctx.fillStyle = '#c8442e';
    ctx.beginPath();
    ctx.moveTo(-span * 0.055, -34);
    ctx.lineTo(span * 0.055, -34);
    ctx.lineTo(span * 0.075, 26);
    ctx.lineTo(-span * 0.075, 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f2e6c8';
    ctx.beginPath();
    ctx.moveTo(-span * 0.05, -20);
    ctx.lineTo(span * 0.05, -20);
    ctx.lineTo(span * 0.062, 12);
    ctx.lineTo(-span * 0.062, 12);
    ctx.closePath();
    ctx.fill();
    // Tail fin and stabiliser.
    ctx.fillStyle = '#c8442e';
    ctx.beginPath();
    ctx.moveTo(-span * 0.02, -34);
    ctx.lineTo(0, -58);
    ctx.lineTo(span * 0.02, -34);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f2e6c8';
    ctx.beginPath();
    ctx.moveTo(-span * 0.14, -30);
    ctx.lineTo(span * 0.14, -30);
    ctx.lineTo(span * 0.11, -22);
    ctx.lineTo(-span * 0.11, -22);
    ctx.closePath();
    ctx.fill();
    // Navigation lights: red port, green starboard, white tail strobe.
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(-span / 2 + 3, 9, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#34d17b';
    ctx.beginPath();
    ctx.arc(span / 2 - 3, 9, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = Math.sin(time * 6) > 0 ? '#ffffff' : '#888888';
    ctx.beginPath();
    ctx.arc(0, -56, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Cockpit view: canopy frame, nose and the dashboard edge. */
  function drawCockpitFrame(w, h, flight) {
    ctx.save();
    // Nose cone at the bottom centre.
    ctx.fillStyle = '#3a3f47';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 150, h);
    ctx.lineTo(w / 2 - 42, h * 0.82);
    ctx.lineTo(w / 2 + 42, h * 0.82);
    ctx.lineTo(w / 2 + 150, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#565d68';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 42, h * 0.82);
    ctx.lineTo(w / 2 + 42, h * 0.82);
    ctx.lineTo(w / 2 + 18, h);
    ctx.lineTo(w / 2 - 18, h);
    ctx.closePath();
    ctx.fill();
    // Canopy struts.
    ctx.strokeStyle = '#14181d';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w * 0.1, h * 0.5);
    ctx.moveTo(w, 0);
    ctx.lineTo(w * 0.9, h * 0.5);
    ctx.moveTo(w * 0.1, h * 0.5);
    ctx.lineTo(w * 0.14, h);
    ctx.moveTo(w * 0.9, h * 0.5);
    ctx.lineTo(w * 0.86, h);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Paint one frame. `view` carries the flight state, the rings, the screen
   * name, the camera mode ('chase' or 'cockpit'), the best score, a banner
   * message and the running clock.
   */
  function draw(view) {
    const { w, h } = resize();
    const flight = view.flight;
    const chase = view.camera !== 'cockpit';
    // Camera: chase sits behind and above the tail; cockpit sits at the pilot.
    const camYaw = flight.heading;
    const camPitch = chase ? flight.pitch * 0.45 + 0.02 : flight.pitch * 0.9;
    const camRoll = flight.roll * (chase ? 0.55 : 0.25);
    const back = chase ? 15 : -1.2;
    const up = chase ? 4.6 : 1.6;
    const target = {
      x: flight.x - Math.sin(flight.heading) * back,
      y: flight.y + up,
      z: flight.z - Math.cos(flight.heading) * back,
      yaw: camYaw,
      pitch: camPitch,
      roll: camRoll,
    };
    if (!cam.ready) {
      Object.assign(cam, target);
      cam.ready = true;
    } else {
      const k = chase ? 0.12 : 0.35;
      cam.x = lerp(cam.x, target.x, k);
      cam.y = lerp(cam.y, target.y, k);
      cam.z = lerp(cam.z, target.z, k);
      cam.yaw = lerp(cam.yaw, target.yaw, k);
      cam.pitch = lerp(cam.pitch, target.pitch, k);
      cam.roll = lerp(cam.roll, target.roll, k);
    }
    const basis = cameraBasis(cam.yaw, cam.pitch, cam.roll);
    const project = makeProjector([cam.x, cam.y, cam.z], basis, w, h);

    drawSky(w, h, basis);
    drawClouds(project, [cam.x, cam.y, cam.z]);
    drawTerrain(project, flight);
    drawRunway(project);
    drawRings(project, flight, view.rings, view.time);
    if (chase) drawPlane(w, h, flight, view.time);
    else drawCockpitFrame(w, h, flight);
    return { ctx, w, h, project };
  }

  return { draw, resize };
}

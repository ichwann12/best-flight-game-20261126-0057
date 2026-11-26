// Valley Run — the HUD and the screens: altitude, speed and heading in big
// lit numerals, a compass tape, an attitude ball, an altimeter and an
// airspeed dial, throttle and fuel gauges, the ring counter, the guidance
// arrow to the next objective, and the title / pause / crash / landing
// screens. Everything is drawn in canvas vector graphics — no images.
import { MISSION } from './config.js';
import { PHASE_FLYING, headingDegrees, toFeet, toKnots } from './flight.js';
import { terrainHeight } from './terrain.js';

const AMBER = '#ffb347';
const GREEN = '#7dff9a';
const PANEL = 'rgba(10, 16, 24, 0.78)';
const PANEL_EDGE = 'rgba(255, 179, 71, 0.45)';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_LANDED = 'landed';

function panel(ctx, x, y, w, h, r = 10) {
  ctx.fillStyle = PANEL;
  ctx.strokeStyle = PANEL_EDGE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
}

function label(ctx, text, x, y, size = 11, colour = '#9fb4c8') {
  ctx.fillStyle = colour;
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

function bigValue(ctx, text, x, y, size = 30) {
  ctx.fillStyle = '#f4f8ff';
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(text, x, y);
}

/** The attitude ball: a horizon that banks and pitches with the aircraft. */
function drawAttitude(ctx, cx, cy, r, flight) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-flight.roll);
  const pitchPx = flight.pitch * r * 1.4;
  ctx.fillStyle = '#2b6cb0';
  ctx.fillRect(-r, -r + pitchPx, r * 2, r);
  ctx.fillStyle = '#8a6b46';
  ctx.fillRect(-r, pitchPx, r * 2, r);
  ctx.strokeStyle = '#f4f8ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, pitchPx);
  ctx.lineTo(r, pitchPx);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(244, 248, 255, 0.5)';
  ctx.lineWidth = 1;
  for (const d of [-0.3, -0.15, 0.15, 0.3]) {
    const y = pitchPx - d * r * 1.4;
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, y);
    ctx.lineTo(r * 0.4, y);
    ctx.stroke();
  }
  ctx.restore();
  // Fixed wings marker and bezel.
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - r - 4, cy);
  ctx.lineTo(cx - r * 0.35, cy);
  ctx.moveTo(cx + r * 0.35, cy);
  ctx.lineTo(cx + r + 4, cy);
  ctx.stroke();
  ctx.strokeStyle = PANEL_EDGE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

/** A round dial with a needle: used for the altimeter and the airspeed. */
function drawDial(ctx, cx, cy, r, value, max, unit, ticks, labelEvery) {
  ctx.fillStyle = '#0c1420';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PANEL_EDGE;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#9fb4c8';
  ctx.font = `600 9px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  for (let i = 0; i <= ticks; i += 1) {
    const a = Math.PI * 0.75 + (i / ticks) * Math.PI * 1.5;
    const x0 = cx + Math.cos(a) * (r - 5);
    const y0 = cy + Math.sin(a) * (r - 5);
    const x1 = cx + Math.cos(a) * (r - 11);
    const y1 = cy + Math.sin(a) * (r - 11);
    ctx.strokeStyle = '#9fb4c8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    if (i % labelEvery === 0) {
      ctx.fillText(String(Math.round((i / ticks) * max)), cx + Math.cos(a) * (r - 20), cy + Math.sin(a) * (r - 20) + 3);
    }
  }
  const angle = Math.PI * 0.75 + (Math.min(value, max) / max) * Math.PI * 1.5;
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * (r - 8), cy + Math.sin(angle) * (r - 8));
  ctx.stroke();
  ctx.fillStyle = '#f4f8ff';
  ctx.font = `700 13px system-ui, sans-serif`;
  ctx.fillText(String(Math.round(value)), cx, cy + r * 0.55);
  ctx.fillStyle = '#9fb4c8';
  ctx.font = `600 9px system-ui, sans-serif`;
  ctx.fillText(unit, cx, cy + r * 0.78);
}

/** Compass tape across the top: the heading, with cardinal marks. */
function drawCompass(ctx, w, flight) {
  const deg = headingDegrees(flight.heading);
  const tapeW = Math.min(460, w * 0.42);
  const x0 = (w - tapeW) / 2;
  const y = 46;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 14, tapeW, 64);
  ctx.clip();
  ctx.fillStyle = 'rgba(10, 16, 24, 0.55)';
  ctx.fillRect(x0, 14, tapeW, 44);
  const pxPerDeg = tapeW / 90;
  for (let d = -60; d <= 60; d += 5) {
    let h = (deg + d + 360) % 360;
    const x = x0 + tapeW / 2 + d * pxPerDeg;
    const major = h % 30 === 0;
    ctx.strokeStyle = major ? '#f4f8ff' : 'rgba(159, 180, 200, 0.7)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x, y + (major ? 8 : 3));
    ctx.stroke();
    if (major) {
      const name = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[h] ?? String(h / 10).padStart(2, '0');
      ctx.fillStyle = '#f4f8ff';
      ctx.font = `700 12px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(name, x, y + 22);
    }
  }
  ctx.restore();
  // Centre caret and the digital heading.
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 7, 12);
  ctx.lineTo(w / 2 + 7, 12);
  ctx.lineTo(w / 2, 22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f4f8ff';
  ctx.font = `700 15px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(String(deg).padStart(3, '0') + '°', w / 2, 84);
}

/** Arrow at the screen edge pointing at the next objective, with distance. */
function drawGuidance(ctx, w, h, project, target, flight) {
  const p = project(target.x, target.y, target.z);
  const dist = Math.round(Math.hypot(target.x - flight.x, target.y - flight.y, target.z - flight.z));
  const name = target.runway ? 'RUNWAY' : `RING ${target.index + 1}`;
  let ax = p ? p.x : w / 2;
  let ay = p ? p.y : h * 0.35;
  let onScreen = !!p && ax > 60 && ax < w - 60 && ay > 110 && ay < h - 180;
  if (!onScreen) {
    // Clamp to an edge chevron pointing the right way.
    const dx = (p ? p.x : w / 2) - w / 2;
    const dy = (p ? p.y : h * 0.3) - h * 0.42;
    const angle = Math.atan2(dy, dx);
    ax = w / 2 + Math.cos(angle) * (w / 2 - 90);
    ay = h * 0.42 + Math.sin(angle) * (h * 0.28);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -12);
    ctx.lineTo(-10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(ax, ay);
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 8);
    ctx.moveTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = '#ffe9a8';
  ctx.font = `700 13px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`${name} · ${dist} m`, ax, ay + 34);
}

/** The whole HUD: top instruments, bottom lit panel, guidance, banner. */
export function drawHud(ctx, w, h, view, project) {
  const { flight, target, banner } = view;
  const altFt = toFeet(flight.y - terrainHeight(flight.x, flight.z));
  const agl = Math.max(0, flight.y - terrainHeight(flight.x, flight.z));

  // Top-left instrument block.
  panel(ctx, 16, 14, 300, 128);
  label(ctx, 'ALTITUDE', 30, 34);
  bigValue(ctx, `${toFeet(flight.y).toLocaleString()} FT`, 30, 64);
  label(ctx, `AGL ${Math.round(agl)} m`, 210, 34, 11, GREEN);
  label(ctx, 'AIRSPEED', 30, 94);
  bigValue(ctx, `${toKnots(flight.speed)} KT`, 30, 122, 26);
  ctx.fillStyle = flight.speed < 22 ? '#ff6b5e' : GREEN;
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(flight.speed < 22 && flight.phase === PHASE_FLYING ? 'STALL' : `V/S ${flight.verticalSpeed >= 0 ? '+' : ''}${flight.verticalSpeed.toFixed(1)} m/s`, 210, 94);

  // Top-right mission block.
  panel(ctx, w - 316, 14, 300, 96);
  label(ctx, 'SCORE', w - 302, 34);
  bigValue(ctx, String(flight.score), w - 302, 64);
  label(ctx, `RINGS  ${flight.ringsHit}/${MISSION.ringCount}`, w - 180, 34, 11, AMBER);
  label(ctx, `TIME  ${Math.floor(flight.time / 60)}:${String(Math.floor(flight.time % 60)).padStart(2, '0')}`, w - 180, 52, 11);
  // Fuel bar.
  label(ctx, 'FUEL', w - 302, 92);
  ctx.fillStyle = '#1c2733';
  ctx.fillRect(w - 250, 80, 168, 12);
  ctx.fillStyle = flight.fuel < 25 ? '#ff6b5e' : GREEN;
  ctx.fillRect(w - 250, 80, 168 * (flight.fuel / 100), 12);
  ctx.fillStyle = '#f4f8ff';
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(flight.fuel)}%`, w - 22, 92);

  drawCompass(ctx, w, flight);

  // Throttle bar, left edge.
  ctx.fillStyle = PANEL;
  ctx.fillRect(16, h - 220, 26, 150);
  ctx.strokeStyle = PANEL_EDGE;
  ctx.strokeRect(16, h - 220, 26, 150);
  ctx.fillStyle = AMBER;
  ctx.fillRect(20, h - 74 - 142 * flight.throttle, 18, 142 * flight.throttle);
  label(ctx, 'THR', 16, h - 52, 10);

  // Bottom instrument panel: attitude, altimeter, airspeed, compass card.
  const py = h - 118;
  panel(ctx, w / 2 - 250, py, 500, 104);
  drawAttitude(ctx, w / 2 - 195, py + 52, 38, flight);
  label(ctx, 'ATTITUDE', w / 2 - 232, py + 100, 9);
  drawDial(ctx, w / 2 - 88, py + 52, 38, altFt, 6000, 'FT', 6, 3);
  label(ctx, 'ALTIMETER', w / 2 - 122, py + 100, 9);
  drawDial(ctx, w / 2 + 22, py + 52, 38, toKnots(flight.speed), 160, 'KT', 8, 2);
  label(ctx, 'AIRSPEED', w / 2 - 12, py + 100, 9);
  // Mini compass card.
  ctx.save();
  ctx.translate(w / 2 + 148, py + 52);
  ctx.fillStyle = '#0c1420';
  ctx.beginPath();
  ctx.arc(0, 0, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PANEL_EDGE;
  ctx.stroke();
  ctx.rotate(-flight.heading);
  ctx.fillStyle = '#f4f8ff';
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const [deg, name] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
    const a = (deg * Math.PI) / 180;
    ctx.fillText(name, Math.sin(a) * 26, -Math.cos(a) * 26 + 4);
  }
  ctx.restore();
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(w / 2 + 148 - 5, py + 52 - 38);
  ctx.lineTo(w / 2 + 148 + 5, py + 52 - 38);
  ctx.lineTo(w / 2 + 148, py + 52 - 28);
  ctx.closePath();
  ctx.fill();
  label(ctx, 'HEADING', w / 2 + 112, py + 100, 9);

  // Centre crosshair.
  ctx.strokeStyle = 'rgba(244, 248, 255, 0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.42, 12, 0, Math.PI * 2);
  ctx.moveTo(w / 2 - 20, h * 0.42);
  ctx.lineTo(w / 2 - 8, h * 0.42);
  ctx.moveTo(w / 2 + 8, h * 0.42);
  ctx.lineTo(w / 2 + 20, h * 0.42);
  ctx.moveTo(w / 2, h * 0.42 - 20);
  ctx.lineTo(w / 2, h * 0.42 - 8);
  ctx.moveTo(w / 2, h * 0.42 + 8);
  ctx.lineTo(w / 2, h * 0.42 + 20);
  ctx.stroke();

  if (target && flight.phase !== 'landed' && flight.phase !== 'crashed') {
    drawGuidance(ctx, w, h, project, target, flight);
  }

  if (banner) {
    ctx.font = '700 20px system-ui, sans-serif';
    const bw2 = ctx.measureText(banner).width + 48;
    panel(ctx, (w - bw2) / 2, 128, bw2, 44, 22);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(banner, w / 2, 157);
  }
}

/** Centred overlay for the title, pause, crash and landing screens. */
export function drawScreen(ctx, w, h, screen, flight, best, message) {
  if (screen === SCREEN_PLAY) return;
  ctx.fillStyle = 'rgba(8, 12, 20, 0.45)';
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2;
  ctx.textAlign = 'center';
  if (screen === SCREEN_TITLE) {
    const top = h * 0.17;
    ctx.fillStyle = '#ffe9a8';
    ctx.font = '800 64px system-ui, sans-serif';
    ctx.fillText('VALLEY RUN', cx, top);
    ctx.fillStyle = '#f4f8ff';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText('Fly the valley. Thread six golden rings. Bring her home.', cx, top + 40);
    ctx.font = '500 16px system-ui, sans-serif';
    ctx.fillStyle = '#c8d6e2';
    const lines = [
      'ARROWS or WASD / mouse — pitch and bank',
      'SHIFT / CTRL or mouse wheel — throttle',
      'C — chase / cockpit camera      P — pause',
      'Land gently on the runway after the rings. Watch the fuel.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, cx, top + 84 + i * 26));
    ctx.fillStyle = AMBER;
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillText('PRESS ENTER OR CLICK TO FLY', cx, top + 84 + lines.length * 26 + 22);
    if (best > 0) {
      ctx.fillStyle = '#9fb4c8';
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillText(`Best score: ${best}`, cx, top + 84 + lines.length * 26 + 52);
    }
  } else if (screen === SCREEN_PAUSED) {
    ctx.fillStyle = '#f4f8ff';
    ctx.font = '800 44px system-ui, sans-serif';
    ctx.fillText('PAUSED', cx, h * 0.42);
    ctx.font = '500 17px system-ui, sans-serif';
    ctx.fillStyle = '#c8d6e2';
    ctx.fillText('Press P or Enter to keep flying.', cx, h * 0.42 + 36);
  } else if (screen === SCREEN_OVER) {
    ctx.fillStyle = '#ff6b5e';
    ctx.font = '800 52px system-ui, sans-serif';
    ctx.fillText('CRASHED', cx, h * 0.38);
    ctx.fillStyle = '#f4f8ff';
    ctx.font = '500 19px system-ui, sans-serif';
    ctx.fillText(message || 'The valley wins this round.', cx, h * 0.38 + 38);
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.fillStyle = AMBER;
    ctx.fillText(`Score ${flight.score} · Rings ${flight.ringsHit}/${MISSION.ringCount} · Best ${Math.max(best, flight.score)}`, cx, h * 0.38 + 76);
    ctx.fillStyle = '#c8d6e2';
    ctx.font = '500 16px system-ui, sans-serif';
    ctx.fillText('Press Enter or click to fly again.', cx, h * 0.38 + 112);
  } else if (screen === SCREEN_LANDED) {
    ctx.fillStyle = GREEN;
    ctx.font = '800 52px system-ui, sans-serif';
    ctx.fillText('MISSION COMPLETE', cx, h * 0.36);
    ctx.fillStyle = '#f4f8ff';
    ctx.font = '500 19px system-ui, sans-serif';
    ctx.fillText(`All ${MISSION.ringCount} rings flown, wheels down on the runway.`, cx, h * 0.36 + 38);
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.fillStyle = AMBER;
    ctx.fillText(
      `Score ${flight.score}  (rings ${flight.ringsHit * MISSION.ringScore} + landing ${MISSION.landingScore} + fuel bonus) · Best ${Math.max(best, flight.score)}`,
      cx,
      h * 0.36 + 76,
    );
    ctx.fillStyle = '#c8d6e2';
    ctx.font = '500 16px system-ui, sans-serif';
    ctx.fillText('Press Enter or click to fly the valley again.', cx, h * 0.36 + 112);
  }
}

// Valley Run — boot and the one loop: input is read every frame, the flight
// advances in fixed 1/60 s steps, and the renderer paints what is there. The
// game moves between five screens: title, play, paused, crashed and landed.
//
// ?seed=N fixes the world. ?shot=start|play|rings|land (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createFlight, EVENT_CRASHED, EVENT_LANDED, EVENT_RING, PHASE_CRASHED, PHASE_LANDED } from './flight.js';
import { createInput, ACTION_CAMERA, ACTION_CONFIRM, ACTION_PAUSE } from './input.js';
import { createRenderer } from './render.js';
import { drawHud, drawScreen, SCREEN_LANDED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './hud.js';
import { crashThud, landingFanfare, ringChime, unlockAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const flight = createFlight(seed);
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, flight);
  let painted = 0;
  function paint() {
    const frameOut = renderer.draw({
      flight: flight.state,
      rings: flight.rings,
      target: flight.currentTarget(),
      screen: scene.screen,
      camera: scene.camera,
      best: scene.best,
      banner: null,
      time: flight.state.time,
    });
    const { ctx, w, h } = frameOut;
    // The HUD stays visible behind the end screens: the instruments lit are
    // part of what the screenshot has to show.
    if (scene.screen !== SCREEN_TITLE) {
      drawHud(ctx, w, h, { flight: flight.state, target: flight.currentTarget(), banner: null }, frameOut.project);
    }
    drawScreen(ctx, w, h, scene.screen, flight.state, scene.best, flight.state.crashReason);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let camera = 'chase';
  let best = readBest();
  let throttle = 0;
  let banner = null;
  let bannerUntil = 0;
  let message = '';
  let accumulator = 0;
  let last = performance.now();

  function announce(text) {
    status.textContent = text;
  }

  function showBanner(text, seconds = 3) {
    banner = text;
    bannerUntil = performance.now() + seconds * 1000;
  }

  function startGame() {
    flight.reset();
    throttle = 0;
    banner = null;
    screen = SCREEN_PLAY;
    announce('Flying. Full throttle to take off, then thread the rings.');
  }

  function endGame(landed) {
    screen = landed ? SCREEN_LANDED : SCREEN_OVER;
    if (flight.state.score > best) {
      best = flight.state.score;
      saveBest(best);
    }
    announce(landed ? `Landed. Score ${flight.state.score}.` : `Crashed. Score ${flight.state.score}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CAMERA) {
      camera = camera === 'chase' ? 'cockpit' : 'chase';
      showBanner(camera === 'chase' ? 'CHASE CAMERA' : 'COCKPIT CAMERA', 1.5);
    }
    if (actions & ACTION_CONFIRM) {
      unlockAudio();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_LANDED) startGame();
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Flying.');
      }
    }
  }

  function step() {
    throttle = Math.max(0, Math.min(1, throttle + input.throttleDelta()));
    const stick = input.stick();
    const events = flight.step(STEP, { pitch: stick.pitch, roll: stick.roll, throttle });
    if (events & EVENT_RING) {
      ringChime();
      showBanner(
        flight.state.nextRing >= flight.rings.length
          ? 'ALL RINGS FLOWN — LAND ON THE RUNWAY'
          : `RING ${flight.state.ringsHit} OF ${flight.rings.length}  ·  +100`,
      );
      announce(`Ring ${flight.state.ringsHit} of ${flight.rings.length}.`);
    }
    if (events & EVENT_LANDED) {
      landingFanfare();
      endGame(true);
    } else if (events & EVENT_CRASHED) {
      crashThud();
      message = flight.state.crashReason;
      endGame(false);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        step();
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) break;
      }
    } else if (screen === SCREEN_TITLE) {
      // The title idles over the runway: the engine ticks over, the world waits.
      while (accumulator >= STEP) {
        flight.step(STEP, { pitch: 0, roll: 0, throttle: 0.25 });
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    if (banner && performance.now() > bannerUntil) banner = null;
    const frameOut = renderer.draw({
      flight: flight.state,
      rings: flight.rings,
      target: flight.currentTarget(),
      screen,
      camera,
      best,
      banner,
      time: flight.state.time,
    });
    drawHudFrame(frameOut, screen, message);
  }

  function drawHudFrame(frameOut, currentScreen, crashMessage) {
    // drawHud needs the raw context and dimensions; the renderer returns them.
    const { ctx, w, h } = frameOut;
    if (currentScreen !== SCREEN_TITLE) {
      drawHud(ctx, w, h, { flight: flight.state, target: flight.currentTarget(), banner }, frameOut.project);
    }
    drawScreen(ctx, w, h, currentScreen, flight.state, best, crashMessage);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Valley Run. Press Enter or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

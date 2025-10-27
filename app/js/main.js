import { CONFIG } from './config.js';
import { spotifyAuth } from './spotifyAuth.js';
import {
  canvas,
  ctx,
  camera,
  pointer,
  drag,
  environment,
  setLastTime,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from './appContext.js';
import { clamp } from './utils.js';
import {
  loadGenres,
  genresLoaded,
  scheduleRecompute,
  updateSubgenreAnimations,
  drawSubgenreLabels,
  maybeScheduleCameraChange,
  MAIN_NODES,
} from './genreEngine.js';
import { layoutMainGenreNodes } from './layout.js';
import { drawNebulae, drawLabels } from './nebula.js';
import { getOctaveSpan, drawOctave, octaveWeight } from './particles.js';

function resize() {
  environment.width = window.innerWidth;
  environment.height = window.innerHeight;
  environment.dpr = window.devicePixelRatio || 1;

  canvas.width = environment.width * environment.dpr;
  canvas.height = environment.height * environment.dpr;
  canvas.style.width = `${environment.width}px`;
  canvas.style.height = `${environment.height}px`;
  ctx.setTransform(environment.dpr, 0, 0, environment.dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;

  pointer.baseRadiusPx = Math.min(environment.width, environment.height) * CONFIG.pointerRadiusFactor;

  camera.zoom = clamp(camera.zoom, CONFIG.minZoom, CONFIG.maxZoom);
  camera.targetZoom = camera.zoom;
  camera.targetX = camera.x;
  camera.targetY = camera.y;

  if (genresLoaded) {
    layoutMainGenreNodes();
    scheduleRecompute(true);
  }
}

function onWheel(event) {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = event.clientX - rect.left;
  const my = event.clientY - rect.top;
  const adjustedDeltaY = CONFIG.invertWheel ? -event.deltaY : event.deltaY;
  const factor = adjustedDeltaY < 0 ? CONFIG.zoomStep : 1 / CONFIG.zoomStep;
  zoomAt(mx, my, factor);
  scheduleRecompute();
}

function hitTestLabel(mx, my) {
  const padX = 8;
  const padY = 4;
  ctx.save();
  ctx.font = `${CONFIG.nodeLabelPx}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  for (let i = 0; i < MAIN_NODES.length; i++) {
    const node = MAIN_NODES[i];
    const screen = worldToScreen(node.x, node.y);
    const labelY = screen.y + (6 + CONFIG.nodeLabelPx / 2);
    const text = node.name;
    const textWidth = ctx.measureText(text).width;
    const x0 = screen.x - textWidth / 2 - padX;
    const x1 = screen.x + textWidth / 2 + padX;
    const y0 = labelY - padY;
    const y1 = labelY + CONFIG.nodeLabelPx + padY;
    if (mx >= x0 && mx <= x1 && my >= y0 && my <= y1) {
      ctx.restore();
      return i;
    }
  }
  ctx.restore();
  return -1;
}

function updatePointerFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  let clientX;
  let clientY;
  if ('touches' in event && event.touches.length) {
    clientX = event.touches[0].clientX;
    clientY = event.touches[0].clientY;
  } else {
    clientX = event.clientX;
    clientY = event.clientY;
  }
  const mx = clientX - rect.left;
  const my = clientY - rect.top;
  const world = screenToWorld(mx, my);
  pointer.x = world.x;
  pointer.y = world.y;
  return { mx, my, wx: world.x, wy: world.y };
}

function onPointerDown(event) {
  const { mx, my, wx, wy } = updatePointerFromEvent(event);
  if (event.pointerType === 'mouse' && event.button !== 0) {
    pointer.active = true;
    return;
  }

  const idx = hitTestLabel(mx, my);
  if (idx >= 0) {
    drag.nodeActive = true;
    drag.nodeIdx = idx;
    const node = MAIN_NODES[idx];
    drag.nodeGrabOffset = { x: wx - node.x, y: wy - node.y };
    canvas.style.cursor = 'grabbing';
    pointer.active = true;
  } else {
    const rect = canvas.getBoundingClientRect();
    drag.panActive = true;
    drag.startMx = event.clientX - rect.left;
    drag.startMy = event.clientY - rect.top;
    drag.startTargetX = camera.targetX;
    drag.startTargetY = camera.targetY;
    canvas.style.cursor = 'grabbing';
    pointer.active = false;
  }
  canvas.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  const { mx, my, wx, wy } = updatePointerFromEvent(event);
  if (drag.nodeActive && drag.nodeIdx >= 0) {
    const node = MAIN_NODES[drag.nodeIdx];
    node.x = wx - drag.nodeGrabOffset.x;
    node.y = wy - drag.nodeGrabOffset.y;
    scheduleRecompute(true);
    return;
  }
  if (drag.panActive) {
    const rect = canvas.getBoundingClientRect();
    const curMx = event.clientX - rect.left;
    const curMy = event.clientY - rect.top;
    const dxScreen = curMx - drag.startMx;
    const dyScreen = curMy - drag.startMy;
    const dxWorld = dxScreen / camera.zoom;
    const dyWorld = dyScreen / camera.zoom;
    camera.targetX = drag.startTargetX - dxWorld;
    camera.targetY = drag.startTargetY - dyWorld;
    scheduleRecompute();
  } else {
    pointer.active = true;
  }
}

function onPointerUp(event) {
  drag.panActive = false;
  drag.nodeActive = false;
  drag.nodeIdx = -1;
  canvas.style.cursor = 'default';
  pointer.active = true;
  try {
    canvas.releasePointerCapture?.(event.pointerId);
  } catch (err) {
    // Ignore
  }
  scheduleRecompute();
}

function animate(time) {
  requestAnimationFrame(animate);
  const dt = time - environment.lastTime;
  setLastTime(time);

  camera.zoom += (camera.targetZoom - camera.zoom) * CONFIG.zoomEase;
  camera.x += (camera.targetX - camera.x) * CONFIG.panEase;
  camera.y += (camera.targetY - camera.y) * CONFIG.panEase;

  ctx.fillStyle = CONFIG.bgFade;
  ctx.fillRect(0, 0, environment.width, environment.height);

  ctx.save();
  ctx.translate(environment.width / 2, environment.height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  drawNebulae(time);

  const lz = Math.log2(camera.zoom);
  const iCenter = Math.floor(lz);
  const span = getOctaveSpan();
  for (let i = iCenter - span; i <= iCenter + span; i++) {
    const alpha = octaveWeight(i, camera.zoom);
    if (alpha > 0.01) {
      drawOctave(i, time + dt * 0.5, alpha);
    }
  }

  drawLabels();
  updateSubgenreAnimations(dt);
  drawSubgenreLabels();
  ctx.restore();

  maybeScheduleCameraChange();
}

function init() {
  spotifyAuth.init();
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerUp);

  loadGenres().then(() => {
    layoutMainGenreNodes();
  });
  requestAnimationFrame(animate);
}

init();

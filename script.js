// === Atlify Infinite-LOD Particle Map (wheel zoom, fractal octaves, left-drag pan) ===

const canvas = document.getElementById('particle-map');
const ctx = canvas.getContext('2d');

const CONFIG = {
  // Camera/zoom
  minZoom: 0.35,
  maxZoom: 64,
  zoomStep: 1.08,       // multiplicative per wheel notch
  zoomEase: 0.18,       // easing for zoom
  panEase: 0.18,        // easing for x/y (match zoomEase for perfect pinning)
  invertWheel: true,    // flip wheel direction

  // Field look/feel
  baseSpacing: 85,
  jitterFrac: 0.45,
  targetPx: 1.6,
  bgFade: 'rgba(2, 2, 6, 0.18)',
  dotColor: 'rgba(225, 232, 255, 1)',

  // Motion
  timeScale: 0.0013,
  easing: 0.08,

  // Pointer interaction (perceptually constant; scaled by 1/zoom)
  pointerRadiusFactor: 0.22, // as fraction of min(screenW, screenH) in px
  pointerStrength: 24,       // base strength (scaled by 1/zoom)

  // Octave visibility
  octaveBand: 0.9,
};

const pointer = {
  x: 0, y: 0,
  baseRadiusPx: 160,        // set on resize
  strengthBase: CONFIG.pointerStrength,
  active: false,
};

let width = 0, height = 0, dpr = window.devicePixelRatio || 1;
let lastTime = 0;

// Camera lives in world space; we draw world -> screen with a transform
const camera = { x: 0, y: 0, zoom: 1, targetZoom: 1, targetX: 0, targetY: 0 };

// Drag state for left-mouse panning
const drag = {
  active: false,
  startMx: 0,
  startMy: 0,
  startTargetX: 0,
  startTargetY: 0,
};

// --- Helpers ---------------------------------------------------------------

function hash2D(ix, iy, seed=1337) {
  let x = ix | 0, y = iy | 0;
  let h = (x * 374761393) ^ (y * 668265263) ^ seed;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

function smoothstep(a, b, t) {
  t = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function screenToWorld(sx, sy) {
  const zx = camera.zoom, zy = camera.zoom;
  const wx = camera.x + (sx - width / 2) / zx;
  const wy = camera.y + (sy - height / 2) / zy;
  return { x: wx, y: wy };
}

// Exact cursor-centric zoom: keep the cursor's world point fixed.
function zoomAt(mouseX, mouseY, zoomFactor) {
  const worldUnderCursor = screenToWorld(mouseX, mouseY);
  const newTargetZoom = clamp(camera.targetZoom * zoomFactor, CONFIG.minZoom, CONFIG.maxZoom);

  camera.targetX = worldUnderCursor.x - (mouseX - width / 2) / newTargetZoom;
  camera.targetY = worldUnderCursor.y - (mouseY - height / 2) / newTargetZoom;
  camera.targetZoom = newTargetZoom;
}

// --- Resize / init ---------------------------------------------------------

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = window.devicePixelRatio || 1;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Pointer base influence radius in *pixels*; converted to world units each frame
  pointer.baseRadiusPx = Math.min(width, height) * CONFIG.pointerRadiusFactor;

  // Keep camera targets coherent
  camera.zoom = clamp(camera.zoom, CONFIG.minZoom, CONFIG.maxZoom);
  camera.targetZoom = camera.zoom;
  camera.targetX = camera.x;
  camera.targetY = camera.y;
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// --- Input: wheel zoom -----------------------------------------------------

function onWheel(e) {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  // Robust inversion: flip deltaY, then decide zoom in/out
  const adjustedDeltaY = CONFIG.invertWheel ? -e.deltaY : e.deltaY;
  const factor = adjustedDeltaY < 0 ? CONFIG.zoomStep : (1 / CONFIG.zoomStep);

  zoomAt(mx, my, factor);
}
canvas.addEventListener('wheel', onWheel, { passive: false });

// --- Input: pointer repel position ----------------------------------------

function updatePointerFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  let cx, cy;
  if ('touches' in e && e.touches.length) {
    cx = e.touches[0].clientX; cy = e.touches[0].clientY;
  } else {
    cx = e.clientX; cy = e.clientY;
  }
  const mx = cx - rect.left, my = cy - rect.top;
  const w = screenToWorld(mx, my);
  pointer.x = w.x; pointer.y = w.y;
  // NOTE: pointer.active is controlled below; disabled during drag panning
}

// --- Input: left-mouse drag panning ---------------------------------------

function onPointerDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) {
    // Only left button initiates pan
    updatePointerFromEvent(e);
    pointer.active = true;
    return;
  }

  // Start drag pan
  const rect = canvas.getBoundingClientRect();
  drag.active = true;
  drag.startMx = e.clientX - rect.left;
  drag.startMy = e.clientY - rect.top;
  drag.startTargetX = camera.targetX;
  drag.startTargetY = camera.targetY;

  // Visual feedback
  canvas.style.cursor = 'grabbing';

  // Disable repel while panning
  pointer.active = false;

  // Capture pointer to continue receiving events outside canvas
  canvas.setPointerCapture?.(e.pointerId);
}

function onPointerMove(e) {
  updatePointerFromEvent(e);

  if (!drag.active) {
    // Normal hover → repel enabled
    pointer.active = true;
    return;
  }

  // While dragging: compute screen delta, convert to world delta (divide by zoom),
  // and move camera targets opposite to mouse movement (map-like panning).
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const dxScreen = mx - drag.startMx;
  const dyScreen = my - drag.startMy;

  const dxWorld = dxScreen / camera.zoom;
  const dyWorld = dyScreen / camera.zoom;

  camera.targetX = drag.startTargetX - dxWorld;
  camera.targetY = drag.startTargetY - dyWorld;

  // Keep repel off during drag
  pointer.active = false;
}

function onPointerUp(e) {
  drag.active = false;
  canvas.style.cursor = 'default';
  // Re-enable repel after drag ends
  pointer.active = true;

  // Release capture if taken
  try { canvas.releasePointerCapture?.(e.pointerId); } catch {}
}

canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointerleave', onPointerUp);

canvas.addEventListener('touchmove', (e) => { updatePointerFromEvent(e); }, { passive: true });
canvas.addEventListener('touchend', onPointerUp, { passive: true });
canvas.addEventListener('touchcancel', onPointerUp, { passive: true });

// --- Octave math -----------------------------------------------------------

function getOctaveSpan() { return 2; }

function drawOctave(i, time, alpha) {
  if (alpha <= 0.01) return;

  const Zi = Math.pow(2, i);
  const spacing = CONFIG.baseSpacing / Zi;
  const jitter = spacing * CONFIG.jitterFrac;

  // Visible world bounds (margin in world units)
  const margin = 60 / camera.zoom;
  const left = camera.x - (width / 2) / camera.zoom - margin;
  const right = camera.x + (width / 2) / camera.zoom + margin;
  const top = camera.y - (height / 2) / camera.zoom - margin;
  const bottom = camera.y + (height / 2) / camera.zoom + margin;

  const gx0 = Math.floor(left / spacing);
  const gx1 = Math.ceil(right / spacing);
  const gy0 = Math.floor(top / spacing);
  const gy1 = Math.ceil(bottom / spacing);

  // Particle radius in world units so that at zoom Zi it appears ~targetPx
  const radiusWorld = CONFIG.targetPx / Zi;

  // Pointer influence scaled to keep *screen* effect constant
  const effectivePointerRadiusWorld = pointer.baseRadiusPx / camera.zoom;
  const effectivePointerStrength = pointer.strengthBase / camera.zoom;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = CONFIG.dotColor;

  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      // deterministic jitter per cell & octave
      const r1 = hash2D(gx, gy, 1000 + i * 7919);
      const r2 = hash2D(gx, gy, 2000 + i * 9173);
      const jitterX = (r1 - 0.5) * jitter * 2;
      const jitterY = (r2 - 0.5) * jitter * 2;

      const baseX = gx * spacing + jitterX;
      const baseY = gy * spacing + jitterY;

      // subtle “swim”
      const seed = hash2D(gx, gy, 3000 + i * 6367) * Math.PI * 2;
      const wave = (6 + hash2D(gx, gy, 4000 + i * 4241) * 12) / Math.sqrt(Zi);
      const parallax = 0.3 + hash2D(gx, gy, 5000 + i * 1223) * 0.7;

      const t = time * CONFIG.timeScale;
      const noiseX = Math.sin(baseX * 0.012 + t * 1.3 + seed);
      const noiseY = Math.cos(baseY * 0.010 + t * 1.1 + seed);

      let targetX = baseX + noiseX * wave * parallax;
      let targetY = baseY + noiseY * wave;

      // pointer repel in world space (zoom-invariant feel)
      if (pointer.active) {
        const dx = pointer.x - baseX;
        const dy = pointer.y - baseY;
        const dist = Math.hypot(dx, dy);
        if (dist < effectivePointerRadiusWorld) {
          const force = (effectivePointerRadiusWorld - dist) / effectivePointerRadiusWorld;
          const angle = Math.atan2(dy, dx);
          const repel = effectivePointerStrength * force * parallax;
          targetX -= Math.cos(angle) * repel;
          targetY -= Math.sin(angle) * repel;
        }
      }

      // simple easing toward target
      const x = baseX + (targetX - baseX) * CONFIG.easing;
      const y = baseY + (targetY - baseY) * CONFIG.easing;

      // cull again just in case
      if (x < left - spacing || x > right + spacing || y < top - spacing || y > bottom + spacing) continue;

      // Draw in world space under camera transform
      ctx.beginPath();
      ctx.arc(x, y, radiusWorld, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function octaveWeight(i, Z) {
  const lz = Math.log2(Z);
  const d = Math.abs(lz - i);
  const band = CONFIG.octaveBand;
  const w = 1 - smoothstep(band * 0.5, band, d);
  return w;
}

// --- Main loop -------------------------------------------------------------

function animate(time) {
  requestAnimationFrame(animate);
  const dt = time - lastTime;
  lastTime = time;

  // ease zoom and pan together (keeps cursor pinning perfect)
  camera.zoom += (camera.targetZoom - camera.zoom) * CONFIG.zoomEase;
  camera.x    += (camera.targetX   - camera.x)    * CONFIG.panEase;
  camera.y    += (camera.targetY   - camera.y)    * CONFIG.panEase;

  // background
  ctx.fillStyle = CONFIG.bgFade;
  ctx.fillRect(0, 0, width, height);

  // camera transform
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  // draw nearby octaves
  const lz = Math.log2(camera.zoom);
  const iCenter = Math.floor(lz);
  const span = getOctaveSpan();

  for (let i = iCenter - span; i <= iCenter + span; i++) {
    const alpha = octaveWeight(i, camera.zoom);
    if (alpha > 0.01) {
      drawOctave(i, time + dt * 0.5, alpha);
    }
  }

  ctx.restore();
}

// --- Init ------------------------------------------------------------------

resize();
requestAnimationFrame(animate);

// === Atlify Infinite-LOD Particle Map + Nebula Genre Fields ===
// - cursor-centric wheel zoom (inverted)
// - left-drag pan (map)
// - drag genre labels to move their nebula
// - particles tint based on nebula overlap
// - JSON-loaded top-level genres
// - animated nebulae: breathe, drift, swirl, shimmer
// - de-gridded nebula blobs + space palette
// - large tint halo with steep falloff
// - bi-color nebulae + clustered layout + fBM alpha noise

const canvas = document.getElementById('particle-map');
const ctx = canvas.getContext('2d');

/** ========= Spotify Authentication Modal ========= */
const spotifyAuth = (() => {
  const modal = document.getElementById('spotify-auth-modal');
  if (!modal) {
    return {
      init() {},
      ensurePrompt() {},
      isAuthenticated() { return false; },
      getToken() { return null; },
      requireClientIdConfigured() { return false; },
    };
  }

  const statusEl = modal.querySelector('[data-role="status"]');
  const loginBtn = modal.querySelector('[data-role="login"]');
  const dismissBtn = modal.querySelector('[data-role="dismiss"]');

  if (modal.hidden) {
    modal.setAttribute('aria-hidden', 'true');
  }

  const TOKEN_KEY = 'atlify.spotify.token';
  const STATE_KEY = 'atlify.spotify.state';

  const scopesAttr = (modal.dataset.scopes || '').trim();
  const scopes = scopesAttr.length ? scopesAttr.split(/\s+/g) : [];
  const redirectAttr = (modal.dataset.redirect || '').trim();
  const redirectUri = redirectAttr || `${window.location.origin}${window.location.pathname}`;
  const clientId = ((modal.dataset.clientId || '').trim() || (window.SPOTIFY_CLIENT_ID || '')).trim();

  let tokenCache = null;

  function setStatus(message, tone = 'info') {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    if (tone === 'error') {
      statusEl.setAttribute('data-tone', 'error');
    } else if (tone === 'success') {
      statusEl.setAttribute('data-tone', 'success');
    } else {
      statusEl.removeAttribute('data-tone');
    }
  }

  let hideTimer = null;

  function showModal() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    modal.hidden = false;
    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function hideModal() {
    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      modal.hidden = true;
    }, 220);
  }

  function safeGet(storage, key) {
    try { return storage.getItem(key); } catch (err) { console.warn('Storage get failed', err); return null; }
  }

  function safeSet(storage, key, value) {
    try { storage.setItem(key, value); }
    catch (err) { console.warn('Storage set failed', err); }
  }

  function safeRemove(storage, key) {
    try { storage.removeItem(key); }
    catch (err) { console.warn('Storage remove failed', err); }
  }

  function clearToken() {
    tokenCache = null;
    safeRemove(localStorage, TOKEN_KEY);
  }

  function readStoredToken() {
    if (tokenCache) {
      if (Date.now() < tokenCache.expiresAt) return tokenCache;
      clearToken();
      return null;
    }
    const raw = safeGet(localStorage, TOKEN_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (!parsed.accessToken || !parsed.expiresAt) return null;
      if (Date.now() >= parsed.expiresAt) {
        clearToken();
        return null;
      }
      tokenCache = parsed;
      return parsed;
    } catch (err) {
      console.warn('Unable to parse Spotify token payload', err);
      return null;
    }
  }

  function storeToken(payload) {
    tokenCache = payload;
    safeSet(localStorage, TOKEN_KEY, JSON.stringify(payload));
  }

  function generateState() {
    if (window.crypto?.getRandomValues) {
      const buffer = new Uint32Array(4);
      window.crypto.getRandomValues(buffer);
      return Array.from(buffer).map((n) => n.toString(16).padStart(8, '0')).join('');
    }
    return Math.random().toString(16).slice(2);
  }

  function consumeHashToken() {
    if (!window.location.hash) return null;
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    if (!accessToken) return null;

    const expiresInSec = Number(params.get('expires_in') || '0');
    const tokenType = params.get('token_type') || 'Bearer';
    const scope = params.get('scope') || scopes.join(' ');
    const state = params.get('state') || '';
    const expectedState = safeGet(sessionStorage, STATE_KEY);

    if (expectedState && state !== expectedState) {
      setStatus('Authentication mismatch. Please try again.', 'error');
      safeRemove(sessionStorage, STATE_KEY);
      window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
      return null;
    }

    safeRemove(sessionStorage, STATE_KEY);
    window.history.replaceState(null, document.title, window.location.pathname + window.location.search);

    return {
      accessToken,
      tokenType,
      scope,
      expiresAt: Date.now() + Math.max(1, expiresInSec || 0) * 1000,
    };
  }

  function startLogin() {
    if (!clientId) {
      setStatus('Spotify client ID is not configured.', 'error');
      showModal();
      return;
    }

    const state = generateState();
    safeSet(sessionStorage, STATE_KEY, state);

    const params = new URLSearchParams({
      response_type: 'token',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state,
      show_dialog: 'true',
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  function attachEvents() {
    loginBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      startLogin();
    });

    dismissBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      hideModal();
    });
  }

  function init() {
    attachEvents();

    const hashToken = consumeHashToken();
    if (hashToken) {
      storeToken(hashToken);
      setStatus('Spotify connected. Enjoy the sonic journey!', 'success');
      setTimeout(() => hideModal(), 420);
      return;
    }

    const stored = readStoredToken();
    if (stored) {
      hideModal();
      return;
    }

    setStatus('Connect your Spotify account to stream sounds as you explore.');
    showModal();
  }

  return {
    init,
    ensurePrompt() {
      if (!readStoredToken()) showModal();
    },
    isAuthenticated() {
      return Boolean(readStoredToken());
    },
    getToken() {
      return readStoredToken();
    },
    requireClientIdConfigured() {
      return Boolean(clientId);
    },
  };
})();

/** ========= Load genres.json ========= */
let GENRES = [];
let MAIN_NODES = [];       // [{ name, x, y, color, color2, nebula }]
let genresLoaded = false;

async function loadGenres() {
  try {
    const url = new URL('genres.json', window.location.href).toString();
    const res = await fetch('genres.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    GENRES = await res.json();
    layoutMainGenreNodes();
    genresLoaded = true;
  } catch (err) {
    console.error('Failed to load genres.json:', err);
  }
}

/** ========= Config ========= */
const CONFIG = {
  // Camera/zoom
  minZoom: 0.35,
  maxZoom: 64,
  zoomStep: 1.08,
  zoomEase: 0.18,
  panEase: 0.18,
  invertWheel: true,

  // Field look/feel
  baseSpacing: 85,
  jitterFrac: 0.45,
  targetPx: 1.6,
  bgFade: 'rgba(3, 5, 16, 0.5)',

  // Motion
  timeScale: 0.0013,
  easing: 0.08,

  // Pointer interaction (zoom-invariant feel)
  pointerRadiusFactor: 0.22,
  pointerStrength: 24,

  // Octave visibility
  octaveBand: 0.9,

  // Main-genre label visuals
  nodeLabelPx: 14,

  // Initial node clustered layout
  clusterRadius: 220,       // typical cluster radius (world units)
  clusterJitter: 55,        // extra randomness
  clusterMinDist: 70,       // minimum spacing between labels
  clusterCountMin: 3,
  clusterCountMax: 6,
  clusterSpread: 340,
  clusterCenterJitter: 70,

  // Nebula fields (world-units; sized to feel good at zoom ~1)
  nebulaRadius: 270,
  nebulaEdgeSoftness: 0.7,
  nebulaAlpha: 0.12,
  nebulaLayersMin: 4,       // per-node randomized count
  nebulaLayersMax: 7,
  nebulaLayerJitter: 0.52,
  nebulaNoiseStrength: 0.42,  // micro-texture
  nebulaAdditiveGlow: true,
  nebulaAnisotropyMin: 0.45,
  nebulaAnisotropyMax: 0.9,
  nebulaHighlightIntensity: 0.22,
  nebulaHighlightWarmth: 0.18,

  // Animated vibes
  nebulaDriftAmp: 3,
  nebulaDriftSpeed: 0.00001,
  nebulaSwirlSpeed: 0.00001,
  nebulaBreatheAmp: 0.006,
  nebulaBreatheSpeed: 0.00006,
  nebulaShimmerAmp: 7,
  nebulaColorPulse: 0.02,
  nebulaTwinkleAmp: 0.18,

  // Particle tinting inside nebulae
  tintStrength: 0.95,
  multiCloudBlend: true,

  // Very wide tint halo with fast falloff
  tintRadiusMultiplier: 2.6,
  tintFalloffPower: 3.75,

  // fBM noise for alpha modulation (breaks latent banding/tiling)
  noiseScale: 0.004,        // larger = more coarse features
  noiseOctaves: 3,          // 2–4 is plenty
  noiseGain: 0.5,           // amplitude falloff per octave
  noiseAlphaMin: 0.7,       // alpha multiplier low end
  noiseAlphaMax: 1.0,       // alpha multiplier high end
  noiseWarpStrength: 0.28,
  noiseWarpScale: 0.0026,
};

/** ========= Curated nebula gradient (blue-green ➜ red) ========= */
const NEBULA_GRADIENT_STOPS = [
  { t: 0.0, color: '#18a7c9' },  // blue-green
  { t: 0.16, color: '#22c9aa' }, // aqua-green
  { t: 0.32, color: '#5edb69' }, // lush green
  { t: 0.48, color: '#c6e357' }, // chartreuse
  { t: 0.63, color: '#f1a24a' }, // amber-orange transition
  { t: 0.78, color: '#f45aa5' }, // rosy magenta
  { t: 0.9, color: '#b35cf4' },  // space purple
  { t: 1.0, color: '#ff4a4a' },  // vivid red
];

// Default dot color when outside clouds
const DOT_BASE_RGB = hexToRgb('#e1e8ff');

/** ========= Pointer & Camera ========= */
const pointer = {
  x: 0, y: 0,
  baseRadiusPx: 160,
  strengthBase: CONFIG.pointerStrength,
  active: true,
};

let width = 0, height = 0, dpr = window.devicePixelRatio || 1;
let lastTime = 0;

const camera = { x: 0, y: 0, zoom: 1, targetZoom: 1, targetX: 0, targetY: 0 };

const drag = {
  panActive: false,
  nodeActive: false,
  nodeIdx: -1,
  startMx: 0,
  startMy: 0,
  startTargetX: 0,
  startTargetY: 0,
  nodeGrabOffset: { x: 0, y: 0 },
};

/** ========= Helpers ========= */
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
  const zx = camera.zoom;
  const wx = camera.x + (sx - width / 2) / zx;
  const wy = camera.y + (sy - height / 2) / zx;
  return { x: wx, y: wy };
}
function worldToScreen(wx, wy) {
  const sx = (wx - camera.x) * camera.zoom + width / 2;
  const sy = (wy - camera.y) * camera.zoom + height / 2;
  return { x: sx, y: sy };
}
function zoomAt(mouseX, mouseY, zoomFactor) {
  const worldUnderCursor = screenToWorld(mouseX, mouseY);
  const newTargetZoom = clamp(camera.targetZoom * zoomFactor, CONFIG.minZoom, CONFIG.maxZoom);
  camera.targetX = worldUnderCursor.x - (mouseX - width / 2) / newTargetZoom;
  camera.targetY = worldUnderCursor.y - (mouseY - height / 2) / newTargetZoom;
  camera.targetZoom = newTargetZoom;
}
function hexToRgb(hex) {
  const s = hex.replace('#','');
  const n = parseInt(s.length === 3
    ? s.split('').map(c=>c+c).join('')
    : s, 16);
  return { r: (n>>16)&255, g: (n>>8)&255, b: n&255 };
}
const NEBULA_GRADIENT = NEBULA_GRADIENT_STOPS.map((stop) => ({
  t: stop.t,
  rgb: hexToRgb(stop.color),
}));
function sampleGradientRgb(gradient, t) {
  if (!gradient.length) return { r: 255, g: 255, b: 255 };
  const v = clamp(t, 0, 1);
  if (v <= gradient[0].t) return gradient[0].rgb;
  for (let i = 1; i < gradient.length; i++) {
    const prev = gradient[i - 1];
    const curr = gradient[i];
    if (v <= curr.t || i === gradient.length - 1) {
      const span = Math.max(1e-6, curr.t - prev.t);
      const localT = clamp((v - prev.t) / span, 0, 1);
      return mixRGB(prev.rgb, curr.rgb, localT);
    }
  }
  return gradient[gradient.length - 1].rgb;
}
function rgbToCss({r,g,b}, a=1) { return `rgba(${r|0},${g|0},${b|0},${a})`; }
function lerp(a,b,t){ return a+(b-a)*t; }
function mixRGB(c1, c2, t) {
  return {
    r: lerp(c1.r, c2.r, t),
    g: lerp(c1.g, c2.g, t),
    b: lerp(c1.b, c2.b, t),
  };
}
function clampRGB({ r, g, b }) {
  return {
    r: clamp(r, 0, 255),
    g: clamp(g, 0, 255),
    b: clamp(b, 0, 255),
  };
}
function tintTowards(c, target, amt) {
  return clampRGB({
    r: lerp(c.r, target.r, amt),
    g: lerp(c.g, target.g, amt),
    b: lerp(c.b, target.b, amt),
  });
}
const WHITE_RGB = { r: 255, g: 255, b: 255 };
const DEEP_SPACE_RGB = { r: 18, g: 18, b: 38 };

// Value noise (bilinear) + simple fBM for alpha modulation
function valueNoise(x, y, seed=777) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const h00 = hash2D(xi, yi, seed);
  const h10 = hash2D(xi+1, yi, seed);
  const h01 = hash2D(xi, yi+1, seed);
  const h11 = hash2D(xi+1, yi+1, seed);
  const u = xf*xf*(3-2*xf);
  const v = yf*yf*(3-2*yf);
  const i1 = h00*(1-u) + h10*u;
  const i2 = h01*(1-u) + h11*u;
  return i1*(1-v) + i2*v; // 0..1
}
function fbm(x, y, octaves=3, gain=0.5, seed=777) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i=0; i<octaves; i++) {
    sum += valueNoise(x*freq, y*freq, seed+i*971) * amp;
    norm += amp;
    amp *= gain;
    freq *= 2;
  }
  return sum / Math.max(1e-6, norm); // 0..1
}

/** ========= Resize / init ========= */
function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = window.devicePixelRatio || 1;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;

  pointer.baseRadiusPx = Math.min(width, height) * CONFIG.pointerRadiusFactor;

  camera.zoom = clamp(camera.zoom, CONFIG.minZoom, CONFIG.maxZoom);
  camera.targetZoom = camera.zoom;
  camera.targetX = camera.x;
  camera.targetY = camera.y;

  if (genresLoaded) layoutMainGenreNodes();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

/** ========= Input: wheel zoom ========= */
function onWheel(e) {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const adjustedDeltaY = CONFIG.invertWheel ? -e.deltaY : e.deltaY;
  const factor = adjustedDeltaY < 0 ? CONFIG.zoomStep : (1 / CONFIG.zoomStep);
  zoomAt(mx, my, factor);
}
canvas.addEventListener('wheel', onWheel, { passive: false });

/** ========= Input: pointer / pan / node drag ========= */
function hitTestLabel(mx, my) {
  const padX = 8, padY = 4;
  ctx.save();
  ctx.font = `${CONFIG.nodeLabelPx}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  for (let i = 0; i < MAIN_NODES.length; i++) {
    const n = MAIN_NODES[i];
    const s = worldToScreen(n.x, n.y);
    const labelY = s.y + (6 + CONFIG.nodeLabelPx / 2);
    const text = n.name;
    const widthText = ctx.measureText(text).width;
    const x0 = s.x - widthText / 2 - padX;
    const x1 = s.x + widthText / 2 + padX;
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
  return { mx, my, wx: w.x, wy: w.y };
}

function onPointerDown(e) {
  const { mx, my, wx, wy } = updatePointerFromEvent(e);
  if (e.pointerType === 'mouse' && e.button !== 0) { pointer.active = true; return; }

  const idx = hitTestLabel(mx, my);
  if (idx >= 0) {
    drag.nodeActive = true;
    drag.nodeIdx = idx;
    const n = MAIN_NODES[idx];
    drag.nodeGrabOffset = { x: wx - n.x, y: wy - n.y };
    canvas.style.cursor = 'grabbing';
    pointer.active = true;
  } else {
    const rect = canvas.getBoundingClientRect();
    drag.panActive = true;
    drag.startMx = e.clientX - rect.left;
    drag.startMy = e.clientY - rect.top;
    drag.startTargetX = camera.targetX;
    drag.startTargetY = camera.targetY;
    canvas.style.cursor = 'grabbing';
    pointer.active = false;
  }
  canvas.setPointerCapture?.(e.pointerId);
}

function onPointerMove(e) {
  const { mx, my, wx, wy } = updatePointerFromEvent(e);
  if (drag.nodeActive && drag.nodeIdx >= 0) {
    const n = MAIN_NODES[drag.nodeIdx];
    n.x = wx - drag.nodeGrabOffset.x;
    n.y = wy - drag.nodeGrabOffset.y;
    return;
  }
  if (drag.panActive) {
    const rect = canvas.getBoundingClientRect();
    const curMx = e.clientX - rect.left;
    const curMy = e.clientY - rect.top;
    const dxScreen = curMx - drag.startMx;
    const dyScreen = curMy - drag.startMy;
    const dxWorld = dxScreen / camera.zoom;
    const dyWorld = dyScreen / camera.zoom;
    camera.targetX = drag.startTargetX - dxWorld;
    camera.targetY = drag.startTargetY - dyWorld;
  } else {
    pointer.active = true;
  }
}

function onPointerUp(e) {
  drag.panActive = false;
  drag.nodeActive = false;
  drag.nodeIdx = -1;
  canvas.style.cursor = 'default';
  pointer.active = true;
  try { canvas.releasePointerCapture?.(e.pointerId); } catch {}
}

canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointerleave', onPointerUp);

/** ========= Octave particles ========= */
function getOctaveSpan() { return 2; }

function drawOctave(i, time, alpha) {
  if (alpha <= 0.01) return;

  const Zi = Math.pow(2, i);
  const spacing = CONFIG.baseSpacing / Zi;
  const jitter = spacing * CONFIG.jitterFrac;

  const margin = 60 / camera.zoom;
  const left = camera.x - (width / 2) / camera.zoom - margin;
  const right = camera.x + (width / 2) / camera.zoom + margin;
  const top = camera.y - (height / 2) / camera.zoom - margin;
  const bottom = camera.y + (height / 2) / camera.zoom + margin;

  const gx0 = Math.floor(left / spacing);
  const gx1 = Math.ceil(right / spacing);
  const gy0 = Math.floor(top / spacing);
  const gy1 = Math.ceil(bottom / spacing);

  const radiusWorld = CONFIG.targetPx / Zi;

  const effectivePointerRadiusWorld = pointer.baseRadiusPx / camera.zoom;
  const effectivePointerStrength = pointer.strengthBase / camera.zoom;

  ctx.save();
  ctx.globalAlpha = alpha;

  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const r1 = hash2D(gx, gy, 1000 + i * 7919);
      const r2 = hash2D(gx, gy, 2000 + i * 9173);
      const jitterX = (r1 - 0.5) * jitter * 2;
      const jitterY = (r2 - 0.5) * jitter * 2;

      const baseX = gx * spacing + jitterX;
      const baseY = gy * spacing + jitterY;

      const seed = hash2D(gx, gy, 3000 + i * 6367) * Math.PI * 2;
      const wave = (6 + hash2D(gx, gy, 4000 + i * 4241) * 12) / Math.sqrt(Zi);
      const parallax = 0.3 + hash2D(gx, gy, 5000 + i * 1223) * 0.7;

      const tt = time * CONFIG.timeScale;
      const noiseX = Math.sin(baseX * 0.012 + tt * 1.3 + seed);
      const noiseY = Math.cos(baseY * 0.010 + tt * 1.1 + seed);

      let targetX = baseX + noiseX * wave * parallax;
      let targetY = baseY + noiseY * wave;

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

      const x = baseX + (targetX - baseX) * CONFIG.easing;
      const y = baseY + (targetY - baseY) * CONFIG.easing;

      // Compute tint from nearby nebulae
      const tint = nebulaTintAt(x, y);
      const r = lerp(DOT_BASE_RGB.r, tint.r, tint.a);
      const g = lerp(DOT_BASE_RGB.g, tint.g, tint.a);
      const b = lerp(DOT_BASE_RGB.b, tint.b, tint.a);

      ctx.fillStyle = rgbToCss({ r, g, b }, 0.78);
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

/** ========= Clustered layout + nebula setup ========= */
function randn_bm() { // Box-Muller, mean 0, std 1
  let u=0, v=0;
  while(u===0) u=Math.random();
  while(v===0) v=Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
function pickCluster(clusters) {
  if (clusters.length === 1) return clusters[0];
  const weights = clusters.map(c => 1 / (1 + c.nodes.length * 0.7));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < clusters.length; i++) {
    r -= weights[i];
    if (r <= 0) return clusters[i];
  }
  return clusters[clusters.length - 1];
}

function generateClusters(count) {
  const clusters = [];
  const spread = CONFIG.clusterSpread;
  const minDist = CONFIG.clusterMinDist * 3.1;
  for (let i = 0; i < count; i++) {
    let candidate = null;
    let attempts = 0;
    while (attempts++ < 400) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.pow(Math.random(), 0.38) * spread;
      const jitterR = (Math.random() - 0.5) * CONFIG.clusterCenterJitter;
      const jitterA = (Math.random() - 0.5) * Math.PI * 0.35;
      const r = Math.max(35, radius + jitterR);
      const a = angle + jitterA;
      candidate = {
        cx: Math.cos(a) * r,
        cy: Math.sin(a) * r,
      };
      let ok = true;
      for (const c of clusters) {
        if (Math.hypot(c.cx - candidate.cx, c.cy - candidate.cy) < minDist) {
          ok = false;
          break;
        }
      }
      if (ok) break;
    }
    if (!candidate) {
      candidate = {
        cx: (Math.random() - 0.5) * spread * 0.8,
        cy: (Math.random() - 0.5) * spread * 0.8,
      };
    }
    clusters.push({
      cx: candidate.cx,
      cy: candidate.cy,
      radius: CONFIG.clusterRadius * (0.85 + Math.random() * 0.65),
      nodes: [],
    });
  }
  return clusters;
}

function placeNodeInCluster(cluster, placed) {
  const minDist = CONFIG.clusterMinDist;
  let attempts = 0;
  while (attempts++ < 800) {
    const angle = Math.random() * Math.PI * 2;
    const radial = Math.pow(Math.random(), 0.45) * cluster.radius;
    const radialJitter = (Math.random() - 0.5) * CONFIG.clusterJitter * 0.9;
    const tangential = (Math.random() - 0.5) * CONFIG.clusterJitter * 1.2;

    const baseX = cluster.cx + Math.cos(angle) * (radial + radialJitter);
    const baseY = cluster.cy + Math.sin(angle) * (radial + radialJitter);
    const tx = Math.cos(angle + Math.PI / 2) * tangential;
    const ty = Math.sin(angle + Math.PI / 2) * tangential;
    const x = baseX + tx;
    const y = baseY + ty;

    let ok = true;
    for (const n of cluster.nodes) {
      if (Math.hypot(n.x - x, n.y - y) < minDist) { ok = false; break; }
    }
    if (ok) {
      for (const n of placed) {
        if (Math.hypot(n.x - x, n.y - y) < minDist * 0.8) { ok = false; break; }
      }
    }
    if (ok) return { x, y };
  }
  return {
    x: cluster.cx + (Math.random() - 0.5) * cluster.radius * 1.6,
    y: cluster.cy + (Math.random() - 0.5) * cluster.radius * 1.6,
  };
}

function layoutMainGenreNodes() {
  if (!Array.isArray(GENRES) || GENRES.length === 0) { MAIN_NODES = []; return; }
  const placed = [];
  const total = GENRES.length;
  const clusterCount = clamp(
    Math.floor(CONFIG.clusterCountMin + Math.random() * (CONFIG.clusterCountMax - CONFIG.clusterCountMin + 1)),
    1,
    Math.min(CONFIG.clusterCountMax, GENRES.length)
  );
  const clusters = generateClusters(clusterCount);

  MAIN_NODES = GENRES.map((g, idx) => {
    const cluster = pickCluster(clusters);
    const { x, y } = placeNodeInCluster(cluster, placed);
    cluster.nodes.push({ x, y });

    const gradientT = total <= 1 ? 0.5 : idx / (total - 1);
    const accentShift = clamp(gradientT + (Math.random() - 0.5) * 0.22, 0, 1);
    const baseColorRaw = sampleGradientRgb(NEBULA_GRADIENT, gradientT);
    const accentColorRaw = sampleGradientRgb(NEBULA_GRADIENT, accentShift);
    const color = tintTowards(baseColorRaw, DEEP_SPACE_RGB, 0.12 + Math.random() * 0.08);
    const color2 = tintTowards(accentColorRaw, WHITE_RGB, 0.1 + Math.random() * 0.12);

    // Randomized number of sub-blobs per node
    const layers = Math.floor(CONFIG.nebulaLayersMin + Math.random() * (CONFIG.nebulaLayersMax - CONFIG.nebulaLayersMin + 1));

    const sub = [];
    let centroidX = 0;
    let centroidY = 0;
    let centroidWeight = 0;
    for (let k = 0; k < layers; k++) {
      const ang = Math.random() * Math.PI * 2;
      const rBias = Math.pow(Math.random(), 1.35);
      const maxR = CONFIG.nebulaRadius * (0.4 + Math.random() * CONFIG.nebulaLayerJitter);
      const localR = rBias * maxR;

      const ox = Math.cos(ang) * localR;
      const oy = Math.sin(ang) * localR;

      const base = 0.55 + Math.random() * 0.45;
      const rr = (CONFIG.nebulaRadius * 0.42 + Math.random() * CONFIG.nebulaRadius * 0.28) * base;
      const axis = lerp(CONFIG.nebulaAnisotropyMin, CONFIG.nebulaAnisotropyMax, Math.random());

      const weight = Math.max(1, rr * rr);
      centroidX += ox * weight;
      centroidY += oy * weight;
      centroidWeight += weight;

      sub.push({
        ox, oy, r: rr,
        phase: Math.random() * Math.PI * 2,
        tilt: Math.random() * Math.PI * 2,
        axis,
        spark: Math.random(),
      });
    }

    if (centroidWeight > 0) {
      const invWeight = 1 / centroidWeight;
      const cx = centroidX * invWeight;
      const cy = centroidY * invWeight;
      for (const blob of sub) {
        blob.ox -= cx;
        blob.oy -= cy;
      }
    }

    sub.push({
      ox: 0,
      oy: 0,
      r: CONFIG.nebulaRadius * (0.32 + Math.random() * 0.08),
      phase: Math.random() * Math.PI * 2,
      tilt: Math.random() * Math.PI * 2,
      axis: lerp(CONFIG.nebulaAnisotropyMin, CONFIG.nebulaAnisotropyMax, 0.55 + Math.random() * 0.25),
      spark: 0.52 + Math.random() * 0.18,
    });

    const node = {
      name: g.name, x, y, color, color2,
      nebula: {
        radius: CONFIG.nebulaRadius,
        sub,
        seed: Math.random() * 10000,
        breathePhase: Math.random() * Math.PI * 2,
        swirlPhase: Math.random() * Math.PI * 2,
        driftDir: Math.random() * Math.PI * 2
      }
    };
    placed.push(node);
    return node;
  });
}

/** ========= Nebula rendering (bi-color + fBM alpha) ========= */
function drawNebulae(time) {
  if (!MAIN_NODES.length) return;

  ctx.save();
  if (CONFIG.nebulaAdditiveGlow) ctx.globalCompositeOperation = 'lighter';

  const t = time;

  for (const node of MAIN_NODES) {
    const n = node.nebula;

    const breathe = 1 + CONFIG.nebulaBreatheAmp * Math.sin(t * CONFIG.nebulaBreatheSpeed + n.breathePhase);

    const phase = t * CONFIG.nebulaDriftSpeed;
    const driftX = Math.cos(n.driftDir + phase) * CONFIG.nebulaDriftAmp;
    const driftY = Math.sin(n.driftDir * 1.23 + phase * 0.91) * CONFIG.nebulaDriftAmp;

    const swirlAngle = n.swirlPhase + t * CONFIG.nebulaSwirlSpeed;
    const sinA = Math.sin(swirlAngle);
    const cosA = Math.cos(swirlAngle);

    const colorPulse = 1 + CONFIG.nebulaColorPulse * Math.sin(0.00035 * t + n.seed);
    const c1 = { r: clamp(node.color.r * colorPulse, 0, 255),
                 g: clamp(node.color.g * colorPulse, 0, 255),
                 b: clamp(node.color.b * colorPulse, 0, 255) };
    const c2 = { r: clamp(node.color2.r * colorPulse, 0, 255),
                 g: clamp(node.color2.g * colorPulse, 0, 255),
                 b: clamp(node.color2.b * colorPulse, 0, 255) };

    for (const blob of n.sub) {
      const shimmer = CONFIG.nebulaShimmerAmp / Math.max(1, camera.zoom);
      const nx = Math.sin(0.0016 * t + blob.phase + blob.ox * 0.017 + n.seed) * shimmer;
      const ny = Math.cos(0.0012 * t + blob.phase + blob.oy * 0.015 + n.seed) * shimmer;

      const rox = blob.ox * cosA - blob.oy * sinA;
      const roy = blob.ox * sinA + blob.oy * cosA;

      const cx = node.x + driftX + rox + nx;
      const cy = node.y + driftY + roy + ny;

      const warpScale = CONFIG.noiseWarpScale;
      const warpField = fbm((cx + n.seed) * warpScale, (cy - n.seed) * warpScale, 2, 0.55, 8181);
      const warpField2 = fbm((cx - n.seed) * warpScale * 1.37, (cy + n.seed) * warpScale * 1.41, 2, 0.6, 9191);
      const warpAngle = warpField * Math.PI * 2;
      const warpMag = CONFIG.noiseWarpStrength * blob.r * (0.6 + warpField2 * 0.8);
      const wcx = cx + Math.cos(warpAngle) * warpMag;
      const wcy = cy + Math.sin(warpAngle) * warpMag;

      const r = blob.r * breathe;
      const twinkle = 1 + (blob.spark - 0.5) * CONFIG.nebulaTwinkleAmp * Math.sin(t * 0.0007 + blob.phase * 1.9 + n.seed);

      // fBM noise for alpha modulation; breaks any lingering patterns
      const ns = CONFIG.noiseScale;
      const nAlpha = fbm(wcx * ns, wcy * ns, CONFIG.noiseOctaves, CONFIG.noiseGain, 1234 + Math.floor(blob.spark * 500));
      const alphaMul = lerp(CONFIG.noiseAlphaMin, CONFIG.noiseAlphaMax, nAlpha);
      const a = CONFIG.nebulaAlpha * alphaMul * twinkle;

      const midMix = 0.35 + blob.spark * 0.35;
      const cm = mixRGB(c1, c2, midMix);
      const highlight = tintTowards(c1, WHITE_RGB, CONFIG.nebulaHighlightIntensity + blob.spark * 0.12);
      const glow = tintTowards(cm, WHITE_RGB, CONFIG.nebulaHighlightWarmth + 0.08 * blob.spark);
      const shadow = tintTowards(c2, DEEP_SPACE_RGB, 0.35);
      const rim = tintTowards(c2, WHITE_RGB, 0.08 + blob.spark * 0.1);

      const axisPulse = 1 + Math.sin(t * 0.0005 + blob.phase * 1.3 + blob.spark * 3.1) * 0.08;
      const anisotropy = clamp(blob.axis * axisPulse, 0.32, 1.15);
      const scaleX = 1 + Math.sin(t * 0.0008 + blob.phase * 2.1 + n.seed * 0.17) * 0.12;
      const scaleY = anisotropy;
      const rotate = blob.tilt + swirlAngle * 0.6;

      ctx.save();
      ctx.translate(wcx, wcy);
      ctx.rotate(rotate);
      ctx.scale(scaleX, scaleY);

      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0.00, `rgba(${highlight.r},${highlight.g},${highlight.b},${a * 0.95})`);
      grad.addColorStop(0.18, `rgba(${c1.r},${c1.g},${c1.b},${a * 0.72})`);
      grad.addColorStop(0.45, `rgba(${cm.r},${cm.g},${cm.b},${a * 0.28})`);
      grad.addColorStop(0.68, `rgba(${glow.r},${glow.g},${glow.b},${a * 0.16})`);
      grad.addColorStop(0.86, `rgba(${rim.r},${rim.g},${rim.b},${a * 0.08})`);
      grad.addColorStop(1.00, `rgba(${shadow.r},${shadow.g},${shadow.b},0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

function drawLabels() {
  if (!MAIN_NODES.length) return;
  ctx.save();
  ctx.font = `${CONFIG.nodeLabelPx / camera.zoom}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const node of MAIN_NODES) {
    const labelY = node.y + (6 / camera.zoom);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = (1.5 / camera.zoom);
    ctx.strokeText(node.name, node.x, labelY);
    ctx.fillStyle = 'rgba(240,244,255,0.95)';
    ctx.fillText(node.name, node.x, labelY);
  }
  ctx.restore();
}

/** ========= Particle tint sampling from nebulae ========= */
function nebulaTintAt(x, y) {
  if (!MAIN_NODES.length) return { r: DOT_BASE_RGB.r, g: DOT_BASE_RGB.g, b: DOT_BASE_RGB.b, a: 0 };

  let accR = 0, accG = 0, accB = 0, accW = 0;

  for (const node of MAIN_NODES) {
    const dx = x - node.x;
    const dy = y - node.y;
    const d = Math.hypot(dx, dy);

    const R = node.nebula.radius * CONFIG.tintRadiusMultiplier;
    if (d > R) continue;

    const t = 1 - clamp(d / R, 0, 1);
    const w = Math.pow(t, CONFIG.tintFalloffPower);

    // Use bi-color for tint, weighted closer to the primary near core
    const mixT = Math.pow(1 - t, 2); // 0 at core -> 1 toward edge
    const cTint = mixRGB(node.color, node.color2, mixT);

    accR += cTint.r * w;
    accG += cTint.g * w;
    accB += cTint.b * w;
    accW += w;
  }

  if (accW <= 0.0001) {
    return { r: DOT_BASE_RGB.r, g: DOT_BASE_RGB.g, b: DOT_BASE_RGB.b, a: 0 };
  }

  const r = accR / accW, g = accG / accW, b = accB / accW;
  const a = CONFIG.tintStrength * Math.min(1, accW);
  return { r, g, b, a };
}

/** ========= Main loop ========= */
function animate(time) {
  requestAnimationFrame(animate);
  const dt = time - lastTime;
  lastTime = time;

  camera.zoom += (camera.targetZoom - camera.zoom) * CONFIG.zoomEase;
  camera.x    += (camera.targetX   - camera.x)    * CONFIG.panEase;
  camera.y    += (camera.targetY   - camera.y)    * CONFIG.panEase;

  ctx.fillStyle = CONFIG.bgFade;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  drawNebulae(time);

  const lz = Math.log2(camera.zoom);
  const iCenter = Math.floor(lz);
  const span = getOctaveSpan();
  for (let i = iCenter - span; i <= iCenter + span; i++) {
    const alpha = octaveWeight(i, camera.zoom);
    if (alpha > 0.01) drawOctave(i, time + dt * 0.5, alpha);
  }

  drawLabels();
  ctx.restore();
}

/** ========= Init ========= */
spotifyAuth.init();
resize();
loadGenres();
requestAnimationFrame(animate);

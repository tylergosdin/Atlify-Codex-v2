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

  function showModal() {
    modal.classList.remove('is-hidden');
  }

  function hideModal() {
    modal.classList.add('is-hidden');
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

const MAIN_NODE_BY_NAME = new Map();

const SUB_CACHE = {
  list: [],
  byName: new Map(),
  byRow: new Map(),
};

const SUB_STATES = new Map();

const INLINE_VECTOR_SAMPLE_B64 = [
  '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'
].join('');

let inlineVectorSampleF32 = null;

const VEC_ASSETS = {
  dims: 0,
  items: [],
  matrix: null,
  byName: new Map(),
  loaded: false,
};

let vecWorker = null;
let vecWorkerReady = false;
let pendingTopK = null;
let vecWorkerRequestId = 0;

let vectorAssetsPromise = null;

let lastRecomputeContextKey = null;
let recomputeTimer = null;
let recomputeRunning = false;
let recomputeNeeds = false;
let forceNextRecompute = false;

const RECOMPUTE_INTERVAL_MS = 60;

let lastCameraSample = { x: Infinity, y: Infinity, zoom: Infinity };

function decodeInlineVectorBuffer() {
  if (!INLINE_VECTOR_SAMPLE_B64) return null;
  if (typeof atob === 'function') {
    const binary = atob(INLINE_VECTOR_SAMPLE_B64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  if (typeof Buffer !== 'undefined') {
    const nodeBuf = Buffer.from(INLINE_VECTOR_SAMPLE_B64, 'base64');
    const bytes = new Uint8Array(nodeBuf.length);
    for (let i = 0; i < nodeBuf.length; i++) bytes[i] = nodeBuf[i];
    return bytes.buffer;
  }
  return null;
}

function getInlineVectorSampleMatrix() {
  if (inlineVectorSampleF32) return inlineVectorSampleF32;
  const buffer = decodeInlineVectorBuffer();
  if (!buffer) return null;
  inlineVectorSampleF32 = new Float32Array(buffer);
  return inlineVectorSampleF32;
}

async function loadGenres() {
  try {
    const url = new URL('genres.json', window.location.href).toString();
    const res = await fetch('genres.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    GENRES = await res.json();
    buildSubgenreCache();
    layoutMainGenreNodes();
    genresLoaded = true;
    scheduleRecompute(true);
    ensureVectorAssets()
      .then(() => {
        attachVectorsToNodesAndSubs();
        scheduleRecompute(true);
      })
      .catch((err) => {
        console.warn('Vector assets unavailable', err);
      });
  } catch (err) {
    console.error('Failed to load genres.json:', err);
  }
}

function buildSubgenreCache() {
  SUB_CACHE.list = [];
  SUB_CACHE.byName.clear();
  SUB_CACHE.byRow.clear();
  if (!Array.isArray(GENRES)) return;

  const ensureRecord = (name, depth, primary) => {
    const key = String(name || '').trim();
    if (!key) return null;
    let rec = SUB_CACHE.byName.get(key);
    if (!rec) {
      rec = {
        name: key,
        depth: Number.isFinite(depth) ? depth : 1,
        parentSet: new Set(),
        parents: [],
        vecRow: null,
        vec: null,
        jitter: null,
      };
      SUB_CACHE.byName.set(key, rec);
      SUB_CACHE.list.push(rec);
    }
    rec.depth = Math.min(rec.depth, Number.isFinite(depth) ? depth : rec.depth);
    if (primary) rec.parentSet.add(primary);
    return rec;
  };

  const walk = (node, primary, depth) => {
    if (!node) return;
    if (typeof node === 'string') {
      ensureRecord(node, depth, primary);
      return;
    }
    if (typeof node !== 'object') return;
    const name = node.name || '';
    const rec = ensureRecord(name, depth, primary);
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        walk(child, primary, depth + 1);
      }
    }
    if (rec && !rec.parents.length) {
      rec.parents = Array.from(rec.parentSet);
    }
  };

  for (const primary of GENRES) {
    if (!primary || typeof primary !== 'object') continue;
    const primaryName = String(primary.name || '').trim();
    if (!primaryName) continue;
    if (!Array.isArray(primary.children)) continue;
    for (const child of primary.children) {
      walk(child, primaryName, 1);
    }
  }

  for (const rec of SUB_CACHE.list) {
    rec.parents = Array.from(rec.parentSet);
  }
}

async function ensureVectorAssets() {
  if (vectorAssetsPromise) return vectorAssetsPromise;
  vectorAssetsPromise = (async () => {
    try {
      const idxRes = await fetch('genres_vectors.index.json');
      if (!idxRes.ok) throw new Error(`vector index HTTP ${idxRes.status}`);
      const index = await idxRes.json();
      let matrixView = null;
      let buffer = null;
      try {
        const binRes = await fetch('genres_vectors.bin');
        if (!binRes.ok) throw new Error(`vector bin HTTP ${binRes.status}`);
        buffer = await binRes.arrayBuffer();
      } catch (err) {
        console.warn('Vector bin fetch failed; using inline fallback sample', err);
      }

      if (buffer) {
        matrixView = new Float32Array(buffer);
      } else {
        matrixView = getInlineVectorSampleMatrix();
        if (!matrixView) throw new Error('inline vector sample unavailable');
      }

      const matrixCopy = new Float32Array(matrixView);

      VEC_ASSETS.dims = index?.dims || 0;
      VEC_ASSETS.items = Array.isArray(index?.items) ? index.items : [];
      VEC_ASSETS.matrix = matrixCopy;
      VEC_ASSETS.byName = new Map();
      VEC_ASSETS.loaded = true;

      VEC_ASSETS.items.forEach((item, idx) => {
        if (!item || !item.name) return;
        VEC_ASSETS.byName.set(item.name, idx);
      });

      const workerBuffer = matrixCopy.buffer.slice(0);
      initVectorWorker(workerBuffer, VEC_ASSETS.dims, VEC_ASSETS.items);
      return VEC_ASSETS;
    } catch (err) {
      VEC_ASSETS.loaded = false;
      throw err;
    }
  })();
  return vectorAssetsPromise;
}

function initVectorWorker(buffer, dims, items) {
  if (vecWorker) {
    try { vecWorker.terminate(); } catch (err) { console.warn('Failed to terminate existing worker', err); }
    vecWorkerReady = false;
  }
  try {
    vecWorker = new Worker('vector-worker.js', { type: 'module' });
  } catch (err) {
    console.error('Unable to create vector worker', err);
    vecWorker = null;
    return;
  }
  vecWorkerReady = false;
  vecWorker.onmessage = handleVecWorkerMessage;
  vecWorker.postMessage({ type: 'init', dims, buffer, items }, [buffer]);
}

function handleVecWorkerMessage(e) {
  const msg = e?.data;
  if (!msg) return;
  if (msg.type === 'ready') {
    vecWorkerReady = true;
    return;
  }
  if (msg.type === 'topk') {
    if (pendingTopK && pendingTopK.id === msg.id) {
      const resolver = pendingTopK.resolve;
      pendingTopK = null;
      resolver(msg.data);
    }
    return;
  }
}

function requestTopK(mix, K = 60) {
  if (!vecWorker || !vecWorkerReady) return Promise.resolve(null);
  const id = ++vecWorkerRequestId;
  if (pendingTopK && pendingTopK.resolve) {
    pendingTopK.resolve(null);
    pendingTopK = null;
  }
  const payload = mix.slice();
  vecWorker.postMessage({ type: 'topk', id, mix: payload.buffer, K }, [payload.buffer]);
  return new Promise((resolve) => {
    pendingTopK = { id, resolve };
  });
}

function attachVectorsToNodesAndSubs() {
  if (!VEC_ASSETS.loaded || !VEC_ASSETS.matrix) return;
  const dims = VEC_ASSETS.dims;
  const matrix = VEC_ASSETS.matrix;
  if (!Number.isFinite(dims) || dims <= 0) return;

  for (const node of MAIN_NODES) {
    node.vecRow = null;
    node.vec = null;
    const idx = VEC_ASSETS.byName.get(node.name);
    if (idx != null) {
      node.vecRow = idx;
      node.vec = matrix.subarray(idx * dims, (idx + 1) * dims);
    }
  }

  SUB_CACHE.byRow.clear();
  for (const rec of SUB_CACHE.list) {
    rec.vecRow = null;
    rec.vec = null;
    const idx = VEC_ASSETS.byName.get(rec.name);
    if (idx != null) {
      rec.vecRow = idx;
      rec.vec = matrix.subarray(idx * dims, (idx + 1) * dims);
      SUB_CACHE.byRow.set(idx, rec);
    }
  }
}

function l2Norm(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  return Math.sqrt(sum);
}

function normalizeVector(vec) {
  const norm = l2Norm(vec);
  if (norm <= 1e-8) return vec;
  const inv = 1 / norm;
  for (let i = 0; i < vec.length; i++) vec[i] *= inv;
  return vec;
}

function blendParentsVec(parents, weights) {
  if (!parents || !parents.length) return null;
  if (!VEC_ASSETS.loaded || !VEC_ASSETS.matrix) return null;
  const dims = VEC_ASSETS.dims;
  const mix = new Float32Array(dims);
  let used = 0;
  for (let i = 0; i < parents.length; i++) {
    const node = parents[i];
    const weight = weights[i] ?? 0;
    if (!node || !node.vec || weight <= 0) continue;
    const vec = node.vec;
    for (let d = 0; d < dims; d++) {
      mix[d] += vec[d] * weight;
    }
    used++;
  }
  if (!used) return null;
  return normalizeVector(mix);
}

function computeZoomBand() {
  const safeZoom = Math.max(camera.zoom, 1e-3);
  return Math.round(Math.log2(safeZoom) * 4);
}

function computeParentBarycenter(parents, weights, fallback = { x: camera.x, y: camera.y }) {
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (let i = 0; i < parents.length; i++) {
    const node = parents[i];
    const weight = weights[i] ?? 0;
    if (!node || weight <= 0) continue;
    sx += node.x * weight;
    sy += node.y * weight;
    sw += weight;
  }
  if (sw > 1e-6) {
    const inv = 1 / sw;
    return { x: sx * inv, y: sy * inv };
  }
  return { x: fallback.x, y: fallback.y };
}

function computeActiveParentsAndWeights(force = false) {
  if (!MAIN_NODES.length) {
    return {
      parents: [],
      weights: [],
      weightMap: new Map(),
      barycenter: { x: camera.x, y: camera.y },
      zoomBand: computeZoomBand(),
      key: '',
      force,
    };
  }

  const cx = camera.x;
  const cy = camera.y;
  const entries = [];

  for (const node of MAIN_NODES) {
    const dx = cx - node.x;
    const dy = cy - node.y;
    const dist = Math.hypot(dx, dy);
    const baseRadius = node?.nebula?.radius ?? CONFIG.nebulaRadius;
    const radius = baseRadius * CONFIG.tintRadiusMultiplier * 1.15;
    const t = 1 - clamp(dist / Math.max(radius, 1e-6), 0, 1);
    const weight = t > 0 ? Math.pow(t, CONFIG.tintFalloffPower) : 0;
    entries.push({ node, weight, dist });
  }

  entries.sort((a, b) => {
    const diff = b.weight - a.weight;
    if (Math.abs(diff) > 1e-6) return diff;
    return a.dist - b.dist;
  });

  const selected = entries.filter((e) => e.weight > 1e-4).slice(0, 4);
  if (!selected.length && entries.length) {
    entries.sort((a, b) => a.dist - b.dist);
    const near = entries.slice(0, Math.min(3, entries.length));
    let inv = 0;
    for (const entry of near) {
      entry.weight = 1 / Math.max(entry.dist, 1);
      inv += entry.weight;
    }
    if (inv > 0) {
      for (const entry of near) entry.weight /= inv;
    }
    selected.splice(0, selected.length, ...near);
  }

  let totalWeight = 0;
  for (const entry of selected) totalWeight += entry.weight;
  if (totalWeight <= 0) {
    return {
      parents: [],
      weights: [],
      weightMap: new Map(),
      barycenter: { x: cx, y: cy },
      zoomBand: computeZoomBand(),
      key: '',
      force,
    };
  }

  const parents = [];
  const weights = [];
  const weightMap = new Map();
  const inv = 1 / totalWeight;
  for (const entry of selected.slice(0, 4)) {
    const w = entry.weight * inv;
    parents.push(entry.node);
    weights.push(w);
    weightMap.set(entry.node.name, w);
  }

  const barycenter = computeParentBarycenter(parents, weights, { x: cx, y: cy });
  const zoomBand = computeZoomBand();
  const parentKey = parents.map((node, idx) => `${node.name}:${weights[idx].toFixed(3)}`).join('|');
  const key = `${zoomBand}:${parentKey}`;

  return { parents, weights, weightMap, barycenter, zoomBand, key, force };
}

function computeParentWeightForRecord(rec, weightMap) {
  if (!rec || !Array.isArray(rec.parents)) return 0;
  let total = 0;
  for (const parentName of rec.parents) {
    const w = weightMap.get(parentName);
    if (w) total += w;
  }
  return total;
}

function computeRecordBarycenter(rec, context, fallback) {
  if (!rec || !Array.isArray(rec.parents) || !rec.parents.length) {
    return fallback || { x: camera.x, y: camera.y };
  }
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (const parentName of rec.parents) {
    const node = MAIN_NODE_BY_NAME.get(parentName);
    if (!node) continue;
    const w = context.weightMap.get(parentName);
    if (!w) continue;
    sx += node.x * w;
    sy += node.y * w;
    sw += w;
  }
  if (sw > 1e-5) {
    const inv = 1 / sw;
    return { x: sx * inv, y: sy * inv };
  }
  if (fallback) return { x: fallback.x, y: fallback.y };
  return { x: camera.x, y: camera.y };
}

function getRecordJitter(rec) {
  if (!rec.jitter) {
    const angle = hashString(rec.name) * Math.PI * 2;
    const radius = (0.3 + hashString(`${rec.name}:j2`) * 0.7) * CONFIG.nebulaRadius * 0.5;
    rec.jitter = { angle, radius };
  }
  return rec.jitter;
}

function computeZoomAlpha() {
  const z = clamp((camera.zoom - 0.55) / 1.4, 0, 1);
  return z;
}

function powerIteration(vecArray, mean, orth, initial) {
  const dims = mean.length;
  const comp = new Float32Array(dims);
  if (initial) {
    comp.set(initial);
  } else {
    for (let d = 0; d < dims; d++) comp[d] = Math.random() - 0.5;
    normalizeVector(comp);
  }
  const temp = new Float32Array(dims);
  for (let iter = 0; iter < 10; iter++) {
    temp.fill(0);
    for (const vec of vecArray) {
      let dot = 0;
      for (let d = 0; d < dims; d++) {
        const centered = vec[d] - mean[d];
        dot += centered * comp[d];
      }
      if (dot === 0) continue;
      for (let d = 0; d < dims; d++) {
        const centered = vec[d] - mean[d];
        temp[d] += centered * dot;
      }
    }
    if (orth && orth.length) {
      for (const base of orth) {
        let proj = 0;
        for (let d = 0; d < dims; d++) proj += temp[d] * base[d];
        for (let d = 0; d < dims; d++) temp[d] -= proj * base[d];
      }
    }
    const norm = l2Norm(temp);
    if (norm <= 1e-6) break;
    for (let d = 0; d < dims; d++) comp[d] = temp[d] / norm;
  }
  const finalNorm = l2Norm(comp);
  if (finalNorm <= 1e-6) return null;
  return comp;
}

function pca2Basis(vecArray) {
  if (!Array.isArray(vecArray) || vecArray.length < 4) return null;
  const dims = VEC_ASSETS.dims;
  if (!Number.isFinite(dims) || dims <= 0) return null;

  const mean = new Float32Array(dims);
  for (const vec of vecArray) {
    for (let d = 0; d < dims; d++) mean[d] += vec[d];
  }
  const inv = 1 / vecArray.length;
  for (let d = 0; d < dims; d++) mean[d] *= inv;

  const initial = new Float32Array(dims);
  const seedVec = vecArray[0];
  for (let d = 0; d < dims; d++) initial[d] = seedVec[d] - mean[d];
  normalizeVector(initial);

  const pc1 = powerIteration(vecArray, mean, null, initial);
  if (!pc1) return null;
  const pc2 = powerIteration(vecArray, mean, [pc1]);
  if (!pc2) return null;
  return { mean, pc1, pc2 };
}

function projectToBasis(vec, basis) {
  const dims = basis.mean.length;
  let x = 0;
  let y = 0;
  for (let d = 0; d < dims; d++) {
    const centered = vec[d] - basis.mean[d];
    x += centered * basis.pc1[d];
    y += centered * basis.pc2[d];
  }
  return { x, y };
}

function applyFallbackSubgenres(context) {
  const weightMap = context.weightMap;
  if (!weightMap || !weightMap.size) {
    clearSubgenreTargets();
    return;
  }
  const candidates = [];
  for (const rec of SUB_CACHE.list) {
    const parentWeight = computeParentWeightForRecord(rec, weightMap);
    if (parentWeight <= 0) continue;
    const depthAttenuation = 1 / (1 + rec.depth * 0.6);
    const score = parentWeight * depthAttenuation;
    candidates.push({ rec, parentWeight, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const visible = [];
  const maxCount = Math.min(30, candidates.length);
  for (let i = 0; i < maxCount; i++) {
    const cand = candidates[i];
    visible.push({ rec: cand.rec, sim: 0, parentWeight: cand.parentWeight, alphaBase: cand.score, simNorm: 0.5 });
  }
  applyVisibleSubgenres(visible, context, null, computeZoomAlpha());
}

function processTopKResults(topk, context) {
  if (!topk || !context) return;
  const weightMap = context.weightMap;
  const visible = [];
  for (let i = 0; i < topk.length; i++) {
    const entry = topk[i];
    if (!entry) continue;
    const sim = entry[0];
    const row = entry[1];
    const rec = SUB_CACHE.byRow.get(row);
    if (!rec) continue;
    const parentWeight = computeParentWeightForRecord(rec, weightMap);
    if (parentWeight <= 0.001) continue;
    const simNorm = clamp((sim + 1) * 0.5, 0, 1);
    const alphaBase = simNorm * (0.55 + 0.45 * Math.min(1, parentWeight)) * parentWeight;
    visible.push({ rec, sim, parentWeight, alphaBase, simNorm });
    if (visible.length >= 40) break;
  }
  if (!visible.length) {
    applyFallbackSubgenres(context);
    return;
  }

  const vecsForBasis = visible.filter((v) => v.rec.vec).map((v) => v.rec.vec);
  let basisInfo = null;
  if (vecsForBasis.length >= 4) {
    const basis = pca2Basis(vecsForBasis);
    if (basis) {
      const projections = new Map();
      let maxRadius = 0;
      for (const item of visible) {
        if (!item.rec.vec) continue;
        const proj = projectToBasis(item.rec.vec, basis);
        projections.set(item.rec, proj);
        const r = Math.hypot(proj.x, proj.y);
        if (r > maxRadius) maxRadius = r;
      }
      const scale = CONFIG.nebulaRadius * 0.6 / Math.max(1e-5, maxRadius || 1);
      basisInfo = { basis, projections, scale };
    }
  }

  applyVisibleSubgenres(visible, context, basisInfo, computeZoomAlpha());
}

function applyVisibleSubgenres(visible, context, basisInfo, zoomAlpha) {
  const seen = new Set();
  const scale = basisInfo?.scale ?? (CONFIG.nebulaRadius * 0.45);
  for (const item of visible) {
    const rec = item.rec;
    const bary = computeRecordBarycenter(rec, context, context.barycenter);
    let targetX = bary.x;
    let targetY = bary.y;
    if (basisInfo && basisInfo.projections?.has(rec)) {
      const proj = basisInfo.projections.get(rec);
      targetX += proj.x * scale;
      targetY += proj.y * scale;
    } else {
      const jitter = getRecordJitter(rec);
      const jitterScale = 0.8 + item.parentWeight * 0.4;
      targetX += Math.cos(jitter.angle) * jitter.radius * jitterScale;
      targetY += Math.sin(jitter.angle) * jitter.radius * jitterScale;
    }
    const alpha = clamp(item.alphaBase * zoomAlpha, 0, 1);
    const state = ensureSubState(rec.name, bary.x, bary.y);
    state.targetX = targetX;
    state.targetY = targetY;
    state.targetAlpha = alpha;
    state.parentWeight = item.parentWeight;
    state.sim = item.sim;
    seen.add(rec.name);
  }
  for (const [name, state] of SUB_STATES) {
    if (!seen.has(name)) {
      state.targetAlpha = 0;
    }
  }
}

function ensureSubState(name, x, y) {
  let state = SUB_STATES.get(name);
  if (!state) {
    state = {
      name,
      x,
      y,
      alpha: 0,
      targetX: x,
      targetY: y,
      targetAlpha: 0,
      parentWeight: 0,
      sim: 0,
    };
    SUB_STATES.set(name, state);
  }
  return state;
}

function clearSubgenreTargets() {
  for (const state of SUB_STATES.values()) {
    state.targetAlpha = 0;
  }
}

function updateSubgenreAnimations(dt) {
  const posEase = clamp(dt / 180, 0.05, 0.35);
  const alphaEase = clamp(dt / 220, 0.06, 0.28);
  for (const [name, state] of SUB_STATES) {
    state.x += (state.targetX - state.x) * posEase;
    state.y += (state.targetY - state.y) * posEase;
    state.alpha += (state.targetAlpha - state.alpha) * alphaEase;
    if (state.targetAlpha <= 0.01 && state.alpha <= 0.01) {
      SUB_STATES.delete(name);
    }
  }
}

function drawSubgenreLabels() {
  if (!SUB_STATES.size) return;
  ctx.save();
  ctx.font = `${12 / camera.zoom}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const state of SUB_STATES.values()) {
    if (state.alpha <= 0.01) continue;
    ctx.globalAlpha = clamp(state.alpha, 0, 1);
    const labelY = state.y + (4 / camera.zoom);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = (1 / camera.zoom);
    ctx.strokeText(state.name, state.x, labelY);
    ctx.fillStyle = 'rgba(228,235,255,0.92)';
    ctx.fillText(state.name, state.x, labelY);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function scheduleRecompute(force = false) {
  if (force) forceNextRecompute = true;
  if (recomputeTimer) return;
  recomputeTimer = setTimeout(() => {
    recomputeTimer = null;
    if (recomputeRunning) {
      recomputeNeeds = true;
      return;
    }
    doRecompute();
  }, RECOMPUTE_INTERVAL_MS);
}

async function doRecompute() {
  recomputeRunning = true;
  const force = forceNextRecompute;
  forceNextRecompute = false;
  recomputeNeeds = false;
  try {
    const context = computeActiveParentsAndWeights(force);
    if (!context.parents.length) {
      clearSubgenreTargets();
      lastRecomputeContextKey = null;
      return;
    }
    if (!context.force && lastRecomputeContextKey === context.key) {
      return;
    }
    if (!VEC_ASSETS.loaded || !vecWorkerReady) {
      applyFallbackSubgenres(context);
      lastRecomputeContextKey = context.key;
      return;
    }
    const mix = blendParentsVec(context.parents, context.weights);
    if (!mix) {
      applyFallbackSubgenres(context);
      lastRecomputeContextKey = context.key;
      return;
    }
    const topk = await requestTopK(mix, 60);
    if (!topk) return;
    processTopKResults(topk, context);
    lastRecomputeContextKey = context.key;
  } catch (err) {
    console.warn('Subgenre recompute failed', err);
  } finally {
    recomputeRunning = false;
    if (recomputeNeeds || forceNextRecompute) {
      recomputeNeeds = false;
      scheduleRecompute();
    }
  }
}

function maybeScheduleCameraChange() {
  const dx = Math.abs(camera.x - lastCameraSample.x);
  const dy = Math.abs(camera.y - lastCameraSample.y);
  const dz = Math.abs(camera.zoom - lastCameraSample.zoom);
  if (dx > 2 || dy > 2 || dz > 0.02) {
    lastCameraSample = { x: camera.x, y: camera.y, zoom: camera.zoom };
    scheduleRecompute();
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
  targetPxSizeVariation: 0.12, // max +/- percentage of particle size jitter
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
  clusterSpread: 460,
  clusterCenterJitter: 120,

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
function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
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
  scheduleRecompute();
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

  if (genresLoaded) {
    layoutMainGenreNodes();
    scheduleRecompute(true);
  }
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
    scheduleRecompute(true);
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
    scheduleRecompute();
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
  scheduleRecompute();
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

  const baseRadiusWorld = CONFIG.targetPx / Zi;

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

      const sizeHash = hash2D(gx, gy, 6000 + i * 3373);
      const sizeFactor = 1 + (sizeHash - 0.5) * CONFIG.targetPxSizeVariation;
      const radiusWorld = baseRadiusWorld * sizeFactor;

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
  const clusterCount = clamp(
    Math.floor(CONFIG.clusterCountMin + Math.random() * (CONFIG.clusterCountMax - CONFIG.clusterCountMin + 1)),
    1,
    Math.min(CONFIG.clusterCountMax, GENRES.length)
  );
  const clusters = generateClusters(clusterCount);

  const total = GENRES.length;

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

  MAIN_NODE_BY_NAME.clear();
  for (const node of MAIN_NODES) {
    MAIN_NODE_BY_NAME.set(node.name, node);
  }
  attachVectorsToNodesAndSubs();
  scheduleRecompute(true);
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
  updateSubgenreAnimations(dt);
  drawSubgenreLabels();
  ctx.restore();

  maybeScheduleCameraChange();
}

/** ========= Init ========= */
spotifyAuth.init();
resize();
loadGenres();
requestAnimationFrame(animate);

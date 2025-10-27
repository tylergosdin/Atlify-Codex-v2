import { CONFIG } from './config.js';
import { ctx, camera } from './appContext.js';
import { clamp, hash2D, hashString, smoothstep, mixRGB, rgbToCss, tintTowards, sampleGradientRgb, valueNoise, fbm, WHITE_RGB, DEEP_SPACE_RGB } from './utils.js';

/** ========= Load genres.json ========= */
export let GENRES = [];
export let MAIN_NODES = [];       // [{ name, x, y, color, color2, nebula }]
export let genresLoaded = false;

export const MAIN_NODE_BY_NAME = new Map();

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

export async function loadGenres() {
  try {
    const url = new URL('genres.json', window.location.href).toString();
    const res = await fetch('genres.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    GENRES = await res.json();
    buildSubgenreCache();
    genresLoaded = true;
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

export function attachVectorsToNodesAndSubs() {
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

export function updateSubgenreAnimations(dt) {
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

export function drawSubgenreLabels() {
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

export function scheduleRecompute(force = false) {
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

export function maybeScheduleCameraChange() {
  const dx = Math.abs(camera.x - lastCameraSample.x);
  const dy = Math.abs(camera.y - lastCameraSample.y);
  const dz = Math.abs(camera.zoom - lastCameraSample.zoom);
  if (dx > 2 || dy > 2 || dz > 0.02) {
    lastCameraSample = { x: camera.x, y: camera.y, zoom: camera.zoom };
    scheduleRecompute();
  }
}


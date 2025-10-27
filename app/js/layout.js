import { CONFIG, NEBULA_GRADIENT } from './config.js';
import { clamp, sampleGradientRgb, tintTowards, lerp, WHITE_RGB, DEEP_SPACE_RGB } from './utils.js';
import { GENRES, MAIN_NODES, MAIN_NODE_BY_NAME, attachVectorsToNodesAndSubs, scheduleRecompute } from './genreEngine.js';

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

export function layoutMainGenreNodes() {
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


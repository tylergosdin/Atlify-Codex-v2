const ctx = self;

let D = 0;
let V = null;
let ROWS = 0;
let META = [];

function pushTopK(heap, sim, idx, K) {
  if (heap.length < K) {
    heap.push([sim, idx]);
    if (heap.length > 1) heap.sort((a, b) => a[0] - b[0]);
    return;
  }
  if (K <= 0) return;
  if (sim <= heap[0][0]) return;
  heap[0] = [sim, idx];
  heap.sort((a, b) => a[0] - b[0]);
}

ctx.onmessage = (event) => {
  const msg = event.data;
  if (!msg) return;
  if (msg.type === 'init') {
    D = msg.dims | 0;
    V = D > 0 ? new Float32Array(msg.buffer) : null;
    ROWS = V && D ? Math.floor(V.length / D) : 0;
    META = Array.isArray(msg.items) ? msg.items : [];
    ctx.postMessage({ type: 'ready' });
    return;
  }
  if (msg.type === 'topk') {
    if (!V || !D) {
      ctx.postMessage({ type: 'topk', id: msg.id, data: [] });
      return;
    }
    const mix = new Float32Array(msg.mix);
    const K = msg.K || 60;
    const heap = [];
    const total = Math.min(ROWS, META.length || ROWS);
    for (let i = 0; i < total; i++) {
      let dot = 0;
      const base = i * D;
      for (let j = 0; j < D; j++) {
        dot += V[base + j] * mix[j];
      }
      pushTopK(heap, dot, i, K);
    }
    heap.sort((a, b) => b[0] - a[0]);
    ctx.postMessage({ type: 'topk', id: msg.id, data: heap });
    return;
  }
};

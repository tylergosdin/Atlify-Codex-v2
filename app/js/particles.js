import { CONFIG, DOT_BASE_RGB } from './config.js';
import { ctx, camera, pointer, environment } from './appContext.js';
import { hash2D, smoothstep, lerp, rgbToCss } from './utils.js';
import { nebulaTintAt } from './nebula.js';

/** ========= Octave particles ========= */
export function getOctaveSpan() { return 2; }

export function drawOctave(i, time, alpha) {
  if (alpha <= 0.01) return;

  const Zi = Math.pow(2, i);
  const spacing = CONFIG.baseSpacing / Zi;
  const jitter = spacing * CONFIG.jitterFrac;

  const margin = 60 / camera.zoom;
  const left = camera.x - (environment.width / 2) / camera.zoom - margin;
  const right = camera.x + (environment.width / 2) / camera.zoom + margin;
  const top = camera.y - (environment.height / 2) / camera.zoom - margin;
  const bottom = camera.y + (environment.height / 2) / camera.zoom + margin;

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

export function octaveWeight(i, Z) {
  const lz = Math.log2(Z);
  const d = Math.abs(lz - i);
  const band = CONFIG.octaveBand;
  const w = 1 - smoothstep(band * 0.5, band, d);
  return w;
}


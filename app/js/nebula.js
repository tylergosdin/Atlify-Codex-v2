import { CONFIG, DOT_BASE_RGB } from './config.js';
import { ctx, camera } from './appContext.js';
import { MAIN_NODES } from './genreEngine.js';
import { clamp, mixRGB, tintTowards, fbm, lerp, WHITE_RGB, DEEP_SPACE_RGB } from './utils.js';

/** ========= Nebula rendering (bi-color + fBM alpha) ========= */
export function drawNebulae(time) {
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

export function drawLabels() {
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
export function nebulaTintAt(x, y) {
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


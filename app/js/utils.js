export function hash2D(ix, iy, seed = 1337) {
  let x = ix | 0;
  let y = iy | 0;
  let h = (x * 374761393) ^ (y * 668265263) ^ seed;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function smoothstep(a, b, t) {
  const span = b - a;
  if (span === 0) return t >= b ? 1 : 0;
  const x = clamp((t - a) / span, 0, 1);
  return x * x * (3 - 2 * x);
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function hexToRgb(hex) {
  const s = hex.replace('#', '');
  const normalized = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const n = parseInt(normalized, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function mixRGB(c1, c2, t) {
  return {
    r: lerp(c1.r, c2.r, t),
    g: lerp(c1.g, c2.g, t),
    b: lerp(c1.b, c2.b, t),
  };
}

export function clampRGB({ r, g, b }) {
  return {
    r: clamp(r, 0, 255),
    g: clamp(g, 0, 255),
    b: clamp(b, 0, 255),
  };
}

export function tintTowards(color, target, amount) {
  return clampRGB({
    r: lerp(color.r, target.r, amount),
    g: lerp(color.g, target.g, amount),
    b: lerp(color.b, target.b, amount),
  });
}

export function sampleGradientRgb(gradient, t) {
  if (!gradient.length) {
    return { r: 255, g: 255, b: 255 };
  }
  const v = clamp(t, 0, 1);
  if (v <= gradient[0].t) {
    return gradient[0].rgb;
  }
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

export function rgbToCss({ r, g, b }, a = 1) {
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

export function valueNoise(x, y, seed = 777) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const h00 = hash2D(xi, yi, seed);
  const h10 = hash2D(xi + 1, yi, seed);
  const h01 = hash2D(xi, yi + 1, seed);
  const h11 = hash2D(xi + 1, yi + 1, seed);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const i1 = h00 * (1 - u) + h10 * u;
  const i2 = h01 * (1 - u) + h11 * u;
  return i1 * (1 - v) + i2 * v;
}

export function fbm(x, y, octaves = 3, gain = 0.5, seed = 777) {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * frequency, y * frequency, seed + i * 971) * amplitude;
    norm += amplitude;
    amplitude *= gain;
    frequency *= 2;
  }
  return sum / Math.max(1e-6, norm);
}

export const WHITE_RGB = { r: 255, g: 255, b: 255 };
export const DEEP_SPACE_RGB = { r: 18, g: 18, b: 38 };

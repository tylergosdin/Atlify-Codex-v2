import { hexToRgb } from './utils.js';

export const CONFIG = {
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
  targetPxSizeVariation: 0.12,
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
  clusterRadius: 220,
  clusterJitter: 55,
  clusterMinDist: 70,
  clusterCountMin: 3,
  clusterCountMax: 6,
  clusterSpread: 460,
  clusterCenterJitter: 120,

  // Nebula fields
  nebulaRadius: 270,
  nebulaEdgeSoftness: 0.7,
  nebulaAlpha: 0.12,
  nebulaLayersMin: 4,
  nebulaLayersMax: 7,
  nebulaLayerJitter: 0.52,
  nebulaNoiseStrength: 0.42,
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

  // fBM noise for alpha modulation
  noiseScale: 0.004,
  noiseOctaves: 3,
  noiseGain: 0.5,
  noiseAlphaMin: 0.7,
  noiseAlphaMax: 1.0,
  noiseWarpStrength: 0.28,
  noiseWarpScale: 0.0026,
};

export const NEBULA_GRADIENT_STOPS = [
  { t: 0.0, color: '#18a7c9' },
  { t: 0.16, color: '#22c9aa' },
  { t: 0.32, color: '#5edb69' },
  { t: 0.48, color: '#c6e357' },
  { t: 0.63, color: '#f1a24a' },
  { t: 0.78, color: '#f45aa5' },
  { t: 0.9, color: '#b35cf4' },
  { t: 1.0, color: '#ff4a4a' },
];

export const NEBULA_GRADIENT = NEBULA_GRADIENT_STOPS.map((stop) => ({
  t: stop.t,
  rgb: hexToRgb(stop.color),
}));

export const DOT_BASE_RGB = hexToRgb('#e1e8ff');

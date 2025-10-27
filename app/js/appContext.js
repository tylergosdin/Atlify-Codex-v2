import { CONFIG } from './config.js';

export const canvas = document.getElementById('particle-map');
export const ctx = canvas.getContext('2d');

export const environment = {
  width: 0,
  height: 0,
  dpr: window.devicePixelRatio || 1,
  lastTime: 0,
};

export const pointer = {
  x: 0,
  y: 0,
  baseRadiusPx: 160,
  strengthBase: CONFIG.pointerStrength,
  active: true,
};

export const camera = { x: 0, y: 0, zoom: 1, targetZoom: 1, targetX: 0, targetY: 0 };

export const drag = {
  panActive: false,
  nodeActive: false,
  nodeIdx: -1,
  startMx: 0,
  startMy: 0,
  startTargetX: 0,
  startTargetY: 0,
  nodeGrabOffset: { x: 0, y: 0 },
};

export function setLastTime(value) {
  environment.lastTime = value;
}

export function screenToWorld(sx, sy) {
  const zx = camera.zoom;
  const wx = camera.x + (sx - environment.width / 2) / zx;
  const wy = camera.y + (sy - environment.height / 2) / zx;
  return { x: wx, y: wy };
}

export function worldToScreen(wx, wy) {
  const sx = (wx - camera.x) * camera.zoom + environment.width / 2;
  const sy = (wy - camera.y) * camera.zoom + environment.height / 2;
  return { x: sx, y: sy };
}

export function zoomAt(mouseX, mouseY, zoomFactor) {
  const worldUnderCursor = screenToWorld(mouseX, mouseY);
  const newTargetZoom = Math.max(CONFIG.minZoom, Math.min(CONFIG.maxZoom, camera.targetZoom * zoomFactor));
  camera.targetX = worldUnderCursor.x - (mouseX - environment.width / 2) / newTargetZoom;
  camera.targetY = worldUnderCursor.y - (mouseY - environment.height / 2) / newTargetZoom;
  camera.targetZoom = newTargetZoom;
}

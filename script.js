const canvas = document.getElementById('particle-map');
const ctx = canvas.getContext('2d');

const pointer = {
  x: 0,
  y: 0,
  radius: 160,
  strength: 24,
  active: false,
};

let width = 0;
let height = 0;
let dpr = window.devicePixelRatio || 1;
let particles = [];
let lastTime = 0;

class Particle {
  constructor(x, y) {
    this.baseX = x;
    this.baseY = y;
    this.x = x;
    this.y = y;
    this.seed = Math.random() * Math.PI * 2;
    this.wave = 6 + Math.random() * 12;
    this.size = 0.7 + Math.random() * 1.2;
    this.parallax = 0.3 + Math.random() * 0.7;
  }

  update(time) {
    const t = time * 0.0015;
    const noiseX = Math.sin(this.baseX * 0.012 + t * 1.3 + this.seed);
    const noiseY = Math.cos(this.baseY * 0.01 + t * 1.1 + this.seed);

    let targetX = this.baseX + noiseX * this.wave * this.parallax;
    let targetY = this.baseY + noiseY * this.wave;

    if (pointer.active) {
      const dx = pointer.x - this.baseX;
      const dy = pointer.y - this.baseY;
      const dist = Math.hypot(dx, dy);
      if (dist < pointer.radius) {
        const force = (pointer.radius - dist) / pointer.radius;
        const angle = Math.atan2(dy, dx);
        const repel = pointer.strength * force * this.parallax;
        targetX -= Math.cos(angle) * repel;
        targetY -= Math.sin(angle) * repel;
      }
    }

    this.x += (targetX - this.x) * 0.08;
    this.y += (targetY - this.y) * 0.08;
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = window.devicePixelRatio || 1;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  pointer.radius = Math.min(width, height) * 0.22;

  initParticles();
}

function initParticles() {
  particles = [];
  const area = width * height;
  const density = 0.00125; // particles per pixel
  const count = Math.max(400, Math.floor(area * density));
  const spacing = Math.sqrt(area / count);
  const jitter = spacing * 0.45;

  const cols = Math.ceil(width / spacing) + 1;
  const rows = Math.ceil(height / spacing) + 1;

  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x <= cols; x++) {
      const px = x * spacing + (Math.random() - 0.5) * jitter;
      const py = y * spacing + (Math.random() - 0.5) * jitter;
      if (px < -20 || px > width + 20 || py < -20 || py > height + 20) {
        continue;
      }
      particles.push(new Particle(px, py));
      if (particles.length >= count) {
        return;
      }
    }
  }
}

function animate(time) {
  requestAnimationFrame(animate);
  const delta = time - lastTime;
  lastTime = time;

  // subtle motion blur to create fluid look
  ctx.fillStyle = 'rgba(2, 2, 6, 0.18)';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(225, 232, 255, 0.78)';

  for (const particle of particles) {
    particle.update(time + delta * 0.5);
    particle.draw();
  }
}

function handlePointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = (event.clientX - rect.left);
  pointer.y = (event.clientY - rect.top);
  pointer.active = true;
}

function disablePointer() {
  pointer.active = false;
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

canvas.addEventListener('pointermove', handlePointer);
canvas.addEventListener('pointerdown', handlePointer);
canvas.addEventListener('pointerup', disablePointer);
canvas.addEventListener('pointerleave', disablePointer);
canvas.addEventListener('touchmove', (event) => {
  if (event.touches.length > 0) {
    handlePointer(event.touches[0]);
  }
}, { passive: true });
canvas.addEventListener('touchend', disablePointer, { passive: true });
canvas.addEventListener('touchcancel', disablePointer, { passive: true });

resize();
requestAnimationFrame(animate);

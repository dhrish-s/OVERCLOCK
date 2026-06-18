// confetti.js - a deliberately simple DOM-particle burst. No canvas, no
// library: a fixed-position overlay gets ~36 small divs with randomized
// color/drift/rotation, each riding the `confetti-fall` keyframe from
// animations.css, then removes itself. Reserved for Perfect Day and
// level-up - see DESIGN.md "restraint" note.

const COLORS = ['#FFB454', '#8B7CF6', '#4ADE80', '#E7E9EE'];

let layer = null;

function ensureLayer() {
  if (layer) return layer;
  layer = document.createElement('div');
  layer.id = 'confetti-layer';
  layer.style.position = 'fixed';
  layer.style.inset = '0';
  layer.style.pointerEvents = 'none';
  layer.style.zIndex = '999';
  layer.style.overflow = 'hidden';
  document.body.appendChild(layer);
  return layer;
}

export function burstConfetti(count = 42) {
  const root = ensureLayer();
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const left = Math.random() * 100;
    const drift = (Math.random() - 0.5) * 160;
    const size = 5 + Math.random() * 5;
    const duration = 1.6 + Math.random() * 1.2;
    const delay = Math.random() * 0.4;
    piece.style.position = 'absolute';
    piece.style.top = '-12px';
    piece.style.left = `${left}%`;
    piece.style.width = `${size}px`;
    piece.style.height = `${size * (Math.random() > 0.5 ? 1 : 2.2)}px`;
    piece.style.background = color;
    piece.style.opacity = '0.95';
    piece.style.setProperty('--drift', `${drift}px`);
    piece.style.animation = `confetti-fall ${duration}s ease-in ${delay}s forwards`;
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '1px';
    root.appendChild(piece);
    setTimeout(() => piece.remove(), (duration + delay) * 1000 + 200);
  }
}

/** A bigger, double-pass burst for level-ups, with a soft expanding ring
 * behind it so the moment reads as distinctly bigger than a perfect day. */
export function burstLevelUp() {
  burstConfetti(30);
  setTimeout(() => burstConfetti(30), 220);

  const ring = document.createElement('div');
  ring.style.position = 'fixed';
  ring.style.left = '50%';
  ring.style.top = '50%';
  ring.style.width = '120px';
  ring.style.height = '120px';
  ring.style.marginLeft = '-60px';
  ring.style.marginTop = '-60px';
  ring.style.borderRadius = '50%';
  ring.style.border = '2px solid var(--violet)';
  ring.style.pointerEvents = 'none';
  ring.style.zIndex = '999';
  ring.style.animation = 'level-up-ring 0.9s ease-out forwards';
  ensureLayer().appendChild(ring);
  setTimeout(() => ring.remove(), 1000);
}

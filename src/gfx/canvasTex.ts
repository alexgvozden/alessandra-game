import * as THREE from 'three';

export const FONT = "'Fredoka', 'Baloo 2', 'Arial Rounded MT Bold', sans-serif";

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function toTex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export type IconKind = 'play' | 'next' | 'replay' | 'home' | 'lock' | 'question' | 'left' | 'right' | 'help';

const iconCache = new Map<string, THREE.Texture>();

/** White chunky rounded icons with a soft shadow, drawn on a 256 canvas. */
export function iconTexture(kind: IconKind, color = '#ffffff'): THREE.Texture {
  const key = kind + color;
  if (iconCache.has(key)) return iconCache.get(key)!;
  const [c, g] = canvas(256, 256);
  g.translate(128, 128);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.shadowColor = 'rgba(80,40,120,0.35)';
  g.shadowBlur = 10;
  g.shadowOffsetY = 6;
  const tri = (pts: number[][]) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.lineWidth = 34; g.stroke(); g.fill(); };
  switch (kind) {
    case 'play': tri([[-38, -62], [-38, 62], [66, 0]]); break;
    case 'right': tri([[-30, -64], [-30, 64], [50, 0]]); break;
    case 'left': tri([[30, -64], [30, 64], [-50, 0]]); break;
    case 'next':
      g.beginPath(); g.moveTo(-70, -26); g.lineTo(10, -26); g.lineTo(10, -70); g.lineTo(78, 0); g.lineTo(10, 70); g.lineTo(10, 26); g.lineTo(-70, 26); g.closePath();
      g.lineWidth = 26; g.stroke(); g.fill(); break;
    case 'replay':
      g.lineWidth = 34; g.beginPath(); g.arc(0, 6, 62, -Math.PI * 0.35, Math.PI * 1.45); g.stroke();
      tri([[20, -92], [70, -52], [8, -30]]); break;
    case 'home':
      tri([[0, -78], [-86, 4], [86, 4]]);
      g.beginPath(); g.roundRect(-58, -6, 116, 86, 18); g.fill();
      g.shadowColor = 'transparent'; g.fillStyle = 'rgba(126,200,242,1)'; g.beginPath(); g.roundRect(-20, 26, 40, 54, 12); g.fill(); break;
    case 'lock':
      g.lineWidth = 26; g.beginPath(); g.arc(0, -22, 44, Math.PI, 0); g.lineTo(44, 10); g.moveTo(-44, 10); g.lineTo(-44, -22); g.stroke();
      g.beginPath(); g.roundRect(-72, -4, 144, 104, 26); g.fill();
      g.shadowColor = 'transparent'; g.fillStyle = 'rgba(150,145,170,1)'; g.beginPath(); g.arc(0, 38, 14, 0, Math.PI * 2); g.fill(); g.fillRect(-6, 40, 12, 32); break;
    case 'question':
    case 'help':
      g.font = `700 200px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 0, 12); break;
  }
  const t = toTex(c);
  iconCache.set(key, t);
  return t;
}

/** Bubbly text label (used for small UI numbers/labels that don't need to be 3D). */
export function labelTexture(text: string, opts: { size?: number; fill?: string; stroke?: string; w?: number; h?: number } = {}): THREE.Texture {
  const size = opts.size ?? 120;
  const [c, g] = canvas(opts.w ?? 512, opts.h ?? 256);
  g.font = `700 ${size}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.22;
  g.strokeStyle = opts.stroke ?? '#d9914a';
  g.strokeText(text, c.width / 2, c.height / 2 + size * 0.06);
  g.fillStyle = opts.fill ?? '#fff6e5';
  g.fillText(text, c.width / 2, c.height / 2 + size * 0.06);
  // glossy highlight
  g.globalCompositeOperation = 'source-atop';
  const grad = g.createLinearGradient(0, c.height / 2 - size / 2, 0, c.height / 2 + size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  return toTex(c);
}

/**
 * Particle atlas, 4x2 cells of 128px:
 * 0 soft glow, 1 twinkle, 2 star, 3 heart, 4 confetti, 5 bubble, 6 Z, 7 music note
 */
export function particleAtlas(): THREE.Texture {
  const [c, g] = canvas(512, 256);
  const cell = (i: number, fn: () => void) => { g.save(); g.translate((i % 4) * 128 + 64, Math.floor(i / 4) * 128 + 64); fn(); g.restore(); };
  g.fillStyle = '#fff';
  cell(0, () => { const r = g.createRadialGradient(0, 0, 0, 0, 0, 60); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(-64, -64, 128, 128); });
  cell(1, () => {
    const r = g.createRadialGradient(0, 0, 0, 0, 0, 30); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(-64, -64, 128, 128);
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -60); g.quadraticCurveTo(6, -6, 60, 0); g.quadraticCurveTo(6, 6, 0, 60); g.quadraticCurveTo(-6, 6, -60, 0); g.quadraticCurveTo(-6, -6, 0, -60); g.fill();
  });
  cell(2, () => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 24 : 56; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = '#fff'; g.stroke(); g.fill(); });
  cell(3, () => { g.beginPath(); g.moveTo(0, 50); g.bezierCurveTo(-70, 0, -40, -60, 0, -24); g.bezierCurveTo(40, -60, 70, 0, 0, 50); g.fill(); });
  cell(4, () => { g.beginPath(); g.roundRect(-34, -18, 68, 36, 10); g.fill(); });
  cell(5, () => {
    g.lineWidth = 7; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(0, 0, 50, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(-18, -22, 14, 8, -0.7, 0, Math.PI * 2); g.fill();
  });
  cell(6, () => { g.font = `700 110px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Z', 0, 6); });
  cell(7, () => { g.beginPath(); g.ellipse(-14, 34, 26, 20, -0.4, 0, Math.PI * 2); g.fill(); g.fillRect(6, -54, 12, 90); g.beginPath(); g.moveTo(18, -54); g.quadraticCurveTo(56, -40, 44, -6); g.quadraticCurveTo(46, -30, 18, -30); g.fill(); });
  const t = toTex(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Vertical gradient texture. */
export function gradientTexture(stops: [number, string][], w = 4, h = 256): THREE.Texture {
  const [c, g] = canvas(w, h);
  const grad = g.createLinearGradient(0, 0, 0, h);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  return toTex(c);
}

/** Cream page decoration: faint swirls & stars embossed in the corners. */
export function pageTexture(): THREE.Texture {
  const [c, g] = canvas(1024, 576);
  g.fillStyle = '#fff6e5';
  g.fillRect(0, 0, 1024, 576);
  const r = g.createRadialGradient(512, 288, 100, 512, 288, 620);
  r.addColorStop(0, 'rgba(255,255,255,0.35)');
  r.addColorStop(1, 'rgba(230,200,160,0.25)');
  g.fillStyle = r;
  g.fillRect(0, 0, 1024, 576);
  g.strokeStyle = 'rgba(214,176,128,0.45)';
  g.lineWidth = 5;
  g.lineCap = 'round';
  const swirl = (x: number, y: number, s: number, flip: number) => {
    g.save(); g.translate(x, y); g.scale(s * flip, s);
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(30, -60, 90, -40, 80, 0); g.bezierCurveTo(70, 30, 30, 20, 40, 0);
    g.moveTo(0, 0); g.bezierCurveTo(60, 20, 120, 20, 160, -10); g.stroke();
    g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? 7 : 16; g.lineTo(170 + Math.cos(a) * rr, -40 + Math.sin(a) * rr); } g.closePath(); g.stroke();
    g.restore();
  };
  swirl(40, 530, 1, 1);
  swirl(984, 530, 1, -1);
  return toTex(c);
}

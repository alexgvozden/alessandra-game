import * as THREE from 'three';

export function roundedRectShape(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape();
  addRoundedRect(s, w, h, r, cx, cy, false);
  return s;
}

function addRoundedRect(p: THREE.Path, w: number, h: number, r: number, cx: number, cy: number, reverse: boolean) {
  const x0 = cx - w / 2, y0 = cy - h / 2, x1 = cx + w / 2, y1 = cy + h / 2;
  r = Math.min(r, w / 2, h / 2);
  if (!reverse) {
    p.moveTo(x0 + r, y0);
    p.lineTo(x1 - r, y0); p.quadraticCurveTo(x1, y0, x1, y0 + r);
    p.lineTo(x1, y1 - r); p.quadraticCurveTo(x1, y1, x1 - r, y1);
    p.lineTo(x0 + r, y1); p.quadraticCurveTo(x0, y1, x0, y1 - r);
    p.lineTo(x0, y0 + r); p.quadraticCurveTo(x0, y0, x0 + r, y0);
  } else {
    p.moveTo(x0 + r, y0);
    p.quadraticCurveTo(x0, y0, x0, y0 + r); p.lineTo(x0, y1 - r);
    p.quadraticCurveTo(x0, y1, x0 + r, y1); p.lineTo(x1 - r, y1);
    p.quadraticCurveTo(x1, y1, x1, y1 - r); p.lineTo(x1, y0 + r);
    p.quadraticCurveTo(x1, y0, x1 - r, y0); p.lineTo(x0 + r, y0);
  }
}

/** A puffy rounded slab (tile, key, panel). Front face at +z. */
export function puffySlab(w: number, h: number, r: number, depth: number, bevel: number, curveSegments = 8): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w - bevel * 2, h - bevel * 2, Math.max(1, r - bevel)), {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments,
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

/** A rounded-rectangle ring (picture frame). */
export function frameGeometry(ow: number, oh: number, or: number, iw: number, ih: number, ir: number, depth: number, bevel: number) {
  const s = roundedRectShape(ow - bevel * 2, oh - bevel * 2, or - bevel);
  const hole = new THREE.Path();
  addRoundedRect(hole, iw + bevel * 2, ih + bevel * 2, ir + bevel, 0, 0, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** A plane with rounded corners (for pictures / stickers). UVs span 0..1. */
export function roundedPlane(w: number, h: number, r: number): THREE.ShapeGeometry {
  const g = new THREE.ShapeGeometry(roundedRectShape(w, h, r), 10);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / w + 0.5;
    uv[i * 2 + 1] = pos.getY(i) / h + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** A soft rounded star outline. */
export function starShape(outer: number, inner: number, points = 5, round = 0.28): THREE.Shape {
  const s = new THREE.Shape();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 === 0 ? outer : inner;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  const n = pts.length;
  const mid = (a: THREE.Vector2, b: THREE.Vector2, t: number) => a.clone().lerp(b, t);
  const start = mid(pts[0], pts[1], round);
  s.moveTo(start.x, start.y);
  for (let i = 1; i <= n; i++) {
    const p = pts[i % n], prev = pts[i - 1], next = pts[(i + 1) % n];
    const a = mid(p, prev, round), b = mid(p, next, round);
    s.lineTo(a.x, a.y);
    s.quadraticCurveTo(p.x, p.y, b.x, b.y);
  }
  return s;
}

const starCache = new Map<number, THREE.ExtrudeGeometry>();
export function starGeometry(size: number): THREE.ExtrudeGeometry {
  if (!starCache.has(size)) {
    const g = new THREE.ExtrudeGeometry(starShape(size, size * 0.52), {
      depth: size * 0.18, bevelEnabled: true, bevelThickness: size * 0.16, bevelSize: size * 0.1, bevelSegments: 6, curveSegments: 6,
    });
    g.center();
    g.computeVertexNormals();
    starCache.set(size, g);
  }
  return starCache.get(size)!;
}

/** A chunky round button body: a disc with a fully rounded rim (lathe profile). Faces +z. */
export function puffyDisc(radius: number, thickness: number, segments = 64): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  const rr = thickness / 2;
  pts.push(new THREE.Vector2(0, -thickness / 2));
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 2 + (i / 12) * Math.PI;
    pts.push(new THREE.Vector2(radius - rr + Math.cos(a) * rr, Math.sin(a) * rr));
  }
  // domed top
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector2((radius - rr) * (1 - t), thickness / 2 + Math.sin(t * Math.PI / 2) * thickness * 0.12));
  }
  const g = new THREE.LatheGeometry(pts, segments);
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

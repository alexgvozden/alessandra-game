import * as THREE from 'three';
import opentype from 'opentype.js';
import fontUrl from '@fontsource/fredoka/files/fredoka-latin-700-normal.woff?url';
import { candy } from './materials';
import { PALETTE } from '../core/layout';

let font: opentype.Font | null = null;

export async function loadFont(): Promise<void> {
  const buf = await (await fetch(fontUrl)).arrayBuffer();
  font = opentype.parse(buf);
}

const UNITS = 100; // glyphs are built at this size and scaled per use

interface Contour { path: THREE.Path; area: number; pts: THREE.Vector2[] }

function signedArea(pts: THREE.Vector2[]) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function inside(pt: THREE.Vector2, poly: THREE.Vector2[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Glyph outline as three.js shapes (holes resolved by winding + containment). */
function glyphShapes(ch: string): THREE.Shape[] {
  if (!font) throw new Error('font not loaded');
  const path = font.getPath(ch, 0, 0, UNITS);
  const contours: Contour[] = [];
  let cur: THREE.Path | null = null;
  const flush = () => {
    if (cur && cur.curves.length) {
      const pts = cur.getPoints(6);
      contours.push({ path: cur, area: signedArea(pts), pts });
    }
    cur = null;
  };
  for (const c of path.commands) {
    if (c.type === 'M') { flush(); cur = new THREE.Path(); cur.moveTo(c.x, -c.y); }
    else if (c.type === 'L') cur!.lineTo(c.x, -c.y);
    else if (c.type === 'Q') cur!.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y);
    else if (c.type === 'C') cur!.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y);
    else if (c.type === 'Z') { const p0 = cur!.curves.length ? cur!.getPoint(0) : null; if (p0) cur!.lineTo(p0.x, p0.y); flush(); }
  }
  flush();
  if (!contours.length) return [];
  const big = contours.reduce((a, b) => (Math.abs(b.area) > Math.abs(a.area) ? b : a));
  const solidSign = Math.sign(big.area);
  const solids = contours.filter((c) => Math.sign(c.area) === solidSign);
  const holes = contours.filter((c) => Math.sign(c.area) !== solidSign);
  return solids.map((s) => {
    const shape = new THREE.Shape();
    shape.curves = s.path.curves;
    shape.currentPoint = s.path.currentPoint;
    for (const h of holes) if (inside(h.pts[0], s.pts)) shape.holes.push(h.path);
    return shape;
  });
}

export function advance(ch: string, size: number): number {
  if (!font) return size * 0.6;
  return (font.charToGlyph(ch).advanceWidth ?? 600) * (size / font.unitsPerEm);
}

const geoCache = new Map<string, THREE.BufferGeometry>();

/** Extruded candy glyph, centred on its bounding box, `size` ≈ cap height in world units. */
export function glyphGeometry(ch: string, outline = false): THREE.BufferGeometry {
  const key = ch + (outline ? ':o' : '');
  let g = geoCache.get(key);
  if (!g) {
    const shapes = glyphShapes(ch);
    g = new THREE.ExtrudeGeometry(shapes, outline
      ? { depth: 4, bevelEnabled: true, bevelThickness: 4, bevelSize: 7, bevelSegments: 3, curveSegments: 6 }
      : { depth: 10, bevelEnabled: true, bevelThickness: 7, bevelSize: 3.2, bevelSegments: 5, curveSegments: 7 });
    // Centre using the plain glyph bounds so outline and fill line up.
    const ref = outline ? glyphGeometry(ch, false) : g;
    if (!outline) { g.computeBoundingBox(); }
    const bb = ref.boundingBox ?? (ref.computeBoundingBox(), ref.boundingBox!);
    if (!outline) {
      const c = bb.getCenter(new THREE.Vector3());
      g.translate(-c.x, -c.y, 0);
      g.userData.center = c;
      g.computeBoundingBox();
    } else {
      const c = (ref.userData.center as THREE.Vector3) ?? new THREE.Vector3();
      g.translate(-c.x, -c.y, -6);
    }
    g.computeVertexNormals();
    geoCache.set(key, g);
  }
  return g;
}

/** Cap height of the built glyphs (for scaling to a requested size). */
const CAP = 70;

export interface CandyLetterOpts {
  color?: THREE.ColorRepresentation;
  outline?: THREE.ColorRepresentation | null;
  material?: THREE.Material;
}

/** A single 3D candy letter. The inner `body` group is safe to animate (squash, wobble). */
export class CandyLetter extends THREE.Group {
  body = new THREE.Group();
  fill: THREE.Mesh;
  rim: THREE.Mesh | null = null;
  readonly char: string;

  constructor(ch: string, size: number, opts: CandyLetterOpts = {}) {
    super();
    this.char = ch;
    const s = size / CAP;
    this.add(this.body);
    this.fill = new THREE.Mesh(glyphGeometry(ch), opts.material ?? candy(opts.color ?? PALETTE.cream));
    this.fill.scale.setScalar(s);
    this.body.add(this.fill);
    if (opts.outline !== null) {
      this.rim = new THREE.Mesh(glyphGeometry(ch, true), candy(opts.outline ?? PALETTE.outline, { rough: 0.45 }));
      this.rim.scale.setScalar(s);
      this.body.add(this.rim);
    }
  }

  setMaterial(m: THREE.Material) { this.fill.material = m; }
}

/** A horizontal word of candy letters, centred at the origin. */
export class CandyWord extends THREE.Group {
  letters: CandyLetter[] = [];
  width = 0;

  constructor(text: string, size: number, colorFor: (i: number, ch: string) => THREE.ColorRepresentation, opts: { outline?: THREE.ColorRepresentation | null; tracking?: number } = {}) {
    super();
    const scale = size / CAP;
    const widths = [...text].map((ch) => advance(ch, UNITS) * scale + (opts.tracking ?? size * 0.04));
    this.width = widths.reduce((a, b) => a + b, 0);
    let x = -this.width / 2;
    [...text].forEach((ch, i) => {
      const w = widths[i];
      if (ch !== ' ') {
        const l = new CandyLetter(ch, size, { color: colorFor(i, ch), outline: opts.outline });
        l.position.x = x + w / 2;
        // Glyphs are bbox-centred; shift back so every letter sits on the same baseline.
        const c = glyphGeometry(ch).userData.center as THREE.Vector3;
        l.position.y = (c.y - CAP / 2) * scale;
        this.add(l);
        this.letters.push(l);
      }
      x += w;
    });
  }
}

/* Polysmith engine: settings -> a finished design (parts, nested sheets, SVG/DXF, jig, guide, README).
   Pure: no DOM. Used by the page (index.html) and by Node (polysmith-api.js). Needs geom.js (window.Poly) first.
   All lengths are millimetres. */
(function (G) {
'use strict';
const P = G.Poly;
if (!P) throw new Error('Polysmith engine needs geom.js loaded first');
const VERSION = '1.0.0';
const IN = 25.4, TAU = Math.PI * 2, deg = r => r * 180 / Math.PI;

/* ---------- settings ---------- */
const DEF = {
  solid: 'icosa', mode: 'tab', units: 'mm', measure: 'edge', size: 80, t: 3, kerf: 0.15, fit: 0.05,
  perEdge: 1, tabLen: 0, protrude: 0, patDensity: 4, bridge: 2.5, fingerW: 0, fingerStyle: 'flush', deckColor: '#3f9aa0', material: 'ply', matColor: '#e0473c', opacity: 60, artMode: 'fill', artScale: 80, artRot: 0, artWhere: 'all', window: 'none', windowPct: 60, dice: false,
  tabH: 8, fold: 'score', copies: 1, sheetW: 600, sheetH: 400, margin: 5, spacing: 3, sheetPreset: '600x400',
};
const SOLIDS = ['tetra', 'cube', 'octa', 'dodeca', 'icosa'];
const MODES = [
  { id: 'tab', name: 'Slot & bracket', about: 'Glue-free press fit. Wood, MDF, acrylic.' },
  { id: 'finger', name: 'Finger joints', about: "Interlocking edges, set to this solid's angle." },
  { id: 'block', name: 'Glue blocks', about: 'Clean faces with hidden inside blocks.' },
  { id: 'none', name: 'Edge-glued', about: 'Bare panels plus angle jigs. Acrylic.' },
  { id: 'net', name: 'Folding net', about: 'One piece. Card, paper, chipboard.' },
];
/* materials: colours for 3D, opacity (a), light transmission for lamp mode (tr), typical kerf; op = default opacity % for see-through ones */
const MATS = {
  ply: { name: 'Birch plywood', face: [222, 184, 135], inn: [176, 140, 98], edge: [150, 108, 66], a: 1, tr: 0, kerf: 0.15 },
  mdf: { name: 'MDF', face: [176, 138, 100], inn: [160, 124, 90], edge: [96, 70, 48], a: 1, tr: 0, kerf: 0.15 },
  bamboo: { name: 'Bamboo ply', face: [222, 194, 132], inn: [204, 172, 112], edge: [172, 132, 78], a: 1, tr: 0, kerf: 0.15 },
  walnut: { name: 'Walnut', face: [128, 88, 60], inn: [112, 76, 52], edge: [84, 56, 38], a: 1, tr: 0, kerf: 0.15 },
  clear: { name: 'Clear acrylic', face: [205, 228, 236], inn: [190, 215, 225], edge: [170, 215, 232], a: 0.22, tr: 0.85, kerf: 0.1, tint: [1, 1, 1], op: 20 },
  frost: { name: 'Frosted acrylic', face: [236, 240, 242], inn: [226, 232, 235], edge: [214, 226, 232], a: 0.8, tr: 0.45, kerf: 0.1, tint: [1, 1, 1], op: 60 },
  color: { name: 'Coloured acrylic', a: 0.55, tr: 0.6, kerf: 0.1, tinted: true, op: 45 },
  black: { name: 'Black acrylic', face: [38, 38, 42], inn: [30, 30, 34], edge: [20, 20, 22], a: 1, tr: 0, kerf: 0.1 },
  card: { name: 'Cardstock', face: [246, 240, 228], inn: [222, 210, 188], edge: [200, 190, 170], a: 1, tr: 0.12, kerf: 0.05, tint: [1, 0.95, 0.85] },
};
const WINDOWS = [
  { id: 'none', name: 'None', kind: 'none' }, { id: 'circle', name: 'Circle', kind: 'window' }, { id: 'poly', name: 'Polygon', kind: 'window' }, { id: 'star', name: 'Star', kind: 'window' },
  { id: 'dots', name: 'Dots', kind: 'pattern' }, { id: 'honeycomb', name: 'Honeycomb', kind: 'pattern' }, { id: 'diamonds', name: 'Diamond lattice', kind: 'pattern' }, { id: 'voronoi', name: 'Voronoi cells', kind: 'pattern' },
  { id: 'starfield', name: 'Starfield', kind: 'pattern' }, { id: 'sunburst', name: 'Sunburst', kind: 'pattern' }, { id: 'rings', name: 'Rings', kind: 'pattern' }, { id: 'moonstars', name: 'Moon & stars', kind: 'pattern' }, { id: 'leaves', name: 'Flower', kind: 'pattern' },
];
const SHEETS = { '304.8x304.8': '12 × 12″', '304.8x508': '12 × 20″', '304.8x609.6': '12 × 24″', '457.2x609.6': '18 × 24″', '609.6x914.4': '24 × 36″', '300x300': '300 × 300 mm', '600x400': '600 × 400 mm', '900x600': '900 × 600 mm', '1300x900': '1300 × 900 mm', custom: 'Custom' };
const ENUMS = {
  solid: SOLIDS, mode: MODES.map(m => m.id), units: ['mm', 'in'], measure: ['edge', 'sphere', 'height'], fingerStyle: ['flush', 'full', 'bevel'],
  material: Object.keys(MATS), window: WINDOWS.map(w => w.id), artMode: ['fill', 'line', 'cut'], artWhere: ['all', 'one'], fold: ['score', 'perf'], perEdge: [1, 2, 3],
};
const RANGES = { // [min, max, integer?]
  size: [0.001, 1e5], t: [0.001, 100], kerf: [0, 5], fit: [-5, 5], tabLen: [0, 1e4], protrude: [0, 1e3], patDensity: [1, 10, true], bridge: [0.1, 100],
  fingerW: [0, 1e4], opacity: [5, 100], artScale: [20, 150], artRot: [0, 360], windowPct: [10, 100], tabH: [0.1, 1e3], copies: [1, 500, true],
  sheetW: [1, 1e5], sheetH: [1, 1e5], margin: [0, 1e4], spacing: [0, 1e4],
};
const isRec = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = v => JSON.parse(JSON.stringify(v));

function check(key, v) {
  if (!Object.prototype.hasOwnProperty.call(DEF, key)) throw new RangeError('Unknown setting: ' + key);
  const d = DEF[key];
  if (typeof d === 'number') { if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(key + ' must be a number'); }
  else if (typeof v !== typeof d) throw new TypeError(key + ' must be a ' + typeof d);
  if (ENUMS[key] && !ENUMS[key].includes(v)) throw new RangeError(key + ' must be one of: ' + ENUMS[key].join(', '));
  if (RANGES[key]) { const [a, b, int] = RANGES[key]; if (v < a || v > b) throw new RangeError(`${key} must be between ${a} and ${b}`); if (int && !Number.isInteger(v)) throw new RangeError(key + ' must be a whole number'); }
  if (/Color$/.test(key) && !/^#[0-9a-f]{6}$/i.test(v)) throw new RangeError(key + ' must look like #rrggbb');
  if (key === 'sheetPreset' && !SHEETS[v]) throw new RangeError('sheetPreset must be one of: ' + Object.keys(SHEETS).join(', '));
}
/** Full settings from defaults plus overrides. Choosing a material (without a kerf) also sets its typical kerf and opacity,
    and a sheetPreset (without sheetW/sheetH) sets the sheet size, as the page does. */
function create(over = {}, base = DEF) {
  if (!isRec(over)) throw new TypeError('Settings must be an object');
  for (const [k, v] of Object.entries(over)) check(k, v);
  const s = { ...DEF, ...base, ...over };
  if (over.material !== undefined && over.kerf === undefined) s.kerf = MATS[s.material].kerf;
  if (over.material !== undefined && over.opacity === undefined && MATS[s.material].op) s.opacity = MATS[s.material].op;
  if (over.sheetPreset !== undefined && over.sheetPreset !== 'custom' && over.sheetW === undefined && over.sheetH === undefined) { const [w, h] = over.sheetPreset.split('x').map(Number); s.sheetW = w; s.sheetH = h; }
  else if ((over.sheetW !== undefined || over.sheetH !== undefined) && over.sheetPreset === undefined) s.sheetPreset = SHEETS[s.sheetW + 'x' + s.sheetH] ? s.sheetW + 'x' + s.sheetH : 'custom';
  return s;
}
const normalize = s => create(isRec(s) ? s : {}, DEF);
function edgeFromSize(st) {
  const S = P.solid(st.solid);
  if (st.measure === 'edge') return st.size;
  if (st.measure === 'sphere') return st.size / (2 * S.R);
  return st.size / S.height;
}
function sizeFromEdge(st, L) { const S = P.solid(st.solid); return st.measure === 'edge' ? L : st.measure === 'sphere' ? L * 2 * S.R : L * S.height; }

/* ---------- artwork: polylines -> a normalised drawing (unit circle, y-up, centred on its convex hull) ---------- */
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let md = 0, mi = -1;
    const A = pts[a], B = pts[b], dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const P0 = pts[i]; let d;
      if (L2 < 1e-12) d = Math.hypot(P0[0] - A[0], P0[1] - A[1]);
      else { const tt = Math.max(0, Math.min(1, ((P0[0] - A[0]) * dx + (P0[1] - A[1]) * dy) / L2)); d = Math.hypot(P0[0] - A[0] - tt * dx, P0[1] - A[1] - tt * dy); }
      if (d > md) { md = d; mi = i; }
    }
    if (md > eps && mi > 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
/** raw: [{pts:[[x,y]...], white?}] in y-up coordinates. Returns {name, svg, polys:[{pts, closed}], texts}. */
function normalizeArt(raw, { name, svg = '', texts = 0 } = {}) {
  const polys = raw.map(r => { const pts = Array.isArray(r) ? r : r.pts; const o = pts.map(q => [+q[0], +q[1]]); o.white = !!r.white; return o; })
    .filter(pl => pl.length > 1 && pl.every(q => Number.isFinite(q[0]) && Number.isFinite(q[1])));
  const bb = arr => { let a = Infinity, b2 = Infinity, c = -Infinity, d = -Infinity; arr.forEach(pl => pl.forEach(q => { a = Math.min(a, q[0]); b2 = Math.min(b2, q[1]); c = Math.max(c, q[0]); d = Math.max(d, q[1]); })); return { w: c - a, h: d - b2 }; };
  const ink = polys.filter(pl => !pl.white);
  if (ink.length) { // drop white background panels: white shapes as big as the whole drawing
    const B = bb(ink);
    for (let i = polys.length - 1; i >= 0; i--) if (polys[i].white) { const w = bb([polys[i]]); if (w.w >= B.w * 0.9 && w.h >= B.h * 0.9) polys.splice(i, 1); }
  }
  if (!polys.length) throw new Error(texts ? 'This SVG only has text. Convert text to paths (outlines) in your design app, then upload again.' : 'No drawable shapes found in that SVG.');
  const all = []; polys.forEach(pl => pl.forEach(q => all.push(q)));
  all.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const q of all) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = all.length - 1; i >= 0; i--) { const q = all[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  const hull = lo.slice(0, -1).concat(up.slice(0, -1));
  let A = 0, hx = 0, hy = 0;
  for (let i = 0; i < hull.length; i++) { const p0 = hull[i], p1 = hull[(i + 1) % hull.length], w = p0[0] * p1[1] - p1[0] * p0[1]; A += w; hx += (p0[0] + p1[0]) * w; hy += (p0[1] + p1[1]) * w; }
  let cx, cy;
  if (Math.abs(A) > 1e-9) { cx = hx / (3 * A); cy = hy / (3 * A); }
  else { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; all.forEach(q => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }); cx = (x0 + x1) / 2; cy = (y0 + y1) / 2; }
  let r = 0;
  polys.forEach(pl => pl.forEach(q => { r = Math.max(r, Math.hypot(q[0] - cx, q[1] - cy)); }));
  r = r || 1;
  const out = polys.map(pl => {
    let pts = pl.map(q => [(q[0] - cx) / r, (q[1] - cy) / r]);
    const closed = pts.length > 3 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.01;
    pts = rdp(pts, 0.0012); if (closed && pts.length > 3) pts.pop();
    return { pts, closed: closed && pts.length >= 3 };
  }).filter(pl => pl.pts.length >= 2);
  return { name: name || 'artwork.svg', svg, polys: out, texts };
}
function checkArt(art) {
  if (art == null) return null;
  if (!isRec(art) || !Array.isArray(art.polys)) throw new TypeError('art must be an artwork object from art.fromSVG or art.fromPolylines');
  art.polys.forEach(pl => { if (!isRec(pl) || !Array.isArray(pl.pts) || pl.pts.some(q => !Array.isArray(q) || !Number.isFinite(q[0]) || !Number.isFinite(q[1]))) throw new TypeError('art.polys must be [{ pts: [[x, y], ...], closed }]'); });
  return art;
}
function artRadius(st, R, mode) {
  const inf = R.res.info, t = st.t;
  if (st.mode === 'net') { const n = R.S.sides; return R.L / (2 * Math.tan(Math.PI / n)) * 0.82; }
  if (inf.finger) return mode === 'cut' ? inf.finger.a - inf.finger.v - Math.max(2 * t, 4) : inf.finger.a - inf.finger.v - 1;
  if (mode === 'cut') return inf.per > 0 ? inf.ap - inf.D - Math.max(t, 2.5) : inf.ap - Math.max(2 * t, 4);
  return inf.ap - Math.max(1.2 * t, 2.5);
}
function applyArt(st, R, ART) {
  const res = R.res, S = R.S; res.artFace = null;
  if (!ART) return;
  const mode = st.artMode, rot = st.artRot * Math.PI / 180, nS = S.sides;
  // polygon norm: how far the (rotated) art reaches toward each edge of the face; 1 = touches the inscribed circle
  let pn = 1e-6; const ca0 = Math.cos(rot), sa0 = Math.sin(rot);
  ART.polys.forEach(pl => pl.pts.forEach(p => { const x = p[0] * ca0 - p[1] * sa0, y = p[0] * sa0 + p[1] * ca0; for (let k = 0; k < nS; k++) { const ph = -Math.PI / 2 + k * TAU / nS; pn = Math.max(pn, x * Math.cos(ph) + y * Math.sin(ph)); } }));
  const rad = Math.max(1, artRadius(st, R, mode)) * st.artScale / 100 / pn;
  const tf = (pts, c, r, a) => { const ca = Math.cos(a), sa = Math.sin(a); return pts.map(p => [c[0] + (p[0] * ca - p[1] * sa) * r, c[1] + (p[0] * sa + p[1] * ca) * r]); };
  const emit = (part, c, r, a) => {
    part.fills = part.fills || [];
    ART.polys.forEach(pl => { const o = { pts: tf(pl.pts, c, r, a), closed: pl.closed };
      if (mode === 'cut' && pl.closed) part.cuts.push(o); else if (mode === 'fill' && pl.closed) part.fills.push(o); else part.marks.push(o); });
  };
  res.artFace = { r: rad, rot, mode };
  if (st.mode === 'net') {
    const part = res.parts[0], pos = res.info.pos; if (!pos) return;
    res.artFace.net = [];
    pos.forEach((pp, f) => {
      if (st.artWhere === 'one' && f !== 0) return;
      let cx = 0, cy = 0; pp.forEach(q => { cx += q[0]; cy += q[1]; }); cx /= pp.length; cy /= pp.length;
      const a = Math.atan2(pp[1][1] - pp[0][1], pp[1][0] - pp[0][0]) + rot;
      emit(part, [cx, cy], rad, a); res.artFace.net.push({ f, c: [cx, cy], a });
    });
    return;
  }
  const faces = res.parts.filter(p => /^Face/.test(p.name));
  if (st.artWhere === 'one') {
    const f0 = faces[0]; if (!f0) return;
    if (f0.count > 1) {
      const copy = { ...f0, name: f0.name + ' (art)', count: 1, cuts: f0.cuts.slice(), marks: f0.marks.slice(), scores: (f0.scores || []).slice(), fills: [] };
      f0.count -= 1; res.parts.splice(res.parts.indexOf(f0), 0, copy); emit(copy, [0, 0], rad, rot);
    } else emit(f0, [0, 0], rad, rot);
  } else faces.forEach(f => emit(f, [0, 0], rad, rot));
  if (mode === 'cut') res.warn.push({ lvl: 'info', msg: 'Cut-through artwork: any island inside a closed shape will fall out. Stencil-style designs work best.' });
}

/* ---------- compute ---------- */
/** The page's internal result for one design: { st, L, res, pk, cut, score, S, jig, art }. */
function compute(st, art) {
  const L = edgeFromSize(st);
  const base = { solid: st.solid, L, t: st.t, kerf: st.kerf, fit: st.fit };
  let res;
  if (st.mode === 'net') res = P.net({ ...base, tabH: st.tabH, fold: st.fold, dice: st.dice, copies: st.copies, window: st.window, windowPct: st.windowPct, patDensity: st.patDensity, bridge: st.bridge });
  else res = P.panels({ ...base, joint: st.mode, perEdge: st.perEdge, tabLen: st.tabLen, fingerW: st.fingerW, fingerStyle: st.fingerStyle, protrude: st.protrude, window: st.window, windowPct: st.windowPct, patDensity: st.patDensity, bridge: st.bridge, dice: st.dice });
  const S = P.solid(st.solid), R = { st, L, res, S, art: art || null };
  applyArt(st, R, art);
  let jig = null;
  if (st.mode === 'finger' && st.fingerStyle === 'bevel' && res.info.finger) jig = P.jigStation(S, L, st.t, res.info.finger, { kerf: st.kerf, fit: st.fit, bedW: st.sheetW, bedH: st.sheetH });
  const pk = P.pack(res.parts, st.sheetW, st.sheetH, st.margin, st.spacing);
  let cut = 0, score = 0;
  pk.sheets.forEach(sh => { sh.cuts.forEach(c => { cut += P.perim(c); }); sh.scores.forEach(c => { score += P.perim(c); }); });
  return Object.assign(R, { pk, cut, score, jig });
}
const sheetDims = (st, sh) => sh.oversize ? [Math.ceil(sh.oversize.w), Math.ceil(sh.oversize.h)] : [st.sheetW, st.sheetH];
const modeWord = m => m === 'net' ? 'net' : m === 'tab' ? 'slotted' : m === 'finger' ? 'finger' : m === 'block' ? 'glueblock' : 'panels';
const baseName = R => `polysmith-${R.S.name.toLowerCase()}-${modeWord(R.st.mode)}-${Math.round(R.L)}mm-edge-${R.st.t}mm`;
const fname = (R, i, ext) => `${baseName(R)}-sheet${i + 1}of${R.pk.sheets.length}.${ext}`;

function guideText(R) {
  const st = R.st, S = R.S, n = S.faces.length;
  if (st.mode === 'tab') return [
    'Cut the fit coupon first in the same sheet. Push a bracket tab into each slot. Pick the one that needs firm thumb pressure, then add that number to Fit. (The middle "0" slot is your current setting.)',
    `Every face is identical and every bracket is identical (${R.res.info.per * S.edges.length} brackets). No sorting needed.`,
    'Push a bracket into one slot of a face from the inside. The tab ends flush with the outside.',
    'Each face slides straight on, perpendicular to itself. So build outward from one face, adding brackets to open edges as you go.',
    'The last face drops straight down onto its brackets. That\'s the whole point of this joint: no wrestling the final piece.',
    'If a joint is loose, a dot of wood glue on the tab from inside fixes it. Tight? Raise Fit by 0.05 mm.',
  ];
  if (st.mode === 'finger') return [
    `Every face is identical: ${S.faces.length} pieces, ${R.res.info.finger.N} fingers per edge. Each edge starts with a finger at one corner and ends with a notch at the other, so any face meets any other face.`,
    'The fingers are offset for the ' + deg(S.dihedral).toFixed(2) + '° angle between faces, so the faces lock at exactly the right angle once they\'re pushed together. That makes them self-jigging.',
    'Build outward from one face. Each new face goes on straight, perpendicular to itself, and the last face drops in the same way.',
    st.fingerStyle === 'bevel' ? 'Bevelled teeth: every tooth tip and notch bottom is cut at the face angle, so the joint closes with no gaps and nothing to sand. Cut the faces flat, then bevel them in the jig (see the Bevel jig card).' : st.fingerStyle === 'full' ? 'Full teeth stand slightly proud along the edges. Glue up, then sand or file them flush for crisp edges.' : 'Flush teeth never stick out. ' + (S.dihedral > Math.PI / 2 + 0.01 ? 'On this solid you\'ll see small V-notches beside each tooth along the edges, which is normal for angled finger joints. Switch to Full teeth and sand if you want them filled.' : 'The edges come out clean.'),
    'Wood glue on the fingers makes it permanent. For a dry fit, raise Fit by 0.05 mm at a time until it goes together with firm hand pressure.',
  ];
  if (st.mode === 'block') return [
    'Faces have no visible joints. Angle blocks are glued inside, one per edge, and they set the angle for you.',
    'Glue a block to one face, centred on an edge, flat against the inside surface with its tip at the face edge.',
    'Bring the next face down onto the block\'s other side. The faces touch along their inside corners.',
    'Use the two angle jigs on the outside to check edges while the glue sets. For acrylic, use solvent cement on the blocks.',
  ];
  if (st.mode === 'none') return [
    'Edge-glued panels: faces are shrunk so their inside corners meet exactly at the right angle. You get a crisp V-groove on every outside edge.',
    'Glue only touches along a line, so this is best for acrylic with solvent cement, or for small pieces. Fill the grooves with glue or putty if you like.',
    'The two angle jigs sit over an edge from outside to hold it at exactly ' + deg(S.dihedral).toFixed(2) + '° while it sets.',
  ];
  return [
    `One-piece net: ${n} faces. Blue lines are folds (score at low power, or pick "perforated" to cut dashes).`,
    'Fold every line the same way, with the printed or engraved side out. Then glue each tab under its neighbouring face.',
    'Close the last face using a tab on its long side. A dab of glue and a fingertip from the open side does it.',
    st.dice ? `Dice numbers are already placed so opposite faces add up to ${n === 4 ? '— (d4 is different)' : n + 1}.` : 'Tip: turn on Dice numbers to make a working d' + n + '.',
  ];
}
function readme(R) {
  const st = R.st, S = R.S, inf = R.res.info, lines = [
    `Polysmith — ${S.name} (${S.die})`, '',
    `Edge length (outer): ${R.L.toFixed(2)} mm`, `Dihedral angle: ${deg(S.dihedral).toFixed(3)}°`,
    `Across points (sphere dia): ${(2 * S.R * R.L).toFixed(1)} mm`, `Height resting on a face: ${(S.height * R.L).toFixed(1)} mm`,
    `Material: ${st.t} mm, kerf ${st.kerf} mm, fit ${st.fit} mm`, '',
    'Colours: RED = cut, BLUE = score / fold line, GREEN = line engrave, BLACK = fill engrave (artwork).',
    'Files are in millimetres. Import at 100% scale. DXF layers: CUT, SCORE, ENGRAVE.', '',
    'Parts:', ...R.res.parts.map(p => `  ${p.count} × ${p.name}`), '', ...guideText(R).map(s => '- ' + s),
  ];
  if (inf.s != null) lines.splice(7, 0, `Face inset per edge (thickness compensation): ${inf.s.toFixed(2)} mm`);
  return lines.join('\r\n');
}
function jigFiles(R) {
  const st = R.st, J = R.jig; if (!J) return [];
  const out = [], pk = P.pack(J.parts, st.sheetW, st.sheetH, st.margin, st.spacing);
  pk.sheets.forEach((sh, i) => out.push({ name: `${baseName(R)}-jig-parts-${i + 1}.svg`, type: 'image/svg+xml', data: P.sheetSVG(sh, st.sheetW, st.sheetH) }));
  out.push({ name: `${baseName(R)}-jig-station.svg`, type: 'image/svg+xml', data: P.stationSVG(J.station) }, { name: `${baseName(R)}-jig-station.dxf`, type: 'application/dxf', data: P.stationDXF(J.station) });
  return out;
}
/** Everything the zip holds, as [{ name, type, data }]. */
function files(R, { svg = true, dxf = true, jig = true, readme: rm = true } = {}) {
  const out = [];
  R.pk.sheets.forEach((sh, i) => {
    if (svg) out.push({ name: fname(R, i, 'svg'), type: 'image/svg+xml', data: P.sheetSVG(sh, ...sheetDims(R.st, sh)) });
    if (dxf) out.push({ name: fname(R, i, 'dxf'), type: 'application/dxf', data: P.sheetDXF(sh) });
  });
  if (jig) out.push(...jigFiles(R).filter(f => (svg || !/\.svg$/.test(f.name)) && (dxf || !/\.dxf$/.test(f.name))));
  if (rm) out.push({ name: 'README.txt', type: 'text/plain', data: readme(R) });
  return out;
}
const zipBlob = R => P.zip(files(R).map(f => ({ name: f.name, data: f.data })));
/** The fit-test coupon (slot & bracket): one SVG. */
function couponSVG(R) {
  const st = R.st;
  const pan = R.res.parts.find(p => p.name === 'Bracket') ? R.res : P.panels({ solid: st.solid, L: R.L, t: st.t, kerf: st.kerf, fit: st.fit, joint: 'tab', perEdge: 1, tabLen: st.tabLen, protrude: 0, window: 'none', windowPct: 0, dice: false });
  const parts = P.coupon({ t: st.t, kerf: st.kerf, fit: st.fit }, pan);
  const pk = P.pack(parts, 300, 200, 4, 3), sh = pk.sheets[0];
  const b = P.bbox(sh.cuts.map(c => c.pts));
  return { name: `polysmith-fit-coupon-${st.t}mm.svg`, data: P.sheetSVG(sh, Math.ceil(b.x1 + 4), 200).replace(/viewBox="0 0 (\S+) 200"/, (m, w) => `viewBox="0 ${(200 - b.y1 - 4).toFixed(2)} ${w} ${(b.y1 - b.y0 + 8).toFixed(2)}"`).replace(/height="200mm"/, `height="${(b.y1 - b.y0 + 8).toFixed(2)}mm"`) };
}

/* ---------- public result ---------- */
const r3 = x => Math.round(x * 1000) / 1000;
function partsList(R, geometry) {
  return R.res.parts.map(p => {
    const b = P.bbox([p.cuts[0].pts]);
    const o = { name: p.name, count: p.count, width: r3(b.x1 - b.x0), height: r3(b.y1 - b.y0), holes: Math.max(0, p.cuts.length - 1), engravings: (p.marks || []).length + (p.fills || []).length, scores: (p.scores || []).length };
    if (geometry) o.geometry = { cuts: clone(p.cuts), scores: clone(p.scores || []), marks: clone(p.marks || []), fills: clone(p.fills || []) };
    return o;
  });
}
function result(R, opt = {}) {
  const st = R.st, S = R.S, inf = R.res.info, svg = opt.svg !== false, dxf = opt.dxf !== false;
  const joint = {};
  if (inf.s != null) joint.edgeInset = r3(inf.s);
  if (inf.finger) Object.assign(joint, { fingersPerEdge: inf.finger.N, fingerWidth: r3(inf.finger.w), fingerDepth: r3((inf.finger.vMax || inf.finger.v) - inf.finger.U), style: st.fingerStyle });
  if (st.mode === 'tab' && inf.per > 0) Object.assign(joint, { bracketsPerEdge: inf.per, brackets: inf.per * S.edges.length, tabLength: r3(inf.w) });
  if (st.mode === 'block' && inf.per > 0) Object.assign(joint, { blocks: inf.per * S.edges.length, blockDepth: r3(inf.D) });
  const J = R.jig;
  const out = {
    name: `${S.name} (${S.die})`, solid: st.solid, mode: st.mode, settings: clone(st),
    size: { edge: r3(R.L), acrossPoints: r3(2 * S.R * R.L), height: r3(S.height * R.L), dihedral: r3(deg(S.dihedral)), faces: S.faces.length, edges: S.edges.length, vertices: S.verts.length },
    joint,
    parts: partsList(R, opt.geometry),
    sheets: R.pk.sheets.map((sh, i) => { const [w, h] = sheetDims(st, sh); const o = { index: i + 1, width: w, height: h, oversize: !!sh.oversize, counts: { ...sh.counts } }; if (svg) o.svg = P.sheetSVG(sh, w, h); if (dxf) o.dxf = P.sheetDXF(sh); return o; }),
    stats: { parts: R.res.parts.reduce((a, p) => a + p.count, 0), sheets: R.pk.sheets.length, cutLengthMm: r3(R.cut), scoreLengthMm: r3(R.score) },
    warnings: [...R.res.warn, ...R.pk.warn].map(w => ({ level: w.lvl, message: w.msg })),
    guide: guideText(R),
    jig: st.mode === 'finger' && st.fingerStyle === 'bevel' ? (J ? {
      needed: true, tilt: r3(deg(J.phi)), facesPerRun: J.K, runs: J.runs, passes: J.passes, tipHeight: r3(J.zTip), notchHeight: r3(J.zNotch),
      outsideFace: J.outerDown ? 'down' : 'up', cutThickness: r3(st.t / Math.cos(J.phi)), files: jigFiles(R).map(f => f.name),
    } : { needed: false, reason: 'A cube meets at exactly 90°, so its teeth are already square. No jig needed.' }) : null,
    art: R.art ? { name: R.art.name, paths: R.art.polys.length, mode: st.artMode, where: st.artWhere } : null,
    readme: readme(R),
  };
  if (opt.files !== false) out.files = files(R, { svg, dxf });
  return out;
}


/* ---------- settings files: everything about a design (and optionally the 3D view and artwork library) as JSON ---------- */
const FORMAT = 'polysmith-settings', FILE_VERSION = 2;
const VIEW_KEYS = { yaw: [-3600, 3600], pitch: [-90, 90], zoom: [0.2, 12], explode: [0, 1] };
function checkView(v) {
  if (v == null) return null;
  if (!isRec(v)) throw new TypeError('view must be an object');
  const o = {};
  for (const [k, x] of Object.entries(v)) {
    if (VIEW_KEYS[k]) { if (typeof x !== 'number' || x < VIEW_KEYS[k][0] || x > VIEW_KEYS[k][1]) throw new RangeError(`view.${k} must be between ${VIEW_KEYS[k][0]} and ${VIEW_KEYS[k][1]}`); o[k] = x; }
    else if (k === 'view') { if (!['whole', 'face', 'bracket', 'jig'].includes(x)) throw new RangeError('view.view must be whole, face, bracket or jig'); o[k] = x; }
    else if (k === 'stereo') { if (!['off', 'cross', 'parallel'].includes(x)) throw new RangeError('view.stereo must be off, cross or parallel'); o[k] = x; }
    else if (k === 'spin') o[k] = !!x;
    else if (k === 'lamp') {
      if (!isRec(x)) throw new TypeError('view.lamp must be an object');
      const L = {}, lim = { gain: [0, 3], roomSize: [0.6, 2.5], x: [-0.6, 0.6], y: [-0.6, 0.6], z: [-0.6, 0.6] };
      for (const [lk, lv] of Object.entries(x)) {
        if (lk === 'on') L.on = !!lv;
        else if (lk === 'color') { if (!/^#[0-9a-f]{6}$/i.test(lv)) throw new RangeError('view.lamp.color must look like #rrggbb'); L.color = lv; }
        else if (lim[lk]) { if (typeof lv !== 'number' || lv < lim[lk][0] || lv > lim[lk][1]) throw new RangeError(`view.lamp.${lk} must be between ${lim[lk][0]} and ${lim[lk][1]}`); L[lk] = lv; }
        else throw new RangeError('Unknown lamp setting: ' + lk);
      }
      o.lamp = L;
    } else throw new RangeError('Unknown view setting: ' + k);
  }
  return o;
}
function checkLibrary(lib) {
  if (lib == null) return null;
  if (!Array.isArray(lib) || lib.some(x => !isRec(x) || typeof x.name !== 'string' || typeof x.svg !== 'string')) throw new TypeError('library must be [{ name, svg }]');
  return lib.map(x => ({ name: x.name, svg: x.svg }));
}
/** The settings-file object: { format, version, app, exported, settings, art?, view?, library? }. */
function exportDoc(settings, { art = null, view = null, library = null, date = true } = {}) {
  const doc = { format: FORMAT, version: FILE_VERSION, app: 'Polysmith ' + VERSION };
  if (date) doc.exported = new Date().toISOString();
  doc.settings = normalize(settings);
  const a = checkArt(art); if (a) doc.art = { name: a.name, svg: a.svg || '', polys: a.polys, texts: a.texts || 0 };
  const v = checkView(view); if (v) doc.view = v;
  const l = checkLibrary(library); if (l) doc.library = l;
  return doc;
}
/** Reads a settings file (any version, or a bare settings object). Returns { settings, art, view, library }. */
function importDoc(json) {
  let o = json;
  if (typeof json === 'string') { try { o = JSON.parse(json); } catch (e) { throw new SyntaxError("That isn't a Polysmith settings file (not valid JSON)."); } }
  if (!isRec(o)) throw new TypeError("That isn't a Polysmith settings file.");
  if (o.format !== undefined && o.format !== FORMAT) throw new RangeError(`That file is a ${o.format} file, not Polysmith settings.`);
  if (o.format === FORMAT && o.version > FILE_VERSION) throw new RangeError('That settings file is from a newer Polysmith. Update this copy and try again.');
  const wrapped = o.format === FORMAT;
  const art = wrapped && o.art ? (Array.isArray(o.art.polys) ? checkArt({ name: o.art.name || 'artwork.svg', svg: o.art.svg || '', polys: o.art.polys, texts: o.art.texts || 0 }) : (typeof o.art.svg === 'string' ? { name: o.art.name || 'artwork.svg', svg: o.art.svg, polys: null } : null)) : null;
  return { settings: normalize(wrapped ? o.settings : o), art, view: wrapped ? checkView(o.view) : null, library: wrapped ? checkLibrary(o.library) : null };
}

/* ---------- the public API object (shared by page and Node) ---------- */
function api(extra = {}) {
  const prep = (settings, art) => compute(normalize(settings), checkArt(art));
  const A = {
    version: VERSION,
    solids: {
      list: () => SOLIDS.map(id => { const S = P.solid(id); return { id, name: S.name, die: S.die, faces: S.faces.length, edges: S.edges.length, vertices: S.verts.length, faceSides: S.sides, dihedral: r3(deg(S.dihedral)) }; }),
      measure(id, { edge, acrossPoints, height } = {}) {
        if (!SOLIDS.includes(id)) throw new RangeError('Unknown solid: ' + id);
        const S = P.solid(id), given = [edge, acrossPoints, height].filter(v => v !== undefined);
        if (given.length !== 1 || !(given[0] > 0)) throw new RangeError('Give exactly one of edge, acrossPoints or height, as a positive number');
        const L = edge !== undefined ? edge : acrossPoints !== undefined ? acrossPoints / (2 * S.R) : height / S.height;
        return { edge: r3(L), acrossPoints: r3(2 * S.R * L), height: r3(S.height * L), dihedral: r3(deg(S.dihedral)), faceArea: r3(P.area(P.ngon(S.sides, L / (2 * Math.sin(Math.PI / S.sides))))) };
      },
    },
    modes: { list: () => clone(MODES) },
    materials: { list: () => Object.entries(MATS).map(([id, m]) => ({ id, name: m.name, kerf: m.kerf, seeThrough: !!m.op, defaultOpacity: m.op || 100, coloured: !!m.tinted })) },
    cutouts: { list: () => clone(WINDOWS) },
    sheets: { presets: () => Object.entries(SHEETS).map(([id, name]) => { const [w, h] = id.split('x').map(Number); return id === 'custom' ? { id, name } : { id, name, width: w, height: h }; }) },
    settings: {
      defaults: () => clone(DEF),
      keys: () => Object.keys(DEF).map(k => ({ key: k, default: DEF[k], type: typeof DEF[k], ...(ENUMS[k] ? { values: ENUMS[k].slice() } : {}), ...(RANGES[k] ? { min: RANGES[k][0], max: RANGES[k][1] } : {}) })),
      create: (over = {}) => create(over),
      update: (settings, changes = {}) => create(changes, normalize(settings)),
      validate(settings) { try { normalize(settings); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } },
      edge: settings => r3(edgeFromSize(normalize(settings))),
      /** Same object, re-expressed with another size measure ('edge', 'sphere' or 'height'), keeping the physical size. */
      remeasure(settings, measure) { const s = normalize(settings); check('measure', measure); const L = edgeFromSize(s); return create({ measure, size: r3(sizeFromEdge({ ...s, measure }, L)) }, s); },
      /** Everything about a design as a JSON settings file. options: art, view, library (all optional). */
      export: (settings = {}, opt = {}) => JSON.stringify(exportDoc(settings, opt), null, 2),
      /** The same, as an object instead of text. */
      exportObject: (settings = {}, opt = {}) => exportDoc(settings, opt),
      /** Reads a settings file (text or object). Returns { settings, art, view, library }; missing parts are null. */
      import: json => importDoc(json),
      /** Short forms: settings only. */
      serialize: settings => JSON.stringify(exportDoc(settings), null, 2),
      parse: json => importDoc(json).settings,
    },
    art: {
      /** Points in any units. y points down like SVG unless { yUp: true }. Each item is [[x,y],...] or { pts, closed }. */
      fromPolylines(polys, { name = 'drawing', yUp = false } = {}) {
        if (!Array.isArray(polys) || !polys.length) throw new TypeError('fromPolylines needs an array of polylines');
        const raw = polys.map(p => { const pts = Array.isArray(p) ? p : p && p.pts; if (!Array.isArray(pts)) throw new TypeError('Each polyline must be [[x, y], ...] or { pts }'); let q = pts.map(v => [+v[0], yUp ? +v[1] : -v[1]]); if (!Array.isArray(p) && p.closed && q.length > 2) q = q.concat([q[0]]); return q; });
        return normalizeArt(raw, { name });
      },
      ...(extra.art || {}),
    },
    design: {
      compute: (settings = {}, opt = {}) => result(prep(settings, opt.art), opt),
      files: (settings = {}, opt = {}) => files(prep(settings, opt.art), opt),
      sheetSVG(settings = {}, index = 1, opt = {}) { const R = prep(settings, opt.art), sh = R.pk.sheets[index - 1]; if (!sh) throw new RangeError(`There is no sheet ${index}; this design has ${R.pk.sheets.length}`); return P.sheetSVG(sh, ...sheetDims(R.st, sh), opt.preview ? { preview: true, bg: opt.background || '#f4ead8' } : {}); },
      sheetDXF(settings = {}, index = 1, opt = {}) { const R = prep(settings, opt.art), sh = R.pk.sheets[index - 1]; if (!sh) throw new RangeError(`There is no sheet ${index}; this design has ${R.pk.sheets.length}`); return P.sheetDXF(sh); },
      async zip(settings = {}, opt = {}) { const R = prep(settings, opt.art); const buf = new Uint8Array(await zipBlob(R).arrayBuffer()); return { name: baseName(R) + '.zip', data: typeof Buffer !== 'undefined' ? Buffer.from(buf) : buf }; },
      coupon: (settings = {}) => couponSVG(prep(settings, null)),
      jig(settings = {}) { const R = prep(settings, null); if (!R.jig) return null; return { ...result(R, { files: false, svg: false, dxf: false }).jig, files: jigFiles(R), preview: P.stationSVG(R.jig.station, { preview: true, bg: '#f4ead8' }) }; },
      readme: (settings = {}, opt = {}) => readme(prep(settings, opt.art)),
      guide: (settings = {}) => guideText(prep(settings, null)),
      fileName: (settings = {}) => baseName(prep(settings, null)),
    },
    units: { toMm: inches => inches * IN, toInches: mm => mm / IN },
  };
  return A;
}

G.PolyEngine = { VERSION, FORMAT, exportDoc, importDoc, checkView, DEF, MATS, SOLIDS, MODES, WINDOWS, SHEETS, ENUMS, create, normalize, check, edgeFromSize, sizeFromEdge, rdp, normalizeArt, checkArt, compute, sheetDims, baseName, fname, guideText, readme, files, jigFiles, zipBlob, couponSVG, result, api };
})(typeof window !== 'undefined' ? window : globalThis);

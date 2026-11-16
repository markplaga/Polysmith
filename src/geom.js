/* Polysmith geometry engine — pure functions, no DOM. All lengths in mm. 2D coords are y-up. */
(function (G) {
'use strict';
const PHI = (1 + Math.sqrt(5)) / 2, TAU = Math.PI * 2;

/* ---------- vectors ---------- */
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
};
V.norm = a => V.mul(a, 1 / V.len(a));
const P2 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  mul: (a, s) => [a[0] * s, a[1] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1],
  len: a => Math.hypot(a[0], a[1]),
  rot: (a, t) => [a[0] * Math.cos(t) - a[1] * Math.sin(t), a[0] * Math.sin(t) + a[1] * Math.cos(t)],
};

/* ---------- solids ---------- */
const INFO = {
  tetra: { name: 'Tetrahedron', die: 'd4', sides: 3, faces: 4 },
  cube: { name: 'Cube', die: 'd6', sides: 4, faces: 6 },
  octa: { name: 'Octahedron', die: 'd8', sides: 3, faces: 8 },
  dodeca: { name: 'Dodecahedron', die: 'd12', sides: 5, faces: 12 },
  icosa: { name: 'Icosahedron', die: 'd20', sides: 3, faces: 20 },
};
function rawVerts(id) {
  const v = [];
  if (id === 'tetra') v.push([1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]);
  else if (id === 'cube') { for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]); }
  else if (id === 'octa') v.push([1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]);
  else if (id === 'icosa') { for (const a of [-1, 1]) for (const b of [-PHI, PHI]) v.push([0, a, b], [a, b, 0], [b, 0, a]); }
  else if (id === 'dodeca') {
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
    for (const a of [-1 / PHI, 1 / PHI]) for (const b of [-PHI, PHI]) v.push([0, a, b], [a, b, 0], [b, 0, a]);
  }
  return v;
}
const ekey = (a, b) => a < b ? a + '-' + b : b + '-' + a;
const solidCache = {};
function solid(id) {
  if (solidCache[id]) return solidCache[id];
  const n = INFO[id].sides;
  let vs = rawVerts(id);
  let md = Infinity;
  for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) md = Math.min(md, V.len(V.sub(vs[i], vs[j])));
  vs = vs.map(v => V.mul(v, 1 / md)); // unit edge
  const faces = [], seen = new Set();
  for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) for (let k = j + 1; k < vs.length; k++) {
    let nn = V.cross(V.sub(vs[j], vs[i]), V.sub(vs[k], vs[i]));
    const l = V.len(nn); if (l < 1e-9) continue;
    nn = V.mul(nn, 1 / l);
    let d = V.dot(nn, vs[i]); if (d < 0) { nn = V.mul(nn, -1); d = -d; }
    if (d < 1e-6) continue;
    let ok = true; const on = [];
    for (let m = 0; m < vs.length; m++) { const e = V.dot(nn, vs[m]) - d; if (e > 1e-6) { ok = false; break; } if (e > -1e-6) on.push(m); }
    if (!ok || on.length !== n) continue;
    const key = on.slice().sort((a, b) => a - b).join(',');
    if (seen.has(key)) continue; seen.add(key);
    let c = [0, 0, 0]; on.forEach(m => { c = V.add(c, vs[m]); }); c = V.mul(c, 1 / n);
    const e1 = V.norm(V.sub(vs[on[0]], c)), e2 = V.cross(nn, e1);
    const ang = m => { const r = V.sub(vs[m], c); return Math.atan2(V.dot(r, e2), V.dot(r, e1)); };
    on.sort((p, q) => ang(p) - ang(q));
    faces.push({ v: on, n: nn, c });
  }
  const edgeMap = {}, edges = [];
  faces.forEach((f, fi) => f.v.forEach((a, i) => {
    const b = f.v[(i + 1) % n], k = ekey(a, b);
    if (!edgeMap[k]) { edgeMap[k] = { a, b, faces: [] }; edges.push(edgeMap[k]); }
    edgeMap[k].faces.push(fi);
  }));
  const e0 = edges[0];
  const dihedral = Math.PI - Math.acos(Math.max(-1, Math.min(1, V.dot(faces[e0.faces[0]].n, faces[e0.faces[1]].n))));
  const R = V.len(vs[0]), r = V.dot(faces[0].n, faces[0].c);
  let height = 0; vs.forEach(v => { height = Math.max(height, r - V.dot(v, faces[0].n)); });
  const S = { id, ...INFO[id], verts: vs, faces, edges, edgeMap, dihedral, R, r, rm: V.len(V.mul(V.add(vs[e0.a], vs[e0.b]), 0.5)), height };
  solidCache[id] = S;
  return S;
}

/* ---------- 2D polygon helpers ---------- */
function area(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
function ccw(p) { return area(p) < 0 ? p.slice().reverse() : p; }
function lineX(a1, u1, a2, u2) {
  const den = u1[0] * u2[1] - u1[1] * u2[0];
  if (Math.abs(den) < 1e-12) return null;
  const s = ((a2[0] - a1[0]) * u2[1] - (a2[1] - a1[1]) * u2[0]) / den;
  return [a1[0] + s * u1[0], a1[1] + s * u1[1]];
}
/* miter offset; d>0 grows a CCW polygon */
function offset(pts, d) {
  if (!d) return pts.map(p => p.slice());
  const p = ccw(pts), n = p.length, out = [];
  const lines = p.map((a, i) => {
    const b = p[(i + 1) % n], u = P2.sub(b, a), l = P2.len(u), un = [u[0] / l, u[1] / l];
    const no = [un[1], -un[0]];
    return { a: P2.add(a, P2.mul(no, d)), u: un, no };
  });
  for (let i = 0; i < n; i++) {
    const L0 = lines[(i - 1 + n) % n], L1 = lines[i];
    let x = lineX(L0.a, L0.u, L1.a, L1.u);
    if (!x || P2.len(P2.sub(x, p[i])) > Math.abs(d) * 6) x = P2.add(p[i], P2.mul(L1.no, d));
    out.push(x);
  }
  return out;
}
function centroid(p) { let x = 0, y = 0; p.forEach(q => { x += q[0]; y += q[1]; }); return [x / p.length, y / p.length]; }
function shrink(p, e) { const c = centroid(p); return p.map(q => { const v = P2.sub(q, c), l = P2.len(v); return l < e ? c : P2.add(c, P2.mul(v, (l - e) / l)); }); }
/* convex polygon overlap (SAT) */
function overlap(A, B) {
  for (const P of [A, B]) {
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], ax = [b[1] - a[1], a[0] - b[0]];
      let mnA = Infinity, mxA = -Infinity, mnB = Infinity, mxB = -Infinity;
      A.forEach(q => { const v = P2.dot(q, ax); mnA = Math.min(mnA, v); mxA = Math.max(mxA, v); });
      B.forEach(q => { const v = P2.dot(q, ax); mnB = Math.min(mnB, v); mxB = Math.max(mxB, v); });
      if (mxA <= mnB + 1e-9 || mxB <= mnA + 1e-9) return false;
    }
  }
  return true;
}
function bbox(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  polys.forEach(p => p.forEach(q => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }));
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
function circle(c, r, seg) { const o = []; for (let i = 0; i < seg; i++) { const t = i / seg * TAU; o.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]); } return o; }
function perim(pl) { let s = 0; const n = pl.pts.length, m = pl.closed ? n : n - 1; for (let i = 0; i < m; i++) s += P2.len(P2.sub(pl.pts[(i + 1) % n], pl.pts[i])); return s; }
/* regular n-gon by apothem, one edge at bottom, CCW */
function ngon(n, ap) {
  const rc = ap / Math.cos(Math.PI / n), o = [];
  for (let k = 0; k < n; k++) { const t = -Math.PI / 2 - Math.PI / n + k * TAU / n; o.push([rc * Math.cos(t), rc * Math.sin(t)]); }
  return o;
}

/* ---------- single-stroke digit font (y-up, box 0.6 x 1) ---------- */
function ell(cx, cy, rx, ry, seg, a0 = 0, a1 = TAU) { const o = []; for (let i = 0; i <= seg; i++) { const t = a0 + (a1 - a0) * i / seg; o.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); } return o; }
const SIX = [[0.55, 0.95], [0.35, 1], [0.15, 0.94], [0.04, 0.72], [0, 0.4], [0.04, 0.14], [0.3, 0], [0.54, 0.1], [0.6, 0.3], [0.52, 0.5], [0.3, 0.58], [0.1, 0.52], [0.02, 0.4]];
const FONT = {
  '0': [ell(0.3, 0.5, 0.3, 0.5, 20)],
  '1': [[[0.12, 0.78], [0.32, 1], [0.32, 0]], [[0.12, 0], [0.52, 0]]],
  '2': [[[0.02, 0.78], [0.1, 0.94], [0.3, 1], [0.5, 0.94], [0.6, 0.76], [0.55, 0.58], [0, 0], [0.6, 0]]],
  '3': [[[0.02, 0.9], [0.17, 1], [0.44, 1], [0.58, 0.88], [0.58, 0.66], [0.44, 0.54], [0.2, 0.54]], [[0.44, 0.54], [0.6, 0.42], [0.6, 0.12], [0.45, 0], [0.15, 0], [0, 0.1]]],
  '4': [[[0.45, 0], [0.45, 1], [0, 0.3], [0.6, 0.3]]],
  '5': [[[0.56, 1], [0.08, 1], [0.03, 0.56], [0.3, 0.62], [0.52, 0.54], [0.6, 0.32], [0.54, 0.1], [0.34, 0], [0.12, 0], [0, 0.1]]],
  '6': [SIX],
  '7': [[[0, 1], [0.6, 1], [0.18, 0]]],
  '8': [ell(0.3, 0.76, 0.24, 0.24, 18), ell(0.3, 0.27, 0.3, 0.27, 20)],
  '9': [SIX.map(p => [0.6 - p[0], 1 - p[1]])],
  '-': [[[0.08, 0.5], [0.52, 0.5]]],
  '+': [[[0.06, 0.5], [0.54, 0.5]], [[0.3, 0.26], [0.3, 0.74]]],
  '.': [[[0.24, 0], [0.36, 0], [0.36, 0.1], [0.24, 0.1], [0.24, 0]]],
  '_': [[[0, -0.16], [0.6, -0.16]]],
};
/* returns open polylines centered at c, height h, rotated by ang */
function text(str, c, h, ang = 0) {
  const adv = 0.85, chars = str.split(''), wid = chars.reduce((s, ch) => s + (ch === '.' ? 0.45 : adv), 0) - (adv - 0.6);
  let x = -wid / 2; const out = [];
  chars.forEach(ch => {
    (FONT[ch] || []).forEach(pl => out.push({ pts: pl.map(p => { const q = P2.rot([(p[0] + x) * h, (p[1] - 0.5) * h], ang); return [q[0] + c[0], q[1] + c[1]]; }), closed: false }));
    x += ch === '.' ? 0.45 : adv;
  });
  return out;
}

/* ---------- panel construction ---------- */
function bracketFrame(S, L, perEdgeX) {
  /* 3D placement data for brackets, used by preview */
  return S.edges.map(e => {
    const A = V.mul(S.verts[e.a], L), B = V.mul(S.verts[e.b], L);
    const m = V.mul(V.add(A, B), 0.5), ed = V.norm(V.sub(B, A)), y = V.mul(V.norm(m), -1);
    const cB = V.mul(S.faces[e.faces[1]].c, L);
    let uB = V.norm(V.sub(cB, m)); uB = V.norm(V.sub(uB, V.mul(y, V.dot(uB, y))));
    return perEdgeX.map(x => ({ M: V.add(m, V.mul(ed, x)), x: uB, y }));
  });
}

function panels(p) {
  const S = solid(p.solid), n = S.sides, L = p.L, t = p.t, k = p.kerf, fit = p.fit;
  const warn = [], h = S.dihedral / 2;
  const s = t / Math.tan(h), a = L / (2 * Math.tan(Math.PI / n)), ap = a - s, Lp = 2 * ap * Math.tan(Math.PI / n);
  if (ap < 3 * t) { warn.push({ lvl: 'err', msg: 'This solid is too small for this material thickness. Make it bigger or use thinner stock.' }); }
  const joint = p.joint;
  if (joint === 'finger') return fingerPanels(p, S);
  let per = joint === 'none' ? 0 : p.perEdge;
  let w = p.tabLen > 0 ? p.tabLen : Math.max(3 * t, 6), g = Math.max(1.25 * t, 2), tail = Math.max(t, 2);
  if (joint === 'block') { g = Math.max(0.6 * t, 1); w = p.tabLen > 0 ? p.tabLen : Math.max(4 * t, 8); }
  const xsFor = q => q === 1 ? [0] : q === 2 ? [-0.24 * Lp, 0.24 * Lp] : q === 3 ? [-0.3 * Lp, 0, 0.3 * Lp] : [];
  let xs = xsFor(per);
  const halfW = t / 2 + Math.max(0.6 * t, 1);
  const frame = kE => { const ph = -Math.PI / 2 + kE * TAU / n, o = [Math.cos(ph), Math.sin(ph)], tg = [-o[1], o[0]]; return (x, d) => [ap * o[0] + x * tg[0] - d * o[0], ap * o[1] + x * tg[1] - d * o[1]]; };
  const frames = []; for (let i = 0; i < n; i++) frames.push(frame(i));
  function feasible(D, X) {
    if (D > 0.9 * ap) return false;
    for (const x of X) if (Math.abs(x) + halfW > Lp / 2 * 0.92) return false;
    const R = [];
    frames.forEach(F => X.forEach(x => R.push([F(x - halfW, 0), F(x + halfW, 0), F(x + halfW, D), F(x - halfW, D)])));
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) if (overlap(R[i], R[j])) return false;
    return true;
  }
  let D = g + w + tail, scaled = 1;
  if (per > 0 && !feasible(D, xs)) {
    let lo = 0, hi = 1;
    for (let it = 0; it < 32; it++) { const mid = (lo + hi) / 2; if (feasible(D * mid, xs)) lo = mid; else hi = mid; }
    scaled = lo; w *= lo; g *= lo; tail *= lo; D = g + w + tail;
    if (lo === 0) { warn.push({ lvl: 'err', msg: `${per} brackets per edge won't fit at this size. Try fewer brackets per edge, a bigger solid, or thinner stock.` }); per = 0; xs = []; }
    else if (joint === 'tab' && w < 1.5 * t) warn.push({ lvl: 'warn', msg: `Brackets had to shrink to fit (tab ${w.toFixed(1)} mm). They'll be fragile. A bigger solid or thinner stock works better.` });
    else warn.push({ lvl: 'info', msg: `Tabs were shortened to ${w.toFixed(1)} mm so neighbouring brackets don't collide inside.` });
  }
  const u1 = g, u2 = g + w;

  /* face plate */
  const outline = offset(ngon(n, ap), k / 2);
  const holes = [];
  if (joint === 'tab' && per > 0) {
    const sw = (t + fit - k) / 2, sl0 = u1 - (fit - k) / 2, sl1 = u2 + (fit - k) / 2;
    frames.forEach(F => xs.forEach(x => holes.push([F(x - sw, sl0), F(x - sw, sl1), F(x + sw, sl1), F(x + sw, sl0)])));
  }
  const freeAp = per > 0 ? ap - D - Math.max(t, 2.5) : ap - Math.max(2 * t, 4);
  if (p.window !== 'none') {
    if (freeAp < 3) warn.push({ lvl: 'warn', msg: 'Not enough room for a face window at this size.' });
    else {
      const wa = Math.max(1.5, freeAp * p.windowPct / 100);
      if (p.window === 'circle') holes.push(circle([0, 0], wa - k / 2, 96));
      else if (p.window === 'poly') holes.push(offset(ngon(n, wa), -k / 2));
      else if (p.window === 'star') {
        const pts = [], m = n === 3 ? 6 : n, ro = wa / Math.cos(Math.PI / n) * 0.98, ri = ro * (n === 4 ? 0.45 : 0.42);
        for (let i = 0; i < 2 * m; i++) { const r = i % 2 ? ri : ro, th = -Math.PI / 2 - Math.PI / n + i * Math.PI / m; pts.push([r * Math.cos(th), r * Math.sin(th)]); }
        holes.push(offset(pts, -k / 2));
      }
    }
  }
  const faceParts = [];
  const numH = Math.min(freeAp * 0.9, ap * 0.55);
  const facePart = num => {
    const cuts = [{ pts: outline, closed: true }, ...holes.map(hh => ({ pts: hh, closed: true }))], marks = [];
    if (num) { marks.push(...text(String(num), [0, numH * 0.02], numH)); if (num === 6 || num === 9) marks.push(...text('_', [0, numH * 0.02], numH)); }
    return { name: 'Face' + (num ? ' ' + num : ''), cuts, marks, scores: [], tri: n === 3, count: num ? 1 : S.faces.length };
  };
  if (p.dice && p.window === 'none' && numH > 4) { for (let i = 1; i <= S.faces.length; i++) faceParts.push(facePart(i)); }
  else { if (p.dice) warn.push({ lvl: 'info', msg: 'Dice numbers need the face window turned off and enough clear space.' }); faceParts.push(facePart(0)); }

  /* bracket (cross-section plane): y = inward bisector, x toward face B */
  const uA = [-Math.sin(h), Math.cos(h)], nA = [Math.cos(h), Math.sin(h)], uB = [Math.sin(h), Math.cos(h)], nB = [-Math.cos(h), Math.sin(h)];
  const Pc = [0, t / Math.sin(h)], T = t + (p.protrude || 0);
  const iA = u => P2.add(Pc, P2.mul(uA, u)), iB = u => P2.add(Pc, P2.mul(uB, u));
  const e = Math.min(0.5 * t, g * 0.5);
  let br = null;
  if (joint === 'tab' && per > 0) {
    br = [iA(e), iA(u1), P2.sub(iA(u1), P2.mul(nA, T)), P2.sub(iA(u2), P2.mul(nA, T)), iA(u2), iA(D), iB(D), iB(u2), P2.sub(iB(u2), P2.mul(nB, T)), P2.sub(iB(u1), P2.mul(nB, T)), iB(u1), iB(e)];
  } else if (joint === 'block' && per > 0) {
    br = [iA(e), iA(D), iB(D), iB(e)];
  }
  const parts = [...faceParts];
  if (br) {
    br = ccw(br);
    const brK = offset(br, k / 2);
    parts.push({ name: joint === 'tab' ? 'Bracket' : 'Angle block', cuts: [{ pts: brK, closed: true }], marks: [], scores: [], count: S.edges.length * per });
  }
  let jig = null;
  if (joint !== 'tab') {
    const Dn = Math.min(0.7 * ap, 35), H = Dn / Math.tan(h) + 14;
    const QA = P2.mul(uA, Dn), QB = P2.mul(uB, Dn);
    jig = ccw([QA, [0, 0], QB, P2.sub(QB, P2.mul(nB, H)), P2.sub(QA, P2.mul(nA, H))]);
    parts.push({ name: 'Angle jig', cuts: [{ pts: offset(jig, k / 2), closed: true }], marks: text(Math.round(S.dihedral * 180 / Math.PI * 10) / 10 + '', [0, -H * 0.35 + Dn * Math.cos(h) * 0.3], Math.min(6, H * 0.15)), scores: [], count: 2 });
  }
  return {
    parts, warn,
    info: { s, a, ap, Lp, D, w, g, per, xs, br, jig, dihedral: S.dihedral, n, scaled },
  };
}

/* ---------- finger joints ---------- */
/* Plate outline (2D, ideal-face coords, apothem a; depth 0 = ideal outer edge).
   Every face uses the same pattern: an even number of fingers per edge, with fingers at even
   positions counted from each edge's CCW start vertex, so all faces are identical. */
function fingerGeom(S, L, t, o) {
  const n = S.sides, d = S.dihedral, h = d / 2, clr = o.depthClr || 0, bevel = o.style === 'bevel';
  // z = depth from the OUTER surface. Tip on the neighbour's outer plane, notch bottom on its inner plane.
  const Uz = z => z / Math.tan(d), vz = z => (t + z * Math.cos(d)) / Math.sin(d) + clr;
  let U, v, U0, Ut, v0, vt;
  if (bevel) { U0 = 0; Ut = Uz(t); v0 = vz(0); vt = vz(t); U = Math.min(U0, Ut); v = Math.min(v0, vt); }
  else { U = o.style === 'full' ? Math.min(0, t / Math.tan(d)) : Math.max(0, t / Math.tan(d)); v = Math.max(t / Math.sin(d), t / Math.tan(h)) + clr; }
  const vMax = bevel ? Math.max(v0, vt) : v;
  const alpha = Math.PI - TAU / n, c0 = vMax / Math.tan(alpha / 2), span = L - 2 * c0;
  const fwT = o.fingerW > 0 ? o.fingerW : Math.max(2.5 * t, 6);
  const N = Math.max(2, 2 * Math.round(span / (2 * fwT)));
  const w = span / N, fit = o.fit || 0;
  const a = L / (2 * Math.tan(Math.PI / n)), Vt = ngon(n, a);
  const E = [];
  for (let k = 0; k < n; k++) {
    const A = Vt[k], B = Vt[(k + 1) % n], dv = P2.sub(B, A), l = P2.len(dv), dir = [dv[0] / l, dv[1] / l];
    E.push({ mid: P2.mul(P2.add(A, B), 0.5), dir, inn: [-dir[1], dir[0]] });
  }
  const pt = (k, x, dd) => P2.add(P2.add(E[k].mid, P2.mul(E[k].dir, x)), P2.mul(E[k].inn, dd));
  // boundaries between N segments (first = finger); fingers narrowed by fit. kind: 'fn' = finger->notch
  const bnd = [];
  for (let i = 1; i < N; i++) { const x = -span / 2 + i * w; bnd.push(i % 2 === 1 ? { x: x - fit / 2, kind: 'fn' } : { x: x + fit / 2, kind: 'nf' }); }
  const build = (Uu, vv) => {
    const poly = [];
    for (let k = 0; k < n; k++) {
      const pk = (k - 1 + n) % n;
      poly.push(lineX(pt(pk, 0, vv), E[pk].dir, pt(k, 0, vv), E[k].dir)); // inner corner
      poly.push(lineX(pt(pk, 0, vv), E[pk].dir, pt(k, 0, Uu), E[k].dir)); // foot of first finger
      bnd.forEach(b => { if (b.kind === 'fn') poly.push(pt(k, b.x, Uu), pt(k, b.x, vv)); else poly.push(pt(k, b.x, vv), pt(k, b.x, Uu)); });
    }
    return poly;
  };
  const out = { poly: build(U, v), U, v, N, w, a, relief: 0, span, bnd, E, n };
  if (bevel) {
    Object.assign(out, { bevel: true, U0, Ut, v0, vt, vMax, outer: build(U0, v0), inner: build(Ut, vt) });
    out.slits = [];
    if (vMax - v > 1e-6) for (let k = 0; k < n; k++) bnd.forEach(b => out.slits.push([pt(k, b.x, v), pt(k, b.x, vMax)]));
  }
  return out;
}

function windowHoles(p, n, freeAp, k, warn) {
  const holes = [];
  if (p.window === 'none') return holes;
  if (freeAp < 3) { warn.push({ lvl: 'warn', msg: 'Not enough room for a face window at this size.' }); return holes; }
  const wa = Math.max(1.5, freeAp * p.windowPct / 100);
  if (p.window === 'circle') holes.push(circle([0, 0], wa - k / 2, 96));
  else if (p.window === 'poly') holes.push(offset(ngon(n, wa), -k / 2));
  else if (p.window === 'star') {
    const pts = [], m = n === 3 ? 6 : n, ro = wa / Math.cos(Math.PI / n) * 0.98, ri = ro * (n === 4 ? 0.45 : 0.42);
    for (let i = 0; i < 2 * m; i++) { const r = i % 2 ? ri : ro, th = -Math.PI / 2 - Math.PI / n + i * Math.PI / m; pts.push([r * Math.cos(th), r * Math.sin(th)]); }
    holes.push(offset(pts, -k / 2));
  }
  return holes;
}
function fingerPanels(p, S) {
  const n = S.sides, L = p.L, t = p.t, k = p.kerf, warn = [];
  const g = fingerGeom(S, L, t, { style: p.fingerStyle, relief: 0, fingerW: p.fingerW, fit: p.fit, depthClr: Math.max(0, p.fit) / 2 });
  if (g.w < 1.2 * t) warn.push({ lvl: 'warn', msg: `Fingers are only ${g.w.toFixed(1)} mm wide, which is thin for ${t} mm stock. Use wider fingers or a bigger solid.` });
  if (g.a < 4 * t) warn.push({ lvl: 'err', msg: 'This solid is too small for this material thickness. Make it bigger or use thinner stock.' });
  if (g.bevel && Math.abs(S.dihedral - Math.PI / 2) < 0.01) warn.push({ lvl: 'info', msg: 'A cube meets at 90°, so bevelled teeth are already square. No jig needed.' });
  if (p.fingerStyle === 'full' && g.U < -0.05) warn.push({ lvl: 'info', msg: `Full teeth stand ${(-g.U).toFixed(1)} mm proud at the edges. Sand them flush after glue-up for crisp corners.` });
  const outline = offset(g.poly, k / 2);
  const freeAp = g.a - (g.vMax || g.v) - Math.max(2 * t, 4);
  const holes = windowHoles(p, n, freeAp, k, warn);
  const numH = Math.min(freeAp * 0.9, g.a * 0.55);
  const facePart = num => {
    const cuts = [{ pts: outline, closed: true }, ...holes.map(hh => ({ pts: hh, closed: true })), ...(g.slits || []).map(sl => ({ pts: sl, closed: false }))], marks = [];
    if (num) { marks.push(...text(String(num), [0, 0], numH)); if (num === 6 || num === 9) marks.push(...text('_', [0, 0], numH)); }
    return { name: 'Face' + (num ? ' ' + num : ''), cuts, marks, scores: [], tri: n === 3 && g.U >= 0, count: num ? 1 : S.faces.length };
  };
  const parts = [];
  if (p.dice && p.window === 'none' && numH > 4) { for (let i = 1; i <= S.faces.length; i++) parts.push(facePart(i)); }
  else { if (p.dice) warn.push({ lvl: 'info', msg: 'Dice numbers need the face window turned off and enough clear space.' }); parts.push(facePart(0)); }
  return { parts, warn, info: { finger: g, a: g.a, ap: g.a, per: 0, xs: [], br: null, dihedral: S.dihedral, n } };
}

/* ---------- bevel jig station ----------
   Bed frame: x right, y = uphill (toward the back of the machine), z up. Base plate sits on the bed and is
   cut IN PLACE, in the same file as the bevel lines, so every line is registered to the jig. */
function clipBelow(poly, sTop) { // keep part with y <= sTop (convex polygon), CCW in, CCW out
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length], ia = A[1] <= sTop, ib = B[1] <= sTop;
    if (ia) out.push(A);
    if (ia !== ib) { const tt = (sTop - A[1]) / (B[1] - A[1]); out.push([A[0] + (B[0] - A[0]) * tt, sTop]); }
  }
  return out;
}
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
function jigStation(S, L, t, g, o) {
  const d = S.dihedral, n = S.sides, F = S.faces.length;
  if (Math.abs(d - Math.PI / 2) < 0.01) return null;
  const outerDown = d > Math.PI / 2, phi = Math.abs(d - Math.PI / 2), cph = Math.cos(phi), sph = Math.sin(phi);
  const k = o.kerf, fit = o.fit, clr = 0.2, a = g.a, Uf = g.U, vMax = g.vMax;
  const rot = q => [-q[0], -q[1]];
  // pocket and seating
  const pocket = ngon(n, a - Uf + clr).map(rot);
  let cmax = 0;
  for (let i = 0; i < n; i++) { const A = pocket[i], B = pocket[(i + 1) % n], dv = P2.sub(B, A), l = P2.len(dv), nn = [dv[1] / l, -dv[0] / l]; if (nn[1] < -1e-6) cmax = Math.max(cmax, -nn[1]); }
  const dSeat = clr / (cmax || 1);
  let pMin = Infinity, pMax = -Infinity; pocket.forEach(q => { pMin = Math.min(pMin, q[1]); pMax = Math.max(pMax, q[0]); });
  const sP = 8 - pMin, sC = sP - dSeat, sEdge = sC + a;
  const m = (t * sph + 1.5) / cph + 1, Dd = sEdge - vMax - m;
  const wp = 2 * pMax, gap = Math.max(10, t + 8), pitch = wp + gap, mX = t + 12;
  const Wmax = o.bedW - 30;
  let K = Math.max(1, Math.min(F, Math.floor((Wmax - 2 * mX + gap) / pitch)));
  const W = 2 * mX + K * pitch - gap;
  const xs = []; for (let i = 0; i < K; i++) xs.push(mX + wp / 2 + i * pitch);
  // ribs: ends + between every 3 pockets
  const ribX = [6 + t / 2];
  for (let i = 3; i < K; i += 3) ribX.push(xs[i - 1] + pitch / 2);
  ribX.push(W - 6 - t / 2);
  // geometry in the (y,z) side view
  const hLow = Math.max(10, 2 * t + 4), y0 = 18, z0 = t + hLow;
  const Bp = sv => [y0 + sv * cph, z0 + sv * sph], nD = [-sph, cph];
  const tw = Math.min(Math.max(8, 3 * t), Dd * 0.28), s1 = Dd * 0.25, s2 = Dd * 0.72;
  const Pt = (u, depth) => { const sv = sEdge - u, hh = outerDown ? depth : t - depth; return P2.add(Bp(sv), P2.mul(nD, t + hh)); };
  const tipA = Pt(0, 0), tipB = Pt(g.Ut, t), nA = Pt(g.v0, 0), nB = Pt(g.vt, t);
  const Ytip = tipA[0] + k / 2, Ynotch = nA[0] + k / 2;
  const zTip = (tipA[1] + tipB[1]) / 2, zNotch = (nA[1] + nB[1]) / 2;
  const planeErr = Math.max(Math.abs(tipA[0] - tipB[0]), Math.abs(nA[0] - nB[0]));
  // rib profile
  const yA = Bp(0)[0], yB = Bp(Dd)[0], yb1 = yA + (yB - yA) * 0.25, yb2 = yA + (yB - yA) * 0.75, btw = Math.min(tw, (yB - yA) * 0.3);
  const ribPoly = [];
  ribPoly.push([yA, t]);
  [yb1, yb2].forEach(yc => { ribPoly.push([yc - btw / 2, t], [yc - btw / 2, 0], [yc + btw / 2, 0], [yc + btw / 2, t]); });
  ribPoly.push([yB, t], Bp(Dd));
  [s2, s1].forEach(sc => { const a1 = Bp(sc + tw / 2), a2 = Bp(sc - tw / 2); ribPoly.push(a1, P2.add(a1, P2.mul(nD, t)), P2.add(a2, P2.mul(nD, t)), a2); });
  ribPoly.push(Bp(0));
  const slotW = (t + fit - k) / 2;
  // deck floor (x, s) with rib slots
  const deckCuts = [{ pts: offset(rect(0, 0, W, Dd), k / 2), closed: true }];
  ribX.forEach(xr => [s1, s2].forEach(sc => deckCuts.push({ pts: rect(xr - slotW, sc - (tw + fit - k) / 2, xr + slotW, sc + (tw + fit - k) / 2), closed: true })));
  // pocket strip: rectangle with open-topped pockets
  const strip = [[0, 0], [W, 0], [W, Dd]];
  for (let i = K - 1; i >= 0; i--) {
    const P = offset(pocket, -k / 2).map(q => [q[0] + xs[i], q[1] + sP]);
    const c = ccw(clipBelow(ccw(P), Dd));
    let j = 0; for (; j < c.length; j++) { const A = c[j], B = c[(j + 1) % c.length]; if (Math.abs(A[1] - Dd) < 1e-6 && Math.abs(B[1] - Dd) < 1e-6) break; }
    // walk from right-top (c[j]) backwards around the bottom to left-top (c[j+1])
    for (let q = 0; q < c.length; q++) strip.push(c[(j - q + c.length) % c.length]);
  }
  strip.push([0, Dd]);
  const stripCuts = [{ pts: offset(strip.map(q => q.slice()), k / 2), closed: true }];
  // station (bed coords): base plate + slots + beam windows, tip & notch lines
  const ox = 12, bx0 = ox - 8, bx1 = ox + W + 8, by0 = yA - 8, by1 = yB + 2;
  const base = [{ pts: rect(bx0, by0, bx1, by1), closed: true }];
  ribX.forEach(xr => [yb1, yb2].forEach(yc => base.push({ pts: rect(ox + xr - slotW, yc - (btw + fit - k) / 2, ox + xr + slotW, yc + (btw + fit - k) / 2), closed: true })));
  const wy0 = Math.min(Ynotch, nB[0]) - 4, wy1 = Math.min(by1 - 3, Math.max(Ytip, tipB[0]) + 4);
  const tips = [], notches = [];
  const ext = L / 2 + 3;
  xs.forEach(xc => {
    const X = ox + xc;
    if (wy1 > wy0 + 2) base.push({ pts: rect(X - L / 2 - 4, wy0, X + L / 2 + 4, wy1), closed: true });
    tips.push({ pts: [[X - ext, Ytip], [X + ext, Ytip]], closed: false });
    const B = g.bnd;
    for (let j = 0; j + 1 < B.length; j += 2) notches.push({ pts: [[X - B[j + 1].x, Ynotch], [X - B[j].x, Ynotch]], closed: false });
    notches.push({ pts: [[X - ext, Ynotch], [X - B[B.length - 1].x, Ynotch]], closed: false });
  });
  const ribCount = ribX.length;
  const flatR = g.poly.map(rot), deckTopY = sv => P2.add(Bp(sv), P2.mul(nD, t))[0];
  const pieces = xs.map(xc => ({ pts: flatR.map(q => [ox + xc + q[0], deckTopY(sC + q[1])]), closed: true }));
  return {
    phi, outerDown, K, runs: Math.ceil(F / K), passes: n, W, Dd, zTip, zNotch, baseTop: t, planeErr, deckLowZ: z0, highZ: Bp(Dd)[1] + t,
    station: { cuts: base, tips, notches, pieces, w: bx1 + 8, h: Math.max(by1, Ytip) + 10 },
    three: { ox, t, phi, y0, z0, ribX, ribPoly, deckCuts, strip, xs, sC, flatR },
    parts: [
      { name: 'Jig rib', cuts: [{ pts: offset(ccw(ribPoly), k / 2), closed: true }], marks: [], scores: [], count: ribCount },
      { name: 'Jig deck', cuts: deckCuts, marks: [], scores: [], count: 1 },
      { name: 'Jig pocket strip', cuts: stripCuts, marks: [], scores: [], count: 1 },
    ],
  };
}
function stationSVG(stn, opts = {}) {
  const W = Math.ceil(stn.w), H = Math.ceil(stn.h), pv = !!opts.preview;
  const sw = pv ? 'stroke-width="1.4" vector-effect="non-scaling-stroke"' : 'stroke-width="0.1"';
  const grp = (id, col, arr) => arr.length ? `<g id="${id}" fill="none" stroke="${col}" ${sw} stroke-linecap="round"><path d="${arr.map(pl => pathD(pl, H)).join('')}"/></g>` : '';
  let extra = '';
  if (pv && stn.pieces) extra = `<g fill="rgba(226,192,141,.45)" stroke="rgba(120,90,50,.9)" ${sw}>${stn.pieces.map(pl => `<path d="${pathD(pl, H)}"/>`).join('')}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">${pv ? `<rect width="${W}" height="${H}" fill="${opts.bg || '#fff'}"/>` : '<!-- Polysmith bevel jig station: red = base plate (cut in place first), orange = bevel tips, purple = bevel notches -->'}${grp('1-base-cut-in-place', '#ff0000', stn.cuts)}${extra}${grp('2-bevel-tips', '#ff8000', stn.tips)}${grp('3-bevel-notches', '#a000ff', stn.notches)}</svg>`;
}
function stationDXF(stn) {
  return sheetDXF({ cuts: stn.cuts, scores: [], marks: [], fills: [] }).replace(/0\r\nENDSEC\r\n0\r\nEOF$/, '') + (() => {
    const L = [];
    const add = (arr, layer, col) => arr.forEach(pl => { L.push('0', 'POLYLINE', '8', layer, '62', col, '66', '1', '70', '0'); pl.pts.forEach(q => L.push('0', 'VERTEX', '8', layer, '10', q[0].toFixed(4), '20', q[1].toFixed(4), '30', '0')); L.push('0', 'SEQEND', '8', layer); });
    add(stn.tips, 'BEVEL_TIPS', '30'); add(stn.notches, 'BEVEL_NOTCHES', '6');
    return L.join('\r\n') + '\r\n0\r\nENDSEC\r\n0\r\nEOF';
  })();
}

/* fit-test coupon */
function coupon(p, pan) {
  const t = p.t, k = p.kerf, fit = p.fit, w = pan.info.w || Math.max(3 * t, 6);
  const offs = [-0.2, -0.1, 0, 0.1, 0.2], sp = Math.max(13, t + 9), W = offs.length * sp + 6, H = w + 20;
  const out = [[0, 0], [W, 0], [W, H], [0, H]];
  const cuts = [{ pts: offset(out, k / 2), closed: true }], marks = [];
  offs.forEach((o, i) => {
    const cx = 3 + sp * (i + 0.5), sw = (t + fit + o - k) / 2, y0 = 4 - (fit - k) / 2, y1 = 4 + w + (fit - k) / 2;
    cuts.push({ pts: [[cx - sw, y0], [cx + sw, y0], [cx + sw, y1], [cx - sw, y1]], closed: true });
    const lab = (o > 0 ? '+' : o < 0 ? '-' : '') + (o === 0 ? '0' : Math.abs(o).toFixed(1).replace(/^0/, ''));
    marks.push(...text(lab, [cx, H - 7], 5));
  });
  const parts = [{ name: 'Fit coupon', cuts, marks, scores: [], count: 1 }];
  const br = pan.parts.find(q => q.name === 'Bracket');
  if (br) parts.push({ ...br, count: 2 });
  return parts;
}

/* ---------- folding nets ---------- */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const netCache = {};
function netLayout(id, tabFrac) {
  const ck = id + ':' + tabFrac;
  if (netCache[ck]) return netCache[ck];
  const S = solid(id), n = S.sides, F = S.faces.length, rng = mulberry32(1234 + F * 7 + n);
  const nb = S.faces.map((f, fi) => f.v.map((a, i) => { const b = f.v[(i + 1) % n], E = S.edgeMap[ekey(a, b)]; return { key: ekey(a, b), other: E.faces[0] === fi ? E.faces[1] : E.faces[0] }; }));
  const H = tabFrac, th = Math.PI / 4, cot = 1 / Math.tan(th);
  function place(Ps, start, dir, j) { const q = []; q[j] = start; let d = dir; for (let m = 1; m < n; m++) { q[(j + m) % n] = P2.add(q[(j + m - 1) % n], d); d = P2.rot(d, TAU / n); } return q; }
  function tabPoly(pa, pb, c1, c2) {
    const dv = P2.sub(pb, pa), l = P2.len(dv), u = [dv[0] / l, dv[1] / l], r = [u[1], -u[0]];
    return ccw([pa, pb, P2.add(pb, P2.add(P2.mul(r, H), P2.mul(u, -H * c2))), P2.add(pa, P2.add(P2.mul(r, H), P2.mul(u, H * c1)))]);
  }
  const TAPERS = [[cot, cot], [cot, 1 / Math.tan(0.52)], [1 / Math.tan(0.52), cot], [1 / Math.tan(0.52), 1 / Math.tan(0.52)], [1 / Math.tan(0.4), 1 / Math.tan(0.4)]].filter(c => H * (c[0] + c[1]) < 0.9);
  function attempt() {
    const pos = new Array(F), parent = new Array(F).fill(null), tree = new Set();
    const root = Math.floor(rng() * F);
    pos[root] = place(null, [0, 0], [1, 0], 0);
    const cand = []; nb[root].forEach((_, i) => cand.push([root, i]));
    let placed = 1;
    while (placed < F && cand.length) {
      const ci = Math.floor(rng() * cand.length), [f, i] = cand.splice(ci, 1)[0], g = nb[f][i].other;
      if (pos[g]) continue;
      const fv = S.faces[f].v, gv = S.faces[g].v, A = fv[i], B = fv[(i + 1) % n];
      let j = 0; for (; j < n; j++) if (gv[j] === B && gv[(j + 1) % n] === A) break;
      const pa = pos[f][i], pb = pos[f][(i + 1) % n];
      pos[g] = place(null, pb, P2.sub(pa, pb), j);
      parent[g] = { f, i }; tree.add(nb[f][i].key); placed++;
      nb[g].forEach((_, ii) => cand.push([g, ii]));
    }
    const shr = pos.map(p => shrink(p, 0.01));
    for (let a = 0; a < F; a++) for (let b = a + 1; b < F; b++) if (overlap(shr[a], shr[b])) { G.__dbg && G.__dbg.face++; return null; }
    const tabs = [], done = new Set(), cutEdges = [];
    for (let f = 0; f < F; f++) for (let i = 0; i < n; i++) { const kk = nb[f][i].key; if (tree.has(kk) || done.has(kk)) continue; done.add(kk); cutEdges.push([f, i]); }
    for (const [f, i] of cutEdges) {
      const g = nb[f][i].other, gv = S.faces[g].v, fv = S.faces[f].v; let j = 0;
      for (; j < n; j++) if (gv[j] === fv[(i + 1) % n] && gv[(j + 1) % n] === fv[i]) break;
      const opts = rng() < 0.5 ? [[f, i], [g, j]] : [[g, j], [f, i]];
      let ok = false;
      outer: for (const [c1, c2] of TAPERS) for (const [ff, ii] of opts) {
        const tp = tabPoly(pos[ff][ii], pos[ff][(ii + 1) % n], c1, c2), ts = shrink(tp, 0.01);
        if (shr.some(sp => overlap(sp, ts))) continue;
        if (tabs.some(tb => overlap(tb.s, ts))) continue;
        tabs.push({ f: ff, i: ii, poly: tp, s: ts }); ok = true; break outer;
      }
      if (!ok) { G.__dbg && G.__dbg.tab++; return null; }
    }
    return { pos, parent, tree, tabs };
  }
  let best = null, bestA = Infinity, found = 0;
  for (let tries = 0; tries < 6000 && found < 30; tries++) {
    const r = attempt(); if (!r) continue; found++;
    const all = [...r.pos, ...r.tabs.map(tb => tb.poly)];
    for (let ai = 0; ai < 36; ai++) {
      const ang = ai * Math.PI / 36, b = bbox(all.map(p => p.map(q => P2.rot(q, ang))));
      const A = b.w * b.h * (1 + 0.15 * Math.abs(Math.log(b.w / b.h)));
      if (A < bestA) { bestA = A; best = { r, ang }; }
    }
  }
  if (!best) return null;
  const { r, ang } = best, R = q => P2.rot(q, ang);
  const pos = r.pos.map(p => p.map(R)), tabs = r.tabs.map(tb => ({ f: tb.f, i: tb.i, poly: tb.poly.map(R) }));
  const b = bbox([...pos, ...tabs.map(tb => tb.poly)]), sh = q => [q[0] - b.x0, q[1] - b.y0];
  const out = { pos: pos.map(p => p.map(sh)), tabs: tabs.map(tb => ({ ...tb, poly: tb.poly.map(sh) })), parent: r.parent, tree: r.tree, nb };
  netCache[ck] = out;
  return out;
}
function chain(segs) {
  const key = p => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000);
  const used = new Array(segs.length).fill(false), at = {};
  segs.forEach((s, i) => { [0, 1].forEach(e => { const kk = key(s[e]); (at[kk] = at[kk] || []).push(i); }); });
  const out = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue; used[i] = true;
    const pts = [segs[i][0], segs[i][1]];
    for (let dir = 0; dir < 2; dir++) {
      for (;;) {
        const end = dir === 0 ? pts[pts.length - 1] : pts[0], kk = key(end);
        const nx = (at[kk] || []).find(j => !used[j]); if (nx === undefined) break;
        used[nx] = true; const s = segs[nx], other = key(s[0]) === kk ? s[1] : s[0];
        if (dir === 0) pts.push(other); else pts.unshift(other);
      }
    }
    const closed = pts.length > 2 && key(pts[0]) === key(pts[pts.length - 1]);
    if (closed) pts.pop();
    out.push({ pts, closed });
  }
  return out;
}
function dashed(seg, dash, gap) {
  const [a, b] = seg, v = P2.sub(b, a), l = P2.len(v), u = [v[0] / l, v[1] / l], out = [];
  const nD = Math.max(1, Math.floor((l + gap) / (dash + gap))), used = nD * dash + (nD - 1) * gap, st = (l - used) / 2;
  for (let i = 0; i < nD; i++) { const s0 = st + i * (dash + gap); out.push({ pts: [P2.add(a, P2.mul(u, s0)), P2.add(a, P2.mul(u, s0 + dash))], closed: false }); }
  return out;
}
function net(p) {
  const S = solid(p.solid), n = S.sides, L = p.L, warn = [];
  const tabFrac = Math.min(p.tabH / L, 0.32);
  const lay = netLayout(p.solid, Math.round(tabFrac * 100) / 100);
  if (!lay) return { parts: [], warn: [{ lvl: 'err', msg: 'Could not find a net layout.' }], info: {} };
  const sc = q => [q[0] * L, q[1] * L];
  const pos = lay.pos.map(pp => pp.map(sc)), tabs = lay.tabs.map(tb => ({ ...tb, poly: tb.poly.map(sc) }));
  const cutSegs = [], scoreSegs = [], seenTree = new Set();
  const tabOn = {}; tabs.forEach(tb => { tabOn[tb.f + ':' + tb.i] = tb; });
  pos.forEach((pp, f) => pp.forEach((pa, i) => {
    const pb = pp[(i + 1) % n], kk = lay.nb[f][i].key;
    if (lay.tree.has(kk)) { if (!seenTree.has(kk)) { seenTree.add(kk); scoreSegs.push([pa, pb]); } }
    else if (tabOn[f + ':' + i]) {
      scoreSegs.push([pa, pb]);
      const tp = tabOn[f + ':' + i].poly; // ccw: find pa, pb and emit outer 3 sides
      const ia = tp.findIndex(q => P2.len(P2.sub(q, pa)) < 1e-6), ib = tp.findIndex(q => P2.len(P2.sub(q, pb)) < 1e-6);
      // walk from pb to pa the long way
      let cur = ib; for (let s2 = 0; s2 < 3; s2++) { const nx = (cur + 1) % 4; cutSegs.push([tp[cur], tp[nx]]); cur = nx; }
      if (cur !== ia) { /* orientation mismatch: walk other way */ cutSegs.splice(cutSegs.length - 3, 3); cur = ia; for (let s2 = 0; s2 < 3; s2++) { const nx = (cur + 1) % 4; cutSegs.push([tp[cur], tp[nx]]); cur = nx; } }
    } else cutSegs.push([pa, pb]);
  }));
  const cuts = chain(cutSegs);
  let scores = [];
  if (p.fold === 'perf') { scoreSegs.forEach(sg => cuts.push(...dashed(sg, Math.max(1.5, Math.min(6, L * 0.06)), Math.max(1, Math.min(2.5, L * 0.025))))); }
  else scores = scoreSegs.map(sg => ({ pts: sg, closed: false }));
  const marks = [];
  if (p.dice) {
    const F = S.faces.length, num = new Array(F).fill(0);
    if (F === 4) num.forEach((_, i) => { num[i] = i + 1; });
    else { let k2 = 1; for (let f = 0; f < F; f++) { if (num[f]) continue; const o = S.faces.findIndex(g => V.dot(g.n, S.faces[f].n) < -0.999); num[f] = k2; num[o] = F + 1 - k2; k2++; } }
    pos.forEach((pp, f) => {
      const c = centroid(pp), ap = L / (2 * Math.tan(Math.PI / n)), hN = ap * 0.75;
      const e0 = P2.sub(pp[1], pp[0]), ang = Math.atan2(e0[1], e0[0]);
      marks.push(...text(String(num[f]), c, hN, ang));
      if (num[f] === 6 || num[f] === 9) marks.push(...text('_', c, hN, ang));
    });
  }
  return { parts: [{ name: 'Net', cuts, scores, marks, count: p.copies || 1, tri: false }], warn, info: { pos, tabs, lay, dihedral: S.dihedral, n } };
}

/* ---------- packing (sheet origin bottom-left, y-up; fill from top-left) ---------- */
function xformPart(part, rot180, dx, dy, b) {
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const f = q => { let x = q[0], y = q[1]; if (rot180) { x = 2 * cx - x; y = 2 * cy - y; } return [x - b.x0 + dx, y - b.y0 + dy]; };
  const m = arr => arr.map(pl => ({ pts: pl.pts.map(f), closed: pl.closed }));
  return { cuts: m(part.cuts), scores: m(part.scores || []), marks: m(part.marks || []), fills: m(part.fills || []) };
}
function pack(parts, W, Hs, margin, sp) {
  const items = [];
  parts.forEach(pt => { for (let i = 0; i < pt.count; i++) items.push(pt); });
  const sheets = [], warn = [];
  let sheet = null, x = margin, rowTop = Hs - margin, rowH = 0, prevTri = false, triIdx = 0, prevB = null, prevLeft = margin, rowEmpty = true;
  const newSheet = () => { sheet = { cuts: [], scores: [], marks: [], fills: [], counts: {} }; sheets.push(sheet); x = margin; rowTop = Hs - margin; rowH = 0; prevTri = false; triIdx = 0; rowEmpty = true; };
  newSheet();
  for (const pt of items) {
    const b = pt._b || (pt._b = bbox(pt.cuts.map(c => c.pts)));
    if (b.w > W - 2 * margin || b.h > Hs - 2 * margin) {
      if (!warn.length) warn.push({ lvl: 'err', msg: `A part (${b.w.toFixed(0)}×${b.h.toFixed(0)} mm) is bigger than the sheet. It's been put on its own oversize sheet.` });
      const sh = { cuts: [], scores: [], marks: [], fills: [], counts: {}, oversize: { w: b.w + 2 * margin, h: b.h + 2 * margin } };
      const xp = xformPart(pt, false, margin, margin, b);
      sh.cuts.push(...xp.cuts); sh.scores.push(...xp.scores); sh.marks.push(...xp.marks); sh.fills.push(...xp.fills); sh.counts[pt.name] = 1;
      sheets.splice(sheets.length - 1, 0, sh); continue;
    }
    let px;
    if (rowEmpty) px = margin;
    else if (pt.tri && prevTri && prevB === b) px = prevLeft + b.w / 2 + sp / Math.sin(Math.PI / 3);
    else px = x + sp;
    if (px + b.w > W - margin + 1e-6) { rowTop -= rowH + sp; px = margin; x = margin; rowH = 0; prevTri = false; triIdx = 0; rowEmpty = true; }
    if (rowTop - b.h < margin - 1e-6) { newSheet(); px = margin; }
    const rot = pt.tri ? (triIdx % 2 === 1) : false;
    const xp = xformPart(pt, rot, px, rowTop - b.h, b);
    sheet.cuts.push(...xp.cuts); sheet.scores.push(...xp.scores); sheet.marks.push(...xp.marks); sheet.fills.push(...xp.fills);
    sheet.counts[pt.name] = (sheet.counts[pt.name] || 0) + 1;
    x = Math.max(x, px + b.w); prevLeft = px; rowEmpty = false; rowH = Math.max(rowH, b.h);
    if (pt.tri) { prevTri = true; triIdx++; } else { prevTri = false; triIdx = 0; }
    prevB = b;
  }
  return { sheets: sheets.filter(s => s.cuts.length), warn };
}

/* ---------- exporters ---------- */
const COL = { cut: '#ff0000', score: '#0000ff', mark: '#00a000', fill: '#000000' };
function pathD(pl, H) { return 'M' + pl.pts.map(q => q[0].toFixed(3) + ',' + (H - q[1]).toFixed(3)).join('L') + (pl.closed ? 'Z' : ''); }
function sheetSVG(sh, W, H, opts = {}) {
  const sw = opts.preview ? 'stroke-width="1.2" vector-effect="non-scaling-stroke"' : 'stroke-width="0.1"';
  const grp = (id, arr) => arr.length ? `<g id="${id}" fill="${id === 'fill' ? (opts.preview ? 'rgba(40,24,10,.75)' : '#000000') : 'none'}" fill-rule="evenodd" stroke="${COL[id]}" ${sw} stroke-linecap="round" stroke-linejoin="round"><path d="${arr.map(pl => pathD(pl, H)).join('')}"/></g>` : '';
  const bg = opts.preview ? `<rect x="0" y="0" width="${W}" height="${H}" fill="${opts.bg || '#fff'}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">${opts.preview ? '' : '<!-- Polysmith: red=cut, blue=score/fold, green=engrave line, black=fill engrave -->'}${bg}${grp('fill', sh.fills || [])}${grp('mark', sh.marks)}${grp('score', sh.scores)}${grp('cut', sh.cuts)}</svg>`;
}
function sheetDXF(sh) {
  const L = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  const add = (arr, layer, col) => arr.forEach(pl => {
    L.push('0', 'POLYLINE', '8', layer, '62', col, '66', '1', '70', pl.closed ? '1' : '0');
    pl.pts.forEach(q => L.push('0', 'VERTEX', '8', layer, '10', q[0].toFixed(4), '20', q[1].toFixed(4), '30', '0'));
    L.push('0', 'SEQEND', '8', layer);
  });
  add(sh.cuts, 'CUT', '1'); add(sh.scores, 'SCORE', '5'); add(sh.marks, 'ENGRAVE', '3'); add(sh.fills || [], 'FILL_ENGRAVE', '7');
  L.push('0', 'ENDSEC', '0', 'EOF');
  return L.join('\r\n');
}
/* stored (uncompressed) zip */
function crc32(buf) { let c, crc = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) { c = (crc ^ buf[i]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }
function zip(files) {
  const enc = new TextEncoder(), chunks = [], central = []; let off = 0;
  const u16 = v => [v & 255, (v >> 8) & 255], u32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  files.forEach(f => {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const hdr = [0x50, 0x4b, 3, 4, ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)];
    chunks.push(new Uint8Array(hdr), name, data);
    central.push({ name, crc, size: data.length, off });
    off += hdr.length + name.length + data.length;
  });
  let cdSize = 0;
  central.forEach(c => {
    const h = [0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c.crc), ...u32(c.size), ...u32(c.size), ...u16(c.name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(c.off)];
    chunks.push(new Uint8Array(h), c.name); cdSize += h.length + c.name.length;
  });
  chunks.push(new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(central.length), ...u16(central.length), ...u32(cdSize), ...u32(off), 0, 0]));
  return new Blob(chunks, { type: 'application/zip' });
}

G.Poly = { PHI, TAU, V, P2, INFO, solid, panels, coupon, net, pack, sheetSVG, sheetDXF, zip, perim, offset, area, overlap, bbox, text, bracketFrame, ngon, fingerGeom, jigStation, ccw, stationSVG, stationDXF };
})(typeof window !== 'undefined' ? window : globalThis);

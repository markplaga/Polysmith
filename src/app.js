(function () {
'use strict';
const P = window.Poly, { V } = P;
const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
const IN = 25.4;

/* ---------- state ---------- */
const DEF = {
  solid: 'icosa', mode: 'tab', units: 'mm', measure: 'edge', size: 80, t: 3, kerf: 0.15, fit: 0.05,
  perEdge: 1, tabLen: 0, protrude: 0, fingerW: 0, fingerStyle: 'flush', deckColor: '#3f9aa0', artMode: 'fill', artScale: 80, artRot: 0, artWhere: 'all', window: 'none', windowPct: 60, dice: false,
  tabH: 8, fold: 'score', copies: 1, sheetW: 600, sheetH: 400, margin: 5, spacing: 3, sheetPreset: '600x400',
};
let st = { ...DEF };
try { const s = JSON.parse(localStorage.getItem('polysmith') || 'null'); if (s) st = { ...DEF, ...s }; } catch (e) { /* storage unavailable */ }
const save = () => { try { localStorage.setItem('polysmith', JSON.stringify(st)); } catch (e) { /* ignore */ } };

const LEN_KEYS = ['fingerW', 'size', 't', 'kerf', 'fit', 'tabLen', 'protrude', 'tabH', 'sheetW', 'sheetH', 'margin', 'spacing'];
const fmtLen = (mm, key) => {
  if (st.units === 'in') { const v = mm / IN; return +(v.toFixed(['kerf', 'fit', 'protrude'].includes(key) ? 4 : 3)); }
  return +mm.toFixed(['kerf', 'fit'].includes(key) ? 3 : 2);
};
const u = (mm, dp) => st.units === 'in' ? (mm / IN).toFixed(dp == null ? 3 : dp) + '″' : mm.toFixed(dp == null ? 1 : Math.max(0, dp - 2)) + ' mm';


/* ---------- artwork: SVG -> polylines ---------- */
let ART = null; // {name, svg, polys:[{pts,closed}]} normalised to the unit circle, y-up
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
function sanitizeSVG(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) throw new Error("That file isn't a readable SVG.");
  root.querySelectorAll('script,foreignObject,iframe,image,audio,video,animate,set,animateTransform,animateMotion').forEach(n => n.remove());
  root.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => { if (/^on/i.test(a.name) || (/href$/i.test(a.name) && !/^#/.test(a.value.trim()))) n.removeAttribute(a.name); }));
  [...root.attributes].forEach(a => { if (/^on/i.test(a.name)) root.removeAttribute(a.name); });
  return root;
}
function expandUses(root) {
  for (let pass = 0; pass < 4; pass++) {
    const uses = [...root.querySelectorAll('use')]; if (!uses.length) break;
    uses.forEach(u => {
      const ref = (u.getAttribute('href') || u.getAttribute('xlink:href') || u.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '').trim();
      const target = ref.startsWith('#') ? root.querySelector('[id="' + ref.slice(1).replace(/"/g, '') + '"]') : null;
      if (!target || target === u || target.contains(u)) { u.remove(); return; }
      const g = root.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
      const x = parseFloat(u.getAttribute('x') || 0), y = parseFloat(u.getAttribute('y') || 0);
      g.setAttribute('transform', (u.getAttribute('transform') || '') + ` translate(${x || 0},${y || 0})`);
      ['fill', 'stroke', 'stroke-width', 'style', 'class'].forEach(a => { if (u.hasAttribute(a)) g.setAttribute(a, u.getAttribute(a)); });
      const clone = target.cloneNode(true); clone.removeAttribute('id');
      if (clone.nodeName.toLowerCase() === 'symbol') { while (clone.firstChild) g.appendChild(clone.firstChild); } else g.appendChild(clone);
      u.parentNode.replaceChild(g, u);
    });
  }
}
function parseArt(text, name) {
  const root = sanitizeSVG(text);
  expandUses(root);
  const num = v => parseFloat(String(v || '').replace(/[a-z%]+$/i, ''));
  if (!root.getAttribute('viewBox')) { const w = num(root.getAttribute('width')), h = num(root.getAttribute('height')); if (w > 0 && h > 0) root.setAttribute('viewBox', `0 0 ${w} ${h}`); }
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;width:600px;height:600px;overflow:hidden;';
  const svg = document.importNode(root, true);
  svg.setAttribute('width', '600'); svg.setAttribute('height', '600');
  host.appendChild(svg); document.body.appendChild(host);
  const polys = []; let texts = 0;
  try {
    if (!svg.getAttribute('viewBox')) { const b = svg.getBBox(); if (b.width > 0 && b.height > 0) svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.width} ${b.height}`); }
    texts = svg.querySelectorAll('text').length;
    const els = svg.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon');
    const SP = 0.6; // sampling step in the 600px frame
    els.forEach(el => {
      if (el.closest('defs,clipPath,mask,symbol,marker,pattern')) return;
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return;
      let len = 0; try { len = el.getTotalLength(); } catch (e) { return; }
      if (!(len > 0)) return;
      const m = el.getCTM(); if (!m) return;
      const sc = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
      const N = Math.max(8, Math.min(6000, Math.ceil(len * sc / SP)));
      let cur = [], prev = null;
      const flush = () => { if (cur.length > 1) polys.push(cur); cur = []; };
      for (let i = 0; i <= N; i++) {
        const q = el.getPointAtLength(len * i / N), r = new DOMPoint(q.x, q.y).matrixTransform(m), pt = [r.x, -r.y];
        if (prev && Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 4 * (len * sc / N) + 0.5) flush();
        cur.push(pt); prev = pt;
      }
      flush();
    });
  } finally { host.remove(); }
  if (!polys.length) throw new Error(texts ? 'This SVG only has text. Convert text to paths (outlines) in your design app, then upload again.' : 'No drawable shapes found in that SVG.');
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  polys.forEach(pl => pl.forEach(q => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; let r = 0;
  polys.forEach(pl => pl.forEach(q => { r = Math.max(r, Math.hypot(q[0] - cx, q[1] - cy)); }));
  r = r || 1;
  const out = polys.map(pl => {
    let pts = pl.map(q => [(q[0] - cx) / r, (q[1] - cy) / r]);
    const closed = pts.length > 3 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.01;
    pts = rdp(pts, 0.0012); if (closed && pts.length > 3) pts.pop();
    return { pts, closed: closed && pts.length >= 3 };
  }).filter(pl => pl.pts.length >= 2);
  const clean = new XMLSerializer().serializeToString(root);
  return { name: name || 'artwork.svg', svg: clean, polys: out, texts };
}
function setArt(text, name) {
  ART = parseArt(text, name);
  try { localStorage.setItem('polysmith-art', JSON.stringify({ name: ART.name, svg: ART.svg })); } catch (e) { /* too big or blocked */ }
  renderArtUI(); compute();
  if (ART.texts) toast('Text elements were skipped. Convert text to outlines to include it.');
}
function clearArt() { ART = null; try { localStorage.removeItem('polysmith-art'); } catch (e) { /* ignore */ } renderArtUI(); compute(); }
function renderArtUI() {
  const has = !!ART;
  $('#art-thumb').innerHTML = has ? `<img alt="" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(ART.svg)}">` : '<span>No artwork</span>';
  $('#art-name').textContent = has ? `${ART.name} · ${ART.polys.length} paths` : 'Upload an SVG' + (sampleFn ? ' or describe one below' : '');
  $('#art-clear').hidden = !has;
  $$('.art-opt').forEach(el => { el.style.display = has ? '' : 'none'; });
}
function artRadius(res, mode) {
  const inf = res.info, t = st.t;
  if (st.mode === 'net') { const n = R0().sides; return R0L() / (2 * Math.tan(Math.PI / n)) * 0.82; }
  if (inf.finger) return mode === 'cut' ? inf.finger.a - inf.finger.v - Math.max(2 * t, 4) : inf.finger.a - inf.finger.v - 1;
  if (mode === 'cut') return inf.per > 0 ? inf.ap - inf.D - Math.max(t, 2.5) : inf.ap - Math.max(2 * t, 4);
  return inf.ap - Math.max(1.2 * t, 2.5);
}
let _S = null, _L = 0; const R0 = () => _S, R0L = () => _L;
function applyArt(res, S, L) {
  _S = S; _L = L; res.artFace = null;
  if (!ART) return;
  const mode = st.artMode, rad = Math.max(1, artRadius(res, mode)) * st.artScale / 100, rot = st.artRot * Math.PI / 180;
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
let R = null;
function edgeFromSize() {
  const S = P.solid(st.solid);
  if (st.measure === 'edge') return st.size;
  if (st.measure === 'sphere') return st.size / (2 * S.R);
  return st.size / S.height;
}
function compute() {
  const L = edgeFromSize();
  const base = { solid: st.solid, L, t: st.t, kerf: st.kerf, fit: st.fit };
  let res;
  if (st.mode === 'net') res = P.net({ ...base, tabH: st.tabH, fold: st.fold, dice: st.dice, copies: st.copies });
  else res = P.panels({ ...base, joint: st.mode, perEdge: st.perEdge, tabLen: st.tabLen, fingerW: st.fingerW, fingerStyle: st.fingerStyle, protrude: st.protrude, window: st.window, windowPct: st.windowPct, dice: st.dice });
  applyArt(res, P.solid(st.solid), L);
  let jig = null;
  if (st.mode === 'finger' && st.fingerStyle === 'bevel' && res.info.finger) jig = P.jigStation(P.solid(st.solid), L, st.t, res.info.finger, { kerf: st.kerf, fit: st.fit, bedW: st.sheetW, bedH: st.sheetH });
  const pk = P.pack(res.parts, st.sheetW, st.sheetH, st.margin, st.spacing);
  let cut = 0, score = 0;
  pk.sheets.forEach(sh => { sh.cuts.forEach(c => { cut += P.perim(c); }); sh.scores.forEach(c => { score += P.perim(c); }); });
  R = { L, res, pk, cut, score, S: P.solid(st.solid), jig };
  if (curSheet >= pk.sheets.length) curSheet = 0;
  sceneDirty = true;
  renderAll();
}

/* ---------- UI binding ---------- */
function syncInputs() {
  $$('[data-k]').forEach(el => {
    const k = el.dataset.k;
    if (el.type === 'checkbox') el.checked = !!st[k];
    else if (el.tagName === 'SELECT') el.value = st[k];
    else if (el.type === 'range') el.value = st[k];
    else el.value = LEN_KEYS.includes(k) ? fmtLen(st[k], k) : st[k];
  });
  $$('[data-unit]').forEach(el => { el.textContent = st.units === 'in' ? 'in' : 'mm'; });
  $$('.seg [data-v]').forEach(b => { const k = b.parentElement.dataset.seg; b.classList.toggle('on', String(st[k]) === b.dataset.v); });
  $$('.solid-btn').forEach(b => b.classList.toggle('on', b.dataset.solid === st.solid));
  document.body.dataset.mode = st.mode;
  $('#wpct-out').textContent = st.windowPct + '%';
}
let tmr = null;
function onInput(el, immediate) {
  const k = el.dataset.k;
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.tagName === 'SELECT') v = el.value;
  else { v = parseFloat(el.value); if (!isFinite(v)) return; if (LEN_KEYS.includes(k) && st.units === 'in') v *= IN; }
  if (['size', 't', 'sheetW', 'sheetH'].includes(k) && v <= 0) return;
  if (k === 'measure') {
    // keep physical size: convert current edge into the new measure
    const L = edgeFromSize(), S = P.solid(st.solid);
    st.measure = v; st.size = v === 'edge' ? L : v === 'sphere' ? L * 2 * S.R : L * S.height;
    syncInputs(); compute(); save(); return;
  }
  if (k === 'sheetPreset') {
    st.sheetPreset = v;
    if (v !== 'custom') { const [w, h] = v.split('x').map(Number); st.sheetW = w; st.sheetH = h; }
    syncInputs(); compute(); save(); return;
  }
  if (k === 'sheetW' || k === 'sheetH') st.sheetPreset = 'custom';
  st[k] = v;
  if (k === 'windowPct') $('#wpct-out').textContent = v + '%';
  clearTimeout(tmr);
  if (immediate) { compute(); save(); } else tmr = setTimeout(() => { compute(); save(); }, 160);
}
function bind() {
  $$('[data-k]').forEach(el => {
    el.addEventListener('input', () => onInput(el, false));
    el.addEventListener('change', () => onInput(el, true));
  });
  $$('.seg').forEach(seg => seg.addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    const k = seg.dataset.seg; let v = b.dataset.v; if (/^\d+$/.test(v)) v = +v;
    if (k === 'units') { st.units = v; syncInputs(); save(); renderAll(); return; }
    st[k] = v; if (k === 'mode') { anim.t = 0; anim.playing = st.mode === 'net'; anim.dir = 1; }
    syncInputs(); compute(); save();
  }));
  $$('.solid-btn').forEach(b => b.addEventListener('click', () => {
    const L = edgeFromSize(), S = P.solid(b.dataset.solid);
    st.solid = b.dataset.solid;
    if (st.measure !== 'edge') st.size = st.measure === 'sphere' ? L * 2 * P.solid(st.solid).R : L * P.solid(st.solid).height;
    void S; syncInputs(); compute(); save();
  }));
  $$('.chip[data-t]').forEach(c => c.addEventListener('click', () => { st.t = parseFloat(c.dataset.t); syncInputs(); compute(); save(); }));
  $('#reset').addEventListener('click', () => { st = { ...DEF }; syncInputs(); compute(); save(); });
  $('#slider').addEventListener('input', e => { anim.t = +e.target.value / 1000; anim.playing = false; updPlay(); sceneDirty = true; });
  $('#play').addEventListener('click', () => { anim.playing = !anim.playing; if (anim.playing && anim.t >= 1) anim.dir = -1; if (anim.playing && anim.t <= 0) anim.dir = 1; updPlay(); });
  $('#sheet-tabs').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; curSheet = +b.dataset.i; renderSheet(); });
  $('#dl-svg').addEventListener('click', () => dl(fname(curSheet, 'svg'), P.sheetSVG(R.pk.sheets[curSheet], ...sheetDims(R.pk.sheets[curSheet]))));
  $('#dl-dxf').addEventListener('click', () => dl(fname(curSheet, 'dxf').replace(/dxf$/, 'dxf'), P.sheetDXF(R.pk.sheets[curSheet]), true));
  $('#dl-zip').addEventListener('click', () => dl(baseName() + '.zip', buildZip()));
  $('#dl-coupon').addEventListener('click', () => {
    const pan = R.res.parts.find(p => p.name === 'Bracket') ? R.res : P.panels({ solid: st.solid, L: R.L, t: st.t, kerf: st.kerf, fit: st.fit, joint: 'tab', perEdge: 1, tabLen: st.tabLen, protrude: 0, window: 'none', windowPct: 0, dice: false });
    const parts = P.coupon({ t: st.t, kerf: st.kerf, fit: st.fit }, pan);
    const pk = P.pack(parts, 300, 200, 4, 3), sh = pk.sheets[0];
    const b = P.bbox(sh.cuts.map(c => c.pts));
    dl(`polysmith-fit-coupon-${st.t}mm.svg`, P.sheetSVG(sh, Math.ceil(b.x1 + 4), 200).replace(/viewBox="0 0 (\S+) 200"/, (m, w) => `viewBox="0 ${(200 - b.y1 - 4).toFixed(2)} ${w} ${(b.y1 - b.y0 + 8).toFixed(2)}"`).replace(/height="200mm"/, `height="${(b.y1 - b.y0 + 8).toFixed(2)}mm"`));
  });
}
const sheetDims = sh => sh.oversize ? [Math.ceil(sh.oversize.w), Math.ceil(sh.oversize.h)] : [st.sheetW, st.sheetH];
const baseName = () => `polysmith-${R.S.name.toLowerCase()}-${st.mode === 'net' ? 'net' : st.mode === 'tab' ? 'slotted' : st.mode === 'finger' ? 'finger' : st.mode === 'block' ? 'glueblock' : 'panels'}-${Math.round(R.L)}mm-edge-${st.t}mm`;
const fname = (i, ext) => `${baseName()}-sheet${i + 1}of${R.pk.sheets.length}.${ext}`;
function readme() {
  const S = R.S, inf = R.res.info, lines = [
    `Polysmith — ${S.name} (${S.die})`, '',
    `Edge length (outer): ${R.L.toFixed(2)} mm`, `Dihedral angle: ${(S.dihedral * 180 / Math.PI).toFixed(3)}°`,
    `Across points (sphere dia): ${(2 * S.R * R.L).toFixed(1)} mm`, `Height resting on a face: ${(S.height * R.L).toFixed(1)} mm`,
    `Material: ${st.t} mm, kerf ${st.kerf} mm, fit ${st.fit} mm`, '',
    'Colours: RED = cut, BLUE = score / fold line, GREEN = line engrave, BLACK = fill engrave (artwork).',
    'Files are in millimetres. Import at 100% scale. DXF layers: CUT, SCORE, ENGRAVE.', '',
    'Parts:', ...R.res.parts.map(p => `  ${p.count} × ${p.name}`), '', ...guideText().map(s => '- ' + s),
  ];
  if (inf.s != null) lines.splice(7, 0, `Face inset per edge (thickness compensation): ${inf.s.toFixed(2)} mm`);
  return lines.join('\r\n');
}
function buildZip() {
  const files = [];
  R.pk.sheets.forEach((sh, i) => { files.push({ name: fname(i, 'svg'), data: P.sheetSVG(sh, ...sheetDims(sh)) }); files.push({ name: fname(i, 'dxf'), data: P.sheetDXF(sh) }); });
  if (R.jig) {
    const pk = P.pack(R.jig.parts, st.sheetW, st.sheetH, st.margin, st.spacing);
    pk.sheets.forEach((sh, i) => files.push({ name: `${baseName()}-jig-parts-${i + 1}.svg`, data: P.sheetSVG(sh, st.sheetW, st.sheetH) }));
    files.push({ name: `${baseName()}-jig-station.svg`, data: P.stationSVG(R.jig.station) }, { name: `${baseName()}-jig-station.dxf`, data: P.stationDXF(R.jig.station) });
  }
  files.push({ name: 'README.txt', data: readme() });
  return P.zip(files);
}
let dlNS = null;
if (window.claude && window.claude.use) window.claude.use('downloads').then(ns => { dlNS = ns; }).catch(() => {});
function toast(m, bad) { const el = $('#toast'); el.textContent = m; el.className = 'toast show' + (bad ? ' bad' : ''); clearTimeout(el._t); el._t = setTimeout(() => { el.className = 'toast'; }, 3600); }
async function dl(name, data) {
  const toast = $('#toast');
  const show = (m, bad) => { toast.textContent = m; toast.className = 'toast show' + (bad ? ' bad' : ''); clearTimeout(toast._t); toast._t = setTimeout(() => { toast.className = 'toast'; }, 3200); };
  const isDxf = name.endsWith('.dxf');
  if (dlNS && !isDxf) {
    try { await dlNS.save({ filename: name, data }); show('Saved ' + name); } catch (e) { if (e && e.code === 'declined') show('Download cancelled'); else show('Could not save: ' + (e && e.message || e), true); }
    return;
  }
  if (dlNS && isDxf) { // .dxf isn't on the allow-list — ship it inside a zip
    try { await dlNS.save({ filename: name.replace(/\.dxf$/, '-dxf.zip'), data: P.zip([{ name, data }]) }); show('Saved DXF (zipped)'); } catch (e) { if (e && e.code === 'declined') show('Download cancelled'); else show('Could not save: ' + (e && e.message || e), true); }
    return;
  }
  try {
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); show('Downloading ' + name);
  } catch (e) { show('Downloads are blocked here', true); }
}

/* ---------- render: stats, warnings, guide, sheets ---------- */
let curSheet = 0;
function renderAll() { renderStats(); renderSheet(); renderGuide(); renderJig(); updSolo(); sceneDirty = true; }
function renderStats() {
  const S = R.S, inf = R.res.info, L = R.L;
  const rows = [
    ['Edge length', u(L)], ['Across points', u(2 * S.R * L)], ['Height on a face', u(S.height * L)],
    ['Dihedral angle', (S.dihedral * 180 / Math.PI).toFixed(3) + '°'],
  ];
  if (st.mode === 'finger') {
    rows.push(['Fingers per edge', inf.finger.N + ''], ['Finger width', u(inf.finger.w)], ['Finger depth', u((inf.finger.vMax || inf.finger.v) - inf.finger.U, 3)]);
  } else if (st.mode !== 'net') {
    rows.push(['Edge inset (thickness fix)', u(inf.s, 3)]);
    if (inf.per > 0) rows.push([st.mode === 'tab' ? 'Tab length' : 'Block depth', u(st.mode === 'tab' ? inf.w : inf.D)]);
  }
  rows.push(['Sheets', st.units === 'in' ? `${R.pk.sheets.length} × ${+(st.sheetW / IN).toFixed(2)}×${+(st.sheetH / IN).toFixed(2)}″` : `${R.pk.sheets.length} × ${+st.sheetW.toFixed(1)}×${+st.sheetH.toFixed(1)}`]);
  rows.push(['Cut length', st.units === 'in' ? (R.cut / IN / 12).toFixed(1) + ' ft' : (R.cut / 1000).toFixed(2) + ' m']);
  if (R.score) rows.push(['Score length', st.units === 'in' ? (R.score / IN / 12).toFixed(1) + ' ft' : (R.score / 1000).toFixed(2) + ' m']);
  $('#stats').innerHTML = rows.map(r => `<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join('');
  $('#parts').innerHTML = R.res.parts.reduce((acc, p) => { const base = p.name.replace(/ \d+$/, ''); const f = acc.find(a => a.n === base); if (f) f.c += p.count; else acc.push({ n: base, c: p.count }); return acc; }, [])
    .map(p => `<li><b>${p.c}×</b> ${p.n}${p.c > 1 && !/s$/.test(p.n) ? 's' : ''}</li>`).join('');
  const w = [...R.res.warn, ...R.pk.warn];
  $('#warn').innerHTML = w.map(x => `<div class="w ${x.lvl}">${x.msg}</div>`).join('');
}
function renderSheet() {
  const sheets = R.pk.sheets;
  $('#sheet-tabs').innerHTML = sheets.length > 1 ? sheets.map((s, i) => `<button data-i="${i}" class="${i === curSheet ? 'on' : ''}">Sheet ${i + 1}</button>`).join('') : '';
  const sh = sheets[curSheet];
  if (!sh) { $('#sheet').innerHTML = '<p class="empty">Nothing to cut.</p>'; return; }
  const [W, H] = sheetDims(sh);
  $('#sheet').innerHTML = P.sheetSVG(sh, W, H, { preview: true, bg: '#f4ead8' }).replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%" preserveAspectRatio="xMidYMid meet"');
  $('#sheet-cap').textContent = Object.entries(sh.counts).map(([k, v]) => `${v} ${k.replace(/ \d+$/, '')}`).reduce((a, s) => { const m = s.match(/^(\d+) (.*)$/); const f = a.find(x => x[1] === m[2]); if (f) f[0] += +m[1]; else a.push([+m[1], m[2]]); return a; }, []).map(x => `${x[0]} × ${x[1]}`).join(' · ');
  $('#dl-svg').textContent = `SVG · sheet ${curSheet + 1}`;
  $('#dl-dxf').textContent = `DXF · sheet ${curSheet + 1}`;
}

function renderJig() {
  const card = $('#jigcard'), on = st.mode === 'finger' && st.fingerStyle === 'bevel';
  card.hidden = !on; if (!on) return;
  const J = R.jig, deg = x => (x * 180 / Math.PI).toFixed(1) + '°';
  if (!J) { $('#jig-body').innerHTML = '<p class="foot">A cube meets at exactly 90°, so its teeth are already square. Cut the faces flat and you\'re done. No jig needed.</p>'; return; }
  const rows = [
    ['Jig tilt', deg(J.phi)], ['Faces per run', J.K + ''], ['Runs × edges', `${J.runs} × ${J.passes}`],
    ['Tip cut height', u(J.zTip)], ['Notch cut height', u(J.zNotch)], ['Face goes in', J.outerDown ? 'Outside face down' : 'Outside face up'],
  ];
  $('#jig-body').innerHTML = `<dl class="jstats">${rows.map(r => `<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join('')}</dl>
    <div class="jprev">${P.stationSVG(J.station, { preview: true, bg: '#f4ead8' }).replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%" preserveAspectRatio="xMidYMid meet"')}</div>
    <div class="legend"><span><i style="background:#ff0000"></i>Base, cut in place</span><span><i style="background:#ff8000"></i>Tip bevels</span><span><i style="background:#a000ff"></i>Notch bevels</span><span><i style="background:#e2c08d"></i>Faces in pockets</span></div>
    <ol class="jsteps">
      <li><b>Cut the faces flat</b> from the main cut sheet. The hairline slits at each notch are intentional: they let the wedges drop out later.</li>
      <li><b>Cut the jig parts</b> (ribs, deck, pocket strip) from ${st.t} mm stock. Glue the strip onto the deck, then push the rib tabs up into the deck slots.</li>
      <li><b>Lay a scrap sheet on the bed and run only the red layer of the jig station file</b>, with Start From set to <b>Absolute Coords</b>. Leave the cut base and the scrap frame around it exactly where they are, and tape them down.</li>
      <li><b>Plug the rib tabs into the base slots.</b> The deck now sits at ${deg(J.phi)}, with the pockets at the back edge.</li>
      <li><b>Drop ${J.K} faces into the pockets, ${J.outerDown ? 'outside face DOWN' : 'outside face UP'}.</b> Gravity seats each one in its V.</li>
      <li><b>Run the orange layer, then the purple layer.</b> They're at different heights: focus ${u(J.zTip)} and ${u(J.zNotch)} above the bed (LightBurn per-layer Z offset, or move the bed between layers). The angled cut is ${(st.t / Math.cos(J.phi)).toFixed(1)} mm thick, so slow down or add a pass.</li>
      <li><b>Turn every face one position the same way</b> and run orange and purple again. Do this ${J.passes} times, then load the next ${J.K} faces (${J.runs} runs in all).</li>
      <li><b>Test first:</b> bevel two faces, push one edge together, and adjust Fit before doing the rest. If the bevels land a hair off, nudge the orange and purple layers together in LightBurn.</li>
    </ol>
    <div class="dls"><button class="btn" id="dl-jparts">Jig parts SVG</button><button class="btn" id="dl-jstation">Jig station SVG</button></div>`;
  $('#dl-jparts').onclick = () => { const pk = P.pack(J.parts, st.sheetW, st.sheetH, st.margin, st.spacing); dl(`${baseName()}-jig-parts.svg`, P.sheetSVG(pk.sheets[0], st.sheetW, st.sheetH)); };
  $('#dl-jstation').onclick = () => dl(`${baseName()}-jig-station.svg`, P.stationSVG(J.station));
}

function guideText() {
  const S = R.S, n = S.faces.length;
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
    'The fingers are offset for the ' + (S.dihedral * 180 / Math.PI).toFixed(2) + '° angle between faces, so the faces lock at exactly the right angle once they\'re pushed together. That makes them self-jigging.',
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
    'The two angle jigs sit over an edge from outside to hold it at exactly ' + (S.dihedral * 180 / Math.PI).toFixed(2) + '° while it sets.',
  ];
  return [
    `One-piece net: ${n} faces. Blue lines are folds (score at low power, or pick "perforated" to cut dashes).`,
    'Fold every line the same way, with the printed or engraved side out. Then glue each tab under its neighbouring face.',
    'Close the last face using a tab on its long side. A dab of glue and a fingertip from the open side does it.',
    st.dice ? `Dice numbers are already placed so opposite faces add up to ${n === 4 ? '— (d4 is different)' : n + 1}.` : 'Tip: turn on Dice numbers to make a working d' + n + '.',
  ];
}
function renderGuide() { $('#guide').innerHTML = guideText().map(s => `<li>${s}</li>`).join(''); }

/* ---------- 3D ---------- */
const anim = { t: 0, dir: 1, playing: false };
let yaw = 0.6, pitch = -0.35, dragging = false, lastX = 0, lastY = 0, idle = 0, sceneDirty = true, scene = [], viewR = 1;
const cv = $('#view');
let ctx = null;
function updPlay() { $('#play').textContent = anim.playing ? '❚❚' : '▶'; $('#slider').value = Math.round(anim.t * 1000); }
function rotAbout(pa, pb, th) {
  const k = V.norm([pb[0] - pa[0], pb[1] - pa[1], 0]), c = Math.cos(th), s = Math.sin(th), o = [pa[0], pa[1], 0];
  return x => { const v = V.sub(x, o); return V.add(V.add(V.add(V.mul(v, c), V.mul(V.cross(k, v), s)), V.mul(k, V.dot(k, v) * (1 - c))), o); };
}
const WOOD = [222, 184, 135], WOOD_IN = [176, 140, 98], GRAIN = [150, 108, 66], BRK = [235, 120, 80], PAPER = [246, 240, 228], PAPER_IN = [214, 196, 168], TAB = [196, 168, 130];
function buildScene() {
  if (solo === 'jig' && R.jig) return buildJigScene();
  const S = R.S, L = R.L, out = [];
  if (st.mode === 'net') {
    const inf = R.res.info; if (!inf.lay) return out;
    const n = S.sides, pos = inf.pos, lay = inf.lay, th = (Math.PI - S.dihedral) * anim.t, M = [];
    const getM = f => { if (M[f]) return M[f]; const pr = lay.parent[f]; if (!pr) return (M[f] = x => x); const pm = getM(pr.f), pp = pos[pr.f], Rr = rotAbout(pp[pr.i], pp[(pr.i + 1) % n], th); return (M[f] = x => pm(Rr(x))); };
    pos.forEach((pp, f) => out.push({ pts: pp.map(q => getM(f)([q[0], q[1], 0])), col: PAPER, back: PAPER_IN, line: 1 }));
    if (ART && R.res.artFace && R.res.artFace.net) R.res.artFace.net.forEach(({ f, c, a }) => {
      const r = R.res.artFace.r, ca = Math.cos(a), sa = Math.sin(a), m = getM(f);
      ART.polys.forEach(pl => out.push({ art: true, closed: pl.closed, pts: pl.pts.map(p => m([c[0] + (p[0] * ca - p[1] * sa) * r, c[1] + (p[0] * sa + p[1] * ca) * r, 0.05])) }));
    });
    inf.tabs.forEach(tb => {
      const pp = pos[tb.f], Rr = rotAbout(pp[tb.i], pp[(tb.i + 1) % n], Math.min(1, anim.t * 1.15) * (Math.PI - S.dihedral) + 0.0), m = getM(tb.f);
      out.push({ pts: tb.poly.map(q => m(Rr([q[0], q[1], 0]))), col: TAB, back: TAB, line: 1 });
    });
    let c = [0, 0, 0], cnt = 0; out.forEach(p => p.pts.forEach(q => { c = V.add(c, q); cnt++; })); c = V.mul(c, 1 / cnt);
    // flat net lies in the "floor" plane: rotate so z becomes y-up-ish
    out.forEach(p => { p.pts = p.pts.map(q => { const v = V.sub(q, c); return [v[0], -v[2], -v[1]]; }); });
    return out;
  }
  const inf = R.res.info, t = st.t, sc = inf.ap / inf.a, ex = anim.t * L * 0.7;
  const holes = (R.res.parts[0] && R.res.parts[0].cuts.slice(1).map(c => c.pts)) || [];
  const p0 = P.ngon(S.sides, 10)[0], th0 = Math.atan2(p0[1], p0[0]);
  const outline2 = inf.finger ? inf.finger.poly : P.ngon(S.sides, inf.ap);
  S.faces.forEach((f, fi) => {
    const g0 = out.length;
    const c = V.mul(f.c, L), off = V.mul(f.n, solo === 'all' ? ex : 0);
    const U = V.norm(V.sub(V.mul(S.verts[f.v[0]], L), c)), Wd = V.cross(f.n, U);
    const map2 = (q, depth) => { const r = Math.hypot(q[0], q[1]), a = Math.atan2(q[1], q[0]) - th0; return V.add(V.add(c, off), V.add(V.add(V.mul(U, r * Math.cos(a)), V.mul(Wd, r * Math.sin(a))), V.mul(f.n, -depth))); };
    const outer = (inf.finger && inf.finger.outer ? inf.finger.outer : outline2).map(q => map2(q, 0)), inner = (inf.finger && inf.finger.inner ? inf.finger.inner : outline2).map(q => map2(q, t));
    const h0 = holes.map(h => h.map(q => map2(q, 0))), h1 = holes.map(h => h.map(q => map2(q, t)));
    out.push({ pts: outer, holes: h0, col: WOOD, back: WOOD_IN, line: 1, face: true });
    out.push({ pts: inner.slice().reverse(), holes: h1.map(h => h.slice().reverse()), col: WOOD_IN, back: WOOD_IN, edge: false });
    if (ART && R.res.artFace && (st.artWhere !== 'one' || fi === 0)) {
      const r = R.res.artFace.r, a = R.res.artFace.rot, ca = Math.cos(a), sa = Math.sin(a);
      ART.polys.forEach(pl => out.push({ art: true, closed: pl.closed, pts: pl.pts.map(p => map2([(p[0] * ca - p[1] * sa) * r, (p[0] * sa + p[1] * ca) * r], -0.04)) }));
    }
    h0.forEach((h, hi) => { for (let i = 0; i < h.length; i++) { const j = (i + 1) % h.length; out.push({ pts: [h[j], h[i], h1[hi][i], h1[hi][j]], col: GRAIN, back: GRAIN, zb: -L * 0.06 }); } });
    for (let i = 0; i < outer.length; i++) { const j = (i + 1) % outer.length; out.push({ pts: [outer[i], outer[j], inner[j], inner[i]], col: GRAIN, back: GRAIN, zb: -L * 0.06 }); }
    for (let i = g0; i < out.length; i++) out[i].grp = 'f' + fi;
  });
  if (inf.br && inf.per > 0) {
    const fr = P.bracketFrame(S, L, inf.xs);
    const BRK_SIDE = [196, 92, 58];
    let bi = 0;
    fr.forEach(arr => arr.forEach(F3 => {
      const g0 = out.length;
      const z = V.norm(V.cross(F3.x, F3.y));
      const at = (q, h2) => V.add(V.add(F3.M, V.mul(z, h2)), V.add(V.mul(F3.x, q[0]), V.mul(F3.y, q[1])));
      const a = inf.br.map(q => at(q, t / 2)), b = inf.br.map(q => at(q, -t / 2));
      out.push({ pts: a, col: BRK, back: BRK, line: 1 });
      out.push({ pts: b.slice().reverse(), col: BRK, back: BRK, line: 1 });
      for (let i = 0; i < a.length; i++) { const j = (i + 1) % a.length; out.push({ pts: [a[i], b[i], b[j], a[j]], col: BRK_SIDE, back: BRK_SIDE }); }
      for (let i = g0; i < out.length; i++) out[i].grp = 'b' + bi; bi++;
    }));
  }
  if (solo === 'all') return out;
  const want = solo === 'face' ? 'f0' : 'b0';
  const one = out.filter(p => p.grp === want);
  if (!one.length) return out;
  let c = [0, 0, 0], cnt = 0; one.forEach(p => p.pts.forEach(q => { c = V.add(c, q); cnt++; })); c = V.mul(c, 1 / cnt);
  // lay the piece in a canonical frame: its main face toward the viewer
  const f0 = one[0].pts; let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < f0.length; i++) { const a = f0[i], b = f0[(i + 1) % f0.length]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
  const nn = V.norm([nx, ny, nz]);
  let ax = [1, 0, 0]; let best = -1; // longest edge of the main face becomes horizontal
  for (let i = 0; i < f0.length; i++) { const e = V.sub(f0[(i + 1) % f0.length], f0[i]), l = V.len(e); if (l > best) { best = l; ax = e; } }
  const uu = V.norm(V.sub(ax, V.mul(nn, V.dot(ax, nn)))), ww = V.cross(nn, uu);
  const sh = q => { const v = V.sub(q, c); return [V.dot(v, uu), V.dot(v, ww), V.dot(v, nn)]; };
  one.forEach(p => { p.pts = p.pts.map(sh); if (p.holes) p.holes = p.holes.map(h => h.map(sh)); });
  return one;
}
let solo = 'all';
function updSolo() {
  const hasBr = st.mode !== 'net' && R && R.res.info.br && R.res.info.per > 0;
  if (solo === 'bracket' && !hasBr) solo = 'all';
  $('#solo').hidden = st.mode === 'net';
  $('#jig-legend').hidden = solo !== 'jig';
  $('#solo [data-s=bracket]').hidden = !hasBr;
  $('#solo [data-s=bracket]').textContent = st.mode === 'block' ? 'Block' : 'Bracket';
  const hasJig = !!(R && R.jig); if (solo === 'jig' && !hasJig) solo = 'all';
  $('#solo [data-s=jig]').hidden = !hasJig;
  $$('#solo button').forEach(b => b.classList.toggle('on', b.dataset.s === solo));
  $('.vbar').classList.toggle('dim', solo !== 'all');
}

/* ---------- 3D jig scene (bed frame x right, y back, z up -> render x, z, -y) ---------- */
const JIG_COL = [178, 150, 112], JIG_SIDE = [130, 104, 72], BASE_COL = [150, 128, 98];
function prism(out, outer, holes, O, eu, ev, en, th, col, side) {
  const r3 = b => [b[0], b[2], -b[1]];
  const Pp = (q, hh) => r3(V.add(O, V.add(V.add(V.mul(eu, q[0]), V.mul(ev, q[1])), V.mul(en, hh))));
  let o = outer; if (P.area(o) * V.dot(V.cross(eu, ev), en) < 0) o = o.slice().reverse();
  const top = o.map(q => Pp(q, th)), bot = o.map(q => Pp(q, 0));
  const hT = holes.map(h => h.map(q => Pp(q, th))), hB = holes.map(h => h.map(q => Pp(q, 0)));
  out.push({ pts: top, holes: hT, col, back: col, line: 1 });
  out.push({ pts: bot.slice().reverse(), holes: hB.map(h => h.slice().reverse()), col: side, back: side, edge: false });
  const wall = (A, B) => { for (let i = 0; i < A.length; i++) { const j = (i + 1) % A.length; out.push({ pts: [A[i], A[j], B[j], B[i]], col: side, back: side }); } };
  wall(top, bot); hT.forEach((h, i) => wall(h, hB[i]));
}
function buildJigScene() {
  const J = R.jig, T = J.three, t = T.t, out = [], cph = Math.cos(T.phi), sph = Math.sin(T.phi);
  const st0 = J.station;
  // base plate (cut in place)
  prism(out, st0.cuts[0].pts, st0.cuts.slice(1).map(c => c.pts), [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], t, BASE_COL, JIG_SIDE);
  // ribs: profile in (y, z), thickness along x
  T.ribX.forEach(xr => prism(out, T.ribPoly, [], [T.ox + xr - t / 2, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0], t, JIG_COL, JIG_SIDE));
  // deck + pocket strip in the tilted (x, s) frame
  const eu = [1, 0, 0], ev = [0, cph, sph], en = [0, -sph, cph], O = [T.ox, T.y0, T.z0];
  const hx = /^#?([0-9a-f]{6})$/i.exec(st.deckColor || '') || [0, '3f9aa0'], dc = [0, 2, 4].map(i => parseInt(hx[1].slice(i, i + 2), 16));
  prism(out, T.deckCuts[0].pts, T.deckCuts.slice(1).map(c => c.pts), O, eu, ev, en, t, dc, dc.map(v => Math.round(v * 0.72)));
  prism(out, T.strip, [], V.add(O, V.mul(en, t)), eu, ev, en, t, [196, 168, 128], JIG_SIDE);
  // faces seated in the pockets (flat-cut shape, before bevelling)
  T.xs.forEach(xc => prism(out, T.flatR.map(q => [xc + q[0], T.sC + q[1]]), [], V.add(O, V.mul(en, t)), eu, ev, en, t, WOOD, GRAIN));
  // laser paths + beams
  const r3 = b => [b[0], b[2], -b[1]], beamTop = Math.max(J.zTip, J.zNotch) + 40;
  st0.tips.forEach(pl => { const [a, b] = pl.pts; out.push({ laser: 'tip', closed: false, pts: [r3([a[0], a[1], J.zTip]), r3([b[0], b[1], J.zTip])] }); const m = (a[0] + b[0]) / 2; out.push({ laser: 'tip', closed: false, pts: [r3([m, a[1], beamTop]), r3([m, a[1], J.zTip])] }); });
  st0.notches.forEach(pl => { const [a, b] = pl.pts; out.push({ laser: 'notch', closed: false, pts: [r3([a[0], a[1], J.zNotch]), r3([b[0], b[1], J.zNotch])] }); });
  let c = [0, 0, 0], cnt = 0; out.forEach(p => p.pts.forEach(q => { c = V.add(c, q); cnt++; })); c = V.mul(c, 1 / cnt);
  const sh = q => V.sub(q, c);
  out.forEach(p => { p.pts = p.pts.map(sh); if (p.holes) p.holes = p.holes.map(h => h.map(sh)); });
  return out;
}

function rotM() { const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch); return q => { const x = cy * q[0] + sy * q[2], z = -sy * q[0] + cy * q[2]; return [x, cp * q[1] - sp * z, sp * q[1] + cp * z]; }; }
function draw(ctx2, W, H, polys, rad, opt = {}) {
  const rm = rotM(), Dp = rad * 5, scl = Math.min(W, H) * (opt.fill || 0.4) / rad, L = V.norm([-0.45, 0.65, 0.6]);
  const items = polys.filter(p => !p.art && !p.laser).map(p => {
    const v = p.pts.map(rm); let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < v.length; i++) { const a = v[i], b = v[(i + 1) % v.length]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    let z = 0; v.forEach(q => { z += q[2]; }); z = z / v.length + (p.zb || 0);
    return { p, v, n: [nx, ny, nz], z };
  }).sort((a, b) => a.z - b.z);
  ctx2.lineJoin = 'round';
  items.forEach(it => {
    const facing = it.n[2] > 0, base = facing ? it.p.col : it.p.back;
    const lam = Math.abs(V.dot(it.n, L)), k = 0.42 + 0.62 * lam;
    ctx2.beginPath();
    it.v.forEach((q, i) => { const f = Dp / (Dp - q[2]), x = W / 2 + (opt.px || 0) + q[0] * scl * f, y = H / 2 + (opt.py || 0) - q[1] * scl * f; i ? ctx2.lineTo(x, y) : ctx2.moveTo(x, y); });
    ctx2.closePath();
    ctx2.fillStyle = `rgb(${base.map(c => Math.min(255, Math.round(c * k))).join(',')})`;
    ctx2.fill();
    ctx2.strokeStyle = it.p.line ? 'rgba(40,24,12,.55)' : `rgb(${base.map(c => Math.round(c * k * 0.82)).join(',')})`;
    ctx2.lineWidth = it.p.line ? (opt.lw || 1) : 0.6; ctx2.stroke();
    if (it.p.decals && facing) it.p.decals.forEach(d => {
      ctx2.beginPath();
      d.pts.map(rm).forEach((q, i) => { const f = Dp / (Dp - q[2]), x = W / 2 + (opt.px || 0) + q[0] * scl * f, y = H / 2 + (opt.py || 0) - q[1] * scl * f; i ? ctx2.lineTo(x, y) : ctx2.moveTo(x, y); });
      ctx2.closePath(); ctx2.fillStyle = `rgb(${d.col.map(c => Math.round(c * (d.col === BRK ? k : 1))).join(',')})`; ctx2.fill();
      ctx2.strokeStyle = 'rgba(20,12,6,.6)'; ctx2.lineWidth = 0.6; ctx2.stroke();
    });
  });
}

/* ---------- WebGL renderer (true depth buffer) ---------- */
let G = null;
function initGL() {
  const gl = cv.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
  if (!gl || !window.earcut) return null;
  const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(o); return o; };
  const prog = (vs, fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); return p; };
  const VS_HEAD = 'uniform mat3 uR;uniform float uScl,uDp,uW,uH,uPx,uPy,uZ;vec4 proj(vec3 p){vec3 v=uR*p;float f=uDp/(uDp-v.z);return vec4((v.x*uScl*f+uPx)/(uW*0.5),(v.y*uScl*f-uPy)/(uH*0.5),-v.z/uZ,1.0);}';
  const pF = prog('attribute vec3 aP,aN,aC,aB;' + VS_HEAD + 'varying vec3 vC,vB;varying float vS;void main(){gl_Position=proj(aP);vec3 n=normalize(uR*aN);vS=0.42+0.62*abs(dot(n,normalize(vec3(-0.45,0.65,0.6))));vC=aC;vB=aB;}',
    'precision mediump float;varying vec3 vC,vB;varying float vS;void main(){vec3 c=gl_FrontFacing?vC:vB;gl_FragColor=vec4(min(c*vS/255.0,vec3(1.0)),1.0);}');
  const pL = prog('attribute vec3 aP;' + VS_HEAD + 'void main(){vec4 q=proj(aP);q.z-=0.0015;gl_Position=q;}',
    'precision mediump float;uniform vec4 uCol;void main(){gl_FragColor=uCol;}');
  return { gl, pF, pL, fb: gl.createBuffer(), lb: gl.createBuffer(), ab: gl.createBuffer(), tb: gl.createBuffer(), nb: gl.createBuffer(), nF: 0, nL: 0, nA: 0, nT: 0, nN: 0 };
}
function upload(polys) {
  const gl = G.gl, F = [], Ln = [], An = [], Lt = [], Ln2 = [];
  polys.forEach(p => {
    if (p.laser) { const v = p.pts; (p.laser === 'tip' ? Lt : Ln2).push(v[0][0], v[0][1], v[0][2], v[1][0], v[1][1], v[1][2]); return; }
    if (p.art) { const v = p.pts, m = p.closed ? v.length : v.length - 1; for (let i = 0; i < m; i++) { const a = v[i], b = v[(i + 1) % v.length]; An.push(a[0], a[1], a[2], b[0], b[1], b[2]); } return; }
    const v = p.pts; let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < v.length; i++) { const a = v[i], b = v[(i + 1) % v.length]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
    const nl = Math.hypot(nx, ny, nz) || 1, n = [nx / nl, ny / nl, nz / nl];
    const all = [v, ...(p.holes || [])], flat3 = [].concat(...all);
    let tri;
    if (v.length === 3 && !p.holes) tri = [0, 1, 2];
    else if (v.length === 4 && !(p.holes && p.holes.length)) tri = [0, 1, 2, 0, 2, 3];
    else {
      const ax = Math.abs(n[0]) > 0.6 ? [0, 0, 1] : [1, 0, 0], u = V.norm(V.cross(n, ax)), w = V.cross(n, u);
      const flat2 = [], holeIdx = []; let c = 0;
      all.forEach((ring, ri) => { if (ri) holeIdx.push(c); ring.forEach(q => { flat2.push(V.dot(q, u), V.dot(q, w)); c++; }); });
      tri = window.earcut(flat2, holeIdx.length ? holeIdx : null, 2);
    }
    const B = p.back || p.col;
    tri.forEach(i => { const q = flat3[i]; F.push(q[0], q[1], q[2], n[0], n[1], n[2], p.col[0], p.col[1], p.col[2], B[0], B[1], B[2]); });
    if (p.line || p.edge !== false) all.forEach(ring => { for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; Ln.push(a[0], a[1], a[2], b[0], b[1], b[2]); } });
  });
  gl.bindBuffer(gl.ARRAY_BUFFER, G.fb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(F), gl.DYNAMIC_DRAW); G.nF = F.length / 12;
  gl.bindBuffer(gl.ARRAY_BUFFER, G.lb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(Ln), gl.DYNAMIC_DRAW); G.nL = Ln.length / 3;
  gl.bindBuffer(gl.ARRAY_BUFFER, G.ab); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(An), gl.DYNAMIC_DRAW); G.nA = An.length / 3;
  gl.bindBuffer(gl.ARRAY_BUFFER, G.tb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(Lt), gl.DYNAMIC_DRAW); G.nT = Lt.length / 3;
  gl.bindBuffer(gl.ARRAY_BUFFER, G.nb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(Ln2), gl.DYNAMIC_DRAW); G.nN = Ln2.length / 3;
}
function rotMat() { const rm = rotM(), a = rm([1, 0, 0]), b = rm([0, 1, 0]), c = rm([0, 0, 1]); return new Float32Array([...a, ...b, ...c]); }
let stereo = 'off'; const STEREO_ANGLE = 0.075; // about 4.3 degrees between the eyes
function drawGL(W, H, rad) {
  const gl = G.gl; gl.viewport(0, 0, cv.width, cv.height);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (stereo === 'off') { drawView(0, cv.width, W, H, rad); return; }
  const y0 = yaw, leftEye = y0 + STEREO_ANGLE / 2, rightEye = y0 - STEREO_ANGLE / 2;
  const order = stereo === 'cross' ? [rightEye, leftEye] : [leftEye, rightEye];
  const half = Math.floor(cv.width / 2);
  order.forEach((yv, i) => { yaw = yv; gl.clear(gl.DEPTH_BUFFER_BIT); drawView(i * half, half, W / 2, H, rad); });
  yaw = y0;
}
function drawView(vx, vw, W, H, rad) {
  const gl = G.gl; gl.viewport(vx, 0, vw, cv.height);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  const scl = (solo === 'jig' ? Math.min(W * 0.47, H * 0.75) : Math.min(W, H) * 0.44) * (stereo === 'off' ? 1 : 0.8) * zoom / rad, R3 = rotMat();
  const setU = p => { gl.useProgram(p); const u = n => gl.getUniformLocation(p, n);
    gl.uniformMatrix3fv(u('uR'), false, R3); gl.uniform1f(u('uScl'), scl); gl.uniform1f(u('uDp'), rad * 5); gl.uniform1f(u('uW'), W); gl.uniform1f(u('uH'), H);
    gl.uniform1f(u('uPx'), panX); gl.uniform1f(u('uPy'), panY); gl.uniform1f(u('uZ'), rad * 1.6); };
  setU(G.pF);
  gl.bindBuffer(gl.ARRAY_BUFFER, G.fb);
  const at = (p, n, size, off, stride) => { const l = gl.getAttribLocation(p, n); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, stride * 4, off * 4); return l; };
  const ls = [at(G.pF, 'aP', 3, 0, 12), at(G.pF, 'aN', 3, 3, 12), at(G.pF, 'aC', 3, 6, 12), at(G.pF, 'aB', 3, 9, 12)];
  gl.disable(gl.BLEND); gl.drawArrays(gl.TRIANGLES, 0, G.nF);
  ls.forEach(l => gl.disableVertexAttribArray(l));
  setU(G.pL);
  gl.bindBuffer(gl.ARRAY_BUFFER, G.lb);
  const lp = at(G.pL, 'aP', 3, 0, 3);
  gl.uniform4f(gl.getUniformLocation(G.pL, 'uCol'), 0.16, 0.10, 0.05, 0.55);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  gl.drawArrays(gl.LINES, 0, G.nL);
  gl.disableVertexAttribArray(lp);
  if (G.nA) {
    gl.bindBuffer(gl.ARRAY_BUFFER, G.ab); const ap = at(G.pL, 'aP', 3, 0, 3);
    const am = st.artMode; gl.uniform4f(gl.getUniformLocation(G.pL, 'uCol'), am === 'cut' ? 0.05 : 0.30, am === 'cut' ? 0.03 : 0.14, am === 'cut' ? 0.02 : 0.05, 0.95);
    gl.drawArrays(gl.LINES, 0, G.nA); gl.disableVertexAttribArray(ap);
  }
  [[G.tb, G.nT, [1, 0.5, 0]], [G.nb, G.nN, [0.63, 0, 1]]].forEach(([buf, cnt, col]) => {
    if (!cnt) return; gl.bindBuffer(gl.ARRAY_BUFFER, buf); const lp2 = at(G.pL, 'aP', 3, 0, 3);
    gl.disable(gl.DEPTH_TEST); gl.uniform4f(gl.getUniformLocation(G.pL, 'uCol'), col[0], col[1], col[2], 1);
    gl.drawArrays(gl.LINES, 0, cnt); gl.enable(gl.DEPTH_TEST); gl.disableVertexAttribArray(lp2);
  });
  gl.depthMask(true);
}

function frame(ts) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  if (anim.playing) {
    anim.t += anim.dir * 0.006; if (anim.t >= 1) { anim.t = 1; anim.playing = false; } if (anim.t <= 0) { anim.t = 0; anim.playing = false; }
    updPlay(); sceneDirty = true;
  }
  if (!dragging && !ptrs.size && zoom <= 1.05 && ts - idle > 1800) yaw += 0.0035;
  if (R && sceneDirty) { scene = buildScene(); sceneDirty = false; let r = 0; scene.forEach(p => p.pts.forEach(q => { r = Math.max(r, V.len(q)); })); viewR = viewR ? viewR + (r - viewR) * (anim.playing ? 0.25 : 1) : r; if (G) upload(scene); }
  if (G) { if (scene.length) drawGL(W, H, viewR); }
  else { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); if (scene.length) draw(ctx, W, H, scene, viewR, { fill: 0.44 * zoom, px: panX, py: panY, lw: Math.min(1.6, 0.8 + zoom * 0.1) }); }
  requestAnimationFrame(frame);
}
const ptrs = new Map(); let pinch = null; let zoom = 1, panX = 0, panY = 0, lastTap = 0;
const ZMIN = 0.6, ZMAX = 12;
function zoomAt(sx, sy, nz) {
  nz = Math.max(ZMIN, Math.min(ZMAX, nz));
  const W = cv.clientWidth, H = cv.clientHeight, cx = sx - W / 2, cy = sy - H / 2;
  panX = cx - (cx - panX) * (nz / zoom); panY = cy - (cy - panY) * (nz / zoom); zoom = nz;
  if (zoom <= 1.001) { panX *= 0.0; panY *= 0.0; }
  updZoomUI();
}
function resetView() { zoom = 1; panX = 0; panY = 0; updZoomUI(); }
function updZoomUI() { $('#zlvl').textContent = zoom < 1.05 && zoom > 0.95 ? '1×' : (zoom < 10 ? zoom.toFixed(1) : Math.round(zoom)) + '×'; }
const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, local(e)); idle = performance.now();
  if (ptrs.size === 1) {
    dragging = true; [lastX, lastY] = local(e);
    const now = performance.now(); if (now - lastTap < 300) resetView(); lastTap = now;
  } else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], z: zoom };
    dragging = false;
  }
});
cv.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  const pos = local(e); ptrs.set(e.pointerId, pos); idle = performance.now();
  if (ptrs.size >= 2 && pinch) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    panX += m[0] - pinch.m[0]; panY += m[1] - pinch.m[1];
    zoomAt(m[0], m[1], pinch.z * d / pinch.d);
    pinch.m = m;
    return;
  }
  if (!dragging) return;
  const dx = pos[0] - lastX, dy = pos[1] - lastY;
  if (e.shiftKey || e.buttons === 2 || e.buttons === 4) { panX += dx; panY += dy; }
  else { yaw += dx * 0.01 / Math.sqrt(zoom); pitch = Math.max(-1.5, Math.min(1.5, pitch + dy * 0.01 / Math.sqrt(zoom))); }
  lastX = pos[0]; lastY = pos[1];
});
const endPtr = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (ptrs.size === 1) { dragging = true; [lastX, lastY] = [...ptrs.values()][0]; } if (!ptrs.size) dragging = false; idle = performance.now(); };
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = local(e); zoomAt(x, y, zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); idle = performance.now(); }, { passive: false });
$('#zin').addEventListener('click', () => zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, zoom * 1.5));
$('#zout').addEventListener('click', () => zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, zoom / 1.5));
$('#zfit').addEventListener('click', resetView);
updZoomUI();

/* solid picker icons */
function icons() {
  $$('.solid-btn canvas').forEach(c => {
    const id = c.parentElement.dataset.solid, S = P.solid(id), dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = 56 * dpr; c.height = 56 * dpr; const x = c.getContext('2d'); x.scale(dpr, dpr);
    const polys = S.faces.map(f => ({ pts: f.v.map(v => S.verts[v]), col: [226, 190, 140], back: [226, 190, 140], line: 1 }));
    const sy = yaw, sp = pitch; yaw = 0.5; pitch = -0.4; draw(x, 56, 56, polys, S.R, { fill: 0.42, lw: 0.8 }); yaw = sy; pitch = sp;
  });
}


/* ---------- artwork UI + Claude drawing ---------- */
let sampleFn = null, aiCtl = null;
if (window.claude && window.claude.use) window.claude.use('sample').then(f => { sampleFn = f || null; $('#ai').hidden = !sampleFn; $('#ai-off').hidden = !!sampleFn; renderArtUI(); }).catch(() => {});
function bindArt() {
  $('#art-file').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 4e6) { toast('That SVG is over 4 MB. Try simplifying it first.', true); return; }
    try { setArt(await f.text(), f.name); } catch (err) { toast(err.message || 'Could not read that SVG', true); }
  });
  $('#art-clear').addEventListener('click', clearArt);
  $('#ai-go').addEventListener('click', async () => {
    const req = $('#ai-prompt').value.trim();
    if (!req) { $('#ai-prompt').focus(); return; }
    if (aiCtl) { aiCtl.abort(); return; }
    const S = P.solid(st.solid), shape = { 3: 'equilateral triangle', 4: 'square', 5: 'regular pentagon' }[S.sides];
    const prompt = `You are designing artwork that a laser will ${st.artMode === 'cut' ? 'cut through' : 'engrave into'} the face of a wooden ${S.name.toLowerCase()} (each face is an ${shape}). Make one SVG for this request: "${req}".\n\nRules:\n- Reply with ONLY the SVG markup, starting with <svg and ending with </svg>. No commentary, no code fences.\n- Use viewBox="0 0 100 100" and xmlns="http://www.w3.org/2000/svg".\n- One colour only: black. Use filled closed shapes (fill="#000") for solid areas${st.artMode === 'line' ? ', or black strokes for linework' : ''}. No gradients, opacity, filters, images, patterns, masks, clip paths, <use>/<defs> or <text> (draw any lettering as paths). For holes, put them in the same path with fill-rule="evenodd" rather than drawing white shapes on top.\n- ${st.artMode === 'cut' ? 'It is a stencil: every shape must be a closed outline, and nothing may float inside a cut-out (use bridges).' : 'Bold and simple enough to read at 4–6 cm across. No details thinner than about 1 unit.'}\n- Keep the whole design inside a circle of radius 46 centred at (50,50).\n- Keep the file under 12 KB.`;
    aiCtl = new AbortController();
    const btn = $('#ai-go'), stat = $('#ai-status');
    btn.textContent = 'Stop'; stat.textContent = 'Thinking…';
    try {
      const { text } = await sampleFn(prompt, { signal: aiCtl.signal, cache: false, onText: ({ text: tx }) => { stat.textContent = `Drawing… ${(tx.length / 1024).toFixed(1)} KB`; } });
      let m = text.match(/<svg[\s\S]*<\/svg>/i), svgText = m && m[0];
      if (!svgText) { // cut off before </svg>? keep every complete element and close it
        const i = text.search(/<svg[\s>]/i);
        if (i < 0) throw { code: 'no_svg' };
        let body = text.slice(i); const last = Math.max(body.lastIndexOf('/>'), body.lastIndexOf('</path>') + 5, body.lastIndexOf('</g>') + 2);
        if (last < 10) throw { code: 'no_svg' };
        body = body.slice(0, last + 2); const opens = (body.match(/<g[\s>]/g) || []).length - (body.match(/<\/g>/g) || []).length;
        svgText = body + '</g>'.repeat(Math.max(0, opens)) + '</svg>';
      }
      setArt(svgText, req.slice(0, 40).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.svg');
      stat.textContent = 'Done. Not quite right? Edit the prompt and try again.';
    } catch (e) {
      const c = e && e.code;
      stat.textContent = c === 'cancelled' ? 'Stopped.' : c === 'not_granted' || c === 'sampling_disabled' ? "Claude isn't available to this page right now." : c === 'rate_limited' ? 'Too many requests. Wait a minute, then try again.' : c === 'refused' ? "Claude couldn't draw that one. Try describing it differently." : c === 'no_svg' ? "That reply didn't include an SVG. Try again." : c === 'upstream_error' ? 'Claude had a hiccup. Try again.' : c === 'empty_completion' ? 'Claude came back empty. Try a simpler description.' : (e && e.message && !c) ? 'Got a drawing but couldn\'t use it: ' + e.message : `Something went wrong${c ? ' (' + c + ')' : ''}. Try again.`;
      if (c === 'not_granted' || c === 'sampling_disabled') { $('#ai').hidden = true; }
    } finally { aiCtl = null; btn.textContent = 'Draw it'; }
  });
  try { const saved = JSON.parse(localStorage.getItem('polysmith-art') || 'null'); if (saved && saved.svg) ART = parseArt(saved.svg, saved.name); } catch (e) { ART = null; }
  renderArtUI();
}

/* ---------- maximise 3D view ---------- */
function bindSolo() {
  $('#deck-color').value = st.deckColor;
  $('#deck-color').addEventListener('input', e => { st.deckColor = e.target.value; sceneDirty = true; save(); });
  $('#solo').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (!b) return; solo = b.dataset.s; updSolo(); resetView(); if (solo === 'jig') { yaw = -0.45; pitch = 0.58; } else if (solo !== 'all') { yaw = 0.35; pitch = -0.5; } else { yaw = 0.6; pitch = -0.35; } idle = performance.now() + 2500; sceneDirty = true; viewR = 0; });
}
function bindStereo() {
  const btn = $('#zst'), pill = $('#stereo'), view = $('.view');
  const set = m => {
    stereo = m; btn.classList.toggle('on', m !== 'off'); pill.hidden = m === 'off'; view.classList.toggle('stereo', m !== 'off');
    $$('#stereo [data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === m)); sceneDirty = true;
  };
  btn.addEventListener('click', () => set(stereo === 'off' ? 'cross' : 'off')); // always starts in cross-eyed
  pill.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) set(b.dataset.m); });
  if (!G) btn.hidden = true;
}
function bindMax() {
  const view = $('.view'), btn = $('#zmax');
  const set = on => {
    view.classList.toggle('max', on); document.body.classList.toggle('noscroll', on);
    btn.textContent = on ? '✕' : '⛶'; btn.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
    sceneDirty = true;
  };
  btn.addEventListener('click', async () => {
    const on = !view.classList.contains('max'); set(on);
    try { if (on && view.requestFullscreen && !document.fullscreenElement) await view.requestFullscreen(); else if (!on && document.fullscreenElement) await document.exitFullscreen(); } catch (e) { /* frame may refuse; CSS maximise still works */ }
  });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && view.classList.contains('max')) set(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && view.classList.contains('max')) set(false); });
}

/* boot */
try { G = initGL(); } catch (e) { G = null; }
if (!G) ctx = cv.getContext('2d');
bind(); bindArt(); bindMax(); bindSolo(); bindStereo(); syncInputs(); icons(); compute(); updPlay();
requestAnimationFrame(frame);
})();

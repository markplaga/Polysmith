require('../src/geom.js');
const P = globalThis.Poly, { V, P2 } = P;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const deg = r => r * 180 / Math.PI;
const expect = { tetra: [4, 6, 70.5288], cube: [6, 12, 90], octa: [8, 12, 109.4712], dodeca: [12, 30, 116.5651], icosa: [20, 30, 138.1897] };
for (const id in expect) {
  const S = P.solid(id), [F, E, d] = expect[id];
  ok(S.faces.length === F && S.edges.length === E, id + ' counts ' + S.faces.length + ' ' + S.edges.length);
  ok(Math.abs(deg(S.dihedral) - d) < 1e-3, id + ' dihedral ' + deg(S.dihedral));
  // orientation: face normal consistent with CCW order
  S.faces.forEach(f => { const a = S.verts[f.v[0]], b = S.verts[f.v[1]], c = S.verts[f.v[2]]; ok(V.dot(V.cross(V.sub(b, a), V.sub(c, a)), f.n) > 0, id + ' face orient'); });

  for (const t of [3, 6.35]) for (const L of [60, 100, 160]) for (const per of [1, 2]) {
    const p = { solid: id, L, t, kerf: 0.15, fit: 0.05, joint: 'tab', perEdge: per, tabLen: 0, protrude: 0, window: 'circle', windowPct: 70, dice: false };
    const pan = P.panels(p), inf = pan.info;
    const nums = JSON.stringify(pan.parts).match(/NaN|null/);
    ok(!nums, `${id} L${L} t${t} NaN`);
    if (inf.per === 0) { console.log(`  note ${id} L${L} t${t} per${per}: no brackets ->`, pan.warn.map(w => w.msg).join(' | ')); continue; }
    // 3D check: bracket polygon inside solid; tab tips on outer surface; tabs land in slots
    const fr = P.bracketFrame(S, L, inf.xs), rL = S.r * L;
    S.edges.forEach((e, ei) => fr[ei].forEach((F3, xi) => {
      const to3 = q => V.add(F3.M, V.add(V.mul(F3.x, q[0]), V.mul(F3.y, q[1])));
      let mx = -1e9; inf.br.forEach(q => { const P3 = to3(q); S.faces.forEach(f => { mx = Math.max(mx, V.dot(P3, f.n) - rL); }); });
      ok(mx < 1e-6 && mx > -1e-6, `${id} bracket reaches outer surface exactly (max ${mx.toFixed(4)})`);
      // tab centre on face A (the one opposite to x direction) -> map into plate coords and compare with slot centre
      const fa = S.faces[e.faces[0]], c3 = V.mul(fa.c, L);
      const h = S.dihedral / 2, Pc = [0, t / Math.sin(h)], uA = [-Math.sin(h), Math.cos(h)], nA = [Math.cos(h), Math.sin(h)];
      const tabC = P2.sub(P2.add(Pc, P2.mul(uA, inf.g + inf.w / 2)), P2.mul(nA, t / 2));
      const T3 = to3(tabC);
      // distance from face plane should be t/2 inside
      ok(Math.abs(rL - V.dot(T3, fa.n) - t / 2) < 1e-6, id + ' tab mid-depth');
      // in-plane: distance from the ideal edge line along the face toward its centre = s + g + w/2
      const A3 = V.mul(S.verts[e.a], L), B3 = V.mul(S.verts[e.b], L), m3 = V.mul(V.add(A3, B3), .5);
      const inward = V.norm(V.sub(c3, m3)), along = V.norm(V.sub(B3, A3));
      const dIn = V.dot(V.sub(T3, m3), inward), dAl = V.dot(V.sub(T3, m3), along);
      ok(Math.abs(dIn - (inf.s + inf.g + inf.w / 2)) < 1e-6, `${id} tab inward pos ${dIn} vs ${inf.s + inf.g + inf.w / 2}`);
      ok(Math.abs(Math.abs(dAl) - Math.abs(inf.xs[xi])) < 1e-6, `${id} tab along pos`);
    }));
    // packing: faces do not overlap
    const pk = P.pack(pan.parts, 600, 400, 5, 3);
    pk.sheets.forEach(sh => {
      const outs = sh.cuts.filter(c => c.pts.length >= 3 && Math.abs(P.area(c.pts)) > 0).map(c => c.pts);
      // compare only face outlines (largest area polys) pairwise via bbox shrink test on convex outlines
      const big = outs.filter(o => Math.abs(P.area(o)) > 0.5 * Math.abs(P.area(pan.parts[0].cuts[0].pts)));
      for (let i = 0; i < big.length; i++) for (let j = i + 1; j < big.length; j++) ok(!P.overlap(big[i], big[j]), `${id} pack overlap`);
      sh.cuts.forEach(c => c.pts.forEach(q => ok(q[0] > 0 && q[0] < 600 && q[1] > 0 && q[1] < 400, id + ' in sheet')));
    });
  }
  // nets: fold closure
  const nt = P.net({ solid: id, L: 50, tabH: 7, fold: 'score', dice: true, copies: 1 });
  const lay = nt.info.lay; ok(!!lay, id + ' net');
  const n = S.sides, Fn = S.faces.length, pos = nt.info.pos;
  const M = new Array(Fn);
  const rotAbout = (pa, pb, th) => { const k = V.norm([pb[0] - pa[0], pb[1] - pa[1], 0]), c = Math.cos(th), s = Math.sin(th); return x => { const v = V.sub(x, [pa[0], pa[1], 0]); const r = V.add(V.add(V.mul(v, c), V.mul(V.cross(k, v), s)), V.mul(k, V.dot(k, v) * (1 - c))); return V.add(r, [pa[0], pa[1], 0]); }; };
  const getM = f => { if (M[f]) return M[f]; const pr = lay.parent[f]; if (!pr) return (M[f] = x => x); const pm = getM(pr.f), pp = pos[pr.f], R = rotAbout(pp[pr.i], pp[(pr.i + 1) % n], Math.PI - S.dihedral); return (M[f] = x => pm(R(x))); };
  const vpos = {};
  let maxErr = 0;
  pos.forEach((pp, f) => pp.forEach((q, i) => { const X = getM(f)([q[0], q[1], 0]), vid = S.faces[f].v[i]; if (vpos[vid]) maxErr = Math.max(maxErr, V.len(V.sub(vpos[vid], X))); else vpos[vid] = X; }));
  ok(maxErr < 1e-6, id + ' net closes, err ' + maxErr);
  console.log(id, 'ok; net cuts', nt.parts[0].cuts.length, 'scores', nt.parts[0].scores.length, 'tabs', nt.info.tabs.length, 'closeErr', maxErr.toExponential(1));
  const pg = P.panels({ solid: id, L: 100, t: 3, kerf: .15, fit: .05, joint: 'tab', perEdge: 1, tabLen: 0, protrude: 0, window: 'none', windowPct: 60, dice: false }).info;
  console.log('   100mm/3mm: inset', pg.s.toFixed(2), 'tab', pg.w.toFixed(1), 'D', pg.D.toFixed(1));
}
// exporters
const pan = P.panels({ solid: 'icosa', L: 80, t: 3, kerf: .15, fit: .05, joint: 'tab', perEdge: 1, tabLen: 0, protrude: 0, window: 'none', windowPct: 60, dice: true });
const pk = P.pack(pan.parts, 600, 400, 5, 3);
console.log('icosa sheets', pk.sheets.length, pk.sheets.map(s => JSON.stringify(s.counts)).join(' '));
require('fs').writeFileSync(require('os').tmpdir()+'/icosa.svg', P.sheetSVG(pk.sheets[0], 600, 400));
require('fs').writeFileSync(require('os').tmpdir()+'/icosa.dxf', P.sheetDXF(pk.sheets[0]));
const nt = P.net({ solid: 'icosa', L: 50, tabH: 7, fold: 'score', dice: true, copies: 1 });
require('fs').writeFileSync(require('os').tmpdir()+'/net.svg', P.sheetSVG(P.pack(nt.parts, 600, 400, 5, 3).sheets[0], 600, 400));
const cp = P.coupon({ t: 3, kerf: .15, fit: .05 }, pan);
require('fs').writeFileSync(require('os').tmpdir()+'/coupon.svg', P.sheetSVG(P.pack(cp, 200, 100, 5, 3).sheets[0], 200, 100));
for (const j of ['block', 'none']) { const pp = P.panels({ solid: 'dodeca', L: 80, t: 3, kerf: .15, fit: .05, joint: j, perEdge: 1, tabLen: 0, protrude: 0, window: 'star', windowPct: 60, dice: false }); require('fs').writeFileSync(require('os').tmpdir()+'/' + j + '.svg', P.sheetSVG(P.pack(pp.parts, 600, 400, 5, 3).sheets[0], 600, 400)); }
console.log(fails ? fails + ' FAILURES' : 'ALL PASS');

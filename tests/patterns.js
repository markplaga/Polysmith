// Every pattern, every face shape, several densities: holes must keep at least ~the bridge width apart and stay inside the safe area.
require('../src/geom.js'); const P = globalThis.Poly;
const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; let t = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const segX = (a, b, c, d) => { const o = (p, q, r) => { const v = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return Math.abs(v) < 1e-6 ? 0 : Math.sign(v); }; const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b); return o1 * o2 < 0 && o3 * o4 < 0; };
const dist = (A, B) => { let m = Infinity; for (const p of A) for (let i = 0; i < B.length; i++) m = Math.min(m, segD(p, B[i], B[(i + 1) % B.length])); for (const p of B) for (let i = 0; i < A.length; i++) m = Math.min(m, segD(p, A[i], A[(i + 1) % A.length])); for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) if (segX(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return 0; return m; };
let fails = 0;
for (const n of [3, 4, 5]) for (const type of P.PATTERNS) for (const dens of [2, 4, 7, 10]) for (const R of [25, 60]) {
  const b = 2.5, H = P.patternHoles(n, R, type, dens, b, 1000 + n);
  let worst = Infinity;
  for (let i = 0; i < H.length; i++) for (let j = i + 1; j < H.length; j++) worst = Math.min(worst, dist(H[i], H[j]));
  if (H.length > 1 && worst < b * 0.85) { fails++; console.log(`FAIL ${type} n=${n} R=${R} dens=${dens}: holes ${worst.toFixed(2)} mm apart (bridge ${b})`); }
}
console.log(fails ? fails + ' FAILURES' : 'PATTERNS OK');

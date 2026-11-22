'use strict';
/* npm test  (the browser tests need playwright-core and Chrome/Chromium; they skip themselves without them) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Polysmith = require('../polysmith-api.js');
const { load } = require('../polysmith-node.js');

const ROOT = path.join(__dirname, '..');
const SOLIDS = ['tetra', 'cube', 'octa', 'dodeca', 'icosa'];
const MODES = ['tab', 'finger', 'block', 'none', 'net'];

test('every control on the page is an API setting', () => {
  const html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  const keys = new Set(Polysmith.settings.keys().map(k => k.key));
  const controls = [...html.matchAll(/data-(?:k|seg)="([A-Za-z]+)"/g)].map(m => m[1]);
  assert.ok(controls.length > 25);
  for (const c of controls) assert.ok(keys.has(c), 'missing setting for control ' + c);
  for (const id of ['solid', 'deckColor']) assert.ok(keys.has(id));
});

test('lists', () => {
  assert.deepEqual(Polysmith.solids.list().map(s => s.id), SOLIDS);
  assert.equal(Polysmith.solids.list().find(s => s.id === 'icosa').dihedral, 138.19);
  assert.deepEqual(Polysmith.modes.list().map(m => m.id), MODES);
  assert.ok(Polysmith.materials.list().find(m => m.id === 'frost').seeThrough);
  assert.equal(Polysmith.cutouts.list().filter(w => w.kind === 'pattern').length, 9);
  assert.ok(Polysmith.sheets.presets().some(p => p.id === '600x400' && p.width === 600));
});

test('every solid builds in every construction mode', () => {
  for (const solid of SOLIDS) for (const mode of MODES) {
    const d = Polysmith.design.compute({ solid, mode, size: 70, sheetPreset: '1300x900' });
    assert.ok(d.stats.parts > 0 && d.stats.sheets > 0, `${solid} ${mode}`);
    assert.ok(d.sheets.every(s => s.svg.startsWith('<svg') && /EOF\s*$/.test(s.dxf)), `${solid} ${mode} files`);
    assert.ok(d.files.some(f => f.name === 'README.txt'));
    assert.ok(d.guide.length >= 3);
    assert.equal(d.warnings.filter(w => w.level === 'err').length, 0, `${solid} ${mode}: ${JSON.stringify(d.warnings)}`);
  }
});

test('every cut-out pattern builds', () => {
  for (const w of Polysmith.cutouts.list()) {
    const d = Polysmith.design.compute({ solid: 'dodeca', window: w.id, size: 90 }, { files: false });
    assert.ok(d.parts[0].holes >= (w.id === 'none' ? 0 : 1), w.id);
  }
});

test('sizes and measures', () => {
  const m = Polysmith.solids.measure('cube', { edge: 50 });
  assert.equal(m.edge, 50); assert.equal(m.height, 50); assert.equal(m.dihedral, 90);
  const s = Polysmith.settings.create({ solid: 'octa', measure: 'sphere', size: 200 });
  assert.equal(Polysmith.settings.edge(s), Polysmith.solids.measure('octa', { acrossPoints: 200 }).edge);
  const back = Polysmith.settings.remeasure(s, 'edge');
  assert.equal(back.measure, 'edge'); assert.equal(back.size, Polysmith.settings.edge(s));
  assert.equal(Polysmith.design.compute(s, { files: false }).size.acrossPoints, 200);
});

test('settings are checked', () => {
  assert.throws(() => Polysmith.settings.create({ solid: 'sphere' }), RangeError);
  assert.throws(() => Polysmith.settings.create({ nope: 1 }), RangeError);
  assert.throws(() => Polysmith.settings.create({ t: '3' }), TypeError);
  assert.throws(() => Polysmith.settings.create({ patDensity: 11 }), RangeError);
  assert.throws(() => Polysmith.settings.create({ matColor: 'red' }), RangeError);
  assert.throws(() => Polysmith.design.compute({ mode: 'glue' }), RangeError);
  assert.equal(Polysmith.settings.validate({ size: -1 }).ok, false);
  const clear = Polysmith.settings.create({ material: 'clear' });
  assert.equal(clear.kerf, 0.1); assert.equal(clear.opacity, 20);
  assert.equal(Polysmith.settings.update(clear, { size: 90 }).kerf, 0.1);
  assert.equal(Polysmith.settings.create({ sheetPreset: '304.8x304.8' }).sheetW, 304.8);
  assert.equal(Polysmith.settings.create({ sheetW: 500 }).sheetPreset, 'custom');
  const json = Polysmith.settings.serialize({ solid: 'tetra' });
  assert.equal(Polysmith.settings.parse(json).solid, 'tetra');
});

test('bevelled teeth come with a jig (except the cube)', () => {
  const d = Polysmith.design.compute({ solid: 'icosa', mode: 'finger', fingerStyle: 'bevel' });
  assert.ok(d.jig.needed); assert.equal(d.jig.outsideFace, 'down');
  assert.ok(Math.abs(d.jig.tilt - 48.19) < 0.01);
  assert.ok(d.files.some(f => /jig-station\.svg$/.test(f.name)) && d.files.some(f => /jig-station\.dxf$/.test(f.name)));
  assert.equal(Polysmith.design.compute({ solid: 'cube', mode: 'finger', fingerStyle: 'bevel' }).jig.needed, false);
  assert.equal(Polysmith.design.jig({ solid: 'cube', mode: 'finger', fingerStyle: 'bevel' }), null);
  assert.ok(Polysmith.design.jig({ solid: 'tetra', mode: 'finger', fingerStyle: 'bevel' }).preview.startsWith('<svg'));
});

test('quantities nest across sheets; zip, coupon, single sheets', async () => {
  const d = Polysmith.design.compute({ mode: 'net', copies: 12, sheetPreset: '300x300' }, { svg: false, dxf: false });
  assert.equal(d.stats.parts, 12); assert.ok(d.stats.sheets > 1);
  assert.throws(() => Polysmith.design.sheetSVG({}, 9), RangeError);
  assert.ok(Polysmith.design.sheetDXF({}, 1).includes('CUT'));
  const z = await Polysmith.design.zip({ solid: 'tetra' });
  assert.equal(z.data.subarray(0, 2).toString(), 'PK');
  assert.ok(z.data.includes(Buffer.from('README.txt')));
  assert.ok(Polysmith.design.coupon({ t: 3.2 }).data.includes('<svg'));
  assert.match(Polysmith.design.fileName({ solid: 'cube', mode: 'finger' }), /^polysmith-cube-finger-80mm-edge-3mm$/);
});

test('artwork from polylines is centred, scaled and placed on faces', () => {
  const art = Polysmith.art.fromPolylines([{ pts: [[100, 100], [140, 100], [120, 60]], closed: true }], { name: 'tri' });
  const pts = art.polys[0].pts, r = Math.max(...pts.map(q => Math.hypot(q[0], q[1])));
  assert.ok(Math.abs(r - 1) < 1e-9);
  assert.ok(Math.abs(pts.reduce((a, q) => a + q[0], 0)) < 1e-9);
  const all = Polysmith.design.compute({ artMode: 'fill' }, { art, files: false });
  assert.equal(all.parts.find(p => p.name === 'Face').engravings, 1);
  const one = Polysmith.design.compute({ artWhere: 'one', artMode: 'cut' }, { art, files: false });
  assert.ok(one.parts.find(p => /\(art\)/.test(p.name)).holes > one.parts.find(p => p.name === 'Face').holes);
  assert.throws(() => Polysmith.design.compute({}, { art: { polys: 'x' } }), TypeError);
});

test('library (in memory)', async () => {
  Polysmith.library.clear();
  await Polysmith.library.add('b.svg', '<svg viewBox="0 0 1 1"/>');
  await Polysmith.library.add('a.svg', '<svg viewBox="0 0 1 1"/>');
  assert.deepEqual(Polysmith.library.list().map(x => x.name), ['a.svg', 'b.svg']);
  assert.ok(Polysmith.library.remove('a.svg')); assert.equal(Polysmith.library.list().length, 1);
  await assert.rejects(() => Polysmith.library.add('c', 'not svg'), TypeError);
  Polysmith.library.clear();
});

/* ---------- with a real browser ---------- */
let full = null, why = '';
test('browser-backed API', async t => {
  try { require.resolve('playwright-core'); } catch (e) { why = 'playwright-core is not installed'; }
  if (!why) { try { full = await load(); await full.page(); } catch (e) { why = e.message; full = null; } }
  if (!full) { t.skip(why); return; }
  t.after(() => full.close());

  await t.test('the page and Node compute the same design', async () => {
    const pg = await full.page();
    const settings = { solid: 'dodeca', mode: 'finger', fingerStyle: 'bevel', window: 'voronoi', size: 95, t: 3.2 };
    const fromPage = await pg.evaluate(s => { Polysmith.browser.setSettings(s); return Polysmith.browser.current({ files: false }); }, settings);
    const fromNode = full.design.compute(settings, { files: false });
    assert.deepEqual(fromPage.stats, fromNode.stats);
    assert.deepEqual(fromPage.sheets.map(s => s.svg), fromNode.sheets.map(s => s.svg));
    assert.deepEqual(fromPage.jig, fromNode.jig);
  });

  await t.test('SVG artwork', async () => {
    const art = await full.art.fromSVG('<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#fff"/><circle cx="80" cy="80" r="15"/><path d="M10 10h20v20h-20z"/></svg>', 'two.svg');
    assert.equal(art.polys.length, 2, 'white background dropped');
    await assert.rejects(() => full.art.fromSVG('<svg xmlns="http://www.w3.org/2000/svg"><text>hi</text></svg>'), /only has text/);
    const d = full.design.compute({ solid: 'cube' }, { art, files: false });
    assert.equal(d.art.paths, 2);
    await full.library.add('two.svg', art.svg);
    assert.equal((await full.library.use('two.svg')).polys.length, 2);
  });

  await t.test('pictures', async () => {
    const png = await full.design.render({ solid: 'octa', window: 'star' }, { width: 320, height: 240, lamp: { gain: 1.4, color: '#88ccff' } });
    assert.equal(png.png.subarray(1, 4).toString(), 'PNG'); assert.equal(png.width, 320);
    const jig = await full.design.render({ solid: 'tetra', mode: 'finger', fingerStyle: 'bevel' }, { view: 'jig', width: 200, height: 150, background: 'transparent' });
    assert.ok(jig.png.length > 1000);
    await assert.rejects(() => full.design.render({}, { view: 'jig' }), RangeError);
    await assert.rejects(() => full.design.render({}, { width: 0 }), RangeError);
    await assert.rejects(() => full.design.render({}, { bogus: 1 }), RangeError);
  });

  await t.test('driving the page', async () => {
    const pg = await full.page();
    const v = await pg.evaluate(() => { Polysmith.browser.updateSettings({ solid: 'icosa', mode: 'tab' }); return Polysmith.browser.view({ yaw: 45, pitch: 30, lamp: { on: true, gain: 2 }, stereo: 'cross', spin: false }); });
    assert.equal(v.yaw, 45); assert.equal(v.lamp.on, true); assert.equal(v.lamp.gain, 2); assert.equal(v.stereo, 'cross'); assert.equal(v.spin, false);
    const snap = await pg.evaluate(() => Polysmith.browser.snapshot({ width: 300, height: 200 }).png.slice(0, 22));
    assert.equal(snap, 'data:image/png;base64,');
    const off = await pg.evaluate(() => { Polysmith.browser.view({ stereo: 'off', lamp: false }); return Polysmith.browser.view({ view: 'bracket', explode: 0.5 }); });
    assert.equal(off.view, 'bracket'); assert.equal(off.explode, 0.5);
    assert.equal(await pg.evaluate(() => document.querySelector('[data-k=size]').value), '95', 'updateSettings keeps the earlier size and the inputs show it');
    await assert.rejects(() => pg.evaluate(() => Polysmith.browser.view({ view: 'jig' })), /isn't available/);
  });
});

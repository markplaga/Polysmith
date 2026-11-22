'use strict';

/* Polysmith in Node.js with every feature of the page.
     npm install playwright-core      (and have Chrome, Chromium or Edge installed)
     const { load } = require('./polysmith-node.js');
     const Polysmith = await load();
     ...
     await Polysmith.close();
   Everything in polysmith-api.js works straight away, with no browser. The browser starts the first time you call
   art.fromSVG, library.use or design.render (they read SVG and draw pictures exactly as the page does),
   and close() shuts it. Choose a browser with load({ chrome: '/path' }) or POLYSMITH_CHROME=/path. */

const fs = require('node:fs');
const path = require('node:path');

async function load({ dir = __dirname, timeout = 30000, chrome } = {}) {
  const root = path.resolve(dir);
  const Polysmith = require(path.join(root, 'polysmith-api.js'));
  const api = { ...Polysmith };
  for (const k of Object.keys(Polysmith)) if (Polysmith[k] && typeof Polysmith[k] === 'object') api[k] = { ...Polysmith[k] };

  let browser = null, starting = null;
  const message = error => new Error(String((error && error.message) || error).split('\n')[0].replace(/^[\w.]+: (?:(?:Type|Range)?Error: )?/, ''));
  const kind = error => { const m = /^[\w.]+: ((?:Type|Range)Error): /.exec(String(error && error.message)); return m ? globalThis[m[1]] : Error; };
  const fail = error => { const Type = kind(error), e = message(error); throw new Type(e.message); };
  const page = () => starting || (starting = (async () => {
    let playwright;
    try { playwright = require('playwright-core'); }
    catch (error) { throw new Error('Reading SVG and rendering from Node need: npm install playwright-core (and Chrome, Chromium or Edge installed)'); }
    const html = await fs.promises.readFile(path.join(root, 'index.html'), 'utf8');
    const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
    if (typeof process.getuid === 'function' && process.getuid() === 0) args.push('--no-sandbox');
    const executablePath = chrome || process.env.POLYSMITH_CHROME;
    const attempts = executablePath ? [{ executablePath }] : [{ channel: 'chrome' }, { channel: 'msedge' }, {}];
    let last;
    for (const attempt of attempts) {
      try { browser = await playwright.chromium.launch({ headless: true, args, ...attempt }); break; }
      catch (error) { last = error; }
    }
    if (!browser) throw new Error('Could not start Chrome. Install Chrome or Chromium, or set POLYSMITH_CHROME to its path. (' + String(last && last.message).split('\n')[0] + ')');
    const pg = await browser.newPage();
    await pg.route('**/*', route => {
      const url = route.request().url();
      if (url === 'http://polysmith.local/index.html') route.fulfill({ contentType: 'text/html', body: html });
      else route.abort();
    });
    await pg.goto('http://polysmith.local/index.html', { waitUntil: 'load', timeout });
    await pg.waitForFunction(() => !!(window.Polysmith && Polysmith.design && Polysmith.design.render), null, { timeout });
    return pg;
  })().catch(error => { starting = null; if (browser) { browser.close().catch(() => {}); browser = null; } throw error; }));

  api.art.fromSVG = async (svg, name) => {
    if (typeof svg !== 'string' || !/<svg[\s>]/i.test(svg)) throw new TypeError('fromSVG needs SVG text');
    const pg = await page();
    try { return await pg.evaluate(([s, n]) => Polysmith.art.fromSVG(s, n), [svg, name || 'artwork.svg']); } catch (error) { return fail(error); }
  };
  /** Reads an SVG file from disk. */
  api.art.fromFile = async file => api.art.fromSVG(await fs.promises.readFile(file, 'utf8'), path.basename(file));
  /** Every .svg in a folder, like Import folder: [{ name, art }] plus { errors }. */
  api.art.fromFolder = async folder => {
    const names = (await fs.promises.readdir(folder)).filter(n => /\.svg$/i.test(n)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const out = [], errors = [];
    for (const n of names) { try { out.push({ name: n, art: await api.art.fromFile(path.join(folder, n)) }); } catch (e) { errors.push({ name: n, error: e.message }); } }
    return Object.assign(out, { errors });
  };
  api.library.use = async name => { const it = api.library.get(name); if (!it) throw new RangeError('No library design called ' + name); return api.art.fromSVG(it.svg, name); };
  api.design.render = async (settings = {}, options = {}) => {
    const pg = await page();
    let r;
    try { r = await pg.evaluate(([s, o]) => Polysmith.design.render(s, o), [settings, options]); } catch (error) { return fail(error); }
    return { png: Buffer.from(r.png.slice(r.png.indexOf(',') + 1), 'base64'), width: r.width, height: r.height };
  };
  /** The headless page (Playwright) running the real Polysmith, where window.Polysmith.browser works too. */
  api.page = page;
  api.close = async () => { const b = browser; browser = null; starting = null; if (b) await b.close(); };
  return api;
}

module.exports = { load };

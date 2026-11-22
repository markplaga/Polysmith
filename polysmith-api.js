'use strict';

/* Polysmith in Node.js, with no dependencies.
     const Polysmith = require('./polysmith-api.js');
     const design = Polysmith.design.compute({ solid: 'dodeca', mode: 'finger', size: 100 });
   Everything the page computes is here: settings, cut sheets, SVG, DXF, zip, fit coupon, bevel jig, assembly guide,
   artwork from polylines, and an artwork library (kept in memory).
   Reading SVG files (art.fromSVG) and drawing pictures (design.render) need a real browser: use polysmith-node.js. */

const path = require('node:path');
const src = path.join(__dirname, 'src');
require(path.join(src, 'geom.js'));
require(path.join(src, 'engine.js'));

const Polysmith = globalThis.PolyEngine.api({ art: {
  fromSVG() { throw new Error("art.fromSVG needs a browser to read SVG. Use require('./polysmith-node.js').load() instead."); },
} });
Polysmith.design.render = () => Promise.reject(new Error("design.render needs a browser. Use require('./polysmith-node.js').load() instead."));

/* artwork library: the same calls as the page's, kept in memory */
const LIB = new Map();
Polysmith.library = {
  list: () => [...LIB.values()].map(x => ({ name: x.name, bytes: x.svg.length })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
  get: name => LIB.has(name) ? { ...LIB.get(name) } : null,
  async add(name, svg) { if (typeof name !== 'string' || !name) throw new TypeError('library.add needs a name'); if (typeof svg !== 'string' || !/<svg[\s>]/i.test(svg)) throw new TypeError('library.add needs SVG text'); LIB.set(name, { name, svg }); return Polysmith.library.list(); },
  remove: name => LIB.delete(name),
  clear() { LIB.clear(); },
  async use(name) { if (!LIB.has(name)) throw new RangeError('No library design called ' + name); return Polysmith.art.fromSVG(LIB.get(name).svg, name); },
};

module.exports = Polysmith;

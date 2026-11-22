# Polysmith

Platonic solids for the laser cutter. Pick a tetrahedron, cube, octahedron, dodecahedron or icosahedron, set the size and material, and Polysmith produces cut-ready SVG/DXF sheets. Material thickness, kerf and the angle each solid's faces meet at are handled automatically, and every joint is checked in 3D.

Open `index.html` in a browser. It's a single self-contained file with no install and no server.

## Construction modes

- **Slot & bracket**: glue-free press fit. Every face slides straight onto its own brackets, so the last face drops in like the rest.
- **Finger joints**: interlocking teeth offset for the solid's angle. All faces are identical.
  - *Flush*: square-cut, never protrudes.
  - *Full*: teeth stand slightly proud; sand flush.
  - *Bevelled*: tooth tips and notch bottoms cut at the face angle in a second pass on a tilted jig. Joints close with no gaps.
- **Glue blocks**: clean faces with hidden angle blocks inside.
- **Edge-glued**: bare panels plus angle jigs (good for acrylic).
- **Folding net**: one-piece net with glue tabs and fold lines, for card or chipboard.

## Features

- Size by edge length, width across the points, or height on a table; mm or inches
- Materials: birch ply, MDF, bamboo, walnut, clear / frosted / coloured / black acrylic, cardstock (look right in 3D; translucent ones let light through in lamp mode; each sets a typical kerf)
- Kerf and fit compensation, plus a fit-test coupon
- Face windows (circle, polygon, star) and engraved dice numbers
- Artwork on faces: upload any SVG, or (inside the Claude app) describe it and have Claude draw it. Fill engrave, line engrave, or cut-through stencil
- Bevel jig generator: ribs, deck and pocket strip, plus a "jig station" file whose base plate is cut in place so the bevel cuts line up with it automatically
- 3D preview (WebGL, true depth): zoom, pan, full screen, explode, fold animation, single-piece view, and a 3D view of the bevel jig
- Sheet layout and export: SVG and DXF per sheet, or everything as a zip with a README

Layer colours: **red** = cut, **blue** = score/fold, **green** = line engrave, **black** = fill engrave. Jig station: **red** = base (cut in place first), **orange** = bevel tips, **purple** = bevel notches.

## Development

`src/` holds the source: `geom.js` (all geometry, no DOM), `app.js` (UI, 3D renderer), `index.html` (markup and styles), and `earcut.min.js` (polygon triangulation, © Mapbox, ISC license).

```
node build.js            # inlines src/ into index.html
node tests/test.js       # solids, bracket/slot alignment, net closure, packing
node tests/ftest.js      # finger-joint collision sweep (slow)
node tests/btest.js      # bevelled vs square teeth: collisions, protrusion, gaps
node tests/patterns.js   # every cut-out pattern keeps a full bridge between holes
```

## JavaScript API

Everything the page does is also a JavaScript API. It works in Node (`require('./polysmith-api.js')`, with no dependencies), with pictures and SVG import through headless Chrome (`require('./polysmith-node.js').load()`), and in the page's console as `window.Polysmith`. See [API.md](API.md).

```js
const Polysmith = require('./polysmith-api.js');
const design = Polysmith.design.compute({ solid: 'dodeca', mode: 'finger', size: 100, window: 'honeycomb' });
for (const f of design.files) require('fs').writeFileSync(f.name, f.data);
```

Build the page from `src/` with `npm run build`; run the tests with `npm install && npm test`.

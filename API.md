# Polysmith JavaScript API

The API does everything the Polysmith page does. It picks solids and sizes, builds every construction mode, adds cut-outs and artwork, and nests parts onto sheets. It writes SVG, DXF and the zip, the fit-test coupon and the bevel jig files, along with the assembly guide and README. It also draws the 3D model to a PNG, including lamp mode and stereo pairs, and drives the page itself. Everything runs locally.

There are three ways to use it:

| Where | How | What you get |
| --- | --- | --- |
| Node.js, no install | `const Polysmith = require('./polysmith-api.js');` | Everything except reading SVG files and drawing pictures. No dependencies. |
| Node.js, everything | `npm install playwright-core`, then `const { load } = require('./polysmith-node.js'); const Polysmith = await load();` | Adds `art.fromSVG`, `art.fromFile`, `art.fromFolder`, `library.use` and `design.render`. These run the real page in headless Chrome. Call `await Polysmith.close()` when you're done. |
| The Polysmith page | `window.Polysmith` in the browser console | The whole API, plus `Polysmith.browser`, which drives the page you're looking at. |

Lengths are in millimetres and angles are in degrees everywhere in the API. The `units` setting only changes what the page displays.

## Quick start: cut files for a solid

```js
const fs = require('node:fs');
const Polysmith = require('./polysmith-api.js');

const design = Polysmith.design.compute({ solid: 'dodeca', mode: 'finger', size: 100, t: 3.2, window: 'honeycomb' });

console.log(design.size, design.joint, design.stats, design.warnings);
for (const file of design.files) fs.writeFileSync(file.name, file.data);   // sheet SVGs + DXFs, jig files, README.txt
```

Or get the same zip the page's **Download everything** button gives you:

```js
const zip = await Polysmith.design.zip({ solid: 'icosa', mode: 'tab' });
fs.writeFileSync(zip.name, zip.data);
```

## Settings

A design is one settings object. Every control on the page is a key (a test checks this). Anything you leave out gets its default.

| Method | Result |
| --- | --- |
| `settings.defaults()` | All keys with their defaults. |
| `settings.keys()` | `[{ key, default, type, values?, min?, max? }]`: what every key accepts. |
| `settings.create(overrides)` | Defaults plus your changes. Throws `RangeError` / `TypeError` for an unknown key or a bad value. |
| `settings.update(settings, changes)` | A copy with a few changes. |
| `settings.validate(settings)` | `{ ok: true }` or `{ ok: false, error }`. |
| `settings.edge(settings)` | The edge length in mm, whichever way the size was given. |
| `settings.remeasure(settings, 'edge' \| 'sphere' \| 'height')` | The same physical size, given another way. |
| `settings.serialize(settings)` / `settings.parse(json)` | Save and load settings as JSON. |

The main keys:

| Key | Values |
| --- | --- |
| `solid` | `'tetra'`, `'cube'`, `'octa'`, `'dodeca'`, `'icosa'` (d4, d6, d8, d12, d20) |
| `mode` | `'tab'` slot & bracket, `'finger'` finger joints, `'block'` glue blocks, `'none'` edge-glued, `'net'` folding net |
| `size`, `measure` | The size, measured as `'edge'` (edge length), `'sphere'` (across the points) or `'height'` (resting on a face) |
| `t`, `kerf`, `fit` | Material thickness, beam width, and fit (+ looser, − tighter) |
| `material` | `'ply'`, `'mdf'`, `'bamboo'`, `'walnut'`, `'clear'`, `'frost'`, `'color'`, `'black'`, `'card'`. Picking one also sets its usual kerf and, for see-through acrylics, its opacity, unless you give those too. `matColor` is the coloured acrylic's colour; `opacity` (5–100) is for see-through ones. |
| `fingerStyle`, `fingerW` | `'flush'`, `'full'` or `'bevel'`; finger width (0 = automatic) |
| `perEdge`, `tabLen`, `protrude` | Brackets per edge (1–3), tab or block length (0 = automatic), how far tabs stand proud |
| `window`, `windowPct`, `patDensity`, `bridge` | Cut-out (see `cutouts.list()`), its size, pattern density (1–10), and the thinnest strip left between holes |
| `dice` | Engrave dice numbers |
| `tabH`, `fold`, `copies` | Folding net: glue-tab height, `'score'` or `'perf'` fold lines, number of copies (1–500) |
| `artMode`, `artScale`, `artRot`, `artWhere` | Artwork: `'fill'`, `'line'` or `'cut'`; size 20–150 %; rotation in degrees; `'all'` faces or `'one'` |
| `sheetPreset`, `sheetW`, `sheetH`, `margin`, `spacing` | Stock size (see `sheets.presets()`), edge margin and gap between parts |
| `deckColor`, `units` | The jig deck colour in 3D; `'mm'` or `'in'` for display |

Lists: `solids.list()`, `modes.list()`, `materials.list()`, `cutouts.list()` and `sheets.presets()`. `solids.measure('icosa', { acrossPoints: 200 })` converts between edge length, size across the points, and height.

## Designs: `design`

| Method | Result |
| --- | --- |
| `design.compute(settings, options)` | Everything about one design (below). |
| `design.files(settings, options)` | Just the files: `[{ name, type, data }]`, named as the page names them. |
| `design.zip(settings, options)` | A promise of `{ name, data }`. `data` is a `Buffer` in Node and a `Uint8Array` in the browser. |
| `design.sheetSVG(settings, index = 1, { preview })` / `design.sheetDXF(settings, index = 1)` | One sheet. `preview: true` gives the coloured version the page shows. |
| `design.coupon(settings)` | The fit-test coupon: `{ name, data }` (SVG). |
| `design.jig(settings)` | Bevel jig numbers, its files and a preview SVG, or `null` when there's no jig. |
| `design.guide(settings)` / `design.readme(settings)` / `design.fileName(settings)` | Assembly steps, README text, and the base file name. |
| `design.render(settings, options)` | A picture. Needs the page or `polysmith-node.js` (see below). |

`options`: `art` (an artwork object, see below), `svg` and `dxf` (default `true`), `files` (default `true`), and `geometry` (`false`; when true it adds each part's cut, score and engrave paths).

`compute` returns:

- `name`, `solid`, `mode`, `settings` (the full settings used).
- `size`: `{ edge, acrossPoints, height, dihedral, faces, edges, vertices }`.
- `joint`: depends on the mode. Edge inset; fingers per edge, finger width and depth; bracket count and tab length; block count and depth.
- `parts`: `[{ name, count, width, height, holes, engravings, scores }]`.
- `sheets`: `[{ index, width, height, oversize, counts, svg, dxf }]`.
- `stats`: `{ parts, sheets, cutLengthMm, scoreLengthMm }`.
- `warnings`: `[{ level, message }]`, the same messages the page shows.
- `guide`: the assembly steps. `readme`: the README text. `files`: as `design.files`.
- `jig`: for bevelled teeth, `{ needed, tilt, facesPerRun, runs, passes, tipHeight, notchHeight, outsideFace, cutThickness, files }` (a cube says `needed: false`). Otherwise `null`.
- `art`: `{ name, paths, mode, where }` or `null`.

SVG layers: red = cut, blue = score/fold, green = line engrave, black = fill engrave. Jig station: red = base (cut in place), orange = tip bevels, purple = notch bevels.

## Artwork: `art` and `library`

Artwork is a plain object, `{ name, svg, polys: [{ pts, closed }], texts }`. It is centred and scaled to fit the face, just like an upload. Pass it as `options.art` to `compute`, `files`, `zip` or `render`.

| Method | Result |
| --- | --- |
| `art.fromPolylines(polylines, { name, yUp })` | From your own points (any units). Each item is `[[x, y], ...]` or `{ pts, closed }`. y points down, as in SVG, unless `yUp: true`. Works everywhere. |
| `await art.fromSVG(svgText, name)` | Reads an SVG exactly as **Upload SVG** does: hidden and white background shapes are dropped and `<use>` is expanded. A file with only text throws. Page or `polysmith-node.js`. |
| `await art.fromFile(path)` / `await art.fromFolder(path)` | Node (`polysmith-node.js`) only. `fromFolder` reads every `.svg`, like **Import folder**, and returns `[{ name, art }]` with an `errors` list. |
| `library.list()` / `get(name)` / `add(name, svg)` / `remove(name)` / `clear()` / `await use(name)` | The artwork library drop-down. In the page, `use` puts the design on the faces and the library is saved in the browser. In Node, it's kept in memory and `use` returns the artwork object. |

```js
const { load } = require('./polysmith-node.js');
const Polysmith = await load();
const fox = await Polysmith.art.fromFile('fox.svg');
const design = Polysmith.design.compute({ solid: 'dodeca', artMode: 'fill', artScale: 90 }, { art: fox });
```

## Pictures: `design.render`

`design.render(settings, options)` draws a design with the same 3D code as the page, on its own canvas and camera, so the page's view isn't touched. It returns a promise of `{ png, width, height }`. `png` is a data URL in the browser and a `Buffer` in Node.

| Option | Meaning |
| --- | --- |
| `yaw` | Degrees around the vertical. Default `34`. |
| `pitch` | Degrees looking down (−90 to 90). Default `20`. |
| `width`, `height` | Pixels, 1–8192. Default `1200` × `900`. |
| `zoom` | 0.2–12. Default `1`. |
| `view` | `'whole'`, `'face'`, `'bracket'` (slot & bracket or glue blocks) or `'jig'` (bevelled teeth). |
| `explode` | 0–1: pulls the parts apart, or folds a net. |
| `lamp` | `true`, or `{ on, gain (0–3), color, roomSize (0.6–2.5), x, y, z (−0.6–0.6) }`: an LED inside, shadows on the walls of a room. |
| `stereo` | `'off'`, `'cross'` (cross-eyed) or `'parallel'`. |
| `background` | `'#rrggbb'` or `'transparent'`. Default white. |
| `art` | Artwork to show on the faces. |

```js
const { png } = await Polysmith.design.render(
  { solid: 'dodeca', window: 'voronoi', material: 'frost', opacity: 40 },
  { width: 1600, height: 1000, lamp: { gain: 1.6, color: '#ffb070' } });
fs.writeFileSync('lamp.png', png);
```

In Node, the picture is drawn by the real page in headless Chromium using software WebGL, so no graphics card is needed. Chrome starts on the first call that needs it (about 2 seconds) and stays open until `close()`. Choose a browser with `load({ chrome: '/path' })` or `POLYSMITH_CHROME=/path`.

## Drive the page: `Polysmith.browser`

This works in the page, or in Node through `await Polysmith.page()`, which returns the Playwright page.

| Method | Effect |
| --- | --- |
| `getSettings()` / `setSettings(s)` / `updateSettings(changes)` / `reset()` | Read or change what the page is showing. The controls update to match. |
| `current(options)` | `design.compute` for the page's design, including its artwork. |
| `view(changes)` | Reads and changes the 3D view: `yaw`, `pitch`, `zoom`, `pan: [x, y]`, `view` (`'whole'`, `'face'`, `'bracket'`, `'jig'`), `explode`, `playing`, `spin` (auto-turn on or off), `stereo`, `lamp` (as in render), `maximize`, `deckColor`. Returns the current view. |
| `play(on = true)` | Plays the explode or fold animation. |
| `setArt(svg, name)` / `clearArt()` / `getArt()` | The artwork on the faces. |
| `sheet(index)` | Shows cut sheet `index` (from 1). With no index, it says which sheet is showing. |
| `download(kind)` | `'zip'`, `'svg'`, `'dxf'` (the sheet showing), `'coupon'`, `'readme'`, `'settings'`, `'jigParts'`, `'jigStation'`, as the buttons do. |
| `snapshot({ width, height, background })` | A PNG of what the 3D view shows now. |
| `collapse(section, on = true)` | Folds a settings card, for example `'Cut sheet'`. |
| `showHelp()` / `toast(message)` | Opens the Help guide, or shows a message. |

```js
Polysmith.browser.updateSettings({ solid: 'octa', window: 'sunburst' });
Polysmith.browser.view({ lamp: { gain: 2, color: '#ff9a50' }, yaw: 20, spin: false });
```

## Tests

`npm install`, then `npm test`. This runs `tests/api.test.js`. It checks that every control on the page is an API setting, every solid builds in every mode, every pattern cuts, and settings are validated. It also checks the jig, zip, coupon, artwork and library calls. Finally, it confirms the page and Node give identical sheets, and that rendering and driving the page work. The browser tests skip themselves if Chrome or `playwright-core` is missing.

The page is built from `src/` with `npm run build` (`node build.js`). The engine (`src/engine.js`) is shared by the page and Node, so they can't drift apart.

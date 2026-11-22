const fs = require('fs'), rd = f => fs.readFileSync(__dirname + '/src/' + f, 'utf8');
let h = rd('index.html');
h = h.replace('/*GEOM*/', () => rd('geom.js')).replace('/*ENGINE*/', () => rd('engine.js')).replace('/*EARCUT*/', () => rd('earcut.min.js')).replace('/*APP*/', () => rd('app.js'));
fs.writeFileSync(__dirname + '/index.html', h); console.log('built', h.length);

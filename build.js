const fs=require('fs');let h=fs.readFileSync(__dirname+'/src/index.html','utf8');
h=h.replace('/*GEOM*/',()=>fs.readFileSync(__dirname+'/src/geom.js','utf8')).replace('/*EARCUT*/',()=>fs.readFileSync(__dirname+'/src/earcut.min.js','utf8')).replace('/*APP*/',()=>fs.readFileSync(__dirname+'/src/app.js','utf8'));
fs.writeFileSync(__dirname+'/index.html',h);console.log('built',h.length);

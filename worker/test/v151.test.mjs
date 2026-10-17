// v151: в репо только 3D-модели реальных марок; безымянные (concept/toycar/truck) и мотоцикл удалены.
import fs from 'fs';
let fails = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fails++; };
const root = new URL('../../', import.meta.url);
const app = fs.readFileSync(new URL('app.js', root), 'utf8');
const glbs = fs.readdirSync(new URL('models/', root)).filter((f) => f.endsWith('.glb'));
ok(!glbs.some((f) => /^(concept|moto|toycar|truck)\.glb$/.test(f)), 'безымянные модели и мотоцикл удалены: ' + glbs.join(','));
const cat = app.slice(app.indexOf('const MODEL_CATALOG = ['), app.indexOf('];', app.indexOf('const MODEL_CATALOG = [')));
const items = [...cat.matchAll(/\{ id: '([^']+)', name: '([^']+)', file: '\.\/models\/([^']+)'/g)];
ok(items.length >= 5 && items.every(([, , name]) => /^(BMW|Porsche|McLaren|Mercedes-AMG|Lexus|Chevrolet|Ferrari|Audi|Nissan|Lamborghini|Toyota)\b/.test(name)), 'каталог 3D: только реальные марки');
ok(items.every(([, , , file]) => glbs.includes(file)), 'у каждой машины каталога есть GLB');
ok(!/(concept|moto|toycar|truck)\.glb/.test(app) && !/(concept|moto|toycar|truck)\.glb/.test(fs.readFileSync(new URL('sw.js', root), 'utf8')), 'нет ссылок на удалённые модели');
ok(/if \(!s\.carId \|\| \(!inCars && !inGarage\)\) s\.carId = 'g87-m2';/.test(app), 'устаревший carId → реальная BMW (без падения)');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v151 OK');

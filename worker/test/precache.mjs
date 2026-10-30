// v231: с v230 модули собираются esbuild в b/app-HASH.js; «в precache» = прямо в списке SW
// или статически импортирован из app.js (попадает в бандл), а бандл — в BUILD-списке sw.js.
import fs from 'fs';
const R = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
export function inPrecache(file) {
  const sw = R('sw.js'); const f = file.replace(/^\.\//, '');
  if (sw.includes(`'./${f}'`)) return true;
  const man = JSON.parse(R('b/manifest.json'));
  const build = (sw.match(/\/\*BUILD\*\/(\[[^\]]*\])\/\*END\*\//) || [])[1];
  if (!build || !JSON.parse(build).includes(man.app)) return false;
  const seen = new Set(); const walk = (m) => { if (seen.has(m)) return false; seen.add(m); let src; try { src = R(m); } catch { return false; }
    for (const x of src.matchAll(/^\s*import\s+(?:[^'"]*?from\s+)?['"]\.\/([^'"]+)['"]/gm)) { if (x[1] === f || walk(x[1])) return true; } return false; };
  return walk('app.js');
}
/** Лениво грузимый модуль: свой чанк в b/ и SW кэширует /b/*-HASH.js при первой загрузке (cache-first). */
export function lazyCached(name) {
  const sw = R('sw.js'); const files = fs.readdirSync(new URL('../../b/', import.meta.url));
  return files.some((f) => new RegExp('^' + name + '-[A-Z0-9]{8}\\.js$').test(f)) && /hashed = \/\\\/b\\\//.test(sw);
}

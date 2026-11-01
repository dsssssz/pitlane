// v230: сборка прода. Исходники (app.js, styles.css, *.js) остаются читаемыми;
// в b/ кладутся минифицированные файлы с хэшем в имени, index.html переписывается на них.
// Запуск: node tools/build.mjs   (нужен esbuild: npm i -g esbuild или npx)
import { build, transform } from 'esbuild';
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'b');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out);
const r = await build({ entryPoints: [path.join(root, 'app.js')], bundle: true, splitting: true, format: 'esm', minify: true,
  target: ['es2022', 'safari15'], outdir: out, entryNames: '[name]-[hash]', chunkNames: '[name]-[hash]',
  external: ['three', 'three/*'], metafile: true, legalComments: 'none', logLevel: 'warning' });
const appFile = Object.keys(r.metafile.outputs).find((k) => r.metafile.outputs[k].entryPoint);
// CSS: минификация + удаление правил с классами/id, которых нет нигде в html/js
let css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const src = fs.readdirSync(root).filter((f) => /\.(js|html)$/.test(f)).concat(['track-v2/tv2.js']).map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
const alive = (tok) => { if (src.includes(tok)) return true; const parts = tok.split('-'); for (let i = 1; i < parts.length; i++) if (src.includes(parts.slice(0, i).join('-') + '-')) return true; return false; };
const min = (await transform(css, { loader: 'css', minify: true, target: ['safari14'] })).code;
let dropped = 0;
const purge = (txt) => txt.replace(/(^|})([^{}@]+)\{([^{}]*)\}/g, (m, pre, sel, body) => {
  const keep = sel.split(',').filter((s) => { const toks = [...s.matchAll(/[.#]([A-Za-z_][\w-]*)/g)].map((x) => x[1]); return toks.every(alive); });
  if (keep.length === sel.split(',').length) return m;
  dropped += sel.split(',').length - keep.length;
  return keep.length ? pre + keep.join(',') + '{' + body + '}' : pre;
});
let pcss = purge(min); // CSS в корне: url() и CSS-переменные из JS считаются от корня
for (const f of fs.readdirSync(root)) if (/^styles-[A-Z0-9]{8}\.css$/.test(f)) fs.rmSync(path.join(root, f));
const h = crypto.createHash('sha1').update(pcss).digest('hex').slice(0, 8).toUpperCase();
const cssFile = `styles-${h}.css`; fs.writeFileSync(path.join(root, cssFile), pcss);
const appRel = path.relative(root, path.join(process.cwd(), appFile)).split(path.sep).join('/');
const appPath = appRel.startsWith('b/') ? appRel : 'b/' + path.basename(appFile);
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/\.\/(?:b\/)?app(?:-[A-Z0-9]+)?\.js/g, './' + appPath).replace(/\.\/(?:b\/)?styles(?:-[A-Z0-9]+)?\.css/g, './' + cssFile);
// v274: версия сборки → meta в index.html + version.json (проверка обновления в Telegram WebView)
const appVer = (fs.readFileSync(path.join(root, 'app.js'), 'utf8').match(/const APP_VERSION = '([^']+)'/) || [])[1] || 'dev';
html = html.replace(/<meta name="pitlane-build" content="[^"]*" \/>/, `<meta name="pitlane-build" content="${appVer}" />`);
fs.writeFileSync(path.join(root, 'version.json'), JSON.stringify({ v: appVer, app: './' + appPath, css: './' + cssFile }) + '\n');
fs.writeFileSync(path.join(root, 'index.html'), html);
const files = fs.readdirSync(out).map((f) => './b/' + f).concat(['./' + cssFile]);
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ app: './' + appPath, css: './' + cssFile, files }, null, 1));
console.log('app', appPath, fs.statSync(path.join(root, appPath)).size, '| css', cssFile, pcss.length, 'dropped selectors', dropped, '| files', files.length);
// сервис-воркер: список собранных файлов для прекэша
const swp = path.join(root, 'sw.js');
const sw = fs.readFileSync(swp, 'utf8').replace(/\/\*BUILD\*\/\[[^\]]*\]\/\*END\*\//, '/*BUILD*/' + JSON.stringify(files.filter((f) => !f.endsWith('manifest.json') && !/plates|tv2|video-tele|lap-analytics|journal|shop-ui/.test(f))) + '/*END*/');
fs.writeFileSync(swp, sw);

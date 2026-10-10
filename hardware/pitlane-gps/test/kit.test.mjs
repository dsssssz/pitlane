// Комплект v3 (корпус C): распиновка в документации = пины прошивки. node test/kit.test.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const D = join(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x))); if (!c) fails++; };

const ini = readFileSync(join(D, 'platformio.ini'), 'utf8');
const sec = ini.split(/^\[env:esp32c3kit\]$/m)[1]?.split(/^\[/m)[0] || '';
const flags = Object.fromEntries([...sec.matchAll(/-D([A-Z_0-9]+)=(-?[\w.]+)/g)].map((m) => [m[1], Number.isNaN(Number(m[2])) ? m[2] : Number(m[2])]));
const P = JSON.parse(readFileSync(join(D, 'docs/kit/pinout.json'), 'utf8'));

console.log('[env esp32c3kit ↔ docs/kit/pinout.json]');
ok(sec.length > 0, 'в platformio.ini есть [env:esp32c3kit]');
ok(/default_envs\s*=.*esp32c3kit/.test(ini), 'esp32c3kit собирается по умолчанию (pio run)');
for (const [k, v] of Object.entries(P.build_flags)) ok(flags[k] === v, `${k} = ${v}`, flags[k]);
for (const w of P.wires.filter((x) => x.flag)) {
  const [k, v] = w.flag.split('='); const gpio = Number(v);
  ok(flags[k] === gpio, `провод ${w.n} (${w.from} → ${w.to}) = ${k}`, flags[k]);
  ok((w.from + w.to).includes('GPIO' + gpio), `провод ${w.n} подписан GPIO${gpio}`);
}
ok(P.wires.find((w) => w.to === 'GPS VCC')?.from === 'ESP32 3V3', 'GPS питается от 3V3');
ok(P.wires.find((w) => w.to === 'ESP32 GPIO20')?.from === 'GPS TX', 'TX GPS → GPIO20 (RX ESP32)');
ok(P.wires.find((w) => w.to === 'ESP32 GPIO21')?.from === 'GPS RX', 'RX GPS ← GPIO21 (TX ESP32)');
ok(/1N4148/.test(P.wires.find((w) => w.to === 'LED +5V')?.via || ''), 'LED +5V — через диод 1N4148');
ok(/330/.test(P.wires.find((w) => w.to === 'LED DIN')?.via || ''), 'LED DIN — через 330 Ом');
const L = P.esp_rows.left, R = P.esp_rows.right;
ok(L.length === 8 && R.length === 8 && L[0] === '5V' && L[2] === '3V3' && L[3] === 'GPIO4' && R[6] === 'GPIO20' && R[7] === 'GPIO21', 'ряды SuperMini (5V GND 3V3 4… / 5…10 20 21)');

console.log('\n[прошивка]');
const lights = readFileSync(join(D, 'src/lights.cpp'), 'utf8'), main = readFileSync(join(D, 'src/main.cpp'), 'utf8');
ok(/LEDS_SINGLE/.test(lights) && /singleColor/.test(lights), 'режим одного LED есть в lights.cpp');
const single = lights.split('uint32_t singleColor(uint32_t now, const State& s, Mode m) {')[1]?.split('\n}\n')[0] || 'NEON';
ok(!/NEON|CYAN|GREEN/.test(single) && /WHITE/.test(single), 'один LED — без неона (белый/янтарь/фиолет/красный)');
ok(/DEFAULT_RATE_HZ/.test(main) && /#ifndef DEFAULT_RATE_HZ/.test(main), 'частота по умолчанию задаётся флагом');
ok(/plboot/.test(main) && /startPortal\(10\)/.test(main), '3 включения подряд → настройка Wi-Fi');
const fw = main.match(/FW_VERSION "([\d.]+)"/)?.[1];
const man = JSON.parse(readFileSync(join(D, 'web-flash/manifest-kit.json'), 'utf8'));
ok(man.version === fw, `manifest-kit.json версии прошивки ${fw}`, man.version);
ok(man.builds.length === 1 && man.builds[0].chipFamily === 'ESP32-C3' && existsSync(join(D, 'web-flash', man.builds[0].parts[0].path)), 'образ комплекта лежит в web-flash/');
ok(/manifest-kit\.json/.test(readFileSync(join(D, 'web-flash/index.html'), 'utf8')), 'кнопка комплекта на странице прошивки');

console.log('\n[корпус C]');
const scad = readFileSync(join(D, 'enclosure/kit/pitlane-gps-c.scad'), 'utf8');
const rep = JSON.parse(readFileSync(join(D, 'enclosure/kit/check_report.json'), 'utf8'));
ok(rep.ok === true, 'check.py: манифолд, коллизий нет, поддержки не нужны');
ok(/TXT = "PITLANE"/.test(scad), 'тиснение PITLANE');
for (const f of ['stl/pitlane-gps-C_body.stl', 'stl/pitlane-gps-C_lid.stl', 'stl/pitlane-gps-C_lightpipe.stl', '3mf/pitlane-gps-C_plate.3mf'])
  ok(existsSync(join(D, 'enclosure/kit', f)), f);

console.log(fails ? `\n✗ kit.test: ${fails} ошибок` : '\nkit.test OK');
process.exit(fails ? 1 : 0);

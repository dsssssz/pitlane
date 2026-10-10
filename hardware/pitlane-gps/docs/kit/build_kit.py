#!/usr/bin/env python3
"""Пакет для сборщика PITLANE GPS (комплект C): PDF + ZIP + README.md + BOM.csv.
   python3 docs/kit/build_kit.py [/workspace/pitlane-gps-kit]
Источники: bom.json, pinout.json, ../../enclosure/kit/{check_report.json, print/estimates.json, renders/, stl/, 3mf/}."""
import csv, html, io, json, os, re, shutil, subprocess, sys, zipfile
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); HW = os.path.abspath(os.path.join(HERE, "../.."))
KIT = os.path.join(HW, "enclosure/kit"); OUT = sys.argv[1] if len(sys.argv) > 1 else "/workspace/pitlane-gps-kit"
os.makedirs(OUT, exist_ok=True)
BOM = json.load(open(os.path.join(HERE, "bom.json"))); PIN = json.load(open(os.path.join(HERE, "pinout.json")))
CHK = json.load(open(os.path.join(KIT, "check_report.json"))); EST = json.load(open(os.path.join(KIT, "print/estimates.json")))
FW = re.search(r'FW_VERSION "([\d.]+)"', open(os.path.join(HW, "src/main.cpp")).read()).group(1)
FLASH_URL = "https://dsssssz.github.io/pitlane/hardware/pitlane-gps/web-flash/"
E = html.escape
def rub(x): return f"{x:,.0f}".replace(",", "\u202f")

# ---------- рендеры → JPEG (в репозиторий и в PDF) ----------
RJ = os.path.join(KIT, "renders-jpg"); os.makedirs(RJ, exist_ok=True)
REN = {}
for n in ["C_hero_34", "C_top", "C_exploded", "C_section", "C_open_wiring", "C_in_car"]:
    src = os.path.join(KIT, "renders", n + ".png"); dst = os.path.join(RJ, n + ".jpg")
    if os.path.exists(src) and (not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src)):
        Image.open(src).convert("RGB").save(dst, quality=88, optimize=True, progressive=True)
    REN[n] = dst

# ---------- итоги BOM ----------
def totals():
    pay_lo = pay_hi = use_lo = use_hi = have_lo = have_hi = 0
    for g in BOM["groups"]:
        if g.get("tools"): continue
        for i in g["items"]:
            k = i["buy"] if i["per_unit"] else 1
            pay_lo += i["lo"] * k; pay_hi += i["hi"] * k
            use_lo += i["lo"] * i["use"]; use_hi += i["hi"] * i["use"]
            if i["id"] not in ("asa", "petg", "wire", "shrink", "glue", "tape"):
                have_lo += i["lo"] * k; have_hi += i["hi"] * k
    tl = sum(i["lo"] for g in BOM["groups"] if g.get("tools") for i in g["items"]); th = sum(i["hi"] for g in BOM["groups"] if g.get("tools") for i in g["items"])
    r = lambda v: int(round(v / 50.0) * 50)
    return dict(pay=(r(pay_lo), r(pay_hi)), use=(r(use_lo), r(use_hi)), have=(r(have_lo), r(have_hi)), tools=(r(tl), r(th)))
T = totals()
def price(i):
    if not i["lo"] and not i["hi"]: return "—"
    s = f'{rub(i["lo"])}–{rub(i["hi"])} ₽'
    return s + (" /шт" if i["per_unit"] and i["buy"] > 1 else "")

# ---------- CSV ----------
with open(os.path.join(HERE, "PITLANE-GPS-BOM.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f, delimiter=";")
    w.writerow(["Группа", "Деталь", "Искать", "Кол-во", "Зачем", "Ориентир, ₽ (от)", "Ориентир, ₽ (до)", "за шт.", "Источник цены", "Аналоги", "На что не попасться"])
    for g in BOM["groups"]:
        for i in g["items"]:
            w.writerow([g["name"], i["name"], i.get("search", ""), i["qty"], i["why"], i["lo"], i["hi"], "да" if i["per_unit"] else "упаковка", i["src"], i["alt"], i["warn"]])

# ---------- таблицы ----------
WIRES = PIN["wires"]
def wire_rows():
    out = []
    for w in WIRES:
        tc = "#111" if w["hex"] in ("#efefef", "#e3c22c") else "#fff"
        out.append(f'<tr><td><span class="dot" style="background:{w["hex"]};color:{tc}">{w["n"]}</span></td><td>{E(w["from"])}</td><td>{E(w["to"])}</td>'
                   f'<td>{E(w["color"])}</td><td>{E(w["via"]) or "—"}</td><td>~{w["len_mm"]} мм</td><td class="sm">{E(w["note"])}</td></tr>')
    return "\n".join(out)
def bom_rows():
    out, n = [], 0
    for g in BOM["groups"]:
        out.append(f'<tr class="grp"><td colspan="4">{E(g["name"])}</td></tr>')
        for i in g["items"]:
            n += 1
            warn = f'<div class="warn">⚠ {E(i["warn"])}</div>' if i["warn"] else ""
            alt = f'<div class="alt">Аналоги: {E(i["alt"])}</div>' if i["alt"] else ""
            srch = f'<div class="srch">Искать: «{E(i["search"])}»</div>' if i.get("search") else ""
            why = f'<div class="why">{E(i["why"])}</div>' if i["why"] else ""
            out.append(f'<tr><td class="n">{n}</td><td><b>{E(i["name"])}</b>{why}{srch}{alt}{warn}</td><td class="q">{E(i["qty"])}</td>'
                       f'<td class="pr">{price(i)}<div class="src">{E(i["src"])}</div></td></tr>')
    return "\n".join(out)

P = CHK["print"]; PARTS = CHK["parts"]
est = lambda k: f'{EST[k]["time"].replace("h", " ч").replace("m", " мин").split(" ") and EST[k]["time"].replace("h", " ч").replace("m ", " мин ").replace("s", " с")}'
asa_g = round(EST["body"]["g"] + EST["lid"]["g"], 1)

LEDS = [
    ("#b07cff", "фиолетовый плавный пульс", "режим настройки Wi-Fi: сеть PITLANE-GPS-XXXX открыта (первый запуск или 3 включения подряд)"),
    ("#ff3b30", "красный, двойная вспышка", "нужна привязка: код не подошёл или прибор отвязан в Mini App → новая привязка"),
    ("#ff3b30", "красный, часто мигает (4 раза в с)", "нет данных от GPS-модуля: питание GPS, TX/RX перепутаны, холодная пайка"),
    ("#ff9500", "янтарный плавный пульс", "GPS ищет спутники (холодный старт под открытым небом до ~30–60 с)"),
    ("#fff1e0", "белый, короткая вспышка раз в 2 с", "спутники есть, Wi-Fi ещё не настроен"),
    ("#fff1e0", "белый, короткая вспышка раз в 1 с", "спутники есть, ищу Режим модема iPhone"),
    ("#fff1e0", "белый, мигает 1 раз в секунду", "Wi-Fi есть, сервера нет: у телефона нет интернета или ждём привязку"),
    ("#fff1e0", "белый, ровно (приглушённо)", "всё готово: поток идёт в Mini App"),
    ("#ffffff", "белый, ровно и ярко", "идёт замер (разгон)"),
    ("#2a2c31", "не горит", "нет питания (горит ли красный LED на самой плате ESP32?), диод стоит наоборот, перепутаны DIN/DOUT"),
]
def led_rows():
    return "\n".join(f'<tr><td><span class="ledsw" style="background:{c}"></span></td><td><b>{E(a)}</b></td><td>{E(b)}</td></tr>' for c, a, b in LEDS)

TROUBLE = [
    ("В логе «GNSS … НЕ ОТВЕЧАЕТ», LED красный 4 Гц", "Поменяйте местами провода 3 и 4 (TX/RX накрест). Проверьте 3,2–3,35 В между VCC и GND платы GPS. Пропаяйте пятаки заново."),
    ("В логе модель не NEO-M9N (M8N, «u-blox M9» без MOD, M10)", "M8N/клон: работать будет, но не 25 Гц и хуже. M10: максимум 10 Гц в нашей прошивке. Для 25 Гц нужен настоящий NEO-M9N-00B."),
    ("Янтарный пульс дольше 2–3 минут", "Антенна не видит небо: прибор под металлом, атермальное/обогреваемое лобовое стекло (ставьте в «окно» без напыления у зеркала), гараж. На 25 Гц приёмник работает только по GPS — нужно открытое небо. Первые 2–3 запуска дольше: заряжается батарейка бэкапа."),
    ("Белый, вспышка раз в 1 с — не подключается к iPhone", "Режим модема: «Разрешать другим» ВКЛ, «Максимальная совместимость» ВКЛ (только 2,4 ГГц), экран «Режим модема» открыт, имя сети = имя iPhone (с апострофом ’ если есть). Пароль — от Режима модема."),
    ("Сеть PITLANE-GPS-XXXX не появляется вообще", "Плата SuperMini с плохим радио: прошивка уже снижает мощность до 8,5 дБм; поставьте запасную плату. Проверьте, что прошит образ «комплект» (strings в логе: «прошивка 2.1.0»)."),
    ("Красная двойная вспышка", "Нужна новая привязка: Mini App → «Привязать чип» → код; на приборе 3 включения подряд → настройка → ввести только код."),
    ("LED не горит, а прибор в Mini App «в сети»", "Диод стоит наоборот (полоска должна смотреть к LED), перепутаны DIN и DOUT, нет 5 В (белый провод)."),
    ("Компьютер не видит плату при прошивке", "Кабель без данных — возьмите другой. Если всё равно нет порта: зажмите BOOT на плате, вставьте USB, отпустите BOOT (до сборки в корпус)."),
    ("Перегрев летом", "В закрытой машине на солнце торпеда бывает 80–100 °C, электроника рассчитана до +85 °C. Шторка на лобовое или снимайте прибор (магнит) на стоянке."),
]
def trouble_rows():
    return "\n".join(f"<tr><td><b>{E(a)}</b></td><td>{E(b)}</td></tr>" for a, b in TROUBLE)

FONT = os.path.join(KIT, "fonts/InterVariable.ttf"); FONTD = os.path.join(KIT, "fonts/InterDisplay-SemiBold.ttf")
img = lambda n: "file://" + REN[n]
WIRING = "file://" + os.path.join(HERE, "pitlane-gps-kit-wiring.png")
chk_ok = "все проверки пройдены" if CHK["ok"] else "ЕСТЬ ОШИБКИ"

HTML = f"""<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>PITLANE GPS — комплект для сборки</title>
<style>
@font-face{{font-family:Inter;src:url("file://{FONT}");font-weight:100 900}}
@font-face{{font-family:InterDisplay;src:url("file://{FONTD}");font-weight:600}}
@page{{size:A4;margin:14mm 13mm 15mm 13mm}}
*{{box-sizing:border-box}}
body{{font-family:Inter,sans-serif;font-size:9.1pt;line-height:1.42;color:#1d1f24;margin:0}}
h1{{font-family:InterDisplay,Inter;font-weight:600;font-size:26pt;letter-spacing:-.01em;margin:0 0 4mm}}
h2{{font-family:InterDisplay,Inter;font-weight:600;font-size:15pt;margin:0 0 3mm;padding-top:1mm;border-top:2px solid #1d1f24}}
h3{{font-size:11pt;margin:4mm 0 1.5mm}}
p{{margin:0 0 2mm}} ul,ol{{margin:0 0 2.5mm;padding-left:5.5mm}} li{{margin:0 0 1mm}}
.page{{page-break-after:always}} .nb{{page-break-inside:avoid}}
.sub{{color:#5a5f69;font-size:11pt;margin-bottom:6mm}}
.cover img{{width:100%;border-radius:3mm;margin:2mm 0 5mm}}
.spec{{display:grid;grid-template-columns:repeat(4,1fr);gap:2.5mm;margin:0 0 5mm}}
.spec div{{background:#f4f5f7;border-radius:2mm;padding:2.5mm 3mm}} .spec b{{display:block;font-size:12pt}} .spec span{{color:#5a5f69;font-size:8.5pt}}
table{{border-collapse:collapse;width:100%;margin:0 0 3mm}}
th,td{{text-align:left;vertical-align:top;padding:1.4mm 1.8mm;border-bottom:.3mm solid #e1e3e8}}
th{{font-size:8.3pt;color:#5a5f69;font-weight:600;border-bottom:.4mm solid #1d1f24}}
.bom td{{font-size:7.9pt;padding:1.1mm 1.6mm;line-height:1.33}} .bom .n{{color:#8a8f99;width:5mm}} .bom .q{{width:22mm}} .bom .pr{{white-space:nowrap;width:34mm}} .why{{color:#3a3f48}}
.grp td{{background:#1d1f24;color:#fff;font-weight:700;font-size:9pt;padding:1.2mm 2mm}}
.srch{{color:#3a6bd1;font-size:7.6pt}} .alt{{color:#4a4f59;font-size:7.6pt}} .warn{{color:#9a4b00;font-size:7.6pt}} .src{{color:#8a8f99;font-size:7.2pt;white-space:normal}}
.sm{{font-size:8.3pt;color:#3a3f48}}
.tot{{background:#f4f5f7;border-radius:2mm;padding:3mm 4mm;margin:2mm 0 3mm}} .tot b{{font-size:12pt}}
.dot{{display:inline-block;width:5.2mm;height:5.2mm;border-radius:50%;text-align:center;line-height:5.2mm;font-size:7.5pt;font-weight:700;border:.3mm solid #1d1f24}}
.ledsw{{display:inline-block;width:6mm;height:6mm;border-radius:50%;border:.3mm solid #8a8f99;box-shadow:inset 0 0 0 .6mm rgba(255,255,255,.35)}}
.box{{border:.4mm solid #e7c27a;background:#fff7e8;border-radius:2mm;padding:2.5mm 3.5mm;margin:0 0 3mm}}
.box.blue{{border-color:#b9c9ec;background:#f2f6ff}}
.two{{display:grid;grid-template-columns:1fr 1fr;gap:4mm}}
.fig img{{width:100%;border-radius:2mm;max-height:56mm;object-fit:cover}} .fig{{margin:0 0 3mm}} .cap{{color:#5a5f69;font-size:8.2pt;margin-top:1mm}}
.wiring img{{width:100%;border:.3mm solid #e1e3e8;border-radius:2mm}}
code{{font-family:"DejaVu Sans Mono",monospace;font-size:8.4pt;background:#f1f2f4;padding:.2mm 1mm;border-radius:1mm}}
.steps li{{margin-bottom:1.6mm}} .muted{{color:#5a5f69}}
.toc{{columns:2;font-size:10pt}} .toc div{{margin-bottom:1mm}}
</style></head><body>

<section class="page cover">
<h1>PITLANE GPS</h1>
<div class="sub">Комплект для сборки · корпус C «USB от машины» · прошивка {FW} (Wi-Fi через Режим модема iPhone, BLE для Android)</div>
<img src="{img('C_hero_34')}">
<div class="spec">
<div><b>76 × 46 × 15,2 мм</b><span>графит ASA, ~{asa_g:g} г</span></div>
<div><b>NEO-M9N, 25 Гц</b><span>u-blox, патч 25×25 вверх</span></div>
<div><b>5 В USB-C</b><span>от ЗУ в прикуриватель, без АКБ</span></div>
<div><b>1 статусный LED</b><span>световод заподлицо в крышке</span></div>
</div>
<div class="toc">
<div>1. Список для заказа</div><div>2. Корпус: решения и печать</div><div>3. Схема и распиновка</div><div>4. Пайка</div>
<div>5. Прошивка через браузер</div><div>6. Сборка в корпус</div><div>7. Первый запуск и привязка</div><div>8. Установка в машине</div>
<div>9. Индикатор и что делать, если не работает</div><div>10. Что не проверено</div>
</div>
<p class="muted" style="margin-top:4mm">Файлы для печати (STL/3MF/SCAD), схема (SVG/PNG), таблица заказа (CSV) и образ прошивки — в архиве PITLANE-GPS-kit.zip.
Исходники: репозиторий pitlane, <code>hardware/pitlane-gps/</code> (корпус — <code>enclosure/kit/</code>, документы — <code>docs/kit/</code>).</p>
</section>

<section class="page">
<h2>1. Список для заказа</h2>
<p>Цены — <b>ориентир</b>: диапазоны из поиска по Ozon/Яндекс Маркету/AliExpress и магазинам на {BOM["date"]}, без доставки. Под каждой ценой — откуда она;
«оценка» — не проверял. Перед заказом сверяйте фото с предупреждениями ⚠.</p>
<table class="bom"><thead><tr><th>#</th><th>Что, зачем, как искать, аналоги, на что не попасться</th><th>Кол-во</th><th>Ориентир</th></tr></thead><tbody>
{bom_rows()}
</tbody></table>
<div class="tot nb">
<b>Итого к оплате (без инструментов, пластик и провод — целыми упаковками): ≈ {rub(T["pay"][0])}–{rub(T["pay"][1])} ₽.</b><br>
Если пластик, провод, скотч, термоусадка и клей уже есть: ≈ {rub(T["have"][0])}–{rub(T["have"][1])} ₽. Реально уходит на один прибор: ≈ {rub(T["use"][0])}–{rub(T["use"][1])} ₽.
Инструменты, если нет ничего: ещё ≈ {rub(T["tools"][0])}–{rub(T["tools"][1])} ₽ (оценка).
</div>
<div class="box nb"><b>Почему питание от USB машины, а не аккумулятор.</b> Прибор работает только вместе с iPhone в Режиме модема, то есть в машине,
где всегда есть 5 В. LiPo под лобовым стеклом летом греется до 70–90 °C: это зона, где литиевый аккумулятор деградирует и может вздуться или загореться,
а заряжать его в жару нельзя. Без АКБ уходят ещё три детали и пайка (модуль заряда, выключатель, делитель). ЗУ с двумя портами одновременно заряжает iPhone,
который на раздаче Wi-Fi быстро садится. Порт <b>USB-A</b> выбран потому, что у части плат SuperMini на USB-C нет резисторов CC и от кабеля C–C они не включаются,
а USB-A даёт 5 В всегда.</div>
</section>

<section class="page">
<h2>2. Корпус: ключевые решения</h2>
<div class="two">
<div class="fig"><img src="{img('C_exploded')}"><div class="cap">Разнесённый вид: основание, ESP32-C3 в кармане, GPS на рейках, LED и световод, крышка со стойками.</div></div>
<div class="fig"><img src="{img('C_section')}"><div class="cap">Разрез по оси: патч под 2,2 мм пластика (воздух 1 мм), ESP32 на дне, LED под световодом.</div></div>
</div>
<ul>
<li><b>Антенна смотрит в небо, над ней только пластик.</b> GPS стоит патчем вверх у правого торца. Крепёж, LED, провода и прижимы вынесены за пределы патча: прижимы держат плату по углам у края без патча.</li>
<li><b>Без металла сверху и без винтов на лицевой стороне.</b> Четыре самореза ST2,2 входят снизу через дно в стойки крышки и стягивают корпус. На лице остаются тиснение PITLANE (0,5 мм, Inter Display, как в приложении) и щель световода 1,6×8,4 мм заподлицо.</li>
<li><b>Премиальная форма.</b> Углы R8, фаска 1,2 мм по верху, 0,8 мм по низу, V-образный «теневой» шов между крышкой и основанием (фаски по 0,45 мм). Решётка из вертикальных щелей 1,5×5 мм по длинным стенкам служит и вентиляцией.</li>
<li><b>USB-C.</b> Окно 12,8×7,0 мм с фаской рассчитано на литьё типового штекера (≤ 12,4×6,8). Плата упирается плечами в стенку, сзади её держит упор, сверху — прижим на корпусе гнезда: штекер вставляется и вынимается без люфта платы.</li>
<li><b>Жара.</b> Основной материал — ASA: размягчается около 95–100 °C и не боится солнца. Внутри нет АКБ. Щели внизу и вверху стенок дают тягу воздуха. Мощность Wi-Fi снижена до 8,5 дБм: меньше нагрев и помех GPS.</li>
<li><b>Крепление.</b> Четыре магнита Ø10×2 вклеиваются в карманы дна и держат прибор на стальной самоклеящейся пластине на торпеде. Прибор снимается одной рукой и не оставляет следов.</li>
<li><b>Печать без поддержек.</b> Основание печатается дном вниз, крышка — лицом вниз: лицо получается гладким от стола, а на текстурном PEI — матовым. Световод печатается фланцем вниз. Самый длинный мост — {P["body"]["max_bridge_span_mm"]:g} мм (верх окна USB).</li>
<li><b>Без кнопок снаружи.</b> BOOT в корпусе недоступна. Режим настройки Wi-Fi включается тремя включениями USB подряд, частота 25 Гц стоит в прошивке комплекта по умолчанию.</li>
</ul>
<h3>Проверка модели (check.py, {chk_ok})</h3>
<table><thead><tr><th>Деталь</th><th>Манифолд / замкнута</th><th>Объём</th><th>Габарит, мм</th><th>Стенки (1-й перцентиль / медиана)</th><th>Макс. мост при печати</th></tr></thead><tbody>
<tr><td>Основание</td><td>да / да</td><td>{PARTS["body"]["volume_cm3"]} см³</td><td>{" × ".join(f"{v:g}" for v in PARTS["body"]["bbox_mm"])}</td><td>{PARTS["body"]["thickness_p01_mm"]} / {PARTS["body"]["thickness_median_mm"]} мм</td><td>{P["body"]["max_bridge_span_mm"]:g} мм</td></tr>
<tr><td>Крышка</td><td>да / да</td><td>{PARTS["lid"]["volume_cm3"]} см³</td><td>{" × ".join(f"{v:g}" for v in PARTS["lid"]["bbox_mm"])}</td><td>{PARTS["lid"]["thickness_p01_mm"]} / {PARTS["lid"]["thickness_median_mm"]} мм</td><td>{P["lid"]["max_bridge_span_mm"]:g} мм</td></tr>
<tr><td>Световод</td><td>да / да</td><td>{PARTS["pipe"]["volume_cm3"]} см³</td><td>{" × ".join(f"{v:g}" for v in PARTS["pipe"]["bbox_mm"])}</td><td>—</td><td>0</td></tr>
</tbody></table>
<p class="sm">Пересечений деталей между собой нет. Платы и провода смоделированы «болванками» по даташитам и раздуты на 0,3 мм: с пластиком не пересекается ни одна. Литьё штекера USB-C проходит в окно.
Тоньше 1,2 мм — только кожа 0,8 мм над магнитами и дно тиснения. Размеры плат: GPS 36×25 (TinyTronics; у части продавцов 35×25 — тоже встанет, по длине запас 0,8 мм),
ESP32-C3 SuperMini 22,52×18 + 2 мм USB-C (espboards, sigmdel), модуль NEO-M9N 16,0×12,2×2,4 (даташит u-blox UBX-19014285). Толщины плат, высота деталей снизу GPS и патча — допущения [ДОП]
в <code>pitlane-gps-c.scad</code>: <b>до печати померьте свои платы штангенциркулем</b>.</p>
</section>

<section class="page">
<h2>2а. Печать</h2>
<table><thead><tr><th>Файл</th><th>Материал</th><th>Как класть</th><th>Вес / время*</th></tr></thead><tbody>
<tr><td><code>pitlane-gps-C_body.stl</code></td><td>ASA графит/чёрный</td><td>дном вниз (как в файле)</td><td>{EST["body"]["g"]:g} г · {E(EST["body"]["time"])}</td></tr>
<tr><td><code>pitlane-gps-C_lid.stl</code></td><td>ASA графит/чёрный</td><td><b>лицом вниз</b> (уже перевёрнута)</td><td>{EST["lid"]["g"]:g} г · {E(EST["lid"]["time"])}</td></tr>
<tr><td><code>pitlane-gps-C_lightpipe.stl</code></td><td>PETG прозрачный (или PC)</td><td>фланцем вниз; печатайте 3–4 шт. за раз</td><td>{EST["lightpipe"]["g"]:g} г · {E(EST["lightpipe"]["time"])}</td></tr>
</tbody></table>
<p class="sm">* PrusaSlicer 2.9, профиль «средний стол-качалка» (Ender-3 / Prusa MK3): периметры 45 мм/с, заполнение 80 мм/с. На CoreXY (Bambu P1/X1, Voron) — примерно в 2–3 раза быстрее (оценка). Профили — <code>enclosure/kit/print/*.ini</code>.
Готовый стол со всеми деталями — <code>pitlane-gps-C_plate.3mf</code>.</p>
<div class="two">
<div>
<h3>ASA (основание, крышка)</h3>
<ul>
<li>Сопло 0,4; слой 0,2 (первый 0,2); <b>4 периметра</b>; верх/низ по 5 слоёв; заполнение 30 % гироид.</li>
<li>Сопло 245–260 °C, стол 95–105 °C, обдув 0–20 % (мосты — 40 %).</li>
<li><b>Закрытый принтер</b> или колпак: без него ASA отрывает углы. Клей или стеклянный/PEI-стол; кайма 3 мм для основания, если углы поднимаются (кайма снимается по фаске).</li>
<li>Крышка: <b>текстурный PEI</b> даёт матовое лицо как у фирменных устройств. Шов — в задний угол.</li>
<li>Поддержки <b>выключены</b>: в модели нет нависаний круче 45°, кроме коротких мостов.</li>
</ul></div>
<div>
<h3>Световод (прозрачный PETG)</h3>
<ul>
<li>Слой 0,12, заполнение 100 %, 15–20 мм/с, сопло 235–245 °C, обдув 30–50 %.</li>
<li>Посадка фланца — 0,12 мм на сторону: должен входить с лёгким усилием. Туго — пройдитесь надфилем по фланцу, свободно — капля клея по краю фланца изнутри.</li>
<li>Лицо световода после печати можно отшлифовать P800–P1500: свечение станет ровнее.</li>
</ul>
<h3>Примерка до пайки</h3>
<ul><li>Вставьте ESP32 в карман (USB-C в окно, плечи — к стенке), GPS — на рейки, наденьте крышку без винтов.
Проверьте, что штекер вашего кабеля входит до упора. Если плата GPS не встаёт по длине — она длиннее 36,4 мм: поправьте <code>GL</code> в SCAD.</li></ul>
</div></div>
</section>

<section class="page">
<h2>3. Схема и распиновка</h2>
<div class="wiring nb"><img src="{WIRING}"></div>
<table><thead><tr><th>№</th><th>Откуда</th><th>Куда</th><th>Провод</th><th>В разрыв</th><th>Длина</th><th>Зачем</th></tr></thead><tbody>
{wire_rows()}
</tbody></table>
<p class="sm">Пины совпадают с прошивкой: <code>platformio.ini [env:esp32c3kit]</code> — <code>GPS_RX_PIN=20</code>, <code>GPS_TX_PIN=21</code>, <code>LEDS_PIN=4</code>, <code>LEDS_SINGLE=1</code>, <code>BAT_ADC_PIN=-1</code>, <code>DEFAULT_RATE_HZ=25</code>.
Это автоматически проверяет тест <code>test/kit.test.mjs</code>. Не подключать: {", ".join(PIN["not_connected"])}.</p>
</section>

<section class="page">
<h2>4. Пайка</h2>
<div class="box"><b>Типичные ошибки.</b> (1) TX и RX соединены «прямо»: нужно накрест, TX GPS → GPIO20, RX GPS → GPIO21. (2) GPS на 5 V: плата GY принимает 3–5 В, но питаем от <b>3V3</b>, это безопаснее для клонов без стабилизатора. (3) Диод наоборот: <b>полоска — к LED</b>. (4) Провод на DOUT вместо DIN.
(5) Перегрев пятаков SuperMini: больше 3 с паяльником при 350 °C — и пятак отходит. (6) Батарейка бэкапа на плате GPS — не трогать, не вынимать, ничего к ней не паять: она своя и заряжается от платы.</div>
<ol class="steps">
<li><b>Сначала прошейте ESP32</b> (раздел 5) и убедитесь, что появилась сеть PITLANE-GPS-XXXX: так вы не будете паять к дохлой плате.</li>
<li><b>Штыри.</b> Если на GPS впаяна гребёнка — выпаяйте её или откусите заподлицо с обеих сторон: корпус рассчитан на провода прямо в пятаки. На ESP32 штыри не ставьте.</li>
<li><b>Провода.</b> Нарежьте по таблице (+10 мм запаса), зачистите 2 мм, залудите. Два чёрных провода сразу скрутите и залудите вместе: они идут в один пятак GND.</li>
<li><b>ESP32 (сверху, со стороны деталей):</b> 3V3 — красный, GND — два чёрных, 5V — белый, GPIO4 — зелёный, GPIO20 — жёлтый, GPIO21 — синий. Номера пинов подписаны на обороте платы: сверьтесь до пайки.</li>
<li><b>GPS (сверху, на краю без патча):</b> VCC — красный, GND — чёрный, TX — жёлтый, RX — синий. Подписи пятаков читайте по шелкографии: порядок у разных продавцов разный. PPS не трогать.</li>
<li><b>LED (оборот мини-платы):</b> в белый провод впаяйте диод 1N4148 полоской к LED, на пятак 5V/VCC. Второй чёрный — на GND. В зелёный провод — резистор 330 Ом, на <b>DIN</b> (стрелка на плате смотрит от DIN к DOUT). Наденьте термоусадку на диод и резистор.</li>
<li><b>Проверка на столе</b> (до корпуса): подключите USB-C к компьютеру, откройте «Logs» на странице прошивки (или <code>pio device monitor</code>).
Должно быть <code>GNSS NEO-M9N-00B: UBX OK, rate 25 Hz</code>, потом раз в секунду строка <code>fix=… sv=… | 25 Hz</code>. LED — фиолетовый пульс (первый запуск = настройка).
Мультиметром: VCC–GND на GPS 3,2–3,35 В; 5V–GND на ESP32 4,8–5,2 В; на LED после диода ≈ 4,2–4,5 В.</li>
</ol>
</section>

<section class="page">
<h2>5. Прошивка через браузер</h2>
<ol class="steps">
<li>Компьютер, <b>Chrome или Edge</b> (нужен Web Serial; на iPhone прошить нельзя). Откройте <code>{FLASH_URL}</code></li>
<li>Подключите ESP32 кабелем USB-A→C с данными. Нажмите <b>«Прошить комплект PITLANE GPS (ESP32-C3)»</b>, выберите порт («USB JTAG/serial debug unit»).</li>
<li>Отметьте <b>«Стереть устройство»</b> и подтвердите. Прошивка {FW} занимает около минуты.</li>
<li>Не видно порта: зажмите BOOT, вставьте USB, отпустите BOOT, повторите. В собранном корпусе этого не понадобится: обновлять прошивку можно тем же кабелем без разборки.</li>
<li>Для разработчиков: <code>cd hardware/pitlane-gps && pio run -e esp32c3kit -t upload</code>; образ для браузера пересобирает <code>./build-web.sh</code>.</li>
</ol>
<p class="sm">Чем образ комплекта отличается от обычного: один LED вместо ленты, нет измерения АКБ, 25 Гц по умолчанию, Wi-Fi 8,5 дБм, режим настройки — 3 включения подряд. BLE для Android работает как прежде.</p>

<h2 style="margin-top:6mm">6. Сборка в корпус</h2>
<div class="two">
<div class="fig"><img src="{img('C_open_wiring')}"><div class="cap">Как всё лежит (крышка снята). LED показан на своей высоте: он стоит в гнезде крышки, над ESP32.</div></div>
<ol class="steps" style="margin-top:0">
<li><b>Магниты:</b> 4 шт. в карманы дна снаружи, капля суперклея-геля, заподлицо. Полярность не важна.</li>
<li><b>ESP32</b> на вспененный скотч в карман, деталями вверх: USB-C до упора в окно, плечи платы — к стенке, сзади — упор.</li>
<li><b>GPS</b> на рейки на скотч: патч к дальнему от ESP32 торцу, край с пятаками — к ESP32. Провода — от края, не через патч.</li>
<li><b>Световод</b> в крышку изнутри, фланцем внутрь, лицо заподлицо. Капля клея только по краю фланца.</li>
<li><b>LED</b> в круглое гнездо крышки под световодом, диодом вверх (капля термоклея). Провода — через прорезь гнезда к ESP32.</li>
<li><b>Уложите провода</b> между платами: ничего над патчем, ничего на углах (там стойки) и под прижимами GPS.</li>
<li><b>Крышка:</b> наденьте (буртик войдёт внутрь стенок), 4 самореза ST2,2×9,5 снизу — до касания и ещё ¼ оборота. Не перетягивайте: ASA трескается.</li>
<li><b>Проверка:</b> USB → LED фиолетовый пульс (если ещё не настроен) или янтарный → белый.</li>
</ol>
</div>
</section>

<section class="page">
<h2>7. Первый запуск и привязка к Mini App (iPhone)</h2>
<ol class="steps">
<li><b>Код:</b> Telegram → Mini App PITLANE → «Заезд» → «Источник GPS» → <b>«Внешний GPS (Wi-Fi)»</b> → «Привязать чип». Код из 6 знаков действует 20 минут.</li>
<li><b>Режим настройки:</b> при первом включении он открывается сам (LED — фиолетовый пульс). Позже: <b>3 включения подряд</b> — вставьте USB, дождитесь LED, через 1–3 с выньте; повторите; на третий раз оставьте. Окно — 10 минут.</li>
<li><b>iPhone → Настройки → Wi-Fi → PITLANE-GPS-XXXX</b>, пароль <code>pitlanegps</code>. Страница настройки откроется сама, иначе — Safari → <code>192.168.4.1</code>.</li>
<li>Впишите <b>имя сети</b> = имя iPhone (Настройки → Основные → Об этом устройстве → Имя), <b>пароль Режима модема</b> и <b>код</b> → «Сохранить».</li>
<li><b>Настройки → Режим модема:</b> «Разрешать другим» — вкл, <b>«Максимальная совместимость» — вкл</b> (прибор видит только 2,4 ГГц). Держите этот экран открытым, пока прибор не подключится.</li>
<li>LED становится белым ровным, в Mini App появляется «чип в сети». Дальше прибор подключается сам при каждом включении, если включён Режим модема.</li>
<li><b>Android:</b> можно без Wi-Fi — Chrome → Mini App → «Внешний GPS (PITLANE GPS)» → Bluetooth.</li>
</ol>
<div class="box blue"><b>Проверка в Mini App:</b> под скоростью строка вида <code>PITLANE-GPS-… · 25 Гц · 14 спутн. · ±1,2 м</code>.
Хорошо: 3D-фикс, ≥ 8 спутников, точность ≤ 2,5 м, частота ≥ 20 Гц. На 25 Гц приёмник использует только GPS: под открытым небом это 10–14 спутников.</div>

<h2 style="margin-top:5mm">8. Установка в машине</h2>
<div class="two">
<div class="fig"><img src="{img('C_in_car')}"><div class="cap">На торпеде у основания лобового стекла, рядом iPhone для масштаба.</div></div>
<ul>
<li><b>Место:</b> торпеда у основания лобового стекла, по центру или ближе к пассажиру, патчем (надписью) вверх. Не под козырьком, не в нише под металлом.</li>
<li><b>Атермальное/обогреваемое стекло</b> глушит GPS. Ставьте напротив «окна» без напыления (обычно у зеркала, где транспондер) или выводите прибор ближе к краю стекла.</li>
<li><b>Пластина:</b> обезжирьте торпеду, приклейте пластину при ≥ +20 °C, сутки не нагружайте. Прибор просто «прилипает» к ней магнитами.</li>
<li><b>Кабель:</b> угловым штекером к прибору, вдоль стыка торпеды и стекла к ЗУ. Порт USB-A — прибору, USB-C — iPhone.</li>
<li><b>Летом</b> на стоянке снимайте прибор или ставьте шторку: торпеда на солнце бывает горячее +85 °C (предел электроники).</li>
</ul>
</div>
</section>

<section>
<h2>9. Индикатор (один LED) и что делать, если не работает</h2>
<table><thead><tr><th style="width:9mm"></th><th style="width:52mm">Индикатор</th><th>Что значит</th></tr></thead><tbody>
{led_rows()}
</tbody></table>
<p class="sm">Порядок важности: настройка и привязка показываются поверх всего, затем «нет GPS», «ищу спутники», затем сеть. На самой плате ESP32 внутри корпуса горит красный LED питания и мигает синий (отладка), снаружи их не видно.</p>
<table><thead><tr><th style="width:62mm">Симптом</th><th>Что делать</th></tr></thead><tbody>
{trouble_rows()}
</tbody></table>
<p class="sm">Лог без Mini App: компьютер, тот же кабель, страница прошивки → «Logs & Console» (115200), или <code>pio device monitor</code>. Строка раз в секунду: фикс, спутники, точность, Гц, состояние Wi-Fi и буфер точек.</p>
</section>

<section class="nb" style="margin-top:5mm">
<h2>10. Что не проверено</h2>
<ul>
<li><b>Корпус не печатался и не собирался вживую.</b> Проверено только в CAD: манифолд, отсутствие коллизий с болванками плат (зазор ≥ 0,3 мм), нависания и мосты, срез в слайсере. Размеры с пометкой [ДОП] (толщины PCB, высота деталей снизу GPS, патч 4 мм, мини-плата LED 10×3) — сверьте со своими деталями до печати.</li>
<li><b>Патч на плате или на проводе.</b> У GY-GPSV3-M9N патч 25×25 обычно стоит на плате, но некоторые продавцы кладут его отдельно на кабеле U.FL. Тогда приклейте патч его скотчем сверху на плату (над модулем), кабель уложите по краю. Патч может касаться крышки — это нормально.</li>
<li><b>Прошивка {FW} собрана и прошла хост-тесты</b> (отметки, буфер, протокол, kit.test). На железе не проверялись: один LED в режиме комплекта, 3 включения подряд, Wi-Fi 8,5 дБм с iPhone, реальные 25 Гц в машине, нагрев в корпусе летом.</li>
<li><b>Цены</b> — диапазоны из выдачи на {BOM["date"]}, не цены конкретного заказа. AliExpress и маркетплейсы часто показывают капчу, поэтому часть цен взята из карточек в выдаче.</li>
<li><b>Распиновка SuperMini</b> взята по описаниям espboards/esp32hub/RandomNerd и сверена с прошивкой. Подписи на обороте конкретной платы — главный ориентир.</li>
</ul>
<p class="muted" style="margin-top:6mm">PITLANE GPS · комплект C · документ собран автоматически из <code>docs/kit/build_kit.py</code> (данные: bom.json, pinout.json, check_report.json).</p>
</section>
</body></html>"""
HTMLF = os.path.join(HERE, "_kit.html"); open(HTMLF, "w").write(HTML)
PDF = os.path.join(OUT, "PITLANE-GPS-kit.pdf")
subprocess.run(["google-chrome", "--headless=new", "--no-sandbox", "--no-pdf-header-footer", "--allow-file-access-from-files",
                f"--print-to-pdf={PDF}", "file://" + HTMLF], capture_output=True, timeout=180)
os.remove(HTMLF)
print("PDF", PDF, os.path.getsize(PDF) // 1024, "KB")

# ---------- README.md (тот же текст, кратко) ----------
md = io.StringIO()
md.write(f"# PITLANE GPS — комплект C «USB от машины» (для сборщика)\n\nПолный пакет: **PITLANE-GPS-kit.pdf** + **PITLANE-GPS-kit.zip** (собирает `python3 docs/kit/build_kit.py`).\n"
         f"Прошивка {FW}, env `esp32c3kit`. Корпус — [`../../enclosure/kit/`](../../enclosure/kit/), схема — [`pitlane-gps-kit-wiring.svg`](pitlane-gps-kit-wiring.svg).\n\n")
md.write("![корпус](../../enclosure/kit/renders-jpg/C_hero_34.jpg)\n\n## Список для заказа (ориентир, " + BOM["date"] + ")\n\n| # | Деталь | Кол-во | Ориентир | На что не попасться |\n|---|---|---|---|---|\n")
n = 0
for g in BOM["groups"]:
    md.write(f"| | **{g['name']}** | | | |\n")
    for i in g["items"]:
        n += 1; md.write(f"| {n} | {i['name']} | {i['qty']} | {price(i)} | {i['warn']} |\n")
md.write(f"\n**Итого к оплате** ≈ {rub(T['pay'][0])}–{rub(T['pay'][1])} ₽ (упаковками, без инструментов); если пластик/провод/расходка есть — ≈ {rub(T['have'][0])}–{rub(T['have'][1])} ₽; "
         f"уходит на 1 прибор ≈ {rub(T['use'][0])}–{rub(T['use'][1])} ₽. Таблица с аналогами и источниками цен — [`PITLANE-GPS-BOM.csv`](PITLANE-GPS-BOM.csv).\n\n")
md.write("## Подключение\n\n![схема](pitlane-gps-kit-wiring.png)\n\n| № | Откуда | Куда | Провод | В разрыв |\n|---|---|---|---|---|\n")
for w in WIRES: md.write(f"| {w['n']} | {w['from']} | {w['to']} | {w['color']} | {w['via'] or '—'} |\n")
md.write("\nПины = `platformio.ini [env:esp32c3kit]`, сверяет `test/kit.test.mjs`.\n\n## Индикатор\n\n| LED | Значит |\n|---|---|\n")
for _, a, b in LEDS: md.write(f"| {a} | {b} |\n")
md.write(f"\n## Печать\n\nASA (основание {EST['body']['g']:g} г / {EST['body']['time']}, крышка {EST['lid']['g']:g} г / {EST['lid']['time']}), световод — прозрачный PETG. "
         "Без поддержек, STL уже повёрнуты. Сопло 0,4, слой 0,2, 4 периметра, 30 % гироид, закрытый принтер.\n\nПодробно (сборка, прошивка, привязка, диагностика, оговорки) — в PDF.\n")
open(os.path.join(HERE, "README.md"), "w").write(md.getvalue())

# ---------- ZIP ----------
ZIPF = os.path.join(OUT, "PITLANE-GPS-kit.zip")
with zipfile.ZipFile(ZIPF, "w", zipfile.ZIP_DEFLATED) as z:
    add = lambda src, arc: z.write(src, "PITLANE-GPS-kit/" + arc)
    add(PDF, "PITLANE-GPS-kit.pdf")
    for f in sorted(os.listdir(os.path.join(KIT, "stl"))): add(os.path.join(KIT, "stl", f), "print/stl/" + f)
    for f in sorted(os.listdir(os.path.join(KIT, "3mf"))): add(os.path.join(KIT, "3mf", f), "print/3mf/" + f)
    for f in ("asa-0.2.ini", "petg-clear-0.12.ini", "estimates.json"): add(os.path.join(KIT, "print", f), "print/slicer/" + f)
    add(os.path.join(KIT, "pitlane-gps-c.scad"), "cad/pitlane-gps-c.scad")
    for f in ("InterDisplay-SemiBold.ttf", "Inter-OFL.txt"): add(os.path.join(KIT, "fonts", f), "cad/fonts/" + f)
    add(os.path.join(KIT, "check.py"), "cad/check.py"); add(os.path.join(KIT, "check_report.json"), "cad/check_report.json")
    for f in ("pitlane-gps-kit-wiring.svg", "pitlane-gps-kit-wiring.png", "pinout.json"): add(os.path.join(HERE, f), "wiring/" + f)
    add(os.path.join(HERE, "PITLANE-GPS-BOM.csv"), "PITLANE-GPS-BOM.csv")
    for n, p in REN.items(): add(p, "renders/" + n + ".jpg")
    add(os.path.join(HW, "web-flash/pitlane-gps-esp32c3kit.bin"), "firmware/pitlane-gps-esp32c3kit.bin")
    z.writestr("PITLANE-GPS-kit/firmware/README.txt", f"Прошивка {FW}, комплект C (ESP32-C3 SuperMini). Проще всего — через браузер: {FLASH_URL}\n"
               "Вручную: esptool.py --chip esp32c3 write_flash 0x0 pitlane-gps-esp32c3kit.bin (цельный образ с адреса 0x0, перед этим erase_flash).\n")
print("ZIP", ZIPF, os.path.getsize(ZIPF) // 1024, "KB")
print("BOM", T)

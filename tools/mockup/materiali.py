"""Materiali marini in stile cartoon: contorno scuro, ombre nette, riflessi pieni, dettagli animati."""
import math
import random
import sys
sys.path.insert(0, sys.path[0])
from forme import uid, f

def blob(w, h, seed, n=4.0, amp=3.0, N=72, pad=0):
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, 6.28) for _ in range(5)]
    a, b = w / 2 - pad - amp, h / 2 - pad - amp
    pts = []
    for i in range(N):
        t = 2 * math.pi * i / N
        c, s = math.cos(t), math.sin(t)
        x = a * math.copysign(abs(c) ** (2 / n), c)
        y = b * math.copysign(abs(s) ** (2 / n), s)
        e = amp * (0.6 * math.sin(2 * t + ph[0]) + 0.5 * math.sin(3 * t + ph[1]) + 0.35 * math.sin(5 * t + ph[2])
                   + 0.25 * math.sin(7 * t + ph[3]) + 0.15 * math.sin(11 * t + ph[4]))
        r = math.hypot(x, y) or 1
        pts.append((w / 2 + x + x / r * e, h / 2 + y + y / r * e))
    return pts


def path(pts):
    return "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + " Z"



INK = "#0b1026"
PAL = {
    # base, ombra, luce, macchie
    "basalt": ("#55638a", "#36406a", "#8d9cc4", "#2a3358"),
    "sand": ("#f2d79a", "#d4aa62", "#fff3cf", "#b98a48"),
    "slab": ("#3f4b70", "#2b3456", "#66759e", "#222a4a"),
    "pebble": ("#c3cde4", "#8c99b9", "#f4f7ff", "#7d8aab"),
    "pebble_dark": ("#46527a", "#323c62", "#6b78a0", "#283052"),
}


def star(cx, cy, r, rot=0, cls="wiggle", color="#ff9f43"):
    pts = []
    for i in range(10):
        a = math.radians(rot - 90 + i * 36)
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    mids = [((pts[i][0] + pts[(i + 1) % 10][0]) / 2, (pts[i][1] + pts[(i + 1) % 10][1]) / 2) for i in range(10)]
    d = f"M{f(mids[-1][0])} {f(mids[-1][1])}" + "".join(f" Q{f(pts[i][0])} {f(pts[i][1])} {f(mids[i][0])} {f(mids[i][1])}" for i in range(10)) + " Z"
    dots = "".join(f'<circle cx="{f(cx + r * .55 * math.cos(math.radians(rot - 90 + i * 72)))}" cy="{f(cy + r * .55 * math.sin(math.radians(rot - 90 + i * 72)))}" r="{f(r * .1)}" fill="#ffe0b0"/>' for i in range(5))
    return (f'<g class="{cls}" style="transform-box: fill-box; transform-origin: center;"><path d="{d}" fill="{color}" stroke="{INK}" stroke-width="1.6" stroke-linejoin="round"/>{dots}'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * .14)}" fill="#ffe0b0"/></g>')


def barnacle(x, y, r, delay=0.0):
    cirri = "".join(f'<path d="M{f(x)} {f(y - r * .3)} q{f((i - 2) * r * .35)} {f(-r * .9)} {f((i - 2) * r * .6)} {f(-r * 1.5)}" stroke="#ffe7c2" stroke-width="1.1" fill="none" stroke-linecap="round"/>' for i in range(5))
    return (f'<g class="cirri" style="transform-box: fill-box; transform-origin: 50% 100%; animation-delay: {delay:.1f}s;">{cirri}</g>'
            f'<path d="M{f(x - r)} {f(y + r * .5)} L{f(x - r * .45)} {f(y - r * .55)} L{f(x + r * .45)} {f(y - r * .55)} L{f(x + r)} {f(y + r * .5)} Z" fill="#e9e1cc" stroke="{INK}" stroke-width="1.4" stroke-linejoin="round"/>'
            f'<path d="M{f(x - r * .6)} {f(y + r * .2)} L{f(x - r * .35)} {f(y - r * .4)} M{f(x + r * .6)} {f(y + r * .2)} L{f(x + r * .35)} {f(y - r * .4)}" stroke="#b7ad94" stroke-width="1"/>'
            f'<ellipse cx="{f(x)}" cy="{f(y - r * .55)}" rx="{f(r * .45)}" ry="{f(r * .18)}" fill="#3a3326" stroke="{INK}" stroke-width="1"/>')


def snail(x, y, s=1.0):
    return (f'<g class="crawl" style="transform-box: fill-box;">'
            f'<path d="M{f(x - 10 * s)} {f(y)} q{f(4 * s)} {f(-5 * s)} {f(14 * s)} {f(-3 * s)} l{f(6 * s)} {f(-5 * s)} m{f(-6 * s)} {f(5 * s)} l{f(4 * s)} {f(-7 * s)} M{f(x - 10 * s)} {f(y)} h{f(22 * s)}" fill="#b7f0c9" stroke="{INK}" stroke-width="1.3" stroke-linecap="round"/>'
            f'<circle cx="{f(x - 1 * s)}" cy="{f(y - 7 * s)}" r="{f(7 * s)}" fill="#ffb86b" stroke="{INK}" stroke-width="1.4"/>'
            f'<path d="M{f(x - 1 * s)} {f(y - 7 * s)} m{f(-4 * s)} 0 a{f(4 * s)} {f(4 * s)} 0 1 1 {f(4 * s)} {f(4 * s)} a{f(2.4 * s)} {f(2.4 * s)} 0 1 1 {f(-1 * s)} {f(-4 * s)}" stroke="{INK}" stroke-width="1" fill="none"/></g>')


def rock(w, h, seed, kind="basalt", n=4.0, amp=3.0, glow=None, barnacles=0, moss=0, thick=6, starfish=False, snail_on=False, style=""):
    base, shade, light, spot = PAL[kind]
    rnd = random.Random(seed * 7 + 3)
    pts = blob(w, h - thick, seed, n=n, amp=amp)
    d = path(pts)
    cp = uid("cp")
    out = [f'<defs><clipPath id="{cp}"><path d="{d}"/></clipPath></defs>',
           f'<path d="{d}" transform="translate(0 {thick})" fill="{shade}" stroke="{INK}" stroke-width="2.4" stroke-linejoin="round"/>',
           f'<path d="{d}" fill="{base}"/>']
    hh = h - thick
    tex = [f'<path d="M-5 {f(hh * .62)} Q{f(w * .22)} {f(hh * .5)} {f(w * .45)} {f(hh * .64)} T{f(w + 5)} {f(hh * .56)} V{hh + 5} H-5 Z" fill="{shade}"/>']
    for _ in range(max(4, int(w / 28))):
        x, y = rnd.uniform(w * .08, w * .92), rnd.uniform(hh * .2, hh * .85)
        rx = rnd.uniform(2.5, 6)
        tex.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(rx)}" ry="{f(rx * .7)}" fill="{spot}" opacity=".55"/>'
                   f'<path d="M{f(x - rx * .6)} {f(y - rx * .3)} q{f(rx * .6)} {f(-rx * .5)} {f(rx * 1.2)} 0" stroke="{light}" stroke-width="1" fill="none" opacity=".6"/>')
    x, y = rnd.uniform(w * .55, w * .8), hh * .3
    tex.append(f'<path d="M{f(x)} {f(y)} l-4 6 l5 3 l-3 7" stroke="{INK}" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>')
    # riflesso pieno in alto a sinistra
    hl = [p for p in pts if p[1] < hh * .42 and p[0] < w * .55]
    if len(hl) > 3:
        hl.sort(key=lambda p: p[0])
        dd = "M" + " L".join(f"{f(px + (w / 2 - px) * .08)} {f(py + (hh / 2 - py) * .25)}" for px, py in hl)
        tex.append(f'<path d="{dd}" stroke="{light}" stroke-width="{f(min(5, hh * .08))}" fill="none" stroke-linecap="round" opacity=".9"/>')
    tex.append(f'<circle cx="{f(w * .62)}" cy="{f(hh * .18)}" r="{f(min(3, hh * .05))}" fill="{light}" opacity=".9"/>')
    for i in range(moss):
        mx, my = pts[int(len(pts) * (0.28 + 0.06 * i))]
        for _ in range(6):
            r = rnd.uniform(2, 3.8)
            tex.append(f'<circle cx="{f(mx + rnd.uniform(-9, 9))}" cy="{f(my + rnd.uniform(-7, 0))}" r="{f(r)}" fill="{rnd.choice(["#5fa84a", "#77c05a", "#4a8f3e"])}" stroke="{INK}" stroke-width="1"/>')
    out.append(f'<g clip-path="url(#{cp})">' + "".join(tex) + '</g>')
    out.append(f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="2.4" stroke-linejoin="round"/>')
    if glow:
        out.append(f'<path class="glowline" d="{d}" fill="none" stroke="{glow}" stroke-width="2" stroke-dasharray="6 9" style="filter: drop-shadow(0 0 4px {glow});"/>')
        k = 0
        for i, (x, y) in enumerate(pts):
            if y > hh * .5 and i % 4 == 0:
                out.append(f'<circle class="glowdot" cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(1.4, 2.6))}" fill="{glow}" style="animation-delay: {k * .23 % 2:.2f}s; filter: drop-shadow(0 0 3px {glow});"/>')
                k += 1
    for i in range(barnacles):
        bx = w * (0.84 - 0.07 * i) + rnd.uniform(-2, 2)
        by = hh * (0.22 + 0.12 * (i % 2))
        out.append(barnacle(bx, by + 2, rnd.uniform(6, 7.5), delay=i * 0.9))
    if starfish:
        out.append(star(w * .2, hh * .78, 12, rot=12))
    if snail_on:
        out.append(snail(w * .7, 2, 0.9))
    return (f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" aria-hidden="true" style="position: absolute; left: 0; top: 0; overflow: visible; {style}">'
            + "".join(out) + '</svg>')


def scallop(size=52):
    cx, hy, R = 26, 42, 22
    ribs = 9
    angs = [math.radians(200 + i * (140 / ribs)) for i in range(ribs + 1)]
    edge = [(cx + R * math.cos(a), hy - 4 + R * math.sin(a) * 1.05) for a in angs]
    d = f"M17 {hy} L{f(edge[0][0])} {f(edge[0][1])}"
    for i in range(ribs):
        am = (angs[i] + angs[i + 1]) / 2
        bx, by = cx + (R + 3.5) * math.cos(am), hy - 4 + (R + 3.5) * math.sin(am) * 1.05
        d += f" Q{f(bx)} {f(by)} {f(edge[i + 1][0])} {f(edge[i + 1][1])}"
    d += f" L35 {hy} Z"
    ribs_svg = "".join(f'<path d="M{cx} {hy - 1} L{f(x)} {f(y)}" stroke="#d0705c" stroke-width="1.3"/>' for x, y in edge[1:-1])
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 52 52" aria-hidden="true" style="position: absolute; left: 0; top: 0; overflow: visible;">'
            f'<g class="breathe" style="transform-box: fill-box; transform-origin: 50% 100%;"><path d="{d}" fill="#ffb8a3" stroke="{INK}" stroke-width="2" stroke-linejoin="round"/>{ribs_svg}'
            f'<path d="M12 22 Q18 10 30 8" stroke="#fff1ea" stroke-width="3" fill="none" stroke-linecap="round"/></g>'
            f'<path d="M15 {hy} L37 {hy} L34 {hy + 7} L18 {hy + 7} Z" fill="#f08f78" stroke="{INK}" stroke-width="2" stroke-linejoin="round"/>'
            f'<circle class="rise" cx="40" cy="8" r="3" fill="none" stroke="#bff6ff" stroke-width="1.4"/><circle class="rise2" cx="44" cy="14" r="2" fill="none" stroke="#bff6ff" stroke-width="1.2"/></svg>')


def sand_dollar(size=52):
    petals = "".join(f'<ellipse cx="26" cy="15" rx="3.2" ry="7.5" fill="#e8d3a2" stroke="#b39463" stroke-width="1.3" transform="rotate({i * 72} 26 26)"/>' for i in range(5))
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 52 52" aria-hidden="true" style="position: absolute; left: 0; top: 0; overflow: visible;">'
            f'<g class="wobble" style="transform-box: fill-box; transform-origin: center;"><circle cx="26" cy="28" r="23" fill="#c7aa72" stroke="{INK}" stroke-width="2"/><circle cx="26" cy="26" r="23" fill="#f6e7c1" stroke="{INK}" stroke-width="2"/>'
            f'<g opacity=".6">{petals}</g><path d="M10 18 Q16 8 28 6" stroke="#fffaf0" stroke-width="3" fill="none" stroke-linecap="round"/></g></svg>')


def crab_shell(w, h, seed=3):
    rnd = random.Random(seed)
    body = path(blob(w, h - 5, seed, n=3.0, amp=2))
    spots = "".join(f'<circle cx="{f(rnd.uniform(30, w - 12))}" cy="{f(rnd.uniform(10, h - 16))}" r="{f(rnd.uniform(1.5, 3))}" fill="#ffc29a" stroke="#b8401f" stroke-width=".8"/>' for _ in range(int(w / 14)))
    eye = lambda x: (f'<path d="M{x} 6 v-12" stroke="{INK}" stroke-width="5" stroke-linecap="round"/><path d="M{x} 6 v-12" stroke="#ff7a4f" stroke-width="3" stroke-linecap="round"/>'
                     f'<g class="blink" style="transform-box: fill-box; transform-origin: center;"><circle cx="{x}" cy="-9" r="5.5" fill="#fff" stroke="{INK}" stroke-width="1.6"/><circle cx="{x + 1}" cy="-8.5" r="2.6" fill="{INK}"/><circle cx="{x + 2}" cy="-10" r=".9" fill="#fff"/></g>')
    upper = (f'<g class="snap" style="transform-box: view-box; transform-origin: 14px {f(h * .42)}px;"><path d="M22 {f(h * .26)} C 8 {f(h * .02)}, -18 {f(h * -.02)}, -40 {f(h * .14)} C -30 {f(h * .24)}, -14 {f(h * .32)}, 4 {f(h * .46)} Z" fill="#ff7a4f" stroke="{INK}" stroke-width="2" stroke-linejoin="round"/>'
             + "".join(f'<path d="M{f(-30 + i * 8)} {f(h * .21 + i * 1.8)} l3 4 l3 -3" fill="#fff3e6" stroke="{INK}" stroke-width=".8"/>' for i in range(4))
             + f'<path d="M-6 {f(h * .12)} Q 6 {f(h * .06)} 14 {f(h * .16)}" stroke="#ffc29a" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>')
    lower = (f'<path d="M20 {f(h * .78)} C 6 {f(h * .98)}, -16 {f(h * 1.02)}, -32 {f(h * .86)} C -22 {f(h * .78)}, -8 {f(h * .66)}, 4 {f(h * .56)} Z" fill="#e85d33" stroke="{INK}" stroke-width="2" stroke-linejoin="round"/>'
             + "".join(f'<path d="M{f(-26 + i * 8)} {f(h * .83 - i * 1.8)} l3 -4 l3 3" fill="#fff3e6" stroke="{INK}" stroke-width=".8"/>' for i in range(3)))
    return (f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" aria-hidden="true" style="position: absolute; left: 0; top: 0; overflow: visible;">'
            f'{eye(int(w * .6))}{eye(int(w * .78))}'
            f'<path d="{body}" transform="translate(0 5)" fill="#a8341a" stroke="{INK}" stroke-width="2.4"/><path d="{body}" fill="#f0643a" stroke="{INK}" stroke-width="2.4"/>'
            f'<path d="M30 {f(h * .3)} Q {f(w * .5)} 6 {f(w - 20)} {f(h * .3)}" stroke="#ffb08a" stroke-width="3" fill="none" stroke-linecap="round"/>{spots}'
            f'{lower}<ellipse cx="16" cy="{f(h * .5)}" rx="20" ry="{f(h * .4)}" fill="#f0643a" stroke="{INK}" stroke-width="2"/><path d="M4 {f(h * .36)} q8 -6 18 -2" stroke="#ffb08a" stroke-width="2.5" fill="none" stroke-linecap="round"/>{upper}</svg>')


def sea_glass(w, h, seed, color, on=True):
    rnd = random.Random(seed)
    N = 7
    pts = []
    for i in range(N):
        t = 2 * math.pi * (i + rnd.uniform(-.2, .2)) / N
        c, s = math.cos(t), math.sin(t)
        x = (w / 2 - 2) * math.copysign(abs(c) ** .6, c) * rnd.uniform(.9, 1)
        y = (h / 2 - 2) * math.copysign(abs(s) ** .6, s) * rnd.uniform(.85, 1)
        pts.append((w / 2 + x, h / 2 + y))
    mids = [((pts[i][0] + pts[(i + 1) % N][0]) / 2, (pts[i][1] + pts[(i + 1) % N][1]) / 2) for i in range(N)]
    d = f"M{f(mids[-1][0])} {f(mids[-1][1])}" + "".join(f" Q{f(pts[i][0])} {f(pts[i][1])} {f(mids[i][0])} {f(mids[i][1])}" for i in range(N)) + " Z"
    op = .75 if on else .3
    glow = f"filter: drop-shadow(0 0 7px {color});" if on else ""
    spark = (f'<path class="sparkle" d="M{f(w * .8)} {f(h * .12)} l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2 z" fill="#fff" style="transform-box: fill-box; transform-origin: center; animation-delay: {rnd.uniform(0, 2):.1f}s;"/>' if on else "")
    return (f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" aria-hidden="true" style="position: absolute; left: 0; top: 0; overflow: visible; {glow}">'
            f'<path d="{d}" transform="translate(0 4)" fill="#000" opacity=".35"/>'
            f'<path d="{d}" fill="{color}" opacity="{op}" stroke="{INK}" stroke-width="2"/>'
            f'<path d="M{f(w * .14)} {f(h * .42)} Q{f(w * .2)} {f(h * .18)} {f(w * .45)} {f(h * .16)}" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity="{.85 if on else .4}"/>'
            f'<circle cx="{f(w * .55)}" cy="{f(h * .2)}" r="1.6" fill="#fff" opacity="{.85 if on else .4}"/>{spark}</svg>')


def bottle():
    return (f'<svg class="bob" width="96" height="48" viewBox="0 0 96 48" aria-hidden="true" style="flex: none; overflow: visible;">'
            f'<path d="M6 12 Q2 12 2 24 Q2 36 6 36 L52 36 Q58 36 62 31 L74 29 L74 19 L62 17 Q58 12 52 12 Z" fill="#5fc79a" fill-opacity=".7" stroke="{INK}" stroke-width="2" stroke-linejoin="round"/>'
            f'<rect x="14" y="17" width="40" height="14" rx="7" fill="#f6e7c1" stroke="{INK}" stroke-width="1.4"/><path d="M18 21 h30 M18 25 h24" stroke="#b49a68" stroke-width="1.2"/>'
            f'<rect x="73" y="18.5" width="9" height="11" rx="2" fill="#c98a52" stroke="{INK}" stroke-width="1.6"/>'
            f'<path d="M8 16 Q30 13 52 15" stroke="#fff" stroke-width="2.5" fill="none" opacity=".75" stroke-linecap="round"/>'
            f'<circle class="rise" cx="66" cy="12" r="2.5" fill="none" stroke="#bff6ff" stroke-width="1.2"/></svg>')

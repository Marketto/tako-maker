"""Generatore di forme SVG: tentacoli rastremati con ventose e alghe (kelp)."""
import math

_uid = [0]


def uid(p):
    _uid[0] += 1
    return f"{p}{_uid[0]}"


def spline(pts, n=16):
    P = [pts[0]] + pts + [pts[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(
                0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                       + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(tuple(pts[-1]))
    return out


def frame(c):
    """lunghezza cumulata normalizzata e normali"""
    L = [0.0]
    for a, b in zip(c, c[1:]):
        L.append(L[-1] + math.dist(a, b))
    tot = L[-1] or 1
    s = [x / tot for x in L]
    nrm = []
    for i in range(len(c)):
        a = c[max(i - 1, 0)]
        b = c[min(i + 1, len(c) - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        d = math.hypot(dx, dy) or 1
        nrm.append((-dy / d, dx / d))
    return s, nrm, tot


def f(v):
    return f"{v:.1f}"


def ribbon(c, nrm, w, i0, i1, off=0.0, scale=1.0, cap=False):
    left, right = [], []
    for i in range(i0, i1 + 1):
        ww = w[i] * scale / 2
        cx = c[i][0] + nrm[i][0] * off * w[i]
        cy = c[i][1] + nrm[i][1] * off * w[i]
        left.append((cx + nrm[i][0] * ww, cy + nrm[i][1] * ww))
        right.append((cx - nrm[i][0] * ww, cy - nrm[i][1] * ww))
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in left)
    if cap:
        r = max(w[i1] * scale / 2, 0.6)
        d += f" A{f(r)} {f(r)} 0 0 1 {f(right[-1][0])} {f(right[-1][1])}"
    d += " L" + " L".join(f"{f(x)} {f(y)}" for x, y in reversed(right)) + " Z"
    return d


def tentacle(pts, w0, w1, behind=(), side=1, n=16, color="pink"):
    """Ritorna (svg_dietro, svg_davanti). behind = lista di (indice_punto_da, indice_punto_a)."""
    pal = {
        "pink": ("#d9508f", "#ff9fcb", "#9c2a64", "#ffc4de", "#b8417c", "#6a1f46"),
    }[color]
    base, hi, shade, suck, ring, back = pal
    c = spline(pts, n)
    s, nrm, tot = frame(c)
    w = [w1 + (w0 - w1) * (1 - x) ** 1.15 for x in s]
    hidden = [False] * len(c)
    for a, b in behind:
        for i in range(a * n, min(b * n, len(c) - 1) + 1):
            hidden[i] = True
    runs = []
    i = 0
    while i < len(c):
        j = i
        while j + 1 < len(c) and hidden[j + 1] == hidden[i]:
            j += 1
        runs.append((hidden[i], max(i - 1, 0), min(j + 1, len(c) - 1)))
        i = j + 1
    back_svg, front_svg = [], []
    for hid, a, b in runs:
        cap = b == len(c) - 1
        if hid:
            back_svg.append(f'<path d="{ribbon(c, nrm, w, a, b, cap=cap)}" fill="{back}"/>')
            continue
        g = [f'<path d="{ribbon(c, nrm, w, a, b, cap=cap)}" fill="{base}" stroke="#0b1026" stroke-width="2.2" stroke-linejoin="round"/>',
             f'<path d="{ribbon(c, nrm, w, a, b, off=-0.26 * side, scale=0.42, cap=cap)}" fill="{shade}" opacity=".75"/>',
             f'<path d="{ribbon(c, nrm, w, a, b, off=0.2 * side, scale=0.3, cap=cap)}" fill="{hi}" opacity=".7"/>']
        # ventose sul lato in ombra, distanziate in proporzione allo spessore
        acc = 0.0
        last = None
        for k in range(a + 2, b - 1):
            if last is not None:
                acc += math.dist(c[k], c[last])
            last = k
            r = w[k] * 0.22
            if r < 1.2:
                continue
            if acc >= r * 4.2:
                acc = 0
                x = c[k][0] - nrm[k][0] * side * w[k] * 0.3
                y = c[k][1] - nrm[k][1] * side * w[k] * 0.3
                g.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{suck}" opacity=".85"/>'
                         f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.5)}" fill="{ring}"/>'
                         f'<circle cx="{f(x - r * 0.3)}" cy="{f(y - r * 0.3)}" r="{f(r * 0.18)}" fill="#fff" opacity=".8"/>')
        front_svg.append("".join(g))
    return "".join(back_svg), "".join(front_svg)


def kelp_blade(pts, W, back=False, n=14, bladder=True):
    gid = uid("kg")
    c = spline(pts, n)
    s, nrm, tot = frame(c)
    w = []
    for x in s:
        prof = math.sin(math.pi * min(1.0, 0.08 + x * 0.92)) ** 0.75
        ruffle = 1 + 0.14 * math.sin(x * 34)
        w.append(max(1.2, W * prof * ruffle))
    if back:
        stops = '<stop offset="0" stop-color="#16303a"/><stop offset=".6" stop-color="#28504a"/><stop offset="1" stop-color="#3d6a52"/>'
    else:
        stops = '<stop offset="0" stop-color="#2e4a1c"/><stop offset=".55" stop-color="#6e8a2a"/><stop offset="1" stop-color="#c2a845"/>'
    x0, y0 = c[0]
    x1, y1 = c[-1]
    out = [f'<defs><linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{f(x0)}" y1="{f(y0)}" x2="{f(x1)}" y2="{f(y1)}">{stops}</linearGradient></defs>',
           f'<path d="{ribbon(c, nrm, w, 0, len(c) - 1, cap=True)}" fill="url(#{gid})" stroke="#0b1026" stroke-width="{1.2 if back else 1.6}" stroke-linejoin="round" opacity="{.85 if back else 1}"/>']
    if not back:
        mid = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in c[2:-3])
        out.append(f'<path d="{mid}" stroke="#2a3a12" stroke-width="1" fill="none" opacity=".55"/>')
        out.append(f'<path d="{ribbon(c, nrm, w, 2, len(c) - 4, off=0.22, scale=0.22)}" fill="#e6d77a" opacity=".22"/>')
        if bladder:
            bx, by = c[1]
            out.append(f'<ellipse cx="{f(bx)}" cy="{f(by)}" rx="{f(W * 0.32)}" ry="{f(W * 0.45)}" fill="#b89a3c"/>'
                       f'<ellipse cx="{f(bx - W * 0.1)}" cy="{f(by - W * 0.15)}" rx="{f(W * 0.1)}" ry="{f(W * 0.14)}" fill="#f0e2a0" opacity=".7"/>')
    return "".join(out)


def kelp(base, blades, sway=True):
    """base=(x,y) punto d'attacco. blades: lista di dict(pts, W, back, dur). Ritorna (dietro, davanti)."""
    bx, by = base
    back, front = [], []
    for i, b in enumerate(blades):
        svg = kelp_blade(b["pts"], b["W"], back=b.get("back", False), bladder=b.get("bladder", True))
        ox, oy = b["pts"][0]
        cls = ' class="kelp"' if sway else ""
        dur = b.get("dur", 4 + i * 0.7)
        g = f'<g{cls} style="transform-box:view-box;transform-origin:{f(ox)}px {f(oy)}px;animation-duration:{dur:.1f}s">{svg}</g>'
        (back if b.get("back") else front).append(g)
    hold = (f'<ellipse cx="{f(bx)}" cy="{f(by + 1)}" rx="16" ry="3.5" fill="#000" opacity=".35"/>'
            f'<path d="M{f(bx - 11)} {f(by + 1)} q3 -7 7 -6 q2 -6 5 -1 q4 -5 6 1 q5 -3 4 6 z" fill="#4a3b22"/>'
            f'<path d="M{f(bx - 8)} {f(by - 2)} q3 -3 6 -2" stroke="#7a6438" stroke-width="1.2" fill="none"/>')
    return "".join(back), hold + "".join(front)

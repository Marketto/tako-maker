"""Generatore di Takotta, mascotte originale di Printopus (stile anime anni 2000).

Uso:  python3 tools/mascot/takotta.py
Scrive src/ui/mascot/sprites.ts (SVG per ogni espressione) e le icone PWA in public/icons.
Gli id interni usano il segnaposto __UID__ (sostituito a runtime) e le punte dei
tentacoli leggono i colori dei filamenti dalle variabili CSS --tip0 … --tip6.
"""
import math

P = dict(base='#cbb4ff', light='#e9dfff', shade='#8f86ee', core='#6a5ad6', line='#35195e', rim='#f3edff', bounce='#ffa6dc', back='#a58cf0', backshade='#7a68d8',
         iris_dark='#4a0f3d', iris='#c2378f', iris_light='#ff8fd0', blush='#ff6fb5')
FIL = ['#ff4d5e', '#ffd23f', '#3fb8ff', '#3ccf7a', '#ffffff', '#ff8a3d', '#b67bff']


def bez(p, t):
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = p
    u = 1 - t
    return (u**3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t**3 * x3,
            u**3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t**3 * y3)


def centerline(ctrl, curl_dir=1, curl_r=14, n=22):
    pts = [bez(ctrl, i / n) for i in range(n + 1)]
    # ricciolo finale a spirale
    (xa, ya), (xb, yb) = pts[-2], pts[-1]
    ang = math.atan2(yb - ya, xb - xa)
    cx = xb + math.cos(ang + curl_dir * math.pi / 2) * curl_r
    cy = yb + math.sin(ang + curl_dir * math.pi / 2) * curl_r
    a0 = math.atan2(yb - cy, xb - cx)
    for k in range(1, 12):
        a = a0 + curl_dir * k * 0.46
        r = curl_r * (1 - k / 16)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def outline(pts, w0, w1=2.5):
    L, R = [], []
    n = len(pts)
    for i, (x, y) in enumerate(pts):
        j0, j1 = max(0, i - 1), min(n - 1, i + 1)
        dx, dy = pts[j1][0] - pts[j0][0], pts[j1][1] - pts[j0][1]
        d = math.hypot(dx, dy) or 1
        nx, ny = -dy / d, dx / d
        t = i / (n - 1)
        w = w1 + (w0 - w1) * (1 - t) ** 0.9
        L.append((x + nx * w / 2, y + ny * w / 2))
        R.append((x - nx * w / 2, y - ny * w / 2))
    poly = L + R[::-1]
    return 'M' + ' '.join(f'{x:.0f},{y:.0f}' for x, y in poly) + 'Z', L, R


def tentacle(k, ctrl, curl_dir, w0=34, curl_r=14, tip_from=0.5, back=False):
    pts = centerline(ctrl, curl_dir, curl_r)
    d, L, R = outline(pts, w0)
    cut = int(len(pts) * tip_from)
    dtip, _, _ = outline(pts[cut:], w0 * (1 - tip_from) ** 0.9 + 2.5)
    col = f'var(--tip{k % 7},{FIL[k % len(FIL)]})'
    cid = f'__UID__-tc{k}'
    pid = f'{cid}p'
    use = lambda extra='': f'<use href="#{pid}" {extra}/>'
    o = [f'<g class="tent" style="animation-delay:{-k * 0.41:.2f}s">',
         f'<defs><path id="{pid}" d="{d}"/></defs>',
         f'<clipPath id="{cid}">{use()}</clipPath>',
         use(f'fill="{P["line"]}" stroke="{P["line"]}" stroke-width="5" stroke-linejoin="round" transform="translate(1.5,2.5)"'),
         use(f'fill="{P["back"] if back else P["base"]}" stroke="{P["line"]}" stroke-width="2.5" stroke-linejoin="round"'),
         f'<g clip-path="url(#{cid})">',
         f'<path d="{dtip}" style="fill:{col}"/>' + (f'<path d="{dtip}" fill="#2a1450" fill-opacity=".22"/>' if back else ''),
         # ombra cel netta sul lato R
         use(f'fill="{P["backshade"] if back else P["shade"]}" fill-opacity=".85" transform="translate({curl_dir * -w0 * 0.42:.1f},-2)"'),
         use(f'fill="url(#__UID__-tone)" transform="translate({curl_dir * -w0 * 0.42:.1f},-2)"'),
         # luce
         use(f'fill="none" stroke="#ffffff" stroke-opacity=".8" stroke-width="3" transform="translate({curl_dir * w0 * 0.22:.1f},0)"'),
         '</g>']
    # ventose sul lato interno
    for t in (0.36, 0.5, 0.64):
        i = int(t * 22)
        x, y = pts[i]
        lx, ly = R[i] if curl_dir > 0 else L[i]
        sx, sy = x * 0.45 + lx * 0.55, y * 0.45 + ly * 0.55
        r = 4.6 - t * 3
        o.append(f'<ellipse cx="{sx:.1f}" cy="{sy:.1f}" rx="{r:.1f}" ry="{r * 0.75:.1f}" fill="{P["rim"]}" stroke="{P["line"]}" stroke-width="1.6"/>')
    o.append('</g>')
    return '\n'.join(o)


HEAD = 'M206,46 C286,40 334,104 332,174 C330,236 282,262 200,262 C118,262 68,238 68,176 C68,108 126,52 206,46Z'


def eye(cx, cy, side, expr='normale'):
    s = -1 if side == 'l' else 1
    lc = P['line']
    if expr == 'felice':
        return f'<path d="M{cx - 24},{cy + 4} Q{cx},{cy - 26} {cx + 24},{cy + 4} Q{cx},{cy - 16} {cx - 24},{cy + 4}Z" fill="#1a0b26" stroke="#1a0b26" stroke-width="3" stroke-linejoin="round"/>'
    if expr == 'concentrata':
        return f'<path d="M{cx - 20 * -s},{cy - 18} L{cx + 18 * -s},{cy} L{cx - 20 * -s},{cy + 18}" fill="none" stroke="#1a0b26" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>'
    if expr == 'confusa':
        pts = ' '.join(f'{cx + (2 + k * 0.55) * math.cos(k * 0.45):.1f},{cy + (2 + k * 0.55) * math.sin(k * 0.45) * 1.2:.1f}' for k in range(44))
        return (f'<ellipse cx="{cx}" cy="{cy}" rx="27" ry="32" fill="#ffffff" stroke="#1a0b26" stroke-width="3"/>'
                f'<polyline points="{pts}" fill="none" stroke="#1a0b26" stroke-width="3.2" stroke-linecap="round"/>')
    eid = f'__UID__-ir{side}'
    ix = cx + 2 * -s
    return f'''<g class="eye">
<clipPath id="{eid}"><ellipse cx="{ix}" cy="{cy + 7}" rx="26" ry="32"/></clipPath>
<path d="M{cx - 32},{cy + 2} C{cx - 32},{cy - 34} {cx + 32},{cy - 34} {cx + 32},{cy + 2} C{cx + 32},{cy + 34} {cx - 32},{cy + 42} {cx - 32},{cy + 2}Z" fill="#ffffff" stroke="{lc}" stroke-width="2"/>
<path d="M{cx - 30},{cy - 4} C{cx - 24},{cy - 26} {cx + 24},{cy - 28} {cx + 30},{cy - 4}" fill="none" stroke="#d9cdf5" stroke-width="6"/>
<g clip-path="url(#{eid})">
<rect x="{cx - 34}" y="{cy - 34}" width="68" height="84" fill="{P['iris']}"/>
<ellipse cx="{ix}" cy="{cy - 22}" rx="36" ry="24" fill="{P['iris_dark']}"/>
<ellipse cx="{ix}" cy="{cy - 4}" rx="30" ry="10" fill="#8f1f6e" fill-opacity=".55"/>
<ellipse cx="{ix}" cy="{cy + 32}" rx="24" ry="15" fill="{P['iris_light']}"/>
<ellipse cx="{ix}" cy="{cy + 38}" rx="14" ry="7" fill="#ffd6f0"/>
<ellipse cx="{ix}" cy="{cy + 6}" rx="11" ry="16" fill="#1a0b26"/>
<path d="M{ix - 26},{cy + 16} q26,10 52,0" fill="none" stroke="#ffd0ec" stroke-width="2" stroke-opacity=".9"/>
</g>
<ellipse cx="{ix}" cy="{cy + 7}" rx="26" ry="32" fill="none" stroke="#1a0b26" stroke-width="2.4"/>
<path transform="translate({cx - 11 * -s - 2},{cy - 10}) rotate({-20 * -s}) scale(1.12)" d="M0,-5 C-3,-12 -14,-11 -13,-2 C-12,6 0,12 0,14 C0,12 12,6 13,-2 C14,-11 3,-12 0,-5Z" fill="#ffffff"/>
<path class="twinkle" transform="translate({cx + 12 * -s},{cy + 18})" d="M0,-7 C.8,-2 2,-.8 7,0 C2,.8 .8,2 0,7 C-.8,2 -2,.8 -7,0 C-2,-.8 -.8,-2 0,-7Z" fill="#ffffff"/>
<circle cx="{cx + 3 * -s}" cy="{cy + 30}" r="2.2" fill="#ffffff"/>
<circle cx="{cx - 14 * -s}" cy="{cy + 22}" r="1.6" fill="#ffffff" fill-opacity=".9"/>
<path d="M{cx - 34},{cy + 2} C{cx - 33},{cy - 36} {cx + 33},{cy - 38} {cx + 35},{cy - 3} C{cx + 24},{cy - 25} {cx - 24},{cy - 27} {cx - 34},{cy + 2}Z" fill="#1a0b26"/>
<path d="M{cx + 33 * s},{cy - 9} l{12 * s},-11 M{cx + 35 * s},{cy - 1} l{14 * s},-5 M{cx + 34 * s},{cy + 7} l{12 * s},1" stroke="#1a0b26" stroke-width="4" stroke-linecap="round"/>
<path d="M{cx + 12 * s},{cy + 38} q{10 * s},-2 {16 * s},-10 M{cx + 4 * s},{cy + 41} l{2 * s},4" fill="none" stroke="#1a0b26" stroke-width="2.4" stroke-linecap="round"/>
</g>'''


def mouth(expr):
    lc = '#1a0b26'
    if expr == 'confusa':
        return f'<path d="M188,236 q6,-7 12,0 q6,7 12,0 q6,-7 12,0" fill="none" stroke="{lc}" stroke-width="3.5" stroke-linecap="round"/>'
    if expr == 'concentrata':
        return f'<path d="M194,238 q8,-5 16,0 q-8,10 -16,0z" fill="#8a1f4a" stroke="{lc}" stroke-width="3" stroke-linejoin="round"/>'
    # bocca a gattino aperta con dentino
    return (f'<path d="M186,230 q7,7 14,0 q7,7 14,0 q-1,18 -14,18 q-13,0 -14,-18z" fill="#8a1f4a" stroke="{lc}" stroke-width="3" stroke-linejoin="round"/>'
            f'<path d="M193,242 q7,-6 14,0 q-7,5 -14,0z" fill="#ff8fb8"/>'
            f'<path d="M203,233 l3,6 l3,-5z" fill="#ffffff" stroke="{lc}" stroke-width="1.2" stroke-linejoin="round"/>')


def defs(uid):
    return f'''<defs>
<pattern id="__UID__-tone" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="3" cy="3" r="1.15" fill="{P['core']}" fill-opacity=".55"/></pattern>
<clipPath id="__UID__-head"><path d="{HEAD}"/></clipPath>
</defs>'''


def head(uid, expr=None):
    lc = P['line']
    o = [f'<path d="{HEAD}" fill="{lc}" transform="translate(3,5)"/>',
         f'<path d="{HEAD}" fill="{P["base"]}" stroke="{lc}" stroke-width="3" stroke-linejoin="round"/>',
         f'<g clip-path="url(#__UID__-head)">',
         # ombra cel netta + retino
         f'<path d="M332,60 C320,150 286,222 200,236 C150,244 100,238 60,224 L60,280 L340,280Z" fill="{P["shade"]}"/>',
         f'<path d="M332,60 C320,150 286,222 200,236 C150,244 100,238 60,224 L60,280 L340,280Z" fill="url(#__UID__-tone)"/>',
         f'<path d="M336,120 C326,200 276,246 196,252 C150,256 110,250 80,240 L80,280 L340,280Z" fill="{P["core"]}" fill-opacity=".55"/>',
         f'<path d="M96,244 C140,262 250,264 310,238" fill="none" stroke="{P["bounce"]}" stroke-width="7" stroke-linecap="round" stroke-opacity=".75"/>',
         # luce di bordo sul lato in ombra
         f'<path d="M300,226 C320,206 330,180 330,152" fill="none" stroke="{P["rim"]}" stroke-width="4" stroke-linecap="round"/>',
         # macchiette
         f'<ellipse cx="262" cy="90" rx="10" ry="7" fill="{P["shade"]}" transform="rotate(-20 262 90)"/>',
         f'<ellipse cx="288" cy="120" rx="6" ry="4.5" fill="{P["shade"]}"/>',
         f'<ellipse cx="244" cy="70" rx="5" ry="3.5" fill="{P["shade"]}"/>',
         '</g>',
         # riflesso netto stile anime
         f'<path d="M112,112 C118,80 150,58 182,56 C160,66 136,86 126,116 C122,124 110,122 112,112Z" fill="#ffffff"/>',
         f'<ellipse cx="196" cy="58" rx="7" ry="4" fill="#ffffff" transform="rotate(-8 196 58)"/>',
         f'<circle cx="104" cy="134" r="4" fill="#ffffff"/>']
    o.append('<!--FACE-->' if expr is None else face(expr))
    return '\n'.join(o)


def face(expr):
    o = []
    # guance tratteggiate
    for x in (108, 292):
        o.append(f'<ellipse cx="{x}" cy="214" rx="22" ry="10" fill="{P["blush"]}" fill-opacity=".55"/>')
        for k in range(4):
            o.append(f'<path d="M{x - 13 + k * 8},208 l-5,12" stroke="#e0338a" stroke-width="2.2" stroke-linecap="round"/>')
        o.append(f'<path transform="translate({x + 14},{204})" d="M0,-5 C.6,-1.5 1.5,-.6 5,0 C1.5,.6 .6,1.5 0,5 C-.6,1.5 -1.5,.6 -5,0 C-1.5,-.6 -.6,-1.5 0,-5Z" fill="#ffffff"/>')
    eexpr = 'normale' if expr == 'pensierosa' else expr
    o.append(f'<g class="eyes">{eye(144, 172, "l", eexpr)}{eye(256, 172, "r", eexpr)}</g>')
    o.append(mouth(expr))
    if expr == 'pensierosa':
        o.append(f'<g class="drop" transform="translate(316,70) scale(2)"><path d="M0,0 c-10,18 -12,28 0,32 c12,-4 10,-14 0,-32z" fill="#bfe9ff" stroke="{P["line"]}" stroke-width="1.6"/><ellipse cx="-4" cy="20" rx="2.2" ry="4.5" fill="#ffffff"/></g>')
    return '\n'.join(o)


def spool():
    lc = P['line']
    return f'''<g class="hat" transform="translate(8,-40) rotate(-14 236 40)">
<path d="M196,52 q48,10 84,0" fill="none" stroke="{lc}" stroke-width="0"/>
<rect x="203" y="18" width="70" height="38" rx="4" fill="#33c4b4" stroke="{lc}" stroke-width="3"/>
<rect x="203" y="18" width="70" height="38" rx="4" fill="url(#__UID__-tone)"/>
<path d="M203,27 h70 M203,36 h70 M203,45 h70" stroke="#1f8f84" stroke-width="2"/>
<path d="M210,24 h22" stroke="#bff6ef" stroke-width="3" stroke-linecap="round"/>
<path d="M192,10 h92 a5,5 0 0 1 0,10 h-92 a5,5 0 0 1 0,-10z" fill="#e8e3f2" stroke="{lc}" stroke-width="3"/>
<path d="M192,54 h92 a5,5 0 0 1 0,10 h-92 a5,5 0 0 1 0,-10z" fill="#c9c2d8" stroke="{lc}" stroke-width="3"/>
<path d="M273,40 c26,0 30,24 14,30 c-14,6 -10,26 12,28" fill="none" stroke="#33c4b4" stroke-width="3.5" stroke-linecap="round"/>
</g>'''


def sparkle(x, y, s, c, delay=0):
    return (f'<path class="twinkle" style="animation-delay:{delay}s" transform="translate({x},{y}) scale({s})" '
            f'd="M0,-16 C1.5,-5 5,-1.5 16,0 C5,1.5 1.5,5 0,16 C-1.5,5 -5,1.5 -16,0 C-5,-1.5 -1.5,-5 0,-16Z" fill="{c}" stroke="{P["line"]}" stroke-width="2"/>')


def mascot(expr='normale', uid='n', accessories=True):
    o = [defs(uid)]
    o.append(f'<ellipse cx="204" cy="378" rx="128" ry="12" fill="{P["line"]}" fill-opacity=".16"/><ellipse cx="204" cy="378" rx="84" ry="7" fill="{P["line"]}" fill-opacity=".12"/>')
    o.append('<g class="bob">')
    # tentacoli (dietro)
    back = [
        (6, [(118, 226), (82, 250), (58, 282), (74, 316)], 1, 36),
        (5, [(286, 226), (324, 250), (348, 282), (330, 316)], -1, 36),
        (1, [(156, 250), (142, 286), (122, 308), (134, 338)], 1, 38),
        (3, [(248, 250), (262, 286), (282, 308), (268, 338)], -1, 38),
    ]
    front = [
        (0, [(112, 238), (70, 258), (48, 298), (76, 330)], 1, 42),
        (2, [(182, 258), (178, 300), (164, 326), (186, 352)], 1, 46),
        (5, [(226, 258), (232, 300), (246, 326), (222, 352)], -1, 46),
    ]
    for k, ctrl, cd, w in back:
        o.append(tentacle(k, ctrl, cd, w0=w, back=True).replace(f'-tc{k}"', f'-tb{k}"').replace(f'-tc{k})', f'-tb{k})'))
    for k, ctrl, cd, w in front:
        o.append(tentacle(k, ctrl, cd, w0=w).replace(f'-tc{k}"', f'-tf{k}"').replace(f'-tc{k})', f'-tf{k})'))
    o.append(f'<g class="wave">{tentacle(4, [(300, 232), (372, 234), (394, 170), (366, 128)], -1, w0=34, curl_r=12)}'
             f'<g transform="translate(384,190) rotate(28)"><path d="M0,0 l-16,-11 l1,21z M0,0 l16,-11 l-1,21z" fill="#ff7fc8" stroke="{P["line"]}" stroke-width="2.4" stroke-linejoin="round"/><circle r="4.5" fill="#ff4fa8" stroke="{P["line"]}" stroke-width="2.2"/></g></g>')
    o.append(f'<g class="tilt" transform="rotate(-7 200 170)">')
    o.append(head(uid, expr))
    if accessories:
        o.append(spool())
    o.append('</g>')
    o.append('</g>')
    if accessories:
        o.append(sparkle(48, 70, 1.2, '#ffe14d', 0))
        o.append(sparkle(34, 210, 0.7, '#7fe3ff', 0.6))
        o.append(sparkle(372, 300, 0.8, '#ff9ad5', 1.1))
        for i, (bx, by, br) in enumerate([(52, 150, 12), (70, 118, 7), (60, 96, 4.5), (30, 250, 9), (22, 228, 5)]):
            o.append(f'<g class="float" style="animation-delay:{i * 0.4}s"><circle cx="{bx}" cy="{by}" r="{br}" fill="#e6f7ff" fill-opacity=".55" stroke="{P["line"]}" stroke-width="2"/>'
                     f'<path d="M{bx - br * 0.55},{by - br * 0.1} a{br * 0.6},{br * 0.6} 0 0 1 {br * 0.5},{-br * 0.45}" fill="none" stroke="#ffffff" stroke-width="{max(1.5, br * 0.22):.1f}" stroke-linecap="round"/></g>')
    return '\n'.join(o)


CSS = '''
.bob{animation:bob 3.2s ease-in-out infinite}
.tent{animation:wig 2.8s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 0%}
.wave{animation:wave 1.6s ease-in-out infinite;transform-box:fill-box;transform-origin:0% 100%}
.eye{animation:blink 4.8s infinite;transform-box:fill-box;transform-origin:center}
.twinkle{animation:tw 2.2s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.float{animation:fl 3s ease-in-out infinite}
.hat{animation:hat 3.2s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes wig{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(2.5deg)}}
@keyframes wave{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(8deg)}}
@keyframes blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.08)}}
@keyframes tw{0%,100%{opacity:1;transform:scale(1) rotate(0)}50%{opacity:.45;transform:scale(.6) rotate(20deg)}}
@keyframes fl{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes hat{0%,100%{transform:rotate(0)}50%{transform:rotate(4deg)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
'''


def svg(expr='normale', uid='n', size=400, accessories=True):
    return f'<svg viewBox="0 0 410 400" width="{size}" height="{size * 400 // 410}" role="img" aria-label="Takotta, mascotte di Printopus">{mascot(expr, uid, accessories)}</svg>'


def scoped_css():
    """Limita le regole CSS delle animazioni all’interno di .takotta."""
    out = []
    for line in CSS.strip().split('\n'):
        if line.startswith('.'):
            out.append('.takotta ' + line)
        elif line.startswith('@media'):
            out.append(line.replace('{*{', '{.takotta *{'))
        else:
            out.append(line)
    return '\n'.join(out)


# Colori del tema "scatola dei filamenti" (src/styles.css)
LAYERS = ['#ff4fa0', '#2f9bff', '#1fbf8f', '#ff8a2b', '#6a3fd8']


def icon_svg(size, pad=0.0, bg='#ffcf2e'):
    """Icona PWA: Takotta su sfondo limone a puntini, appoggiata su strati di stampa colorati."""
    inner = mascot('normale', 'icon', accessories=False)
    inner = inner.replace('__UID__', 'icon')
    s = 1 - 2 * pad
    rx = 0 if pad else 88
    # Strati di filamento in basso, come un pezzo appena stampato
    h = 13 * s
    y0 = 400 - pad * 400 - 18 * s - h * len(LAYERS)
    layers = ''.join(f'<rect x="0" y="{y0 + i * h:.1f}" width="400" height="{h + 0.6:.1f}" fill="{c}"/>' for i, c in enumerate(LAYERS))
    layers += f'<rect x="0" y="{y0 + h * len(LAYERS):.1f}" width="400" height="400" fill="{LAYERS[-1]}"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="{size}" height="{size}">'
            f'<defs><clipPath id="icon-clip"><rect width="400" height="400" rx="{rx}"/></clipPath>'
            f'<radialGradient id="icon-glow" cx="50%" cy="38%" r="60%"><stop offset="0" stop-color="#fff3b8"/><stop offset="1" stop-color="{bg}"/></radialGradient>'
            f'<pattern id="icon-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="2.4" fill="#ffffff" fill-opacity=".45"/></pattern></defs>'
            f'<g clip-path="url(#icon-clip)">'
            f'<rect width="400" height="400" fill="url(#icon-glow)"/><rect width="400" height="400" fill="url(#icon-dots)"/>'
            f'{layers}'
            f'<g transform="translate({200 - 205 * s * 1.0:.1f},{200 - 205 * s * 1.0:.1f}) scale({s * 1.0:.3f})">{inner}</g>'
            f'</g></svg>')


if __name__ == '__main__':
    import json, os, re
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    moods = ['normale', 'felice', 'concentrata', 'confusa', 'pensierosa']
    squash = lambda t: re.sub(r'\s*\n\s*', '', t)
    body = squash(mascot(None, 'x'))
    faces = {m: squash(face(m)) for m in moods}
    ts = ('// File generato da tools/mascot/takotta.py: non modificarlo a mano.\n'
          '// Takotta è un personaggio originale di Printopus (licenza MIT come il resto del codice).\n\n'
          "export type Mood = 'normale' | 'felice' | 'concentrata' | 'confusa' | 'pensierosa';\n\n"
          'export const VIEWBOX = \'0 0 410 400\';\n\n'
          '/** Corpo comune: il viso va al posto di <!--FACE-->. */\n'
          f'export const BODY = {json.dumps(body, ensure_ascii=False)};\n\n'
          f'export const FACES: Record<Mood, string> = {json.dumps(faces, ensure_ascii=False, indent=2)};\n\n'
          f'export const MASCOT_CSS = {json.dumps(scoped_css())};\n')
    os.makedirs(os.path.join(root, 'src/ui/mascot'), exist_ok=True)
    open(os.path.join(root, 'src/ui/mascot/sprites.ts'), 'w').write(ts)
    icons = os.path.join(root, 'public/icons')
    open(os.path.join(icons, 'icon.svg'), 'w').write(icon_svg(512))
    open(os.path.join(icons, 'icon-maskable.svg'), 'w').write(icon_svg(512, pad=0.12))
    print('sprites e icone generati')

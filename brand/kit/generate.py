"""Readr logo masters: fill-only outlines, no strokes, text or transforms.
Usage: python3 generate.py <out-dir>"""
import math, sys
OUT = sys.argv[1]
ACCENT, INK, PAPER = "#c67139", "#201e1d", "#f5ead8"
TAN = math.tan(math.radians(15))


class T:
    """Bakes a scale + offset into the coordinates."""
    def __init__(self, ox=0, oy=0, s=1):
        self.ox, self.oy, self.s = ox, oy, s

    def p(self, x, y):
        return f"{self.ox + x * self.s:.2f} {self.oy + y * self.s:.2f}"

    def a(self, r, large, sweep, x, y):
        rr = f"{r * self.s:.2f}"
        return f"A{rr} {rr} 0 {large} {sweep} {self.p(x, y)}"


# ---- symbol ----------------------------------------------------------------
def pill(t, cx, axis, h, w):
    r, y0, y1 = w / 2, axis - h / 2, axis + h / 2
    return (f"M{t.p(cx - r, y0 + r)}{t.a(r, 0, 1, cx + r, y0 + r)}L{t.p(cx + r, y1 - r)}"
            f"{t.a(r, 0, 1, cx - r, y1 - r)}Z")


def symbol(t=T(), top=38, H=150, D=112, axis=143, w=22, pills=((0, 104), (40, 68), (80, 32)), dip=None):
    dip = D * TAN if dip is None else dip
    pts = [(128 - D, top), (128, top + dip), (128 + D, top), (128 + D, top + H), (128, top + dip + H), (128 - D, top + H)]
    d = "M" + "L".join(t.p(*q) for q in pts) + "Z"
    for dist, h in pills:
        d += pill(t, 128 - dist, axis, h, w)
        if dist:
            d += pill(t, 128 + dist, axis, h, w)
    return d


# 16 px cut: three bars, every edge on the 16-unit pixel grid (so the dip is 2 px, not exactly 15 degrees).
SMALL = dict(top=16, H=192, D=128, dip=32, axis=144, w=32, pills=((0, 128), (80, 64)))
# Reversed: light marks look heavier on dark, so the holes open up slightly.
REVERSED = dict(w=23.5)


# ---- wordmark: constructed lowercase outlines ------------------------------
def wordmark(t, x, base, sw=20):
    top, asc, cy = base - 108, base - 156, base - 54
    RO, RI = 55, 55 - sw     # 1 unit of overshoot on round letters

    def r(x):
        ri = 48 - sw
        notch = top + 48 - math.sqrt(48 ** 2 - ri ** 2)
        return (f"M{t.p(x, top)}L{t.p(x + sw, top)}L{t.p(x + sw, notch)}{t.a(48, 0, 1, x + 48, top)}"
                f"L{t.p(x + 54, top)}L{t.p(x + 54, top + sw)}L{t.p(x + 48, top + sw)}"
                f"{t.a(ri, 0, 0, x + sw, top + 48)}L{t.p(x + sw, base)}L{t.p(x, base)}Z")

    def bowl(c, stem_top):
        sx = c + RI
        dy = math.sqrt(RO ** 2 - RI ** 2)
        return (f"M{t.p(sx, stem_top)}L{t.p(c + RO, stem_top)}L{t.p(c + RO, base)}L{t.p(sx, base)}L{t.p(sx, cy + dy)}"
                f"{t.a(RO, 1, 1, sx, cy - dy)}Z"
                f"M{t.p(c - RI, cy)}{t.a(RI, 1, 1, c + RI, cy)}{t.a(RI, 1, 1, c - RI, cy)}Z")

    def e(c):
        b, ang = sw * 0.4, math.radians(38)
        xo, xi = math.sqrt(RO ** 2 - b ** 2), math.sqrt(RI ** 2 - b ** 2)
        co, si = math.cos(ang), math.sin(ang)
        return (f"M{t.p(c + xo, cy + b)}{t.a(RO, 1, 0, c + RO * co, cy + RO * si)}L{t.p(c + RI * co, cy + RI * si)}"
                f"{t.a(RI, 0, 1, c - xi, cy + b)}Z"
                f"M{t.p(c - xi, cy - b)}{t.a(RI, 0, 1, c + xi, cy - b)}Z")

    # Gaps are optical: round-round tightest, straight-straight widest.
    c1 = x + 54 + 10 + RO
    c2 = c1 + RO + 12 + RO
    c3 = c2 + RO + 18 + RO
    x2 = c3 + RO + 26
    return r(x) + e(c1) + bowl(c2, top) + bowl(c3, asc) + r(x2)


WM_W = 504


# ---- files -----------------------------------------------------------------
def write(name, w, h, *paths):
    body = "".join(f'<path id="{i}" fill="{f}" fill-rule="evenodd" d="{d}"/>' for i, f, d in paths)
    t = "Readr logo"
    with open(f"{OUT}/{name}.svg", "w") as fh:
        fh.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{t}"><title>{t}</title>{body}</svg>\n')


def horizontal(mark_kw, sw):
    s, base, pad = 0.74, 206, 16
    t = T(pad - 16 * s, base - 218 * s, s)        # spine point sits on the baseline
    x = pad + 224 * s + 30
    return (int(x + WM_W + pad + 0.5), 256, symbol(t, **mark_kw), wordmark(T(), x, base, sw))


def stacked(mark_kw, sw):
    s, pad = 1.1, 16
    W = WM_W + 2 * pad
    base = pad + 180 * s + 28 + 156
    return (W, int(base + pad + 0.5), symbol(T(W / 2 - 128 * s, pad - 38 * s, s), **mark_kw), wordmark(T(), pad, base, sw))


write("readr-symbol", 256, 256, ("symbol", ACCENT, symbol()))
write("readr-symbol-small", 256, 256, ("symbol", ACCENT, symbol(**SMALL)))
write("readr-symbol-reversed", 256, 256, ("symbol", ACCENT, symbol(**REVERSED)))

w, h, m, wm = horizontal({}, 20)
write("readr-horizontal", w, h, ("symbol", ACCENT, m), ("wordmark", INK, wm))
w, h, m, wm = horizontal(REVERSED, 19)
write("readr-horizontal-reversed", w, h, ("symbol", ACCENT, m), ("wordmark", PAPER, wm))

w, h, m, wm = stacked({}, 20)
write("readr-stacked", w, h, ("symbol", ACCENT, m), ("wordmark", INK, wm))
w, h, m, wm = stacked(REVERSED, 19)
write("readr-stacked-reversed", w, h, ("symbol", ACCENT, m), ("wordmark", PAPER, wm))

write("readr-wordmark", WM_W + 32, 188, ("wordmark", INK, wordmark(T(), 16, 172, 20)))
write("readr-wordmark-reversed", WM_W + 32, 188, ("wordmark", PAPER, wordmark(T(), 16, 172, 19)))

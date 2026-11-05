"""Cutout: a solid open book with a soundwave punched through it.
The wave sits on one straight axis, mirrored left/right and top/bottom. Usage: python3 generate.py <out-dir>"""
import math, sys
OUT = sys.argv[1]
TAN = math.tan(math.radians(15))
D, H = 112, 150
TOP = 128 - (D * TAN + H) / 2
AXIS = TOP + D * TAN + H / 2  # mid-height of the book at the spine


def svg(body, w=256, h=256):
    t = "Readr logo"
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{t}"><title>{t}</title>{body}</svg>\n'


def poly(pts, r=0):
    if not r:
        return "M" + "L".join(f"{x:.2f} {y:.2f}" for x, y in pts) + "Z"
    n, d = len(pts), ""
    for i, (x, y) in enumerate(pts):
        px, py = pts[i - 1]
        nx, ny = pts[(i + 1) % n]
        lp, ln = math.hypot(px - x, py - y), math.hypot(nx - x, ny - y)
        a = (x + (px - x) * r / lp, y + (py - y) * r / lp)
        b = (x + (nx - x) * r / ln, y + (ny - y) * r / ln)
        d += f'{"M" if i == 0 else "L"}{a[0]:.2f} {a[1]:.2f}Q{x:.2f} {y:.2f} {b[0]:.2f} {b[1]:.2f}'
    return d + "Z"


def book(r=0):
    return poly([(128 - D, TOP), (128, TOP + D * TAN), (128 + D, TOP), (128 + D, TOP + H),
                 (128, TOP + D * TAN + H), (128 - D, TOP + H)], r)


def pill(cx, h, w):
    """Vertical pill with true semicircular ends, centred on the shared axis."""
    r, y0, y1 = w / 2, AXIS - h / 2, AXIS + h / 2
    return (f"M{cx - r:.2f} {y0 + r:.2f}A{r} {r} 0 0 1 {cx + r:.2f} {y0 + r:.2f}V{y1 - r:.2f}"
            f"A{r} {r} 0 0 1 {cx - r:.2f} {y1 - r:.2f}Z")


def mark(r, w, pills):
    """pills: (distance from spine, height) pairs, mirrored about the spine."""
    holes = ""
    for d, h in pills:
        holes += pill(128 - d, h, w)
        if d:
            holes += pill(128 + d, h, w)
    return f'<path fill="#000" fill-rule="evenodd" d="{book(r)}{holes}"/>'


def wordmark(x, base=190):
    sw, R, cy, top, asc, out = 20, 44, base - 54, base - 108, base - 156, []

    def stroke(d, w=sw):
        out.append(f'<path d="{d}" fill="none" stroke="#000" stroke-width="{w}"/>')

    def r(x):
        stroke(f"M{x + 10} {base}V{top}")
        stroke(f"M{x + 10} {top + 48}A38 38 0 0 1 {x + 48} {top + 10}H{x + 54}")
        return x + 66

    def bowl(x, ascend):
        c = x + R + 10
        out.append(f'<circle cx="{c}" cy="{cy}" r="{R}" fill="none" stroke="#000" stroke-width="{sw}"/>')
        stroke(f"M{c + R} {asc if ascend else top}V{base}")
        return c + R + 28

    x = r(x)
    c, a = x + R + 10, math.radians(38)
    stroke(f"M{c + 43.27} {cy + 8}A{R} {R} 0 1 0 {c + R * math.cos(a):.2f} {cy + R * math.sin(a):.2f}")
    stroke(f"M{c - R} {cy}H{c + 53}", 16)
    x = bowl(c + R + 26, False)
    x = bowl(x, True)
    end = r(x) - 12
    return "".join(out), end


marks = {
    "a-classic": mark(0, 14, [(0, 100), (28, 76), (56, 52), (84, 28)]),
    "b-bold": mark(0, 22, [(0, 104), (40, 68), (80, 32)]),
    "c-soft-split": mark(14, 18, [(16, 92), (48, 62), (80, 32)]),
}
for name, body in marks.items():
    open(f"{OUT}/{name}.svg", "w").write(svg(body))
    wm, end = wordmark(206)
    open(f"{OUT}/{name}-lockup.svg", "w").write(svg(f'<g transform="translate(14 28) scale(.66)">{body}</g>{wm}', int(end + 16), 256))

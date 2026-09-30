#!/usr/bin/env python3
"""
Regenerates every brand asset from one definition of the Rift logotype.

The brand is "Rift" set in Inter ExtraBold, slanted, with one band strung
through the i, f and t at crossbar height — it is the f's and t's crossbar,
drawn exactly as thick — ending past the t in a point. Slashes cut the band
between the letters, so they read as joined and are not. The R stands clear
of the band, and on its own it is the mark.

Glyph outlines come straight from the font, flattened to polygons, so the
letters are Inter's own; only the band and the cuts are drawn here. The
script writes the vector assets (src/app/icon.svg, public/brand/*.svg)
itself and prints the paths and boxes that `mark` and `logotype` in
src/lib/brand.ts carry verbatim. Run it after changing the logotype:

    uv run --with pillow --with shapely --with fonttools scripts/generate-brand-assets.py

Inter is downloaded to .cache/fonts on first run and is not committed; only
the rendered PNGs are.
"""

import math
import os
import urllib.request
from PIL import Image, ImageChops, ImageDraw, ImageFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont
from shapely import affinity
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(ROOT, ".cache", "fonts")
APP = os.path.join(ROOT, "src", "app")
BRAND = os.path.join(ROOT, "public", "brand")

INK = (15, 15, 15, 255)
PAPER = (255, 255, 255, 255)
MUTED = (91, 91, 91, 255)
RULE = (227, 227, 227, 255)

NAME = "Rift"
TAGLINE = "The visual learning platform"
BLURB = ("Concept maps, animated walkthroughs, and practice that adapts "
         "to what you have not understood yet.")
DOMAIN = "interactivelearningresources.org"

FONTS = {
    "Inter-Regular.ttf": "UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg",
    "Inter-Medium.ttf": "UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZg",
    "Inter-SemiBold.ttf": "UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg",
    "Inter-Bold.ttf": "UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg",
    "Inter-ExtraBold.ttf": "UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuDyYMZg",
    "Inter-Black.ttf": "UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuBWYMZg",
}


def font_file(name):
    os.makedirs(FONT_DIR, exist_ok=True)
    path = os.path.join(FONT_DIR, name)
    if not os.path.exists(path):
        url = "https://fonts.gstatic.com/s/inter/v20/%s.ttf" % FONTS[name]
        print("  downloading %s" % name)
        urllib.request.urlretrieve(url, path)
    return path


def font(name, size):
    return ImageFont.truetype(font_file(name), size)


WEIGHT = "Inter-ExtraBold.ttf"
SLANT = 10          # degrees; Inter's own italic leans about the same
TRACKING = -40      # font units between letters
SLASH = 64          # width of a cut through the band, font units
SLASH_ANGLE = 34    # its lean from vertical, before the slant


def _flatten(ops, steps=12):
    """A glyph's pen recording as closed point rings, curves sampled."""
    rings, cur, pos = [], [], None

    def quad(p0, c, e):
        return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * e[0],
                 (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * e[1])
                for t in (k / steps for k in range(1, steps + 1))]

    for op, args in ops:
        if op == "moveTo":
            cur, pos = [args[0]], args[0]
        elif op == "lineTo":
            cur.append(args[0])
            pos = args[0]
        elif op == "qCurveTo":
            pts = [p for p in args if p is not None]
            p0 = pos
            for i, c in enumerate(pts[:-1]):
                last = i == len(pts) - 2
                e = pts[i + 1] if last else ((c[0] + pts[i + 1][0]) / 2,
                                             (c[1] + pts[i + 1][1]) / 2)
                cur += quad(p0, c, e)
                p0 = e
            pos = pts[-1]
        elif op == "curveTo":
            c1, c2, e = args
            p0 = pos
            for t in (k / steps for k in range(1, steps + 1)):
                u = 1 - t
                cur.append((u ** 3 * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * e[0],
                            u ** 3 * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * e[1]))
            pos = e
        elif op in ("closePath", "endPath"):
            if len(cur) > 2:
                rings.append(cur)
            cur = []
    return rings


def _glyph(tt, ch, x):
    """One glyph as a shape at pen position x, y down, nonzero-filled.

    TrueType outers wind clockwise and counters the other way, and static
    Inter keeps overlapping outers (a crossbar over a stem), so an evenodd
    fill would punch holes where they cross. Each outer loses only the
    counters inside it, and the outers are unioned.
    """
    gs = tt.getGlyphSet()
    name = tt.getBestCmap()[ord(ch)]
    pen = DecomposingRecordingPen(gs)
    gs[name].draw(pen)

    def clockwise(r):
        return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(r, r[1:] + r[:1])) < 0

    rings = [(Polygon([(px + x, -py) for px, py in r]).buffer(0), clockwise(r))
             for r in _flatten(pen.value)]
    holes = [p for p, outer in rings if not outer]
    return unary_union([
        p.difference(unary_union([h for h in holes if p.contains(h.representative_point())]))
        for p, outer in rings if outer
    ]), gs[name].width


def _letters():
    tt = TTFont(font_file(WEIGHT))
    x, out = 0, {}
    for ch in NAME:
        g, w = _glyph(tt, ch, x)
        out[ch] = g
        x += w + TRACKING
    return out, tt["OS/2"].sxHeight


def _slant(g):
    return affinity.skew(g, xs=-SLANT, origin=(0, 0))


def _logotype():
    letters, x_height = _letters()
    top = -x_height
    # The band is the f's crossbar carried through: measure how deep it runs
    # below the x-height at the f's left overhang, where nothing else is.
    f = letters["f"]
    edge = f.intersection(box(-1e5, top - 5, 1e5, top + 600)).bounds[0]
    bot = f.intersection(box(edge + 5, -1e5, edge + 15, 1e5)).bounds[3]
    mid = (top + bot) / 2

    # From flush with the i's left side to past the t, ending in a point.
    i_left = letters["i"].intersection(box(-1e5, top, 1e5, bot)).bounds[0]
    t_right = letters["t"].bounds[2]
    tip = (bot - top) * 0.9
    band = Polygon([(i_left, top), (t_right + 120 + tip, top),
                    (t_right + 120, bot), (i_left, bot)])
    g = unary_union(list(letters.values()) + [band])

    # A slash centred in the white between each pair of stems, kept to the
    # band's depth so it never nicks a letter above or below it.
    lean = math.tan(math.radians(SLASH_ANGLE))
    below = box(-1e5, bot + 10, 1e5, bot + 200)
    for a, b in (("i", "f"), ("f", "t")):
        cx = (letters[a].intersection(below).bounds[2]
              + letters[b].intersection(below).bounds[0]) / 2
        y0, y1 = top - 1, bot + 1
        g = g.difference(Polygon([
            (cx - SLASH / 2 - lean * (y0 - mid), y0), (cx + SLASH / 2 - lean * (y0 - mid), y0),
            (cx + SLASH / 2 - lean * (y1 - mid), y1), (cx - SLASH / 2 - lean * (y1 - mid), y1)]))
    return _slant(g), _slant(letters["R"])


def _rings(g):
    out = []
    for poly in getattr(g, "geoms", [g]):
        out.append(list(poly.exterior.coords)[:-1])
        out += [list(i.coords)[:-1] for i in poly.interiors]
    return out


def _path(rings):
    return "".join("M" + " ".join("%g %g" % p for p in r) + "Z" for r in rings)


def _clean(pts):
    """Drop points that round onto their neighbour."""
    return [p for i, p in enumerate(pts) if p != pts[i - 1]]


LOGOTYPE, R_GLYPH = _logotype()
INK_BOX = 76     # fitted extent of the mark on the 100-unit canvas


def _fit_mark():
    g = R_GLYPH.simplify(1.5)
    x0, y0, x1, y1 = g.bounds
    k = INK_BOX / max(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return [_clean([(round(50 + (x - cx) * k, 2), round(50 + (y - cy) * k, 2))
                    for x, y in r]) for r in _rings(g)]


def _fit_logotype():
    """The logotype at cap height 100, its ink starting at the origin."""
    g = LOGOTYPE.simplify(1.5)
    x0, y0, x1, y1 = g.bounds
    k = 100 / (R_GLYPH.bounds[3] - R_GLYPH.bounds[1])
    rings = [_clean([(round((x - x0) * k, 2), round((y - y0) * k, 2)) for x, y in r])
             for r in _rings(g)]
    return rings, round((x1 - x0) * k, 2), round((y1 - y0) * k, 2)


RINGS = _fit_mark()
PATH = _path(RINGS)
INK_BOUNDS = tuple(round(f(v for r in RINGS for v in (p[i] for p in r)), 2)
                   for f, i in ((min, 0), (min, 1), (max, 0), (max, 1)))
INK_VIEWBOX = "%g %g %g %g" % (INK_BOUNDS[0], INK_BOUNDS[1],
                               round(INK_BOUNDS[2] - INK_BOUNDS[0], 2),
                               round(INK_BOUNDS[3] - INK_BOUNDS[1], 2))
LOGO_RINGS, LOGO_W, LOGO_H = _fit_logotype()
LOGO_PATH = _path(LOGO_RINGS)
TILE_RADIUS = 0.20  # fraction of the tile edge

def _raster(rings, w, h, k, fill, ss):
    """Rings scaled by k onto a transparent w x h image, evenodd, at ss x."""
    acc = Image.new("1", (w * ss, h * ss), 0)
    for ring in rings:
        m = Image.new("1", acc.size, 0)
        ImageDraw.Draw(m).polygon([(x * k * ss, y * k * ss) for x, y in ring], fill=1)
        acc = ImageChops.logical_xor(acc, m)
    img = Image.new("RGBA", acc.size, fill)
    img.putalpha(acc.convert("L").point(lambda v: 255 if v else 0))
    return img.resize((w, h), Image.LANCZOS)


def mark(size, fill=INK, ss=8):
    """The bare R, anti-aliased, on a transparent square."""
    return _raster(RINGS, size, size, size / 100.0, fill, ss)


def logotype(height, fill=INK, ss=4):
    """The logotype, cropped to its ink, `height` px tall."""
    k = height / LOGO_H
    return _raster(LOGO_RINGS, int(math.ceil(LOGO_W * k)), height, k, fill, ss)


def tile(size, radius=TILE_RADIUS, inset=0.0, ss=8):
    """The R on its white tile — the icon form of the logo."""
    big = size * ss
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if radius > 0:
        d.rounded_rectangle([0, 0, big - 1, big - 1],
                            radius=radius * big, fill=PAPER)
    else:
        d.rectangle([0, 0, big - 1, big - 1], fill=PAPER)
    glyph = mark(big, ss=1)
    if inset:
        inner = int(big * (1 - inset))
        glyph = glyph.resize((inner, inner), Image.LANCZOS)
        off = (big - inner) // 2
        img.alpha_composite(glyph, (off, off))
    else:
        img.alpha_composite(glyph)
    return img.resize((size, size), Image.LANCZOS)


def wrap(draw, text, fnt, max_width):
    lines, line = [], ""
    for word in text.split():
        trial = (line + " " + word).strip()
        if draw.textlength(trial, font=fnt) <= max_width or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def lockup(height=200, dark=False):
    """The logotype on transparent — the horizontal logo."""
    return logotype(height, fill=PAPER if dark else INK)


def social(width=1200, height=630):
    """1200x630 card. Laid out top-down from measured blocks so a longer
    tagline pushes the copy instead of colliding with it."""
    img = Image.new("RGBA", (width, height), PAPER)
    d = ImageDraw.Draw(img)
    pad = 88

    # Eyebrow: the logotype, with the domain closing the row.
    g = 60
    img.alpha_composite(logotype(44), (pad, pad + 8))
    dom = font("Inter-Medium.ttf", 25)
    d.text((width - pad - d.textlength(DOMAIN, font=dom), pad + 17),
           DOMAIN, font=dom, fill=MUTED)
    d.rectangle([pad, pad + g + 34, width - pad, pad + g + 35], fill=RULE)

    # The line that does the work.
    head = font("Inter-Bold.ttf", 82)
    y = 252
    for line in wrap(d, TAGLINE, head, width - pad * 2):
        d.text((pad, y), line, font=head, fill=INK)
        y += 94

    body = font("Inter-Regular.ttf", 31)
    y += 26
    for line in wrap(d, BLURB, body, 900)[:3]:
        d.text((pad, y), line, font=body, fill=MUTED)
        y += 46

    assert y < height - pad // 2, "social copy overflows the card"
    return img.convert("RGB")


def svg(path, fill, backdrop="", inset=None, d=None, box="0 0 100 100"):
    """One vector asset: a single evenodd path, the R unless `d` is given."""
    body = '<path fill-rule="evenodd" d="%s" fill="%s"/>' % (d or PATH, fill)
    if inset:
        body = ('<g transform="translate(50 50) scale(%g) translate(-50 -50)">\n'
                '    %s\n  </g>' % (inset, body))
    w, h = box.split()[2:]
    lines = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s" '
             'width="%s" height="%s" role="img" aria-label="%s">' % (box, w, h, NAME)]
    if backdrop:
        lines.append("  " + backdrop)
    lines += ["  " + body, "</svg>", ""]
    with open(path, "w") as f:
        f.write("\n".join(lines))
    print("  %-52s %s" % (os.path.relpath(path, ROOT), "svg"))


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    print("  %-52s %s" % (os.path.relpath(path, ROOT), img.size))


def main():
    print("brand assets")
    print("  mark.inkBox = %s" % INK_VIEWBOX)
    print("  mark.path = %s" % PATH)
    print("  logotype.viewBox = 0 0 %g %g" % (LOGO_W, LOGO_H))
    print("  logotype.path = %s" % LOGO_PATH)

    ink, paper = "#%02x%02x%02x" % INK[:3], "#%02x%02x%02x" % PAPER[:3]
    tile_rect = '<rect width="100" height="100" rx="%g" fill="%s"/>' % (TILE_RADIUS * 100, paper)
    svg(os.path.join(APP, "icon.svg"), ink, tile_rect)
    svg(os.path.join(BRAND, "logo-tile.svg"), ink, tile_rect)
    svg(os.path.join(BRAND, "logo-mark.svg"), ink)
    svg(os.path.join(BRAND, "logo-mark-white.svg"), paper)
    svg(os.path.join(BRAND, "logo-maskable.svg"), ink,
        '<rect width="100" height="100" fill="%s"/>' % paper, inset=0.72)
    logo_box = "0 0 %g %g" % (LOGO_W, LOGO_H)
    svg(os.path.join(BRAND, "logo-wordmark.svg"), ink, d=LOGO_PATH, box=logo_box)
    svg(os.path.join(BRAND, "logo-wordmark-white.svg"), paper, d=LOGO_PATH, box=logo_box)

    # favicon.ico — Pillow writes every size into one file.
    ico = tile(256)
    ico.save(os.path.join(APP, "favicon.ico"), format="ICO",
             sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("  %-52s %s" % ("src/app/favicon.ico", "16-256"))

    save(tile(180), os.path.join(APP, "apple-icon.png"))
    save(tile(192), os.path.join(BRAND, "icon-192.png"))
    save(tile(512), os.path.join(BRAND, "icon-512.png"))
    # Android masks a circle out of this one, so bleed the tile and inset the mark.
    save(tile(512, radius=0, inset=0.28), os.path.join(BRAND, "icon-maskable-512.png"))

    save(mark(512), os.path.join(BRAND, "logo-mark.png"))
    save(lockup(), os.path.join(BRAND, "logo-lockup.png"))
    save(lockup(dark=True), os.path.join(BRAND, "logo-lockup-white.png"))

    og = social()
    save(og, os.path.join(APP, "opengraph-image.png"))
    save(og, os.path.join(APP, "twitter-image.png"))


if __name__ == "__main__":
    main()

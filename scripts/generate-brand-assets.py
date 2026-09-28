#!/usr/bin/env python3
"""
Regenerates every raster brand asset from one definition of the Rift mark.

The mark is a swept-wing jet climbing at 45 degrees with a needle-shaped rift
cut down its fuselage. It is drawn here, nose-up, as a half outline mirrored
about the centreline, then rotated and fitted to the 12..88 ink box of a
100x100 canvas. The script prints the resulting SVG path; the vector assets
(src/app/icon.svg, public/brand/*.svg) and `mark.path` in src/lib/brand.ts
carry that string verbatim, filled evenodd. Run it after changing the mark or
the wordmark:

    python3 scripts/generate-brand-assets.py

Requires Pillow. Inter is downloaded to .cache/fonts on first run and is not
committed; only the rendered PNGs are.
"""

import math
import os
import urllib.request
from PIL import Image, ImageDraw, ImageFont

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

# The aircraft, nose-up, in its own units: nose at (0, 0), tail at y ~= 100,
# starboard half only. The nose is a quadratic ogive sampled into segments so
# the whole outline stays a polygon, which both PIL and SVG draw identically.
def _bez(p0, p1, p2, n):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1])
            for t in (i / n for i in range(1, n + 1))]


_HALF = ([(0, 0)] + _bez((0, 0), (6.4, 4.5), (6.4, 19), 10) + [
    (6.4, 33),               # wing root, leading edge
    (45, 64), (45, 70.5),    # wingtip, cut parallel to the line of flight
    (6.4, 57),               # wing root, trailing edge
    (4.2, 82),               # fuselage tapers into the tail
    (19, 95.5), (19, 100),   # tailplane tip
    (0, 95.5),               # swallow-tail finish on the centreline
])
_BODY = _HALF + [(-x, y) for x, y in reversed(_HALF[1:-1])]
# The rift: a needle along the spine, never reaching nose or tail.
_RIFT = [(0, 21), (-1.3, 50), (0, 84), (1.3, 50)]
ANGLE = 45       # degrees clockwise from nose-up
INK_BOX = 76     # fitted extent on the 100-unit canvas (12..88)


def _fit():
    a = math.radians(ANGLE)
    rot = lambda pts: [(x * math.cos(a) - y * math.sin(a),
                        x * math.sin(a) + y * math.cos(a)) for x, y in pts]
    body, rift = rot(_BODY), rot(_RIFT)
    xs, ys = [p[0] for p in body], [p[1] for p in body]
    k = INK_BOX / max(max(xs) - min(xs), max(ys) - min(ys))
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    place = lambda pts: [(round(50 + (x - cx) * k, 2), round(50 + (y - cy) * k, 2))
                         for x, y in pts]
    return place(body), place(rift)


BODY, RIFT = _fit()
PATH = "".join("M" + " ".join("%g %g" % p for p in pts) + "Z" for pts in (BODY, RIFT))
TILE_RADIUS = 0.20  # fraction of the tile edge

FONTS = {
    "Inter-Regular.ttf": "UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg",
    "Inter-Medium.ttf": "UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZg",
    "Inter-SemiBold.ttf": "UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg",
    "Inter-Bold.ttf": "UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg",
    "Inter-Black.ttf": "UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuBWYMZg",
}


def font(name, size):
    os.makedirs(FONT_DIR, exist_ok=True)
    path = os.path.join(FONT_DIR, name)
    if not os.path.exists(path):
        url = "https://fonts.gstatic.com/s/inter/v20/%s.ttf" % FONTS[name]
        print("  downloading %s" % name)
        urllib.request.urlretrieve(url, path)
    return ImageFont.truetype(path, size)


def mark(size, fill=INK, ss=8):
    """The bare airplane, anti-aliased, on a transparent square."""
    big = size * ss
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    k = big / 100.0
    d.polygon([(x * k, y * k) for x, y in BODY], fill=fill)
    d.polygon([(x * k, y * k) for x, y in RIFT], fill=(0, 0, 0, 0))
    return img.resize((size, size), Image.LANCZOS)


def tile(size, radius=TILE_RADIUS, inset=0.0, ss=8):
    """The airplane on its white tile — the icon form of the logo."""
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


def lockup(cap=256, dark=False, pad=0):
    """Mark + wordmark on transparent — the horizontal logo.

    Driven off one cap height. The mark is cropped to its ink box (the
    100x100 canvas carries padding a lockup must not inherit), drawn at
    1.05x the name's size, and centred on the capitals rather than sat on the
    baseline: a diagonal has its weight in the middle, not at its foot.
    """
    ink = PAPER if dark else INK
    em = cap / 0.728                       # Inter's cap height is 0.728em
    fnt = font("Inter-SemiBold.ttf", int(round(em)))

    n = int(round(em * 1.05 / 0.76))
    glyph = mark(n, fill=ink)
    lo, hi = round(n * 0.12), round(n * 0.88)
    glyph = glyph.crop((lo, lo, hi, hi))
    gw, gh = glyph.size

    gap = int(round(em * 0.36))
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    text_w = probe.textlength(NAME, font=fnt)
    _, descent = fnt.getmetrics()

    # Baseline sits so the cap block is centred on the mark.
    base = pad + gh / 2 + cap / 2
    w = int(round(gw + gap + text_w)) + pad * 2 + 2
    h = int(round(max(pad * 2 + gh, base + descent + pad)))
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    img.alpha_composite(glyph, (pad, pad))
    d = ImageDraw.Draw(img)
    d.text((pad + gw + gap, base), NAME, font=fnt, fill=ink, anchor="ls")
    return img


def social(width=1200, height=630):
    """1200x630 card. Laid out top-down from measured blocks so a longer
    tagline pushes the copy instead of colliding with it."""
    img = Image.new("RGBA", (width, height), PAPER)
    d = ImageDraw.Draw(img)
    pad = 88

    # Eyebrow: the mark beside the name, with the domain closing the row.
    g = 60
    img.alpha_composite(mark(g), (pad, pad))
    eyebrow = font("Inter-SemiBold.ttf", 30)
    d.text((pad + g + 18, pad + 14), NAME, font=eyebrow, fill=INK)
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


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    print("  %-52s %s" % (os.path.relpath(path, ROOT), img.size))


def main():
    print("brand assets")
    print("  mark.path = %s" % PATH)

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
    save(lockup(160), os.path.join(BRAND, "logo-lockup.png"))
    save(lockup(160, dark=True), os.path.join(BRAND, "logo-lockup-white.png"))

    og = social()
    save(og, os.path.join(APP, "opengraph-image.png"))
    save(og, os.path.join(APP, "twitter-image.png"))


if __name__ == "__main__":
    main()

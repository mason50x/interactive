#!/usr/bin/env python3
"""
Regenerates every raster brand asset from one definition of the IL monogram.

The vector assets (src/app/icon.svg, public/brand/*.svg) and this script share
the same numbers, which come from measuring Inter Black at 1000upm. Run it
after changing the mark or the wordmark:

    python3 scripts/generate-brand-assets.py

Requires Pillow. Inter is downloaded to .cache/fonts on first run and is not
committed; only the rendered PNGs are.
"""

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

NAME = "Interactive Learning"
TAGLINE = "The visual learning platform"
BLURB = ("Concept maps, animated walkthroughs, and practice that adapts "
         "to what you have not understood yet.")
DOMAIN = "interactivelearningresources.org"

# The monogram on a 100x100 canvas: the union of three bars, with the counter
# between the letters cut back out down to the baseline web. Kept identical to
# `monogram.path` in src/lib/brand.ts.
RECTS = [
    (18.00, 21.00, 33.77, 79.00),   # I stem
    (42.73, 21.00, 58.50, 79.00),   # L stem
    (18.00, 66.33, 82.00, 79.00),   # shared foot
]
COUNTER = (33.77, 21.00, 42.73, 74.50)  # subtracted; leaves a 4.5 web
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
    """The bare monogram, anti-aliased, on a transparent square."""
    big = size * ss
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    k = big / 100.0
    for x0, y0, x1, y1 in RECTS:
        d.rectangle([x0 * k, y0 * k, x1 * k, y1 * k], fill=fill)
    x0, y0, x1, y1 = COUNTER
    d.rectangle([x0 * k, y0 * k, x1 * k, y1 * k], fill=(0, 0, 0, 0))
    return img.resize((size, size), Image.LANCZOS)


def tile(size, radius=TILE_RADIUS, inset=0.0, ss=8):
    """The monogram on its white tile — the icon form of the logo."""
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


def tracked(draw, xy, text, fnt, fill, tracking=0.0, anchor=None):
    """Draw text with letterspacing, which PIL has no native support for."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill, anchor=anchor)
        x += draw.textlength(ch, font=fnt) + tracking
    return x


def tracked_width(draw, text, fnt, tracking=0.0):
    if not text:
        return 0.0
    return sum(draw.textlength(c, font=fnt) for c in text) + tracking * (len(text) - 1)


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

    Everything is driven off one cap height so the monogram and the wordmark
    share a cap line: the mark is cropped to its ink box (the 100x100 canvas
    carries padding a lockup must not inherit), and Inter is sized by its
    0.728em cap height rather than by eye.
    """
    ink = PAPER if dark else INK

    # Crop the mark to its ink: x 18..82, y 21..79 of the 100-unit canvas.
    n = int(round(cap / 0.58))
    glyph = mark(n, fill=ink)
    glyph = glyph.crop((round(n * 0.18), round(n * 0.21),
                        round(n * 0.82), round(n * 0.79)))
    gw, gh = glyph.size

    fnt = font("Inter-SemiBold.ttf", int(round(cap / 0.728)))
    tracking = cap * 0.004
    gap = int(round(cap * 0.38))
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    text_w = tracked_width(probe, NAME, fnt, tracking)
    _, descent = fnt.getmetrics()

    w = int(round(gw + gap + text_w)) + pad * 2 + 2
    h = gh + descent + pad * 2
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    img.alpha_composite(glyph, (pad, pad))
    d = ImageDraw.Draw(img)
    # Baseline of the wordmark == baseline of the monogram.
    tracked(d, (pad + gw + gap, pad + gh), NAME, fnt, ink, tracking, anchor="ls")
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
    eyebrow = font("Inter-SemiBold.ttf", 25)
    tracked(d, (pad + g + 18, pad + 17), NAME.upper(), eyebrow, INK, 3.4)
    dom = font("Inter-Medium.ttf", 25)
    d.text((width - pad - d.textlength(DOMAIN, font=dom), pad + 17),
           DOMAIN, font=dom, fill=MUTED)
    d.rectangle([pad, pad + g + 34, width - pad, pad + g + 35], fill=RULE)

    # The line that does the work.
    head = font("Inter-Bold.ttf", 82)
    y = 252
    for line in wrap(d, TAGLINE, head, width - pad * 2):
        tracked(d, (pad, y), line, head, INK, -1.8)
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

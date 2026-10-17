"""Draw the MacroForge icons (needs Pillow).

Family DNA (docs/DESIGN.md): a geometric mark in the product colour with one
lime element, on a black rounded tile. MacroForge's mark is a keycap in
Signal cyan, with the deeper bottom lip of a real keycap, and a lime play
mark on its face. Geometry matches src/components/brand.tsx (32-unit grid).

Also writes the tray icons as raw 32x32 RGBA (lit while bindings are on,
grey while off), which the app embeds directly.
"""
from pathlib import Path
from PIL import Image, ImageDraw

SIGNAL = (34, 211, 238, 255)
LIME = (198, 255, 52, 255)
TILE = (10, 10, 12, 255)
FACE = (10, 10, 12, 255)
GREY = (120, 120, 132, 255)
OUT = Path(__file__).resolve().parent.parent / "src-tauri" / "icons"


def draw(size: int, cap=SIGNAL, mark=LIME, tile=True) -> Image.Image:
    ss = 8
    s = size * ss
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = s / 32.0
    if tile:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=7 * u, fill=TILE)
    # Keycap: the coloured body, then its face, set high so the bottom lip is deeper.
    d.rounded_rectangle([5 * u, 5 * u, 27 * u, 27.6 * u], radius=5.6 * u, fill=cap)
    d.rounded_rectangle([8.2 * u, 8.2 * u, 23.8 * u, 22.4 * u], radius=3.4 * u, fill=FACE)
    # Play mark on the face.
    d.polygon([(13.4 * u, 11.2 * u), (20.2 * u, 15.3 * u), (13.4 * u, 19.4 * u)], fill=mark)
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(parents=True, exist_ok=True)
draw(32).save(OUT / "32x32.png")
draw(128).save(OUT / "128x128.png")
draw(256).save(OUT / "128x128@2x.png")
big = draw(512)
big.save(OUT / "icon.png")
big.save(OUT / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
(OUT / "tray-on.rgba").write_bytes(draw(32, tile=False).tobytes())
(OUT / "tray-off.rgba").write_bytes(draw(32, cap=GREY, mark=GREY, tile=False).tobytes())
print("icons written to", OUT)

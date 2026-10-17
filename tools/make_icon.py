"""Draw the MacroForge app icon (needs Pillow): a violet keycap with a lime
play mark, on the same black rounded tile as PeakTweaks' icon. Geometry
matches src/components/Logo.tsx (32-unit grid)."""
from pathlib import Path
from PIL import Image, ImageDraw

VIOLET = (126, 59, 237, 255)
LIME = (198, 255, 52, 255)
TILE = (10, 10, 12, 255)
OUT = Path(__file__).resolve().parent.parent / "src-tauri" / "icons"


def draw(size: int) -> Image.Image:
    ss = 8
    s = size * ss
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = s / 32.0
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=7 * u, fill=TILE)
    # Keycap ring.
    d.rounded_rectangle([5.2 * u, 5.2 * u, 26.8 * u, 26.8 * u], radius=5.5 * u, outline=VIOLET, width=round(3.4 * u))
    # Play mark.
    d.polygon([(13.0 * u, 10.6 * u), (21.8 * u, 16 * u), (13.0 * u, 21.4 * u)], fill=LIME)
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(parents=True, exist_ok=True)
draw(32).save(OUT / "32x32.png")
draw(128).save(OUT / "128x128.png")
draw(256).save(OUT / "128x128@2x.png")
big = draw(512)
big.save(OUT / "icon.png")
big.save(OUT / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("icons written to", OUT)

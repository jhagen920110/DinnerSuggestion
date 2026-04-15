"""Generate app icons: bowl + noodles + chopsticks, supersampled for clean edges."""
from PIL import Image, ImageDraw
import os

SCALE = 4  # supersample factor


def draw_icon(size):
    """Draw at SCALE * size then downscale for anti-aliasing."""
    s = size * SCALE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = s / 2, s / 2
    r = s * 0.44

    # Circle bg
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill="#4f46e5")

    w = (255, 255, 255, 255)

    # --- Bowl ---
    rim_y = cy + s * 0.05
    rim_hw = s * 0.25  # half-width
    sw = round(s * 0.038)  # stroke width

    # Rim
    d.line([(cx - rim_hw - s * 0.015, rim_y), (cx + rim_hw + s * 0.015, rim_y)],
           fill=w, width=sw)

    # Bowl body (arc)
    bw = s * 0.24
    d.arc([cx - bw, rim_y, cx + bw, rim_y + s * 0.30],
          0, 180, fill=w, width=sw)

    # --- Noodles ---
    nlw = round(s * 0.02)
    nt = rim_y - s * 0.17  # noodle top
    nb = rim_y + s * 0.005
    for i in range(5):
        nx = cx - s * 0.09 + i * (s * 0.045)
        d.line([(nx, nt), (nx, nb)], fill=w, width=nlw)

    # --- Chopsticks ---
    clw = round(s * 0.028)
    # Left chopstick (top-left → right)
    d.line([(cx - s * 0.24, cy - r * 0.60), (cx + s * 0.14, rim_y - s * 0.05)],
           fill=w, width=clw)
    # Right chopstick (top-right → center)
    d.line([(cx + s * 0.27, cy - r * 0.52), (cx + s * 0.07, rim_y - s * 0.03)],
           fill=w, width=clw)

    return img.resize((size, size), Image.LANCZOS)


out = os.path.join(os.path.dirname(__file__), "web", "images")
for sz, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")]:
    draw_icon(sz).save(os.path.join(out, name))
    print(f"Saved {name} ({sz}x{sz})")

ico = draw_icon(64)
ico.save(os.path.join(out, "favicon.ico"), format="ICO", sizes=[(64, 64)])
print("Saved favicon.ico")

out = os.path.join(os.path.dirname(__file__), "web", "images")
for sz, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")]:
    img = draw_icon(sz)
    img.save(os.path.join(out, name))
    print(f"Saved {name} ({sz}x{sz})")

# favicon.ico from 64px
ico = draw_icon(64)
ico.save(os.path.join(out, "favicon.ico"), format="ICO", sizes=[(64, 64)])
print("Saved favicon.ico")

"""Generate app icon: bowl with noodles and chopsticks, white on indigo circle."""
from PIL import Image, ImageDraw
import os


def draw_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size / 2, size / 2
    r = size * 0.44

    # Indigo circle background
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill="#4f46e5")

    white = (255, 255, 255, 255)
    lw = max(round(size * 0.038), 3)

    # --- Bowl ---
    bowl_top = cy + size * 0.0
    bowl_bot = cy + r * 0.58
    bowl_left = cx - size * 0.24
    bowl_right = cx + size * 0.24

    # Bowl rim (thick line)
    rim_ext = size * 0.03
    draw.line([(bowl_left - rim_ext, bowl_top), (bowl_right + rim_ext, bowl_top)], fill=white, width=lw)

    # Bowl body - bottom half ellipse
    bowl_ew = size * 0.25
    bowl_eh = (bowl_bot - bowl_top) * 1.6
    draw.arc(
        [cx - bowl_ew, bowl_top - bowl_eh * 0.08, cx + bowl_ew, bowl_top + bowl_eh],
        0, 180, fill=white, width=lw
    )

    cap = lw * 0.5

    # --- Noodles (vertical lines hanging from rim) ---
    noodle_top = bowl_top - size * 0.16
    noodle_bot = bowl_top
    nlw = max(round(size * 0.02), 2)
    noodle_count = 5
    noodle_span = size * 0.15
    for i in range(noodle_count):
        nx = cx - noodle_span / 2 + i * (noodle_span / (noodle_count - 1))
        draw.line([(nx, noodle_top), (nx, noodle_bot)], fill=white, width=nlw)
        nc = nlw * 0.4
        draw.ellipse([nx - nc, noodle_top - nc, nx + nc, noodle_top + nc], fill=white)

    # --- Chopsticks (diagonal, crossing above bowl) ---
    clw = max(round(size * 0.028), 2)
    # Left chopstick
    c1_x1 = cx - size * 0.26
    c1_y1 = cy - r * 0.58
    c1_x2 = cx + size * 0.14
    c1_y2 = bowl_top - size * 0.02
    draw.line([(c1_x1, c1_y1), (c1_x2, c1_y2)], fill=white, width=clw)
    draw.ellipse([c1_x1 - cap, c1_y1 - cap, c1_x1 + cap, c1_y1 + cap], fill=white)

    # Right chopstick
    c2_x1 = cx + size * 0.28
    c2_y1 = cy - r * 0.50
    c2_x2 = cx + size * 0.08
    c2_y2 = bowl_top - size * 0.01
    draw.line([(c2_x1, c2_y1), (c2_x2, c2_y2)], fill=white, width=clw)
    draw.ellipse([c2_x1 - cap, c2_y1 - cap, c2_x1 + cap, c2_y1 + cap], fill=white)

    return img

out = os.path.join(os.path.dirname(__file__), "web", "images")
for sz, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")]:
    img = draw_icon(sz)
    img.save(os.path.join(out, name))
    print(f"Saved {name} ({sz}x{sz})")

# favicon.ico from 64px
ico = draw_icon(64)
ico.save(os.path.join(out, "favicon.ico"), format="ICO", sizes=[(64, 64)])
print("Saved favicon.ico")

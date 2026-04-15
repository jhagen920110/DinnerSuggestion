"""Generate app icon: bowl with noodles and chopsticks (like ramen icon)."""
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
    sw = max(round(size * 0.045), 3)  # stroke width

    # --- Bowl (lower portion) ---
    bowl_y = cy + size * 0.04
    bowl_w = size * 0.28
    bowl_depth = size * 0.20

    # Rim line
    draw.line([(cx - bowl_w - size * 0.02, bowl_y),
               (cx + bowl_w + size * 0.02, bowl_y)],
              fill=white, width=sw)

    # Bowl curve
    draw.arc([cx - bowl_w, bowl_y - size * 0.02,
              cx + bowl_w, bowl_y + bowl_depth * 2],
             0, 180, fill=white, width=sw)

    # --- Noodles (vertical lines dropping into bowl) ---
    noodle_top = bowl_y - size * 0.17
    noodle_bot = bowl_y + size * 0.01
    nlw = max(round(size * 0.025), 2)
    noodle_count = 5
    noodle_span = size * 0.18
    for i in range(noodle_count):
        nx = cx - noodle_span / 2 + i * (noodle_span / (noodle_count - 1))
        draw.line([(nx, noodle_top), (nx, noodle_bot)], fill=white, width=nlw)
        nc = nlw * 0.45
        draw.ellipse([nx - nc, noodle_top - nc, nx + nc, noodle_top + nc], fill=white)

    # --- Chopsticks (two diagonal lines, crossing above bowl) ---
    clw = max(round(size * 0.032), 2)
    cap = clw * 0.5

    # Left chopstick
    c1_x1 = cx - size * 0.28
    c1_y1 = cy - r * 0.65
    c1_x2 = cx + size * 0.16
    c1_y2 = bowl_y - size * 0.06
    draw.line([(c1_x1, c1_y1), (c1_x2, c1_y2)], fill=white, width=clw)
    draw.ellipse([c1_x1 - cap, c1_y1 - cap, c1_x1 + cap, c1_y1 + cap], fill=white)
    draw.ellipse([c1_x2 - cap, c1_y2 - cap, c1_x2 + cap, c1_y2 + cap], fill=white)

    # Right chopstick
    c2_x1 = cx + size * 0.30
    c2_y1 = cy - r * 0.58
    c2_x2 = cx + size * 0.08
    c2_y2 = bowl_y - size * 0.04
    draw.line([(c2_x1, c2_y1), (c2_x2, c2_y2)], fill=white, width=clw)
    draw.ellipse([c2_x1 - cap, c2_y1 - cap, c2_x1 + cap, c2_y1 + cap], fill=white)
    draw.ellipse([c2_x2 - cap, c2_y2 - cap, c2_x2 + cap, c2_y2 + cap], fill=white)

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

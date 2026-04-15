"""Generate app icons from bowl-source.png on indigo circle."""
from PIL import Image, ImageOps
import os


def make_icon(source_path, size):
    # Create indigo circle background
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # Draw circle
    from PIL import ImageDraw
    d = ImageDraw.Draw(img)
    r = size * 0.44
    cx, cy = size / 2, size / 2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill="#4f46e5")

    # Load source and convert black artwork to white
    src = Image.open(source_path).convert("RGBA")

    # Invert: make black parts white, keep transparency
    r_ch, g_ch, b_ch, a_ch = src.split()
    # The source is black-on-white. Make white areas transparent, black areas white.
    # Convert to grayscale to detect content
    gray = src.convert("L")
    # Create mask: dark pixels = opaque
    from PIL import ImageChops
    # Threshold: pixels darker than 128 are content
    mask = gray.point(lambda p: 255 if p < 128 else 0)

    # Create white version with mask as alpha
    white_layer = Image.new("RGBA", src.size, (255, 255, 255, 255))
    white_layer.putalpha(mask)

    # Crop to content bounding box
    bbox = mask.getbbox()
    if bbox:
        white_layer = white_layer.crop(bbox)

    # Trim a small bit off the right to shorten chopstick tips
    trim_right = int(white_layer.width * 0.03)
    white_layer = white_layer.crop((0, 0, white_layer.width - trim_right, white_layer.height))

    # Scale to fit inside circle with padding
    icon_area = int(r * 1.55)
    ratio = min(icon_area / white_layer.width, icon_area / white_layer.height)
    new_w = int(white_layer.width * ratio)
    new_h = int(white_layer.height * ratio)
    white_layer = white_layer.resize((new_w, new_h), Image.LANCZOS)

    # Center on circle, nudge right so the bowl body is visually centered
    ox = int(cx - new_w / 2) + int(size * 0.03)
    oy = int(cy - new_h / 2) + int(size * 0.02)
    img.paste(white_layer, (ox, oy), white_layer)

    # Clip anything outside the circle to keep it clean
    circle_mask = Image.new("L", (size, size), 0)
    dm = ImageDraw.Draw(circle_mask)
    dm.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    img.putalpha(circle_mask)

    return img


src_path = os.path.join(os.path.dirname(__file__), "web", "images", "bowl-source.png")
out = os.path.join(os.path.dirname(__file__), "web", "images")

for sz, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")]:
    make_icon(src_path, sz).save(os.path.join(out, name))
    print(f"Saved {name} ({sz}x{sz})")

ico = make_icon(src_path, 64)
ico.save(os.path.join(out, "favicon.ico"), format="ICO", sizes=[(64, 64)])
print("Saved favicon.ico")

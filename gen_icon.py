"""Generate app icons from image-source.png on indigo circle."""
from PIL import Image, ImageDraw
import os


def make_icon(source_path, size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = size * 0.44
    cx, cy = size / 2, size / 2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill="#4f46e5")

    # Load source and convert black artwork to white
    src = Image.open(source_path).convert("RGBA")
    gray = src.convert("L")
    mask = gray.point(lambda p: 255 if p < 128 else 0)
    white_layer = Image.new("RGBA", src.size, (255, 255, 255, 255))
    white_layer.putalpha(mask)

    # Crop to content bounding box
    bbox = mask.getbbox()
    if bbox:
        white_layer = white_layer.crop(bbox)

    # Scale to fit inside circle with padding
    icon_area = int(r * 1.45)
    ratio = min(icon_area / white_layer.width, icon_area / white_layer.height)
    new_w = int(white_layer.width * ratio)
    new_h = int(white_layer.height * ratio)
    white_layer = white_layer.resize((new_w, new_h), Image.LANCZOS)

    # Center on circle
    ox = int(cx - new_w / 2)
    oy = int(cy - new_h / 2)
    img.paste(white_layer, (ox, oy), white_layer)

    # Clip to circle
    circle_mask = Image.new("L", (size, size), 0)
    dm = ImageDraw.Draw(circle_mask)
    dm.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    img.putalpha(circle_mask)

    return img


src_path = os.path.join(os.path.dirname(__file__), "web", "images", "image-source.png")
out = os.path.join(os.path.dirname(__file__), "web", "images")

for sz, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")]:
    make_icon(src_path, sz).save(os.path.join(out, name))
    print(f"Saved {name} ({sz}x{sz})")

ico = make_icon(src_path, 64)
ico.save(os.path.join(out, "favicon.ico"), format="ICO", sizes=[(64, 64)])
print("Saved favicon.ico")

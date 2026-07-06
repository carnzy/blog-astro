"""Generate a geek-style avatar.avif to replace the current one."""
from PIL import Image, ImageDraw
import os, random

W, H = 1024, 1024
img = Image.new("RGB", (W, H), (10, 14, 39))
draw = ImageDraw.Draw(img)

# Gradient background
for y in range(H):
    r = int(10 + (26 - 10) * y / H)
    g = int(14 + (16 - 14) * y / H)
    b = int(39 + (64 - 39) * y / H)
    for x in range(W):
        img.putpixel((x, y), (r, g, b))

# Outer glowing ring
draw.ellipse([(62, 62), (962, 962)], outline=(0, 212, 255), width=4)
draw.ellipse([(82, 82), (942, 942)], outline=(40, 40, 120), width=2)

# Big stylized "F" letter (terminal-style)
# Vertical bar
draw.rectangle([(300, 200), (360, 680)], fill=(0, 212, 255))
# Top horizontal
draw.rectangle([(300, 200), (720, 260)], fill=(0, 212, 255))
# Middle horizontal
draw.rectangle([(300, 400), (640, 460)], fill=(0, 212, 255))
# Glow effect
draw.rectangle([(300, 200), (360, 680)], fill=(0, 150, 200), width=0)
draw.rectangle([(290, 190), (370, 690)], outline=(0, 212, 255, 80), width=1)

# Terminal window dots
draw.ellipse([(780, 220), (820, 260)], fill=(255, 95, 86))
draw.ellipse([(830, 220), (870, 260)], fill=(255, 189, 46))
draw.ellipse([(880, 220), (920, 260)], fill=(39, 201, 63))

# Code lines (JSON-like)
code_lines = [
    (200, 550, '{', (124, 58, 237)),
    (240, 550, '"name": "Fzy",', (0, 212, 255)),
    (240, 590, '"role": "developer",', (0, 255, 65)),
    (240, 630, '"status": "coding"', (255, 220, 0)),
    (200, 670, '}', (124, 58, 237)),
]
for x, y, text, color in code_lines:
    for i, ch in enumerate(text):
        draw.text((x + i * 18, y), ch, fill=color)

# Bottom terminal bar
draw.rectangle([(200, 740), (824, 780)], fill=(15, 23, 42), outline=(0, 212, 255))
for i, ch in enumerate("root@geek:~$ whoami # Fzy"):
    draw.text((210 + i * 18, 750), ch, fill=(0, 212, 255))

# Subtle matrix rain background
for _ in range(40):
    x = random.randint(50, 974)
    y = random.randint(50, 974)
    for i in range(3):
        draw.text((x, y + i * 24), random.choice("01"), fill=(0, random.randint(30, 80), 0))

path = r"E:\CC\bolg\src\assets\images\avatar.avif"
img.save(path, format="AVIF", quality=90)
print(f"avatar.avif generated: {os.path.getsize(path) // 1024} KB")

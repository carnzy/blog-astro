#!/usr/bin/env python3
"""Generate geek/tech/hacker-style wallpapers to replace anime images."""

import math
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

# ── colours ──
BLACK   = (0, 0, 0)
GREEN   = (0, 255, 65)
DARK_GREEN = (0, 128, 40)
CYAN    = (0, 200, 255)
BLUE    = (0, 100, 255)
DARK_BLUE = (0, 40, 80)
PURPLE  = (180, 0, 255)
ORANGE  = (255, 160, 0)
RED     = (255, 40, 40)
WHITE   = (200, 200, 200)
GREY    = (60, 60, 60)
YELLOW  = (255, 220, 0)

# ── helpers ──
def make_base(w, h, colour=BLACK):
    return Image.new("RGB", (w, h), colour)

def draw_text_lines(draw, lines, start_x, start_y, colour=GREEN, font_size=16, spacing=8):
    """Draw monochrome text lines."""
    for i, line in enumerate(lines):
        y = start_y + i * (font_size + spacing)
        draw.text((start_x, y), line, fill=colour)

def draw_matrix_rain(draw, w, h, intensity=0.15, colour=GREEN, kernel_size=3):
    """Sparse 'digital rain' columns."""
    columns = [x for x in range(0, w, kernel_size * 6) if random.random() < intensity]
    chars = "0123456789ABCDEF"
    for x in columns:
        length = random.randint(6, 20)
        start_y = random.randint(-h, 0)
        for i in range(length):
            y = start_y + i * kernel_size * 3
            if 0 <= y < h:
                c = random.choice(chars)
                alpha = max(0.2, 1.0 - i / length * 0.8)
                col = tuple(int(v * alpha) for v in colour)
                draw.text((x, y), c, fill=col)

def draw_grid(draw, w, h, step=40, colour=GREY):
    """Draw perspective/tech grid."""
    for x in range(0, w, step):
        draw.line([(x, 0), (x, h)], fill=colour, width=1)
    for y in range(0, h, step):
        draw.line([(0, y), (w, y)], fill=colour, width=1)

def draw_circuit_lines(draw, w, h, count=30, colour=CYAN):
    """Random circuit-board traces."""
    for _ in range(count):
        x = random.randint(0, w)
        y = random.randint(0, h)
        dx = random.choice([-1, 1]) * random.randint(20, 100)
        dy = random.choice([-1, 1]) * random.randint(20, 100)
        draw.line([(x, y), (x + dx, y)], fill=colour, width=2)
        draw.line([(x + dx, y), (x + dx, y + dy)], fill=colour, width=2)
        # small circle at endpoint
        draw.ellipse([(x + dx - 3, y + dy - 3), (x + dx + 3, y + dy + 3)], fill=colour)

def draw_hex_grid(draw, w, h, start_x, start_y, rows=8, cols=8, size=20):
    """Draw a hex grid (memory map aesthetic)."""
    r = size
    for row in range(rows):
        for col in range(cols):
            ox = start_x + col * (r * 1.5) + (row % 2) * (r * 0.75)
            oy = start_y + row * (r * 1.1)
            pts = []
            for i in range(6):
                angle = math.pi / 3 * i - math.pi / 6
                pts.append((ox + r * math.cos(angle), oy + r * math.sin(angle)))
            draw.polygon(pts, outline=GREEN, width=1)

def draw_binary_stream(draw, w, h, count=10):
    """Binary number streams (0101...)."""
    chars = "01"
    for _ in range(count):
        x = random.randint(0, w - 200)
        y = random.randint(0, h - 200)
        for i in range(6):
            draw.text((x, y + i * 20), "".join(random.choice(chars) for _ in range(16)),
                      fill=(0, max(180, random.randint(100, 255)), 0))

def draw_terminal_box(draw, x, y, w_box, h_box, lines, title="root@geek:~$"):
    """Draw a terminal emulator box."""
    # background
    draw.rectangle([(x, y), (x + w_box, y + h_box)], outline=GREEN, fill=(0, 10, 0), width=2)
    # title bar
    draw.rectangle([(x, y), (x + w_box, y + 24)], fill=(0, 20, 0))
    draw.text((x + 6, y + 4), title, fill=GREEN)
    # content
    for i, line in enumerate(lines):
        draw.text((x + 8, y + 28 + i * 18), line, fill=GREEN)

def draw_code_snippet(draw, x, y, lines, colour=YELLOW):
    """Draw syntax-highlighted code."""
    highlights = [GREEN, CYAN, ORANGE, YELLOW, WHITE]
    for i, line in enumerate(lines):
        c = highlights[i % len(highlights)]
        draw.text((x, y + i * 18), line, fill=c)

def draw_scan_line(draw, w, h, colour=CYAN, alpha=40):
    """Horizontal scan-line effect."""
    for y in range(0, h, 3):
        draw.line([(0, y), (w, y)], fill=(0, 0, 0, 0) if y % 6 == 0 else colour, width=1)

# ── image generators ──

def gen_d1(w=1920, h=1080):
    """Matrix digital rain"""
    img = make_base(w, h)
    draw = ImageDraw.Draw(img)
    draw_matrix_rain(draw, w, h, intensity=0.2)
    # large ">_ " in top left
    draw.text((60, 60), ">_ SYSTEM INITIALIZED", fill=GREEN)
    draw.text((60, 100), "  SECURE BOOT: OK", fill=GREEN)
    draw.text((60, 140), "  NETWORK: ACTIVE", fill=GREEN)
    return img

def gen_d2(w=1920, h=1080):
    """Terminal + circuit board"""
    img = make_base(w, h, (10, 5, 20))
    draw = ImageDraw.Draw(img)
    draw_grid(draw, w, h, step=50, colour=(20, 40, 30))
    draw_circuit_lines(draw, w, h, count=20)
    term_lines = [
        "root@geek:~$ ./configure --enable-hack-mode",
        "checking build system... x86_64-linux-gnu",
        "checking for gcc... found",
        "checking for libssl... found",
        "config.status: creating Makefile",
        "root@geek:~$ make -j8",
        "[ 12%] Building CXX src/neural/core.cc",
        "[ 45%] Building CXX src/vision/glitch.cc",
        "[ 78%] Building CXX src/hack/exploit.cc",
        "[100%] Linking CXX bin/pwned",
        "root@geek:~$ █",
    ]
    draw_terminal_box(draw, 200, 600, 1520, 380, term_lines, title="root@geek:~$ ./compiler --hack")
    return img

def gen_d3(w=1920, h=1080):
    """Cyberpunk neon grid + code"""
    img = make_base(w, h, (5, 0, 15))
    draw = ImageDraw.Draw(img)
    # Perspective grid
    for i in range(-10, 50):
        alpha = 1.0 - abs(i) / 50.0
        c = tuple(int(v * alpha) for v in PURPLE)
        draw.line([(w//2 - i * 30, h), (w//2 - i * 8, 0)], fill=c, width=1)
        draw.line([(w//2 + i * 30, h), (w//2 + i * 8, 0)], fill=c, width=1)
    # Binary stream
    for i in range(8):
        draw.text((100 + i * 220, h // 3), "".join(random.choice("01") for _ in range(24)),
                  fill=(255, 0, 180))
    # Glowing hex
    draw_hex_grid(draw, w, h, w//2 - 80, h//2 - 80, rows=4, cols=4, size=25)
    return img

def gen_d4(w=1920, h=1080):
    """Data visualization / waveform"""
    img = make_base(w, h, (0, 5, 20))
    draw = ImageDraw.Draw(img)
    # Waveforms
    center_y = h // 2
    for offset in range(0, w, 200):
        for x in range(0, 200, 2):
            px = offset + x
            if px > w: break
            y1 = center_y + int(math.sin(x * 0.05 + offset * 0.02) * 100)
            y2 = y1 + int(math.cos(x * 0.03) * 60)
            draw.point((px, y1), fill=CYAN)
            draw.point((px, y2), fill=GREEN)
    # Labels
    draw.text((60, 60), "SYSTEM MONITOR v4.2", fill=CYAN)
    draw.text((60, 100), "CPU: ████████░░ 78%", fill=GREEN)
    draw.text((60, 140), "MEM: ██████░░░░ 62%", fill=YELLOW)
    draw.text((60, 180), "NET: ██████████ 99%", fill=ORANGE)
    return img

def gen_d5(w=1920, h=1080):
    """Hacker terminal + scan lines"""
    img = make_base(w, h, (0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Scan lines
    for y in range(0, h, 4):
        draw.line([(0, y), (w, y)], fill=(0, 20, 0), width=1)
    # Large centered terminal
    code_lines = [
        "\#include <stdio.h>",
        "\#include <stdlib.h>",
        "",
        "int main() {",
        "    char *flag = malloc(256);",
        "    sprintf(flag, \"FLAG{%s}\", \"h4ck3d\");",
        "    printf(\"%s\\n\", flag);",
        "    return 0;",
        "}",
    ]
    draw_code_snippet(draw, 200, 200, code_lines)
    # Output below
    draw.text((200, 380), "$ ./exploit", fill=GREEN)
    draw.text((200, 400), "$ FLAG{h4ck3d}", fill=CYAN)
    return img

def gen_d6(w=1920, h=1080):
    """Glowing network map / firewall diagram"""
    img = make_base(w, h, (8, 0, 20))
    draw = ImageDraw.Draw(img)
    # Network nodes
    nodes = []
    for _ in range(30):
        nx = random.randint(50, w - 50)
        ny = random.randint(50, h - 50)
        nodes.append((nx, ny))
        draw.ellipse([(nx - 3, ny - 3), (nx + 3, ny + 3)], fill=CYAN)
    # Connections
    for i, (x1, y1) in enumerate(nodes):
        for j in range(i + 1, len(nodes)):
            if random.random() < 0.08:
                x2, y2 = nodes[j]
                dist = ((x2 - x1)**2 + (y2 - y1)**2)**0.5
                if dist < 400:
                    draw.line([(x1, y1), (x2, y2)], fill=(0, 100, 200, 80), width=1)
    # Center node
    cx, cy = w//2, h//2
    draw.ellipse([(cx - 20, cy - 20), (cx + 20, cy + 20)], fill=RED, outline=ORANGE, width=3)
    draw.text((cx - 25, cy - 40), "FIREWALL", fill=RED)
    return img

# ── mobile generators (portrait 1080x1920) ──

def gen_m1(w=1080, h=1920):
    """Vertical matrix rain"""
    img = make_base(w, h)
    draw = ImageDraw.Draw(img)
    draw_matrix_rain(draw, w, h, intensity=0.25)
    draw.text((60, 80), ">_ secure shell: OK", fill=GREEN)
    draw.text((60, 120), "  encryption: AES-256", fill=GREEN)
    draw.text((60, 160), "  tunnel: established", fill=GREEN)
    return img

def gen_m2(w=1080, h=1920):
    """Terminal output vertical"""
    img = make_base(w, h, (5, 0, 10))
    draw = ImageDraw.Draw(img)
    draw_grid(draw, w, h, step=60, colour=(20, 40, 30))
    draw_circuit_lines(draw, w, h, count=15, colour=CYAN)
    term_lines = [
        "$ ssh root@192.168.1.1 -p 22",
        "root@192.168.1.1's password: ***",
        "Last login: today",
        "root@gateway:~# █",
    ]
    draw_terminal_box(draw, 100, 500, 880, 400, term_lines, title="root@ssh:~$")
    return img

def gen_m3(w=1080, h=1920):
    """Binary rain + neon"""
    img = make_base(w, h, (10, 0, 30))
    draw = ImageDraw.Draw(img)
    # Horizontal scan lines
    for y in range(0, h, 4):
        if y % 8 == 0:
            draw.line([(0, y), (w, y)], fill=(20, 0, 40), width=1)
    draw_binary_stream(draw, w, h, count=15)
    draw.text((200, 300), "DECRYPTING...", fill=CYAN)
    # Progress bar
    for p in range(200, 880):
        draw.point((p, 360), fill=GREEN if p < 650 else YELLOW)
    draw.text((200, 400), "72% COMPLETE", fill=GREEN)
    return img

def gen_m4(w=1080, h=1920):
    """Code scroll"""
    img = make_base(w, h, (0, 5, 10))
    draw = ImageDraw.Draw(img)
    code = [
        "def decrypt(ciphertext, key):",
        "    \"\"\"ChaCha20 decryption\"\"\"",
        "    nonce = ciphertext[:12]",
        "    ct = ciphertext[12:]",
        "    cipher = ChaCha20.new(",
        "        key=key, nonce=nonce)",
        "    return cipher.decrypt(ct)",
        "",
        "def exploit(target):",
        "    payload = build_payload()",
        "    sock = socket.socket()",
        "    sock.connect((target, 4444))",
        "    sock.send(payload)",
        "    return sock.recv(4096)",
    ]
    draw_code_snippet(draw, 50, 200, code)
    draw.text((50, 560), "← INSERT MODE -- main.py", fill=GREY)
    return img

def gen_m5(w=1080, h=1920):
    """Cyberpunk city grid (glowing lines)"""
    img = make_base(w, h, (10, 0, 30))
    draw = ImageDraw.Draw(img)
    # Perspective lines going up
    for i in range(-15, 15):
        a = 1.0 - abs(i) / 15.0
        c = tuple(int(v * a) for v in CYAN)
        draw.line([(w//2 - i * 50, h), (w//2 - i * 10, 0)], fill=c, width=2)
        draw.line([(w//2 + i * 50, h), (w//2 + i * 10, 0)], fill=c, width=2)
    # Glitch text
    draw.text((380, 300), "NEON", fill=PURPLE)
    draw.text((320, 360), "DREAM", fill=CYAN)
    draw.text((300, 420), "v3.0 ██", fill=YELLOW)
    return img

def gen_m6(w=1080, h=1920):
    """Lock icon / security theme"""
    img = make_base(w, h, (0, 5, 10))
    draw = ImageDraw.Draw(img)
    # Firewall / lock pattern
    for _ in range(50):
        x = random.randint(0, w)
        y = random.randint(0, h)
        c = (0, random.randint(80, 200), random.randint(50, 255))
        draw.point((x, y), fill=c)
    # Lock icon (ASCII art style)
    lock_lines = [
        "  .----------------.", 
        " / .--------------. \\",
        "| |  ┌───┐ ┌───┐  | |",
        "| |  │ S │ │ S │  | |",
        "| |  └───┘ └───┘  | |",
        "| |  ┌──────────┐ | |",
        "| |  │  ENCRYPT  │ | |",
        "| |  │  LOCKED   │ | |",
        "| |  └──────────┘ | |",
        "| |  PORT: 443    | |",
        "| |  STATUS: OK   | |",
        " \\ '--------------' /",
        "  '----------------'",
    ]
    draw_text_lines(draw, lock_lines, w//2 - 130, h//2 - 180, YELLOW, 22, 4)
    draw.text((w//2 - 100, h//2 + 120), "SECURE CONNECTION", fill=GREEN)
    draw.text((w//2 - 120, h//2 + 160), "TLS 1.3  |  AES-256", fill=CYAN)
    return img

# ── main ──
DESKTOP_DIR = r"E:\CC\bolg\src\assets\images\DesktopWallpaper"
MOBILE_DIR  = r"E:\CC\bolg\src\assets\images\MobileWallpaper"

os.makedirs(DESKTOP_DIR, exist_ok=True)
os.makedirs(MOBILE_DIR, exist_ok=True)

print("Generating DESKTOP wallpapers (geek style)...")
desktop_generators = [gen_d1, gen_d2, gen_d3, gen_d4, gen_d5, gen_d6]
for i, gen in enumerate(desktop_generators, 1):
    path = os.path.join(DESKTOP_DIR, f"d{i}.avif")
    img = gen()
    img.save(path, format="AVIF", quality=85)
    print(f"  -> {path} ({os.path.getsize(path)//1024} KB)")

print("\nGenerating MOBILE wallpapers (geek style)...")
mobile_generators = [gen_m1, gen_m2, gen_m3, gen_m4, gen_m5, gen_m6]
for i, gen in enumerate(mobile_generators, 1):
    path = os.path.join(MOBILE_DIR, f"m{i}.avif")
    img = gen()
    img.save(path, format="AVIF", quality=85)
    print(f"  -> {path} ({os.path.getsize(path)//1024} KB)")

print("\n✓ DONE — 12 geek wallpapers generated!")

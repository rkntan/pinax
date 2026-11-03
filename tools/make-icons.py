# Draws the extension icon (stacked index-card tabs) as PNGs without any libraries.
# Run: python -I tools/make-icons.py
import os, struct, zlib

INK, PAPER, SIGNAL = (28, 27, 25), (240, 233, 220), (226, 88, 34)

# Shapes on a 16x16 grid: (x0, y0, x1, y1, radius, colour). Later shapes paint over earlier.
SHAPES = [(0, 0, 16, 16, 3.2, INK)]
for i, col in enumerate([PAPER, PAPER, SIGNAL]):
    y = 2.6 + i * 3.9
    tx = 2.4 + i * 3.6
    SHAPES.append((tx, y, tx + 4.4, y + 2.0, 0.6, col))       # the tab
    SHAPES.append((2.4, y + 1.2, 13.6, y + 3.2, 0.6, col))    # the card edge


def inside(px, py, x0, y0, x1, y1, r):
    if not (x0 <= px <= x1 and y0 <= py <= y1):
        return False
    cx = min(max(px, x0 + r), x1 - r)
    cy = min(max(py, y0 + r), y1 - r)
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r


def render(size, ss=4):
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    px = (x + (sx + 0.5) / ss) * 16 / size
                    py = (y + (sy + 0.5) / ss) * 16 / size
                    col = None
                    for *box, c in SHAPES:
                        if inside(px, py, *box):
                            col = c
                    if col:
                        acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2]; acc[3] += 255
            n = ss * ss
            a = acc[3] // n
            k = max(acc[3] // 255, 1)
            row += bytes([acc[0] // k, acc[1] // k, acc[2] // k, a])
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", raw) + chunk(b"IEND", b""))


out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
os.makedirs(out, exist_ok=True)
for s in (16, 32, 48, 128):
    with open(os.path.join(out, f"icon{s}.png"), "wb") as f:
        f.write(render(s))
print("icons written to", os.path.normpath(out))

#!/usr/bin/env python3
"""
Mariner's AI Grid - Wind Barb Asset Generator
Generates SVG wind barb icons following WMO meteorological standards.

Wind barbs point in the direction the wind is coming FROM.
- Short barb = 5 knots
- Long barb = 10 knots
- Pennant (triangle) = 50 knots

Output: PNG files for Mapbox symbol layers.
"""

from PIL import Image, ImageDraw
import math
import os

ASSETS_DIR = "../assets/wind-barbs"
SIZE = 64  # Icon size in pixels
STAFF_LENGTH = 50
BARB_LENGTH = 20
BARB_SPACING = 8
STAFF_COLOR = (255, 255, 255)  # White for dark map
STAFF_WIDTH = 3


def ensure_dir(path):
    if not os.path.exists(path):
        os.makedirs(path)


def draw_wind_barb(speed_kt: int) -> Image.Image:
    """
    Draw a wind barb for the given speed in knots.
    The barb points upward (North) - rotation is handled by Mapbox.
    """
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx, cy = SIZE // 2, SIZE // 2
    staff_end_y = cy - STAFF_LENGTH // 2
    staff_start_y = cy + STAFF_LENGTH // 2

    # Draw staff (vertical line)
    draw.line(
        [(cx, staff_start_y), (cx, staff_end_y)],
        fill=STAFF_COLOR,
        width=STAFF_WIDTH
    )

    if speed_kt < 2:
        # Calm - draw circle at center
        draw.ellipse(
            [cx - 8, cy - 8, cx + 8, cy + 8],
            outline=STAFF_COLOR,
            width=2
        )
        return img

    # Calculate barbs needed
    remaining = speed_kt
    pennants = remaining // 50
    remaining %= 50
    long_barbs = remaining // 10
    remaining %= 10
    short_barbs = 1 if remaining >= 5 else 0

    # Draw from top of staff
    y_pos = staff_end_y + 4

    # Draw pennants (50kt triangles)
    for _ in range(pennants):
        points = [
            (cx, y_pos),
            (cx + BARB_LENGTH, y_pos + BARB_SPACING // 2),
            (cx, y_pos + BARB_SPACING)
        ]
        draw.polygon(points, fill=STAFF_COLOR)
        y_pos += BARB_SPACING + 2

    # Draw long barbs (10kt)
    for _ in range(long_barbs):
        draw.line(
            [(cx, y_pos), (cx + BARB_LENGTH, y_pos - 6)],
            fill=STAFF_COLOR,
            width=STAFF_WIDTH
        )
        y_pos += BARB_SPACING

    # Draw short barb (5kt)
    if short_barbs:
        draw.line(
            [(cx, y_pos), (cx + BARB_LENGTH // 2, y_pos - 3)],
            fill=STAFF_COLOR,
            width=STAFF_WIDTH
        )

    return img


def generate_all_barbs():
    """Generate wind barb icons for 0-65+ knots."""
    ensure_dir(ASSETS_DIR)

    # Calm (< 2kt)
    img = draw_wind_barb(0)
    img.save(os.path.join(ASSETS_DIR, "wind-calm.png"))
    print("Generated: wind-calm.png")

    # 5kt increments up to 65
    for kt in range(5, 70, 5):
        img = draw_wind_barb(kt)
        filename = f"wind-{kt}.png"
        img.save(os.path.join(ASSETS_DIR, filename))
        print(f"Generated: {filename}")

    # 65+ (storm force)
    img = draw_wind_barb(70)
    img.save(os.path.join(ASSETS_DIR, "wind-65plus.png"))
    print("Generated: wind-65plus.png")


if __name__ == "__main__":
    generate_all_barbs()
    print(f"\nAll wind barb icons generated in {ASSETS_DIR}")

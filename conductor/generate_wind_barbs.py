#!/usr/bin/env python3
"""
Mariner's AI Grid - Wind Barb Asset Generator (v2)
Generates high-resolution wind barb icons following WMO meteorological standards.

Wind barbs point in the direction the wind is coming FROM.
- Short barb = 5 knots
- Long barb = 10 knots
- Pennant (triangle) = 50 knots

Output: High-res PNG files (256x256) for Mapbox symbol layers with:
- Anti-aliased rendering
- Dark outline for visibility on any map background
- Proper WMO proportions
"""

from PIL import Image, ImageDraw
import os

ASSETS_DIR = "../assets/wind-barbs"
SIZE = 256  # 4x larger for high-DPI displays
SCALE = SIZE / 64  # Scale factor from original

# Scaled dimensions
STAFF_LENGTH = int(50 * SCALE)
BARB_LENGTH = int(22 * SCALE)  # Slightly longer for visibility
BARB_SPACING = int(9 * SCALE)
STAFF_WIDTH = int(4 * SCALE)  # Thicker staff
BARB_WIDTH = int(3.5 * SCALE)  # Barb thickness
OUTLINE_WIDTH = int(2 * SCALE)  # Dark outline

# Colors
STAFF_COLOR = (255, 255, 255, 255)  # Pure white
OUTLINE_COLOR = (0, 27, 58, 200)  # Dark navy with slight transparency


def ensure_dir(path):
    if not os.path.exists(path):
        os.makedirs(path)


def draw_wind_barb(speed_kt: int) -> Image.Image:
    """
    Draw a wind barb for the given speed in knots.
    The barb points upward (North) - rotation is handled by Mapbox.
    Uses supersampling for anti-aliasing.
    """
    # Render at 2x for anti-aliasing, then downscale
    render_size = SIZE * 2
    scale = render_size / 64

    img = Image.new('RGBA', (render_size, render_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx, cy = render_size // 2, render_size // 2
    staff_length = int(50 * scale)
    barb_length = int(22 * scale)
    barb_spacing = int(9 * scale)
    staff_width = int(5 * scale)
    barb_width = int(4 * scale)
    outline_extra = int(2.5 * scale)

    staff_end_y = cy - staff_length // 2
    staff_start_y = cy + staff_length // 2

    # Helper to draw line with outline
    def draw_outlined_line(points, width):
        # Draw outline first (darker, slightly wider)
        draw.line(points, fill=OUTLINE_COLOR, width=width + outline_extra * 2)
        # Draw main line on top
        draw.line(points, fill=STAFF_COLOR, width=width)

    # Helper to draw polygon with outline
    def draw_outlined_polygon(points):
        # For outline, draw slightly larger polygon
        # Approximate by drawing thick lines around edges + fill
        draw.polygon(points, fill=STAFF_COLOR, outline=OUTLINE_COLOR, width=int(outline_extra))

    if speed_kt < 2:
        # Calm - draw circle at center
        r = int(10 * scale)
        # Outline
        draw.ellipse(
            [cx - r - outline_extra, cy - r - outline_extra,
             cx + r + outline_extra, cy + r + outline_extra],
            outline=OUTLINE_COLOR,
            width=int(3 * scale)
        )
        # Main circle
        draw.ellipse(
            [cx - r, cy - r, cx + r, cy + r],
            outline=STAFF_COLOR,
            width=int(2.5 * scale)
        )
        # Downscale with anti-aliasing
        return img.resize((SIZE, SIZE), Image.LANCZOS)

    # Draw staff (vertical line) with outline
    draw_outlined_line([(cx, staff_start_y), (cx, staff_end_y)], staff_width)

    # Calculate barbs needed
    remaining = speed_kt
    pennants = remaining // 50
    remaining %= 50
    long_barbs = remaining // 10
    remaining %= 10
    short_barbs = 1 if remaining >= 5 else 0

    # Draw from top of staff
    y_pos = staff_end_y + int(4 * scale)

    # Draw pennants (50kt triangles)
    for _ in range(pennants):
        points = [
            (cx, y_pos),
            (cx + barb_length, y_pos + barb_spacing // 2),
            (cx, y_pos + barb_spacing)
        ]
        # Draw outline by drawing filled polygon slightly larger, then main
        outline_points = [
            (cx - outline_extra, y_pos - outline_extra),
            (cx + barb_length + outline_extra, y_pos + barb_spacing // 2),
            (cx - outline_extra, y_pos + barb_spacing + outline_extra)
        ]
        draw.polygon(outline_points, fill=OUTLINE_COLOR)
        draw.polygon(points, fill=STAFF_COLOR)
        y_pos += barb_spacing + int(3 * scale)

    # Draw long barbs (10kt)
    for _ in range(long_barbs):
        barb_end_x = cx + barb_length
        barb_end_y = y_pos - int(7 * scale)
        draw_outlined_line([(cx, y_pos), (barb_end_x, barb_end_y)], barb_width)
        y_pos += barb_spacing

    # Draw short barb (5kt) - half length
    if short_barbs:
        short_length = barb_length // 2
        barb_end_x = cx + short_length
        barb_end_y = y_pos - int(4 * scale)
        draw_outlined_line([(cx, y_pos), (barb_end_x, barb_end_y)], barb_width)

    # Downscale with high-quality anti-aliasing
    return img.resize((SIZE, SIZE), Image.LANCZOS)


def generate_all_barbs():
    """Generate wind barb icons for 0-65+ knots."""
    ensure_dir(ASSETS_DIR)

    # Calm (< 2kt)
    img = draw_wind_barb(0)
    img.save(os.path.join(ASSETS_DIR, "wind-calm.png"), optimize=True)
    print("Generated: wind-calm.png")

    # 5kt increments up to 65
    for kt in range(5, 70, 5):
        img = draw_wind_barb(kt)
        filename = f"wind-{kt}.png"
        img.save(os.path.join(ASSETS_DIR, filename), optimize=True)
        print(f"Generated: {filename}")

    # 65+ (storm force)
    img = draw_wind_barb(70)
    img.save(os.path.join(ASSETS_DIR, "wind-65plus.png"), optimize=True)
    print("Generated: wind-65plus.png")


if __name__ == "__main__":
    generate_all_barbs()
    print(f"\nAll wind barb icons generated in {ASSETS_DIR} (256x256 with anti-aliasing)")

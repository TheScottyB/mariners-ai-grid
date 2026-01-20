from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math
import os

# Configuration
ASSETS_DIR = "../assets"
PALETTE = {
    "deep_ocean": (0, 27, 58),       # #001B3A
    "mid_ocean": (0, 72, 102),       # #004866
    "surface_teal": (0, 96, 100),    # #006064
    "signal_amber": (255, 179, 0),   # #FFB300
    "glass_highlight": (255, 255, 255, 180),
    "glass_shadow": (0, 0, 0, 80),
    "text_white": (240, 248, 255)
}

def ensure_dir(path):
    if not os.path.exists(path):
        os.makedirs(path)

def create_gradient(width, height, start_color, end_color):
    base = Image.new('RGB', (width, height), start_color)
    top = Image.new('RGB', (width, height), end_color)
    mask = Image.new('L', (width, height))
    mask_data = []
    for y in range(height):
        for x in range(width):
            # Diagonal gradient
            p = (x + y) / (width + height)
            mask_data.append(int(255 * p))
    mask.putdata(mask_data)
    base.paste(top, (0, 0), mask)
    return base

def draw_glass_overlay(draw, width, height):
    # Top-left glossy reflection (elliptical)
    # This simulates the "Liquid Glass" look
    # Semi-transparent white
    
    # We'll draw a shape and blur it
    overlay = Image.new('RGBA', (width, height), (0,0,0,0))
    o_draw = ImageDraw.Draw(overlay)
    
    # Highlight shape: Top half/third curved
    # Coordinates for a large ellipse that intersects the top left
    bounds = [-width*0.2, -height*0.2, width*1.2, height*0.6]
    o_draw.chord(bounds, start=180, end=0, fill=(255, 255, 255, 40))
    
    # Specular highlight (stronger, smaller)
    bounds_spec = [width*0.1, height*0.1, width*0.9, height*0.4]
    o_draw.ellipse(bounds_spec, fill=(255, 255, 255, 20))
    
    return overlay

def draw_compass_symbol(draw, cx, cy, radius, color):
    # 4-point star
    points = [
        (cx, cy - radius),          # Top
        (cx + radius * 0.25, cy - radius * 0.25),
        (cx + radius, cy),          # Right
        (cx + radius * 0.25, cy + radius * 0.25),
        (cx, cy + radius),          # Bottom
        (cx - radius * 0.25, cy + radius * 0.25),
        (cx - radius, cy),          # Left
        (cx - radius * 0.25, cy - radius * 0.25)
    ]
    draw.polygon(points, fill=color)
    
    # Inner ring
    ring_radius = radius * 0.6
    bbox = [cx - ring_radius, cy - ring_radius, cx + ring_radius, cy + ring_radius]
    draw.ellipse(bbox, outline=color, width=int(radius * 0.05))
    
    # Center dot
    dot_radius = radius * 0.15
    bbox_dot = [cx - dot_radius, cy - dot_radius, cx + dot_radius, cy + dot_radius]
    draw.ellipse(bbox_dot, fill=PALETTE['text_white'])

def generate_app_icon():
    size = 1024
    img = create_gradient(size, size, PALETTE['mid_ocean'], PALETTE['deep_ocean'])
    draw = ImageDraw.Draw(img, 'RGBA')
    
    # 1. Subtle grid lines (The "Grid" in AI Grid)
    step = size // 8
    for i in range(1, 8):
        # Vertical
        draw.line([(i * step, 0), (i * step, size)], fill=(255, 255, 255, 10), width=2)
        # Horizontal
        draw.line([(0, i * step), (size, i * step)], fill=(255, 255, 255, 10), width=2)
        
    # 2. Main Symbol (Compass)
    center = size // 2
    radius = size * 0.35
    
    # Shadow
    draw_compass_symbol(draw, center+10, center+10, radius, PALETTE['glass_shadow'])
    # Symbol
    draw_compass_symbol(draw, center, center, radius, PALETTE['signal_amber'])
    
    # 3. Liquid Glass Overlay
    glass = draw_glass_overlay(draw, size, size)
    img.paste(glass, (0,0), glass)
    
    # 4. Border (Glass Edge)
    draw.rectangle([0, 0, size-1, size-1], outline=(255, 255, 255, 30), width=4)
    
    filename = os.path.join(ASSETS_DIR, "app-icon.png")
    img.save(filename)
    print(f"Generated: {filename}")

def generate_adaptive_icon():
    # Android Foreground (Transparent BG)
    size = 1024
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img, 'RGBA')
    
    center = size // 2
    radius = size * 0.35 # Slightly smaller safe zone
    
    # Symbol
    draw_compass_symbol(draw, center, center, radius, PALETTE['signal_amber'])
    
    # Simple gloss on symbol only
    # (Simplified for adaptive icon to avoid clipping issues)
    
    filename = os.path.join(ASSETS_DIR, "adaptive-icon.png")
    img.save(filename)
    print(f"Generated: {filename}")

def generate_splash_screen():
    width, height = 1242, 2436
    img = create_gradient(width, height, PALETTE['mid_ocean'], PALETTE['deep_ocean'])
    draw = ImageDraw.Draw(img, 'RGBA')
    
    # Grid background
    step = 150
    for y in range(0, height, step):
         draw.line([(0, y), (width, y)], fill=(255, 255, 255, 5), width=2)
    for x in range(0, width, step):
         draw.line([(x, 0), (x, height)], fill=(255, 255, 255, 5), width=2)

    cx, cy = width // 2, height // 2
    
    # Large Compass Icon
    radius = 300
    draw_compass_symbol(draw, cx, cy - 200, radius, PALETTE['signal_amber'])
    
    # Text (Approximation without custom font file)
    # We won't try to load a font to avoid errors, just geometric shapes or basic default text if possible
    # But usually default font is tiny.
    # We'll just stick to the iconography for now, or assume PIL default font is legible.
    # Better: Draw "MARINER'S AI" using simple lines or just rely on the icon.
    # Let's try to load a default font, scaling it up if possible.
    try:
        # Try a common linux font
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", 80)
    except:
        try:
             # Try macOS
             font = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 80, index=0)
        except:
             # Fallback
             font = ImageFont.load_default()
             # Can't scale bitmap font easily
    
    try:
        text = "MARINER'S AI"
        # draw.text((cx - 250, cy + 200), text, fill=PALETTE['text_white'], font=font)
        # Centering text
        bbox = draw.textbbox((0,0), text, font=font)
        text_w = bbox[2] - bbox[0]
        draw.text((cx - text_w//2, cy + 200), text, fill=PALETTE['text_white'], font=font)
        
        text2 = "WAZE FOR SAILORS"
        font2 = font.font_variant(size=40) if hasattr(font, 'font_variant') else font
        bbox2 = draw.textbbox((0,0), text2, font=font2)
        text_w2 = bbox2[2] - bbox2[0]
        draw.text((cx - text_w2//2, cy + 300), text2, fill=(200, 200, 200), font=font2)
    except Exception as e:
        print(f"Could not draw text: {e}")

    filename = os.path.join(ASSETS_DIR, "splash-icon.png")
    img.save(filename)
    print(f"Generated: {filename}")

def generate_favicon():
    size = 48
    img = Image.new('RGB', (size, size), PALETTE['deep_ocean'])
    draw = ImageDraw.Draw(img)
    
    draw_compass_symbol(draw, size//2, size//2, size*0.4, PALETTE['signal_amber'])
    
    filename = os.path.join(ASSETS_DIR, "favicon.png")
    img.save(filename)
    print(f"Generated: {filename}")

def generate_liquid_glass_icon():
    size = 1024
    layer_dir = os.path.join(ASSETS_DIR, "app.icon", "layers")
    ensure_dir(layer_dir)
    
    # 1. Background Layer (Gradient + Grid)
    bg = create_gradient(size, size, PALETTE['mid_ocean'], PALETTE['deep_ocean'])
    bg_draw = ImageDraw.Draw(bg, 'RGBA')
    step = size // 8
    for i in range(1, 8):
        bg_draw.line([(i * step, 0), (i * step, size)], fill=(255, 255, 255, 10), width=2)
        bg_draw.line([(0, i * step), (size, i * step)], fill=(255, 255, 255, 10), width=2)
    bg.save(os.path.join(layer_dir, "background.png"))
    
    # 2. Middle Layer (Compass Symbol + Shadow)
    mid = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    mid_draw = ImageDraw.Draw(mid, 'RGBA')
    center = size // 2
    radius = size * 0.35
    draw_compass_symbol(mid_draw, center+10, center+10, radius, PALETTE['glass_shadow'])
    draw_compass_symbol(mid_draw, center, center, radius, PALETTE['signal_amber'])
    mid.save(os.path.join(layer_dir, "middle.png"))
    
    # 3. Foreground Layer (Glass Highlights + Edge)
    fg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    fg_draw = ImageDraw.Draw(fg, 'RGBA')
    glass = draw_glass_overlay(fg_draw, size, size)
    fg.paste(glass, (0,0), glass)
    fg_draw.rectangle([0, 0, size-1, size-1], outline=(255, 255, 255, 40), width=6)
    fg.save(os.path.join(layer_dir, "foreground.png"))
    
    # 4. Contents.json
    contents = {
        "images": [
            {"filename": "layers/background.png", "idiom": "universal", "scale": "1x", "layer": "background"},
            {"filename": "layers/middle.png", "idiom": "universal", "scale": "1x", "layer": "middle"},
            {"filename": "layers/foreground.png", "idiom": "universal", "scale": "1x", "layer": "foreground"}
        ],
        "info": {"version": 1, "author": "expo", "liquid-glass": True}
    }
    import json
    with open(os.path.join(ASSETS_DIR, "app.icon", "Contents.json"), "w") as f:
        json.dump(contents, f, indent=2)
    
    print(f"Generated Liquid Glass Icon layers in {layer_dir}")

def generate_marketing_screenshots():
    # iPhone 16 Pro Max dimensions approx 1290 x 2796
    width, height = 1290, 2796
    shot_dir = os.path.join(ASSETS_DIR, "marketing")
    ensure_dir(shot_dir)
    
    titles = [
        "SOVEREIGN AI NAVIGATION",
        "ZERO-LATENCY SEARCH",
        "OFFLINE WEATHER GRID",
        "TRUTH-VERIFIED SENSORS"
    ]
    
    for i, title in enumerate(titles):
        img = create_gradient(width, height, PALETTE['deep_ocean'], PALETTE['mid_ocean'])
        draw = ImageDraw.Draw(img, 'RGBA')
        
        # Grid overlay
        step = 100
        for y in range(0, height, step):
            draw.line([(0, y), (width, y)], fill=(255, 255, 255, 5), width=1)
        for x in range(0, width, step):
            draw.line([(x, 0), (x, height)], fill=(255, 255, 255, 5), width=1)
            
        # Placeholder for Map/UI
        draw.rectangle([100, 400, width-100, height-600], outline=PALETTE['signal_amber'], width=4)
        draw.text((width//2, height//2), "MOCK UI PREVIEW", fill=(100, 100, 100), anchor="mm")
        
        # Title
        try:
            font = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 70, index=0)
        except:
            font = ImageFont.load_default()
            
        bbox = draw.textbbox((0,0), title, font=font)
        tw = bbox[2] - bbox[0]
        draw.text(((width - tw)//2, 200), title, fill=PALETTE['text_white'], font=font)
        
        filename = os.path.join(shot_dir, f"screenshot_{i+1}.png")
        img.save(filename)
        print(f"Generated Marketing Screenshot: {filename}")

if __name__ == "__main__":
    ensure_dir(ASSETS_DIR)
    generate_app_icon()
    generate_adaptive_icon()
    generate_splash_screen()
    generate_favicon()
    generate_liquid_glass_icon()
    generate_marketing_screenshots()

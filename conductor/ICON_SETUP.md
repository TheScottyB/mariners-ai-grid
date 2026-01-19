# iOS Liquid Glass Icon Setup Guide

## Overview

iOS 26 introduces **Liquid Glass** icons - a new dynamic icon format that provides depth, glassmorphic effects, and adaptive lighting. Your app is configured to use this format for MVP launch.

## Current Configuration

### app.json
```json
{
  "icon": "./assets/app-icon.png",  // Fallback for Android/web
  "ios": {
    "icon": "./assets/app.icon"     // iOS 26 Liquid Glass directory
  }
}
```

## Required Asset Structure

Create the following directory structure:

```
assets/
├── app-icon.png           # Fallback (1024x1024, Android/web)
├── adaptive-icon.png      # Android adaptive icon
├── splash-icon.png        # Splash screen
├── favicon.png            # Web favicon
└── app.icon/              # iOS Liquid Glass directory
    ├── Contents.json      # Icon metadata
    ├── layers/            # Multi-layer composition
    │   ├── background.png
    │   ├── middle.png
    │   └── foreground.png
    └── variants/          # Size variants
        ├── 1024.png
        ├── 512.png
        └── 180.png
```

## Generating Liquid Glass Icons

### Option 1: Using Expo's Icon Generator (Recommended)

```bash
# Install icon generator
npm install -g @expo/icon-generator

# Generate from a single 1024x1024 source
expo-icon-generator generate \
  --input ./design/icon-source.png \
  --output ./assets \
  --liquid-glass
```

### Option 2: Using Figma/Sketch Export

Design requirements for manual export:
- **Layers**: Export as separate PNGs (background, middle, foreground)
- **Depth map**: Optional grayscale heightmap for 3D effect
- **Tint layers**: For glassmorphic color adaptation

### Option 3: AI Generation (Claude/Midjourney)

Prompt template for AI icon generation:
```
Create a marine navigation app icon in iOS Liquid Glass style:
- Central element: Compass rose or weather grid
- Color palette: Deep ocean blues (#0A2463), nautical gold (#FFD700)
- Style: Glassmorphic, depth layers, subtle gradients
- Requirements: 1024x1024, transparency support, 3 depth layers
```

## Liquid Glass Design Principles

### 1. Layered Composition
- **Background**: Solid foundation (ocean, sky gradient)
- **Middle**: Main icon element (compass, grid lines)
- **Foreground**: Highlights, glints, depth details

### 2. Glassmorphic Effects
- Semi-transparent layers with blur
- Subtle reflections and refractions
- Adaptive lighting (responds to device tilt)

### 3. Marine Theme for Mariner's AI Grid
Suggested visual elements:
- **Primary**: Weather grid overlay on ocean surface
- **Secondary**: Compass rose with AI circuit aesthetics
- **Accent**: Satellite signal waves or navigation stars

## Contents.json Template

Create `assets/app.icon/Contents.json`:

```json
{
  "images": [
    {
      "filename": "layers/background.png",
      "idiom": "universal",
      "scale": "1x",
      "layer": "background"
    },
    {
      "filename": "layers/middle.png",
      "idiom": "universal",
      "scale": "1x",
      "layer": "middle"
    },
    {
      "filename": "layers/foreground.png",
      "idiom": "universal",
      "scale": "1x",
      "layer": "foreground"
    }
  ],
  "info": {
    "version": 1,
    "author": "expo",
    "liquid-glass": true
  }
}
```

## Quick Start: Placeholder Icons

For immediate testing, create placeholder assets:

```bash
# Navigate to assets directory
cd assets

# Create Liquid Glass directory
mkdir -p app.icon/layers

# Generate placeholder 1024x1024 image (requires ImageMagick)
magick -size 1024x1024 \
  gradient:#0A2463-#1E88E5 \
  app-icon.png

# Or use Python PIL
python3 << EOF
from PIL import Image, ImageDraw
img = Image.new('RGB', (1024, 1024), color='#0A2463')
draw = ImageDraw.Draw(img)
draw.ellipse([312, 312, 712, 712], fill='#1E88E5')
img.save('app-icon.png')
EOF
```

## Testing Liquid Glass Icons

### Local Preview
```bash
# Start Expo dev server
npx expo start

# Run on iOS Simulator (requires macOS)
npx expo run:ios

# Check icon in home screen
# Tilt simulator to see dynamic lighting
```

### EAS Build Preview
```bash
# Build with new icon assets
eas build --profile preview --platform ios

# Install on physical device via TestFlight
# Liquid Glass effects only visible on real hardware
```

## Icon Validation Checklist

Before submitting to App Store:

- [ ] `app.icon/` directory exists with Contents.json
- [ ] All layer images are 1024x1024 PNG
- [ ] Layers have proper transparency (alpha channel)
- [ ] Fallback `app-icon.png` exists for Android
- [ ] Icon renders correctly in iOS Simulator
- [ ] Liquid Glass effects tested on physical iPhone
- [ ] No copyright violations in icon design
- [ ] Icon meets Apple's [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/app-icons)

## Design Resources

### Color Palette (Marine Navigation Theme)
```
Primary:   #0A2463 (Deep Ocean Blue)
Secondary: #1E88E5 (Nautical Blue)
Accent:    #FFD700 (Navigation Gold)
Glass:     #FFFFFF80 (Semi-transparent white)
Shadow:    #00000040 (Depth shadow)
```

### Inspiration
- Apple Weather app (glassmorphic weather data)
- Marine charts aesthetic (NOAA/nautical colors)
- Signal K dashboard (modern boat instrumentation)

## Troubleshooting

### "Icon directory not found"
- Verify `app.icon/` exists in `assets/`
- Check Contents.json syntax
- Ensure file paths in Contents.json are relative

### "Liquid Glass not rendering"
- Liquid Glass requires iOS 26+ (check simulator version)
- Effects only visible on physical devices, not all simulators
- Verify `"liquid-glass": true` in Contents.json

### "Build fails with icon error"
- Run `npx expo prebuild --clean` to regenerate native projects
- Check EAS build logs for specific asset errors
- Ensure all referenced files exist

## Next Steps

1. **Design icon** using one of the methods above
2. **Generate assets** with proper layer structure
3. **Test locally** with `npx expo start`
4. **Build preview** with `eas build --profile preview`
5. **Validate** on physical iPhone to see Liquid Glass effects

---

**Note:** Liquid Glass icons significantly improve App Store visibility and user perception. Investing time in quality icon design is critical for MVP launch.

# Mariner's AI Grid - Conductor Documentation

## Project Overview

**Mariner's AI Grid** is a safety-critical mobile application for offshore mariners that provides AI-enhanced weather forecasting and route optimization. Think "Waze for the ocean" - combining professional meteorological data with crowdsourced real-time observations.

### The Core Problem
Offshore sailors face a dangerous bandwidth gap:
- **Global weather models**: 10-50GB files (impossible to download via satellite)
- **Satellite bandwidth**: $2-7/MB on Starlink/Iridium
- **Safety requirement**: Real-time weather data 500+ miles from shore

### The Solution: Regional "Slicing"
Instead of downloading massive global files, we extract only the 500nm radius around your route:
- **Global model**: 10GB ❌
- **Regional slice**: 2.1MB (Parquet) ✅
- **Compression**: **2000x reduction**, achievable via Maverick quantization rules.

### 📊 Performance: The Pacific Seed Audit
- **Wind (0.5kt precision):** +15% compression gain.
- **Direction (5° precision):** +20% compression gain.
- **Ingest Speed:** <50ms via Apache Arrow.
- **OpEx:** ~$4.20 per regional forecast via Starlink.

### 🌐 The Open Data Advantage
As of **Oct 1, 2025**, the ECMWF has moved to full Open Data status. Our slicer pulls the **native 9km resolution AIFS data** at zero information cost, enabling premium high-res navigation for the entire fleet.

## Architecture

### Mobile App (Expo SDK 54)
```
mariners-ai-grid/
├── app/                    # React Native screens
├── components/             # Reusable UI components
├── services/               # API clients, data fetching
├── store/                  # State management (TanStack Query + Zustand)
├── types/                  # TypeScript definitions
└── conductor/              # Python backend & AI logic
    ├── slicer.py          # Regional weather extraction
    ├── inference.py       # Local AI model runner
    └── signal-k.py        # NMEA 2000 bridge
```

### Technology Stack

#### Frontend (Mobile)
- **Framework**: Expo SDK 54 (Managed Workflow + CNG)
- **Language**: TypeScript (Strict Mode)
- **State**: TanStack Query (server) + Zustand (UI)
- **Maps**: Mapbox GL Native (@rnmapbox/maps)
- **Sensors**: expo-sensors, expo-location

#### Backend (Python)
- **Data Processing**: NumPy, Xarray (weather grids)
- **Storage**: Parquet (columnar), Zarr (cloud-optimized)
- **AI Inference**: ONNX Runtime, CoreML
- **Marine Bridge**: Signal K client (WebSocket)

#### DevOps
- **Build**: EAS (Expo Application Services)
- **CI/CD**: GitHub Actions → EAS Build → TestFlight
- **Updates**: OTA (Over-The-Air) for JS hotfixes
- **Signing**: EAS Credentials (automated)

## Development Philosophy

### "Zero-Xcode" Rule
With Expo SDK 54's Continuous Native Generation (CNG), AI agents should **never** ask you to open Xcode or Android Studio. All native configuration happens via:

1. **Config Plugins** (in `app.json`)
2. **Expo Modules** (custom native code via `expo-module-scripts`)
3. **EAS Build** (cloud-based compilation)

### AI Agent Orchestration

This project is designed to be built **with** AI agents, not just **by** you:

- **Claude Code**: Writes TypeScript/React Native UI components
- **Gemini Conductor**: Handles Python data processing and AI inference
- **EAS**: Automates App Store submissions and screenshot generation

The `conductor/` directory contains Python code that AI agents can modify without touching the mobile app's native layers.

### "Managed Cloud" Testing
Use **EAS Build** (cloud) for heavy compilation:
- Leaves your M-series Mac free for running Claude/Gemini at full speed
- Automatic code signing and provisioning
- Parallel iOS + Android builds

## Key Files

### `tech-stack.md`
"Truth source" for AI agents - prevents hallucinating outdated React Native patterns.

### `slicer.py`
Core logic for regional weather extraction. This is where the bandwidth optimization happens.

### `app.json`
Native app configuration including:
- Bundle identifiers
- Permissions (Location, Network)
- iOS/Android platform settings
- Config Plugins

### `eas.json`
Build profiles and App Store submission automation:
- `development`: Internal testing builds
- `preview`: TestFlight/Internal distribution
- `production`: App Store releases

## Workflow

### 1. Local Development
```bash
# Start Expo development server
npx expo start

# Run on iOS simulator
npx expo run:ios

# Run on Android emulator
npx expo run:android
```

### 2. Cloud Builds (via EAS)
```bash
# Preview build for internal testing
eas build --profile preview --platform all

# Production build for App Store
eas build --profile production --platform all
```

### 3. App Store Submission
```bash
# Submit to TestFlight (iOS)
eas submit --platform ios

# Submit to Google Play (Android)
eas submit --platform android
```

### 4. OTA Updates (Skip App Review)
```bash
# Push JS-only updates directly to users
eas update --branch production --message "Fix weather grid rendering"
```

## Critical Advantages of Expo SDK 54

### 1. Continuous Native Generation (CNG)
- Write custom native modules (NMEA 2000, AI inference)
- No "ejecting" required
- AI agents handle Xcode/Gradle complexity

### 2. EAS as "Co-worker"
- Automated code signing
- Screenshot generation
- Single-command App Store submission
- Exactly the "get it approved for me" tool we need

### 3. OTA Updates
- Push bug fixes in 5 minutes (not 2-day Apple review)
- Critical for safety-critical weather app
- Social "Waze" layer updates independently

### 4. SQLite Vector Support
`expo-sqlite/vec` enables:
- Local storage of crowdsourced hazard reports as vectors
- Instant search: "Recent hazards within 50 miles"
- Works completely offline

## Slicer Module (ECMWF HRES)

The `slicer/` package handles the core 10GB → 5MB reduction:

```
conductor/slicer/
├── __init__.py      # Package exports
├── core.py          # BoundingBox, WeatherSeed, ECMWFHRESSlicer
├── variables.py     # Marine variable definitions & pruning
├── export.py        # Parquet/Protobuf Seed export
└── cli.py           # Command-line interface (mag-slicer)
```

### Quick Start

```bash
# Install dependencies (requires uv)
cd conductor
uv sync --extra dev

# Run demo (Pacific crossing scenario)
uv run mag-slicer demo

# Extract custom region
uv run mag-slicer slice --lat 21.3 --lon -157.8 --radius 500 --hours 72

# Estimate size before download
uv run mag-slicer estimate --lat 37.0 --lon -122.4 --radius 300
```

### Key Capabilities

1. **Geographical Cropping**: Extract 500nm radius from global model
2. **Variable Pruning**: 100+ ECMWF variables → 8-15 marine essentials
3. **Seed Export**: Zstandard-compressed Protobuf (~5MB typical)
4. **CDS API Integration**: Direct ECMWF HRES data fetching
5. **Offline Mode**: Mock data for development without API access

### Marine Variables (Standard Set)

| Variable | Description | Units |
|----------|-------------|-------|
| u10, v10 | 10m wind components | m/s |
| gust | Wind gust speed | m/s |
| msl | Mean sea level pressure | Pa |
| swh | Significant wave height | m |
| mwp | Mean wave period | s |
| mwd | Mean wave direction | degrees |
| tp | Total precipitation | m |

## Next Steps

1. **Build basic UI screens**
   - Map view with weather overlay
   - Route planning interface
   - Satellite bandwidth estimator

2. **Signal K bridge**
   - WebSocket connection to boat's NMEA 2000 system
   - Real-time sensor data ingestion (GPS, barometer, wind)

3. **Local AI inference (GraphCast)**
   - JAX/ONNX Runtime integration
   - Weather model fine-tuning with local observations

4. **Social "Waze" layer**
   - User-submitted hazard reports
   - Vector similarity search for nearby events
   - Privacy-preserving location handling

5. **Managed Compute integration**
   - Cloud slicer service for bandwidth-constrained vessels
   - Pre-computed regional Seeds for popular routes

## Questions for AI Agents

When working on this project, AI agents should reference these principles:

**Q: Should I suggest opening Xcode?**
A: No. Use Config Plugins or Expo Modules instead.

**Q: Should I use bare React Native commands?**
A: No. Use `npx expo` commands (managed workflow).

**Q: Should I commit directly to production?**
A: No. Use EAS Build profiles (preview → production).

**Q: Should I download full GFS files?**
A: No. Use the `slicer.py` regional extraction.

**Q: Should I store weather data in JSON?**
A: No. Use Parquet (columnar, compressed, AI-ready).

---

**Philosophy**: Expo SDK in 2026 is not a beginner's trade-off—it's the most sophisticated way to build for the App Store, especially when orchestrating with AI agents.

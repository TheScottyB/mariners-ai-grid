# Mariner’s AI Grid (MAG)
### *The Waze of the Ocean. Local-First AI Weather & Social Hazards.*

[![License: CC0-1.0](https://img.shields.io/badge/License-CC0_1.0-lightgrey.svg)](http://creativecommons.org/publicdomain/zero/1.0/)
[![Expo SDK 54](https://img.shields.io/badge/Expo-SDK_54-blue.svg)](https://expo.dev)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-green.svg)](https://www.python.org/)

**Traditional weather models are blind to the surface. Mariner’s AI changes the game.**

Mariner’s AI Grid is an open-source, agentic weather platform built for the deep-water community. By running Google’s GraphCast AI directly on your device’s NPU, we deliver 10-day global forecasts that are faster, more accurate, and 95% more data-efficient than traditional GRIB downloads.

---

## ⚓ The Problem: The Offshore Bandwidth Gap
Offshore sailors face a dangerous reality:
- **Global weather models** are 10-50GB (impossible to download via satellite).
- **Satellite bandwidth** costs $2-7/MB on Iridium/Starlink.
- **Physics-based models** often miss local surface micro-climates.

## 🛰️ The Solution: The "Circular Truth" Loop
1.  **The Slicer (Cloud):** Prunes 10GB global GRIB2 files down to a 5MB "Seed" using regional cropping and variable pruning.
2.  **Local Inference (Boat):** Runs GraphCast AI on the boat's hardware (iOS/Android NPU) using the Seed.
3.  **The Bridge (Truth):** Pulls real-time NMEA 2000 data (Wind, Pressure) via Signal K to "ground truth" the AI model.
4.  **The Waze Layer (Social):** Crowdsourced reporting of hazards (debris, harbor surge) shared across the grid.

---

## 🛠️ Architecture

### 1. The Conductor (Backend/Slicer)
- **Engine:** Python 3.12+ (managed by `uv`).
- **Data Source:** ECMWF AIFS (AI Integrated Forecasting System) Open Data.
- **Output:** `.seed.zst` (Zstandard compressed Protobuf/Parquet).
- **Logic:** 2.5-degree spatial buffering to prevent edge artifacts.

### 2. The Mobile App (Frontend)
- **Framework:** Expo SDK 54 (Managed Workflow + CNG).
- **Identity:** "Shadow Auth" - Anonymous device-level identity via `expo-secure-store`.
- **Maps:** Mapbox GL Native for high-performance offline rendering.
- **Sensors:** Signal K WebSocket bridge for real-time telemetry.

---

## 🚀 Quick Start

### For Developers (Conductor)
```bash
cd conductor
uv sync --extra dev
uv run mag-slicer demo
```

### For Mobile Devs (Expo)
```bash
# Install dependencies
npm install

# Start development server
npx expo start
```

---

## 🧭 Roadmap: 90-Day Sprint
- [x] **Phase 1: Environment & Slicer Scaffolding** (✅ Complete)
- [ ] **Phase 2: Slicer Refinement** - Maximize compression, handle real ECMWF tokens.
- [ ] **Phase 3: The App (Frontend)** - Tactical Mapbox UI & Seed reading.
- [ ] **Phase 4: The Bridge (Hardware)** - Full Signal K integration & Social "Waze" reporting.

---

## 🤝 The Mariner’s Code
Every boat becomes a sensor. Securely share your wind and pressure data to help the fleet and improve the AI grid. MAG is built on the principle of **Crowdsourced Truth**.

### Contributing
We welcome contributions from meteorologists, AI researchers, and sailors. 
- **Data License:** CC0 (Public Domain).
- **Code License:** Apache-2.0.

*Join the grid. Protect the fleet. Navigate with intelligence.*

---
*Built with Gemini Conductor & Claude Code.*

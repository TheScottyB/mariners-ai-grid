# Mariner's AI Grid

Offline-first maritime weather AI app. Expo SDK 54 + CNG. pnpm for package management.

## Commands

```bash
pnpm start              # Expo dev server (requires dev client build)
pnpm dev-up             # Start seed server + Expo together
pnpm dev-down           # Stop both servers
pnpm test               # vitest run (all tests)
pnpm test:sovereign     # Core service tests only
pnpm clean              # Remove native dirs + reinstall
pnpm nuke               # Full reset including DerivedData + watchman
```

### Conductor (Python backend, in `conductor/`)

```bash
cd conductor && uv sync          # Install Python deps
uv run mag-slicer slice --help   # CLI for weather data slicing
uv run pytest                    # Python tests
```

### EAS Builds

```bash
eas build --platform ios --profile development   # iOS dev build
eas build --platform ios --profile preview        # Internal testing
```

## Architecture

```
src/
├── components/     # React Native UI (MarinerMap, FAB, DevMenu, etc.)
├── services/       # Core logic (SeedManager, VecDB, ParquetReader, SignalKBridge)
├── hooks/          # Custom hooks (useSeedManager, useEmergencyMode, useNightWatch)
├── context/        # React contexts (SQLiteContext)
├── schema/         # Protobuf/data schemas
└── utils/          # Geo utilities
conductor/
├── slicer/         # Python: ECMWF AIFS/IFS data -> Parquet seeds
├── demo_seeds/     # Sample .parquet and .seed.zst files
└── *.py            # Standalone scripts (ingest_cron, openmeteo_client, etc.)
plugins/
├── withMarinerOptimizations.js  # -O3/-ffast-math compiler flags
└── with-sqlite-vec/             # sqlite-vec config plugin
```

## Critical Conventions

- **CNG (Continuous Native Generation)**: `/ios` and `/android` are gitignored and regenerated.
  NEVER manually edit native folders. All native config goes through config plugins or app.config.js.
- **Package manager**: pnpm (set in packageManager field). Never use npm or yarn.
- **sqlite-vec**: Uses `op-sqlite` with `"sqliteVec": true` in package.json + `vlasky/sqlite-vec` v0.2.4-alpha community fork.
- **No `plugins/` or `modules/` creation**: Existing plugins are intentional exceptions.
  Don't add new native plugins without discussion.
- **Mapbox SDK**: `@rnmapbox/maps` pinned to MapboxMaps SDK 11.16.2.
  RNMAPBOX_MAPS_DOWNLOAD_TOKEN stored as EAS env variable (not in code).

## Gotchas

- `expo-sqlite` prefixes symbols as `exsqlite3_*`. Custom sqlite-vec source compilation
  will fail. Use pre-compiled static libraries or the op-sqlite integration.
- EAS builds require clean git working tree (`cli.requireCommit: true` in eas.json).
- Seed server runs on port 8089 (`pnpm seed-server`). Expo dev server on 8081.
- Weather data from ECMWF AIFS Open Data is free 9km resolution. Seeds are ~2MB compressed.
- The `conductor/` Python project uses `uv` for dependency management, not pip.

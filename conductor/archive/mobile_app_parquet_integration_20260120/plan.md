# Implementation Plan - Mobile App Parquet Integration

## Phase 1: Investigation & Dependency Setup
- [x] Task: Evaluate Parquet libraries for React Native
    - [x] Sub-task: Create a small reproduction script to test `parquet-wasm` or `apache-arrow` read capabilities in the Expo environment.
    - [x] Sub-task: Select the best library (likely `parquet-wasm` or a pure JS alternative if performance permits).
- [x] Task: Install Dependencies
    - [x] Sub-task: Add selected package to `package.json`.
    - [x] Sub-task: Configure Metro bundler if WASM is required.

## Phase 2: SeedManager Refactoring
- [x] Task: Implement Parquet Reader
    - [x] Sub-task: Create `ParquetReader.ts` service.
    - [x] Sub-task: Implement `read(fileUri)` method returning `WeatherSeed` structure.
    - [x] Sub-task: Handle Zstd decompression if not handled by the library (Parquet often has internal compression).
- [x] Task: Integrate into SeedManager
    - [x] Sub-task: Update `SeedManager.parseParquetSeed` to use the new reader.
    - [x] Sub-task: Ensure `downloadSeed` and `importLocalSeed` handle the `.parquet` extension correctly.

## Phase 3: Verification & Polish
- [x] Task: Update Tooling
    - [x] Sub-task: Update `scripts/SeedUploader.ts` to support `.parquet` uploads.
- [x] Task: End-to-End Verification
    - [x] Sub-task: Run `seed_server`.
    - [x] Sub-task: Download a Parquet seed in the app.
    - [x] Sub-task: Verify data visualization matches the Protobuf version.

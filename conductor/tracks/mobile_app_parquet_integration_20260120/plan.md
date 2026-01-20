# Implementation Plan - Mobile App Parquet Integration

## Phase 1: Investigation & Dependency Setup
- [ ] Task: Evaluate Parquet libraries for React Native
    - [ ] Sub-task: Create a small reproduction script to test `parquet-wasm` or `apache-arrow` read capabilities in the Expo environment.
    - [ ] Sub-task: Select the best library (likely `parquet-wasm` or a pure JS alternative if performance permits).
- [ ] Task: Install Dependencies
    - [ ] Sub-task: Add selected package to `package.json`.
    - [ ] Sub-task: Configure Metro bundler if WASM is required.

## Phase 2: SeedManager Refactoring
- [ ] Task: Implement Parquet Reader
    - [ ] Sub-task: Create `ParquetReader.ts` service.
    - [ ] Sub-task: Implement `read(fileUri)` method returning `WeatherSeed` structure.
    - [ ] Sub-task: Handle Zstd decompression if not handled by the library (Parquet often has internal compression).
- [ ] Task: Integrate into SeedManager
    - [ ] Sub-task: Update `SeedManager.parseParquetSeed` to use the new reader.
    - [ ] Sub-task: Ensure `downloadSeed` and `importLocalSeed` handle the `.parquet` extension correctly.

## Phase 3: Verification & Polish
- [ ] Task: Update Tooling
    - [ ] Sub-task: Update `scripts/SeedUploader.ts` to support `.parquet` uploads.
- [ ] Task: End-to-End Verification
    - [ ] Sub-task: Run `seed_server`.
    - [ ] Sub-task: Download a Parquet seed in the app.
    - [ ] Sub-task: Verify data visualization matches the Protobuf version.

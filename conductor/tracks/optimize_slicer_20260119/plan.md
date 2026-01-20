# Implementation Plan - Optimize Slicer

## Phase 1: Environment & Test Data Setup [checkpoint: e40fe68]
- [x] Task: Set up Python environment and dependencies 1867c83
    - [x] Sub-task: Verify `uv` setup and `pyproject.toml` dependencies (ensure `xarray`, `pandas`, `pyarrow`/`fastparquet`, `cfgrib` are present).
    - [x] Sub-task: Create a Docker Compose configuration for the Slicer service (Python 3.12).
- [x] Task: Acquire Reference Data c316c77
    - [x] Sub-task: Create a script to download a sample ECMWF AIFS GRIB2 file (global, single timestep) for testing.
    - [x] Sub-task: Verify GRIB2 integrity and inspect variable names/metadata.
- [x] Task: Conductor - User Manual Verification 'Phase 1: Environment & Test Data Setup' (Protocol in workflow.md)

## Phase 2: Core Slicing Logic [checkpoint: 81ae745]
- [x] Task: Implement Spatial Cropping 775a792
    - [x] Sub-task: Write tests for `SpatialSlicer` class (input: global xarray, bbox; output: cropped xarray).
    - [x] Sub-task: Implement `SpatialSlicer` with 2.5-degree buffer logic using `xarray`.
- [x] Task: Implement Variable Pruning 34a0543
    - [x] Sub-task: Write tests for `VariablePruner` (input: xarray, list of vars; output: pruned xarray).
    - [x] Sub-task: Implement `VariablePruner` to filter for Wind (U/V), Pressure (MSL), and Waves.
- [x] Task: Conductor - User Manual Verification 'Phase 2: Core Slicing Logic' (Protocol in workflow.md)

## Phase 3: Quantization & Parquet Export
- [ ] Task: Implement Quantization Strategy
    - [ ] Sub-task: Define `QuantizationConfig` schema/class.
    - [ ] Sub-task: Implement `Quantizer` class to apply 0.5kt / 5-degree rounding to specific variables.
    - [ ] Sub-task: Verify quantization does not break data structure (unit tests).
- [ ] Task: Implement Parquet Serialization
    - [ ] Sub-task: Write tests for `ParquetSerializer` (input: xarray; output: .parquet bytes).
    - [ ] Sub-task: Implement `ParquetSerializer` using efficient dictionary encoding options.
    - [ ] Sub-task: Benchmark output size against the 2.5MB target.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Quantization & Parquet Export' (Protocol in workflow.md)

## Phase 4: Integration & Pipeline
- [ ] Task: Build `SeedBuilder` Orchestrator
    - [ ] Sub-task: Implement the main pipeline class connecting Fetch -> Slice -> Prune -> Quantize -> Serialize.
    - [ ] Sub-task: Create a CLI entry point (e.g., `python -m conductor.slicer slice --lat ... --lon ...`) to run the pipeline.
- [ ] Task: End-to-End Validation
    - [ ] Sub-task: Run the pipeline on the sample GRIB2 file.
    - [ ] Sub-task: Verify the output "Seed" can be read back and contains correct data values (fidelity check).
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Integration & Pipeline' (Protocol in workflow.md)

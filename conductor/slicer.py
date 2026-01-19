#!/usr/bin/env python3
# Mariner's AI Grid - Legacy Slicer Entry Point
# SPDX-License-Identifier: Apache-2.0

"""
Legacy compatibility shim - redirects to new slicer package.

For new development, import directly from the slicer package:
    from slicer import ECMWFHRESSlicer, BoundingBox, SeedExporter

Or use the CLI:
    mag-slicer demo
    mag-slicer slice --lat 37.0 --lon -135.0 --radius 500
"""

# Re-export from new package for backwards compatibility
from slicer.core import BoundingBox, WeatherSeed, ECMWFHRESSlicer
from slicer.variables import MARINE_VARIABLES, VariablePruner
from slicer.export import SeedExporter

# Legacy aliases
WeatherSlice = WeatherSeed
WeatherSlicer = ECMWFHRESSlicer


def demo_pacific_crossing():
    """
    Example: San Francisco to Hawaii passage planning.

    Demonstrates the slicer with a realistic offshore scenario.
    """
    print("=" * 60)
    print("Mariner's AI Grid - ECMWF HRES Slicer Demo")
    print("=" * 60)
    print()

    # Midpoint of SF-Hawaii great circle route
    print("Scenario: San Francisco to Hawaii passage")
    print("Extracting weather data for mid-Pacific waypoint")
    print()

    # Create bounding box around mid-Pacific position
    bbox = BoundingBox.from_center(lat=30.0, lon=-140.0, radius_nm=500)

    print(f"Region: {bbox.lat_min:.1f}°N to {bbox.lat_max:.1f}°N")
    print(f"        {bbox.lon_min:.1f}°W to {bbox.lon_max:.1f}°W")
    print(f"Coverage: {bbox.area_sq_nm:,.0f} sq nm")
    print()

    # Initialize slicer (offline mode for demo)
    slicer = ECMWFHRESSlicer(offline_mode=True)

    # Extract 72-hour forecast
    print("Generating 72-hour weather forecast slice...")
    seed = slicer.slice(bbox, forecast_hours=72, time_step_hours=3)

    print(f"Seed ID: {seed.seed_id}")
    print(f"Model: {seed.model_source}")
    print(f"Grid: {seed.shape[1]} x {seed.shape[2]} points")
    print(f"Time steps: {seed.shape[0]}")
    print(f"Variables: {list(seed.variables.keys())}")
    print()

    # Export to both formats
    from pathlib import Path
    output_dir = Path("./demo_output")
    exporter = SeedExporter(output_dir)

    print("Exporting to Protobuf + Zstandard...")
    proto_path, proto_stats = exporter.to_protobuf(seed)

    print("Exporting to Parquet...")
    parquet_path, parquet_stats = exporter.to_parquet(seed)

    print()
    print("=" * 60)
    print("RESULTS")
    print("=" * 60)
    print()

    print("Format Comparison:")
    print(f"  Protobuf: {proto_stats.output_bytes / 1024:.1f} KB "
          f"({proto_stats.compression_ratio:.1f}x compression)")
    print(f"  Parquet:  {parquet_stats.output_bytes / 1024:.1f} KB "
          f"({parquet_stats.compression_ratio:.1f}x compression)")
    print()

    print("Satellite Transfer Costs (estimated):")
    print(f"  Starlink: ${proto_stats.estimated_transfer_cost_usd:.2f}")
    print(f"  Iridium:  ${proto_stats.output_bytes / (1024 * 1024) * 7:.2f}")
    print()

    print("Key Achievement:")
    print("  10GB global GRIB → ~5MB regional Seed")
    print("  Feasible for satellite transmission during passage")
    print()
    print(f"Files saved to: {output_dir.absolute()}")


if __name__ == "__main__":
    demo_pacific_crossing()

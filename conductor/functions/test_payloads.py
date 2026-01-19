#!/usr/bin/env python3
# Mariner's AI Grid - Test Payloads for Cloud Function
# SPDX-License-Identifier: Apache-2.0

"""
Test payloads for the slicer cloud function.

These represent realistic offshore sailing scenarios and can be used for:
1. Integration testing
2. Load testing
3. Documentation examples
4. Demo purposes

Run tests: python test_payloads.py
"""

import json
from datetime import datetime, timezone
from pathlib import Path

# =============================================================================
# Test Payloads - Realistic Offshore Scenarios
# =============================================================================

TEST_PAYLOADS = {
    # -------------------------------------------------------------------------
    # Scenario 1: Pacific Crossing - SF to Hawaii
    # -------------------------------------------------------------------------
    "pacific_crossing_midpoint": {
        "description": "Mid-Pacific waypoint during SF-Hawaii passage",
        "request": {
            "lat": 30.0,
            "lon": -140.0,
            "radius_nm": 500,
            "forecast_hours": 72,
            "time_step_hours": 3,
            "variables": "standard",
            "format": "protobuf",
            "vessel_id": "test-vessel-001",
            "request_id": "pacific-001",
        },
        "expected": {
            "min_grid_points": 1000,
            "max_size_mb": 10,
            "required_variables": ["u10", "v10", "msl", "swh"],
        },
    },

    # -------------------------------------------------------------------------
    # Scenario 2: Route-based - Full Hawaii Approach
    # -------------------------------------------------------------------------
    "hawaii_approach_route": {
        "description": "Full route coverage for Hawaii approach from mid-Pacific",
        "request": {
            "waypoints": [
                (30.0, -140.0),   # Mid-Pacific
                (25.0, -150.0),   # Intermediate
                (21.3, -157.8),   # Honolulu
            ],
            "radius_nm": 200,  # Buffer around route
            "forecast_hours": 96,
            "time_step_hours": 6,
            "variables": "standard",
            "format": "protobuf",
            "request_id": "hawaii-route-001",
        },
        "expected": {
            "min_grid_points": 500,
            "max_size_mb": 15,
        },
    },

    # -------------------------------------------------------------------------
    # Scenario 3: Minimal - Iridium-constrained vessel
    # -------------------------------------------------------------------------
    "iridium_minimal": {
        "description": "Minimal payload for Iridium satellite (expensive bandwidth)",
        "request": {
            "lat": 35.0,
            "lon": -125.0,
            "radius_nm": 200,
            "forecast_hours": 48,
            "time_step_hours": 6,
            "variables": "minimal",
            "format": "protobuf",
            "compression_level": 19,  # Maximum compression
            "request_id": "iridium-001",
        },
        "expected": {
            "max_size_mb": 2,
            "required_variables": ["u10", "v10", "msl"],
        },
    },

    # -------------------------------------------------------------------------
    # Scenario 4: Atlantic Crossing - Europe to Caribbean
    # -------------------------------------------------------------------------
    "atlantic_arc_route": {
        "description": "ARC Rally route - Las Palmas to St. Lucia",
        "request": {
            "waypoints": [
                (28.1, -15.4),    # Las Palmas, Gran Canaria
                (20.0, -30.0),    # Mid-Atlantic
                (14.0, -61.0),    # St. Lucia
            ],
            "radius_nm": 300,
            "forecast_hours": 120,  # 5-day forecast for long passage
            "time_step_hours": 6,
            "variables": "standard",
            "format": "protobuf",
            "request_id": "arc-001",
        },
        "expected": {
            "min_grid_points": 2000,
            "max_size_mb": 25,
        },
    },

    # -------------------------------------------------------------------------
    # Scenario 5: Coastal - California coast
    # -------------------------------------------------------------------------
    "coastal_california": {
        "description": "Short coastal passage - SF to San Diego",
        "request": {
            "waypoints": [
                (37.8, -122.4),  # San Francisco
                (36.6, -121.9),  # Monterey
                (34.0, -118.5),  # Channel Islands
                (32.7, -117.2),  # San Diego
            ],
            "radius_nm": 100,
            "forecast_hours": 48,
            "time_step_hours": 3,
            "variables": "full",  # Full detail for coastal
            "format": "parquet",  # Parquet for shore-side analysis
            "request_id": "coastal-001",
        },
        "expected": {
            "min_grid_points": 500,
            "max_size_mb": 8,
        },
    },

    # -------------------------------------------------------------------------
    # Scenario 6: High Latitude - Alaska
    # -------------------------------------------------------------------------
    "high_latitude_alaska": {
        "description": "Alaska Inside Passage approach",
        "request": {
            "lat": 57.0,
            "lon": -135.0,
            "radius_nm": 300,
            "forecast_hours": 72,
            "time_step_hours": 3,
            "variables": "standard",
            "format": "protobuf",
            "request_id": "alaska-001",
        },
        "expected": {
            "min_grid_points": 800,
            "max_size_mb": 8,
            # Longitude spread should be larger at high latitude
        },
    },

    # -------------------------------------------------------------------------
    # Scenario 7: Edge Case - Near Antimeridian
    # -------------------------------------------------------------------------
    "near_dateline": {
        "description": "Pacific near International Date Line",
        "request": {
            "lat": 20.0,
            "lon": 175.0,  # Near Fiji
            "radius_nm": 400,
            "forecast_hours": 72,
            "time_step_hours": 3,
            "variables": "standard",
            "format": "protobuf",
            "request_id": "dateline-001",
        },
        "expected": {
            "min_grid_points": 800,
        },
    },
}


# =============================================================================
# Test Runner
# =============================================================================

def run_payload_tests(verbose: bool = True):
    """
    Run all test payloads against the slicer function.

    Returns:
        Dict with test results
    """
    from functions.slicer_function import handle_slice_request

    results = {
        "passed": [],
        "failed": [],
        "total": len(TEST_PAYLOADS),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    for name, payload in TEST_PAYLOADS.items():
        if verbose:
            print(f"\n{'='*60}")
            print(f"Testing: {name}")
            print(f"Description: {payload['description']}")
            print(f"{'='*60}")

        try:
            response_data, status, seed_bytes = handle_slice_request(payload["request"])

            # Check status
            if status != 200:
                raise AssertionError(f"HTTP {status}: {response_data.get('error')}")

            # Check response structure
            assert response_data["success"], "Response not successful"
            assert response_data["seed_id"], "Missing seed_id"
            assert response_data["size_bytes"] > 0, "Empty seed"

            # Check expected constraints
            expected = payload.get("expected", {})

            if "max_size_mb" in expected:
                size_mb = response_data["size_bytes"] / (1024 * 1024)
                assert size_mb <= expected["max_size_mb"], \
                    f"Size {size_mb:.2f}MB exceeds max {expected['max_size_mb']}MB"

            if "min_grid_points" in expected:
                grid_points = (
                    response_data["grid_shape"][1] *
                    response_data["grid_shape"][2]
                )
                assert grid_points >= expected["min_grid_points"], \
                    f"Grid {grid_points} points < min {expected['min_grid_points']}"

            if "required_variables" in expected:
                for var in expected["required_variables"]:
                    assert var in response_data["variables"], \
                        f"Missing required variable: {var}"

            # Success
            results["passed"].append({
                "name": name,
                "size_bytes": response_data["size_bytes"],
                "grid_shape": response_data["grid_shape"],
                "variables": len(response_data["variables"]),
                "compression_ratio": response_data["compression_ratio"],
            })

            if verbose:
                print(f"  Status: PASSED")
                print(f"  Seed ID: {response_data['seed_id']}")
                print(f"  Size: {response_data['size_bytes']:,} bytes")
                print(f"  Grid: {response_data['grid_shape']}")
                print(f"  Compression: {response_data['compression_ratio']:.1f}x")
                print(f"  Starlink cost: ${response_data['estimated_starlink_cost_usd']:.2f}")

        except Exception as e:
            results["failed"].append({
                "name": name,
                "error": str(e),
            })

            if verbose:
                print(f"  Status: FAILED")
                print(f"  Error: {e}")

    # Summary
    if verbose:
        print(f"\n{'='*60}")
        print("SUMMARY")
        print(f"{'='*60}")
        print(f"Passed: {len(results['passed'])}/{results['total']}")
        print(f"Failed: {len(results['failed'])}/{results['total']}")

        if results["failed"]:
            print("\nFailed tests:")
            for fail in results["failed"]:
                print(f"  - {fail['name']}: {fail['error']}")

    return results


def generate_curl_examples():
    """Generate curl command examples for documentation"""

    base_url = "http://localhost:8080"

    print("# Mariner's AI Grid - Slicer API Examples")
    print("# ========================================")
    print()

    for name, payload in TEST_PAYLOADS.items():
        print(f"# {name}: {payload['description']}")
        print(f"curl -X POST {base_url}/slice \\")
        print(f"  -H 'Content-Type: application/json' \\")
        print(f"  -d '{json.dumps(payload['request'])}'")
        print()


def save_test_seeds(output_dir: Path = Path("./test_seeds")):
    """Generate and save test seeds for all payloads"""
    from functions.slicer_function import handle_slice_request

    output_dir.mkdir(parents=True, exist_ok=True)

    for name, payload in TEST_PAYLOADS.items():
        print(f"Generating: {name}...")

        response_data, status, seed_bytes = handle_slice_request(payload["request"])

        if status == 200 and seed_bytes:
            # Determine extension
            fmt = payload["request"].get("format", "protobuf")
            ext = ".seed.zst" if fmt == "protobuf" else ".parquet"

            # Save seed
            seed_path = output_dir / f"{name}{ext}"
            seed_path.write_bytes(seed_bytes)

            # Save metadata
            meta_path = output_dir / f"{name}.json"
            meta_path.write_text(json.dumps(response_data, indent=2))

            print(f"  Saved: {seed_path} ({len(seed_bytes):,} bytes)")
        else:
            print(f"  Failed: {response_data.get('error')}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Test payloads for slicer function")
    parser.add_argument("--run", action="store_true", help="Run all payload tests")
    parser.add_argument("--curl", action="store_true", help="Generate curl examples")
    parser.add_argument("--save", action="store_true", help="Save test seeds to disk")
    parser.add_argument("--output", type=Path, default=Path("./test_seeds"),
                        help="Output directory for saved seeds")

    args = parser.parse_args()

    if args.run:
        run_payload_tests()
    elif args.curl:
        generate_curl_examples()
    elif args.save:
        save_test_seeds(args.output)
    else:
        # Default: show available payloads
        print("Available test payloads:")
        print("-" * 60)
        for name, payload in TEST_PAYLOADS.items():
            print(f"  {name}")
            print(f"    {payload['description']}")
        print()
        print("Run with --run to execute tests, --curl for examples, --save to generate seeds")

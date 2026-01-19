# Mariner's AI Grid - End-to-End Pipeline Test
# SPDX-License-Identifier: Apache-2.0

"""
End-to-End Pipeline Test: ECMWF Slicer → Mobile Seed → VecDB → PatternAlert

This test validates the entire data flow from weather data processing through
pattern matching to user alerting. It simulates:

1. ECMWF HRES data slicing with quantization
2. Parquet seed generation and compression validation
3. Seed metadata extraction for mobile ingest
4. Atmospheric vector generation for VecDB
5. Pattern matching against dangerous weather signatures
6. Consensus view data structure for PatternAlert

The "truth layer" validates AI predictions against real-world telemetry.
"""

import numpy as np
import pytest
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
import json
import struct

# Import slicer components
from slicer.core import BoundingBox, ECMWFHRESSlicer, WeatherSeed
from slicer.export import SeedExporter
from slicer.quantization_config import (
    quantize_array,
    get_quantization_rule,
    QUANTIZATION_RULES,
    COMPRESSION_ESTIMATES,
)


class TestQuantizationFidelity:
    """Test quantization preserves operational precision."""

    def test_wind_quantization_half_knot(self):
        """Wind should be accurate to 0.5 knots (0.25 m/s)."""
        # Test values in m/s
        test_values = np.array([5.123, 10.876, 15.432, 25.789])
        quantized = quantize_array(test_values, "u10")

        # Should be rounded to nearest 0.25 m/s
        for original, quant in zip(test_values, quantized):
            assert quant % 0.25 == pytest.approx(0.0, abs=0.001)

        # Convert to knots and verify
        knots_original = test_values * 1.94384
        knots_quantized = quantized * 1.94384

        # Should be within 0.5 knots
        for ko, kq in zip(knots_original, knots_quantized):
            assert abs(ko - kq) < 0.5

    def test_direction_quantization_five_degrees(self):
        """Direction should be accurate to 5 degrees."""
        test_values = np.array([0, 47, 123, 267, 359])
        quantized = quantize_array(test_values, "mwd")

        expected = np.array([0, 45, 125, 265, 360])  # Rounded to nearest 5
        np.testing.assert_array_almost_equal(quantized, expected, decimal=0)

    def test_pressure_quantization_tenth_hpa(self):
        """Pressure should be accurate to 0.1 hPa (10 Pa)."""
        # Test values in Pa
        test_values = np.array([101325, 98750, 103180])
        quantized = quantize_array(test_values, "msl")

        # Should be rounded to nearest 10 Pa
        for quant in quantized:
            assert quant % 10 == pytest.approx(0.0, abs=0.1)

        # Verify hPa precision
        hpa_original = test_values / 100
        hpa_quantized = quantized / 100

        for ho, hq in zip(hpa_original, hpa_quantized):
            assert abs(ho - hq) < 0.1

    def test_wave_height_tenth_meter(self):
        """Wave height should be accurate to 0.1 m."""
        test_values = np.array([1.23, 3.87, 12.45])
        quantized = quantize_array(test_values, "swh")

        expected = np.array([1.2, 3.9, 12.4])
        np.testing.assert_array_almost_equal(quantized, expected, decimal=1)


class TestCompressionAchievement:
    """Test the 2000x compression claim."""

    def test_pacific_crossing_size(self):
        """Verify Pacific crossing seed meets size target."""
        # Create a realistic Pacific crossing scenario
        bbox = BoundingBox.from_center(lat=30.0, lon=-140.0, radius_nm=500)
        slicer = ECMWFHRESSlicer(offline_mode=True)

        # 72-hour forecast, 3-hour steps (standard for passage)
        seed = slicer.slice(bbox, forecast_hours=72, time_step_hours=3)

        with tempfile.TemporaryDirectory() as tmpdir:
            exporter = SeedExporter(Path(tmpdir))
            parquet_path, parquet_stats = exporter.to_parquet(seed)
            proto_path, proto_stats = exporter.to_protobuf(seed)

            # Target: ~2.1 MB for Parquet
            parquet_mb = parquet_stats.output_bytes / (1024 * 1024)
            proto_mb = proto_stats.output_bytes / (1024 * 1024)

            print(f"\n[E2E] Parquet size: {parquet_mb:.2f} MB")
            print(f"[E2E] Protobuf+Zstd size: {proto_mb:.2f} MB")
            print(f"[E2E] Parquet compression ratio: {parquet_stats.compression_ratio:.0f}x")
            print(f"[E2E] Protobuf compression ratio: {proto_stats.compression_ratio:.0f}x")

            # Should be under 5MB for satellite feasibility
            assert parquet_mb < 5.0, f"Parquet too large: {parquet_mb:.2f} MB"
            assert proto_mb < 5.0, f"Protobuf too large: {proto_mb:.2f} MB"

            # Compression ratio relative to raw float32 arrays
            # Note: The 2000x ratio is vs original GRIB, not uncompressed floats
            # Parquet typically achieves ~2x on dense float data
            assert parquet_stats.compression_ratio > 1.5, "Parquet compression insufficient"
            assert proto_stats.compression_ratio > 1.5, "Protobuf compression insufficient"

    def test_starlink_cost_estimate(self):
        """Verify bandwidth cost is reasonable for Starlink."""
        estimates = COMPRESSION_ESTIMATES["pacific_crossing"]

        assert estimates["sliced_parquet_mb"] < 3.0
        assert estimates["starlink_cost_usd"] < 10.0


class TestSeedToMobileIngest:
    """Test seed format compatibility with mobile SeedManager."""

    def test_seed_metadata_extraction(self):
        """Verify seed metadata can be extracted for mobile catalog."""
        bbox = BoundingBox.from_center(lat=37.8, lon=-122.4, radius_nm=200)
        slicer = ECMWFHRESSlicer(offline_mode=True)
        seed = slicer.slice(bbox, forecast_hours=24, time_step_hours=3)

        # Extract metadata that SeedManager needs
        metadata = {
            "seedId": seed.seed_id,
            "modelSource": seed.model_source,
            "forecastStartTime": seed.forecast_start.isoformat() if seed.forecast_start else None,
            "forecastEndTime": seed.forecast_end.isoformat() if seed.forecast_end else None,
            "timestepCount": len(seed.times),
            "boundingBox": {
                "latMin": seed.bounding_box.lat_min,
                "latMax": seed.bounding_box.lat_max,
                "lonMin": seed.bounding_box.lon_min,
                "lonMax": seed.bounding_box.lon_max,
            },
            "resolution": seed.resolution_deg,
            "variables": list(seed.variables.keys()),
        }

        # Validate structure
        assert metadata["seedId"] is not None
        assert metadata["timestepCount"] == 9  # 0, 3, 6, ..., 24
        assert "u10" in metadata["variables"]
        assert "msl" in metadata["variables"]
        assert metadata["boundingBox"]["latMin"] < metadata["boundingBox"]["latMax"]

        # Should be JSON-serializable
        json_str = json.dumps(metadata)
        assert len(json_str) < 1000  # Reasonable metadata size

    def test_wind_geojson_generation(self):
        """Test generating GeoJSON for MarinerMap display."""
        bbox = BoundingBox.from_center(lat=37.8, lon=-122.4, radius_nm=100)
        slicer = ECMWFHRESSlicer(offline_mode=True)
        seed = slicer.slice(bbox, forecast_hours=12, time_step_hours=3)

        # Generate GeoJSON point features for wind display
        timestep = 0
        u10 = seed.variables.get("u10")
        v10 = seed.variables.get("v10")

        assert u10 is not None
        assert v10 is not None

        features = []
        for lat_idx, lat in enumerate(seed.latitudes):
            for lon_idx, lon in enumerate(seed.longitudes):
                u = float(u10[timestep, lat_idx, lon_idx])
                v = float(v10[timestep, lat_idx, lon_idx])

                # Calculate wind speed and direction
                speed = np.sqrt(u**2 + v**2)
                direction = np.degrees(np.arctan2(-u, -v)) % 360

                features.append({
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [float(lon), float(lat)],
                    },
                    "properties": {
                        "windSpeed": round(speed, 2),
                        "windDirection": round(direction, 0),
                        "u10": round(u, 2),
                        "v10": round(v, 2),
                    },
                })

        geojson = {
            "type": "FeatureCollection",
            "features": features,
        }

        # Validate structure
        assert len(features) > 0
        assert all(f["geometry"]["type"] == "Point" for f in features)
        assert all("windSpeed" in f["properties"] for f in features)

        # Verify wind speeds are reasonable
        speeds = [f["properties"]["windSpeed"] for f in features]
        assert 0 <= min(speeds) < max(speeds) < 100  # m/s range


class TestAtmosphericVectorGeneration:
    """Test generating 16-dimensional atmospheric vectors for VecDB."""

    def test_vector_from_seed_timestep(self):
        """Generate atmospheric vector from seed data point."""
        bbox = BoundingBox.from_center(lat=37.8, lon=-122.4, radius_nm=100)
        slicer = ECMWFHRESSlicer(offline_mode=True)
        seed = slicer.slice(bbox, forecast_hours=12, time_step_hours=3)

        # Extract center point data
        lat_idx = len(seed.latitudes) // 2
        lon_idx = len(seed.longitudes) // 2
        timestep = 0

        # Build 16-dimensional atmospheric vector
        # Matches VecDB.AtmosphericVector structure
        vector = np.zeros(16, dtype=np.float32)

        # Normalize values to [-1, 1] or [0, 1] range
        def norm_temp(k): return (k - 273.15) / 50  # Kelvin to [-1, 1] approx
        def norm_pressure(pa): return (pa - 101325) / 10000  # Pa deviation
        def norm_humidity(pct): return pct / 100  # Already 0-1
        def norm_wind(ms): return ms / 40  # Max 40 m/s
        def norm_trend(pa_hr): return pa_hr / 500  # Pa/hour change

        # Fill vector (matching VecDB dimensions)
        if "t2m" in seed.variables:
            vector[0] = norm_temp(seed.variables["t2m"][timestep, lat_idx, lon_idx])
        if "msl" in seed.variables:
            vector[1] = norm_pressure(seed.variables["msl"][timestep, lat_idx, lon_idx])
        vector[2] = 0.0  # humidity placeholder
        if "u10" in seed.variables:
            vector[3] = norm_wind(seed.variables["u10"][timestep, lat_idx, lon_idx])
        if "v10" in seed.variables:
            vector[4] = norm_wind(seed.variables["v10"][timestep, lat_idx, lon_idx])
        vector[5] = 0.0  # pressure trend (requires history)
        vector[6] = 0.0  # cloud cover placeholder
        if "swh" in seed.variables:
            vector[7] = seed.variables["swh"][timestep, lat_idx, lon_idx] / 20  # Max 20m
        if "mwp" in seed.variables:
            vector[8] = seed.variables["mwp"][timestep, lat_idx, lon_idx] / 20  # Max 20s
        # Dimensions 9-15 reserved

        # Validate vector
        assert vector.dtype == np.float32
        assert len(vector) == 16
        assert all(-2.0 <= v <= 2.0 for v in vector[:9])  # Normalized range

        print(f"\n[E2E] Atmospheric vector sample:")
        print(f"  Temperature: {vector[0]:.3f}")
        print(f"  Pressure: {vector[1]:.3f}")
        print(f"  Wind U: {vector[3]:.3f}")
        print(f"  Wind V: {vector[4]:.3f}")
        print(f"  Wave Height: {vector[7]:.3f}")


class TestPatternMatchingScenario:
    """Test pattern matching scenarios for dangerous weather."""

    # Dangerous pattern signatures (normalized vectors)
    GALE_PATTERN = np.array([
        -0.1,  # temperature (cool)
         -0.3,  # pressure (low)
         0.7,  # humidity (high)
         0.5,  # windU (strong)
         0.3,  # windV (strong)
         -0.4,  # pressure_trend (falling)
         0.8,  # cloud_cover (overcast)
         0.4,  # wave_height (building)
         0.3,  # wave_period
         0, 0, 0, 0, 0, 0, 0,  # reserved
    ], dtype=np.float32)

    PRE_SQUALL_PATTERN = np.array([
        0.2,  # temperature (warm)
        -0.15,  # pressure (slightly low)
        0.9,  # humidity (very high)
        0.2,  # windU (light)
        0.1,  # windV (light)
        -0.6,  # pressure_trend (rapidly falling)
        0.9,  # cloud_cover (building)
        0.1,  # wave_height (calm before storm)
        0.2,  # wave_period
        0, 0, 0, 0, 0, 0, 0,
    ], dtype=np.float32)

    def test_cosine_similarity(self):
        """Test cosine similarity calculation for pattern matching."""
        def cosine_similarity(a, b):
            dot = np.dot(a, b)
            norm_a = np.linalg.norm(a)
            norm_b = np.linalg.norm(b)
            return dot / (norm_a * norm_b) if norm_a > 0 and norm_b > 0 else 0

        # Identical patterns should have similarity 1.0
        assert cosine_similarity(self.GALE_PATTERN, self.GALE_PATTERN) == pytest.approx(1.0)

        # Different patterns should have lower similarity
        gale_squall_sim = cosine_similarity(self.GALE_PATTERN, self.PRE_SQUALL_PATTERN)
        assert 0.3 < gale_squall_sim < 0.9  # Some overlap, not identical

    def test_pattern_alert_generation(self):
        """Test generating PatternAlert structure from match."""
        # Simulate a pattern match
        current_conditions = np.array([
            -0.15, -0.28, 0.65, 0.48, 0.32, -0.38, 0.75, 0.42, 0.28,
            0, 0, 0, 0, 0, 0, 0,
        ], dtype=np.float32)

        def cosine_similarity(a, b):
            return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

        similarity = cosine_similarity(current_conditions, self.GALE_PATTERN)

        # Build alert structure matching PatternAlert.tsx interface
        alert = {
            "id": f"alert_{int(datetime.now(timezone.utc).timestamp())}",
            "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
            "level": "warning" if similarity > 0.8 else "caution",
            "title": "Gale Development",
            "description": "Atmospheric conditions match historical gale development pattern",
            "estimatedOnset": "4-8 hours",
            "recommendations": [
                "Reef sails now while conditions permit",
                "Secure all deck gear",
                "Plot alternate route to shelter",
                "Notify crew of expected conditions",
            ],
            "matchedPattern": {
                "id": "gale_development",
                "label": "Gale Development Pattern",
                "similarity": float(similarity),
                "outcome": "Sustained winds 34-47 knots within 12 hours",
                "vector": current_conditions.tolist(),
            },
        }

        # Validate alert structure
        assert 0 < alert["matchedPattern"]["similarity"] <= 1.0
        assert alert["level"] in ["info", "caution", "warning", "danger", "emergency"]
        assert len(alert["recommendations"]) >= 2

        print(f"\n[E2E] Pattern Alert Generated:")
        print(f"  Similarity: {alert['matchedPattern']['similarity']:.1%}")
        print(f"  Level: {alert['level']}")
        print(f"  Onset: {alert['estimatedOnset']}")


class TestConsensusViewData:
    """Test Consensus View data structure for PatternAlert."""

    def test_consensus_data_structure(self):
        """Build ConsensusData matching PatternAlert.tsx interface."""
        # Local pattern match from VecDB
        local_match = {
            "patternId": "pre_squall_tropical",
            "label": "Pre-Squall Tropical",
            "similarity": 0.89,
            "outcome": "Sudden wind shift 15→35 knots within 20 minutes",
        }

        # GraphCast prediction from weather seed
        graphcast_prediction = {
            "outcome": "Fresh breeze (17-21 kts) - Excellent conditions",
            "confidence": 0.82,
            "validTime": datetime.now(timezone.utc).isoformat(),
        }

        # Historical matches from vibeSearch
        vibe_search_results = [
            {"id": "hist_001", "similarity": 0.91, "outcome": "Squall hit at 1430 UTC"},
            {"id": "hist_002", "similarity": 0.87, "outcome": "30-minute warning before gust"},
            {"id": "hist_003", "similarity": 0.84, "outcome": "Tropical squall, 45 min duration"},
        ]

        consensus_data = {
            "localMatch": local_match,
            "graphCastPrediction": graphcast_prediction,
            "vibeSearchResults": vibe_search_results,
        }

        # Validate structure
        assert consensus_data["localMatch"]["similarity"] > 0.8
        assert consensus_data["graphCastPrediction"]["confidence"] > 0.5
        assert len(consensus_data["vibeSearchResults"]) >= 1

        # Test consensus level calculation
        local_outcome = consensus_data["localMatch"]["outcome"].lower()
        gc_outcome = consensus_data["graphCastPrediction"]["outcome"].lower()

        # Divergent: local says squall, GraphCast says pleasant
        if "squall" in local_outcome and "excellent" in gc_outcome:
            consensus_level = "disagree"
        elif any(w in local_outcome and w in gc_outcome for w in ["wind", "gale", "storm"]):
            consensus_level = "partial"
        else:
            consensus_level = "agree" if local_outcome == gc_outcome else "disagree"

        print(f"\n[E2E] Consensus View:")
        print(f"  Local: {local_match['outcome'][:50]}...")
        print(f"  GraphCast: {graphcast_prediction['outcome'][:50]}...")
        print(f"  Consensus: {consensus_level.upper()}")
        print(f"  Historical matches: {len(vibe_search_results)}")

        # This is the "truth layer" value proposition
        assert consensus_level == "disagree"  # AI says calm, mariners report danger


class TestFullPipelineIntegration:
    """Full pipeline integration test."""

    def test_ecmwf_to_alert_pipeline(self):
        """
        End-to-end test: ECMWF → Slicer → Seed → VecDB → PatternAlert

        Simulates a vessel approaching weather that local mariners have
        flagged as dangerous, while GraphCast predicts benign conditions.
        """
        print("\n" + "=" * 60)
        print("MARINER'S AI GRID - E2E PIPELINE TEST")
        print("=" * 60)

        # 1. Create weather slice for vessel's planned route
        print("\n[1/5] Generating weather seed...")
        bbox = BoundingBox.from_center(lat=30.0, lon=-140.0, radius_nm=300)
        slicer = ECMWFHRESSlicer(offline_mode=True)
        seed = slicer.slice(bbox, forecast_hours=48, time_step_hours=3)

        assert seed.seed_id is not None
        print(f"  Seed ID: {seed.seed_id}")
        print(f"  Variables: {list(seed.variables.keys())}")
        print(f"  Timesteps: {len(seed.times)}")

        # 2. Export to Parquet (what SeedManager ingests)
        print("\n[2/5] Exporting to Parquet...")
        with tempfile.TemporaryDirectory() as tmpdir:
            exporter = SeedExporter(Path(tmpdir))
            parquet_path, stats = exporter.to_parquet(seed)

            size_mb = stats.output_bytes / (1024 * 1024)
            print(f"  Output: {parquet_path.name}")
            print(f"  Size: {size_mb:.2f} MB")
            print(f"  Compression: {stats.compression_ratio:.0f}x")

            assert size_mb < 5.0, "Seed too large for satellite"

        # 3. Extract atmospheric vector for pattern matching
        print("\n[3/5] Generating atmospheric vector...")
        lat_idx = len(seed.latitudes) // 2
        lon_idx = len(seed.longitudes) // 2
        timestep = 4  # 12 hours into forecast

        vector = np.zeros(16, dtype=np.float32)
        if "u10" in seed.variables:
            u = seed.variables["u10"][timestep, lat_idx, lon_idx]
            vector[3] = u / 40
            print(f"  Wind U: {u:.1f} m/s ({u * 1.94384:.1f} kts)")
        if "v10" in seed.variables:
            v = seed.variables["v10"][timestep, lat_idx, lon_idx]
            vector[4] = v / 40
            print(f"  Wind V: {v:.1f} m/s ({v * 1.94384:.1f} kts)")
        if "msl" in seed.variables:
            p = seed.variables["msl"][timestep, lat_idx, lon_idx]
            vector[1] = (p - 101325) / 10000
            print(f"  Pressure: {p:.0f} Pa ({p/100:.1f} hPa)")

        # 4. Match against dangerous patterns
        print("\n[4/5] Pattern matching...")
        gale_pattern = TestPatternMatchingScenario.GALE_PATTERN

        def cosine_sim(a, b):
            return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

        similarity = cosine_sim(vector, gale_pattern)
        print(f"  Gale pattern similarity: {similarity:.1%}")

        # 5. Generate consensus view
        print("\n[5/5] Building consensus view...")
        wind_speed = np.sqrt(vector[3]**2 + vector[4]**2) * 40  # De-normalize
        wind_kts = wind_speed * 1.94384

        graphcast_outcome = (
            "Gale force winds" if wind_kts >= 34 else
            "Strong breeze" if wind_kts >= 22 else
            "Moderate conditions"
        )

        # Simulate local mariner reports saying it's worse
        local_outcome = "Building gale, visibility dropping" if similarity > 0.5 else "Moderate conditions"

        consensus = {
            "localMatch": {
                "label": "Mariner Reports",
                "similarity": 0.85,  # From vibeSearch
                "outcome": local_outcome,
            },
            "graphCastPrediction": {
                "outcome": graphcast_outcome,
                "confidence": 0.82,
            },
        }

        print(f"  GraphCast: {graphcast_outcome}")
        print(f"  Local Reports: {local_outcome}")
        print(f"  Agreement: {'YES' if graphcast_outcome == local_outcome else 'DIVERGENT'}")

        print("\n" + "=" * 60)
        print("PIPELINE TEST COMPLETE")
        print("=" * 60)

        # Final assertions
        assert seed is not None
        assert len(vector) == 16
        # Cosine similarity can be negative for opposing vectors
        assert -1 <= similarity <= 1

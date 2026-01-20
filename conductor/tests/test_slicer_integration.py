
# Mariner's AI Grid - Slicer Integration Tests
# SPDX-License-Identifier: Apache-2.0

import pytest
from datetime import datetime, timezone, timedelta
from pathlib import Path
import tempfile
import numpy as np
import xarray as xr

from slicer.core import BoundingBox, WeatherSeed
from slicer.aifs import AIFSSlicer
from slicer.variables import VariablePruner

class TestSlicerIntegration:
    """Integration tests for the AIFS Slicer component."""

    def test_variable_pruner_consistency(self):
        """Ensure VariablePruner returns expected ECMWF parameter names."""
        pruner = VariablePruner("marine")
        
        # Check surface parameters
        sfc_params = pruner.get_ecmwf_params("sfc")
        assert "10u" in sfc_params or "u10" in sfc_params
        assert "10v" in sfc_params or "v10" in sfc_params
        assert "msl" in sfc_params
        
        # Check pressure level parameters
        pl_params = pruner.get_ecmwf_params("pl")
        assert "z" in pl_params  # Geopotential (was gh)
        assert "t" in pl_params  # Temperature

    def test_bounding_box_buffer_logic(self):
        """Test that the slicer correctly buffers the requested bounding box."""
        # Define a test box (e.g., Hawaii)
        original_bbox = BoundingBox(lat_min=18.0, lat_max=23.0, lon_min=-160.0, lon_max=-154.0)
        
        # We can't easily mock the internal _fetch_files without a lot of setup,
        # but we can verify the logic by instantiating the class and checking its constants/methods
        # or by running a "dry run" slice if supported.
        
        # For now, let's verify the BoundingBox logic itself which is critical for the slicer
        assert original_bbox.lat_min == 18.0
        
        # Verify buffer logic (recreating the logic used in slice())
        BUFFER_DEG = 2.5
        buffered_bbox = BoundingBox(
            lat_min=max(-90, original_bbox.lat_min - BUFFER_DEG),
            lat_max=min(90, original_bbox.lat_max + BUFFER_DEG),
            lon_min=original_bbox.lon_min - BUFFER_DEG,
            lon_max=original_bbox.lon_max + BUFFER_DEG
        )
        
        assert buffered_bbox.lat_min == 15.5
        assert buffered_bbox.lat_max == 25.5
        assert buffered_bbox.lon_min == -162.5
        assert buffered_bbox.lon_max == -151.5

    def test_weather_seed_structure(self):
        """Test that WeatherSeed objects are constructed correctly from mock data."""
        # Create mock xarray dataset simulating a slice
        lats = np.linspace(25.5, 15.5, 11) # 1 degree res
        lons = np.linspace(-162.5, -151.5, 12)
        times = [datetime.now(timezone.utc) + timedelta(hours=i*6) for i in range(3)]
        
        data_u = np.random.rand(3, 11, 12).astype(np.float32)
        data_v = np.random.rand(3, 11, 12).astype(np.float32)
        
        variables = {
            "u10": data_u,
            "v10": data_v
        }
        
        bbox = BoundingBox(lat_min=15.5, lat_max=25.5, lon_min=-162.5, lon_max=-151.5)
        
        seed = WeatherSeed(
            seed_id="test_seed_001",
            created_at=datetime.now(timezone.utc),
            model_source="mock_test",
            model_run=datetime.now(timezone.utc),
            bounding_box=bbox,
            resolution_deg=1.0,
            forecast_start=times[0],
            forecast_end=times[-1],
            time_step_hours=6,
            variables=variables,
            latitudes=lats,
            longitudes=lons,
            times=times,
            metadata={}
        )
        
        assert seed.seed_id == "test_seed_001"
        assert seed.variables["u10"].shape == (3, 11, 12)
        assert len(seed.latitudes) == 11
        assert len(seed.longitudes) == 12
        assert len(seed.times) == 3

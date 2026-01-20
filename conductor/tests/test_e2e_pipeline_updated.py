import pytest
from pathlib import Path
from slicer.core import SeedBuilder
import pyarrow.parquet as pq

# Use the sample GRIB2 we acquired in Phase 1
SAMPLE_GRIB_PATH = Path("test_seeds/aifs_sample.grib2")

@pytest.mark.skipif(not SAMPLE_GRIB_PATH.exists(), reason="Sample GRIB2 missing")
def test_e2e_pipeline_with_sample_data(tmp_path, monkeypatch):
    """Run the full orchestrated pipeline using real sample data."""
    
    # 1. Setup Builder
    cache_dir = tmp_path / "cache"
    output_dir = tmp_path / "output"
    builder = SeedBuilder(cache_dir=cache_dir, output_dir=output_dir)
    
    # Mock AIFSSlicer._fetch_files to use our local sample
    # instead of hitting the network
    from slicer.aifs import AIFSSlicer
    
    def mock_fetch(self, date, time, steps, sfc_params, pl_params, levels, target_sfc, target_pl):
        # Symlink our sample to the expected cache targets
        import os
        if not target_sfc.exists():
            os.symlink(SAMPLE_GRIB_PATH.absolute(), target_sfc)
        if not target_pl.exists():
            # Create a mock pl file with one variable from sfc to avoid merge issues
            # Actually, the easiest is to just use the same file and hope merge handles it
            os.symlink(SAMPLE_GRIB_PATH.absolute(), target_pl)
            
    monkeypatch.setattr(AIFSSlicer, "_fetch_files", mock_fetch)
    
    # 2. Run Pipeline
    # Hawaii approx center
    # Set forecast_hours=0 to match our single-timestep sample GRIB
    output_path = builder.build_seed(lat=21.0, lon=-157.0, radius_nm=100, forecast_hours=0)
    
    # 3. Verify Output
    assert output_path.exists()
    assert output_path.suffix == ".parquet"
    
    # Verify we can read it and it has expected columns
    table = pq.read_table(output_path)
    df = table.to_pandas()
    
    assert "lat" in df.columns
    assert "lon" in df.columns
    # Check for at least one weather variable (u10, v10, or msl)
    weather_vars = {"u10", "v10", "msl"}
    found_vars = weather_vars.intersection(set(df.columns))
    assert len(found_vars) > 0
    
    # Verify quantization (values should be snapped to steps)
    if "u10" in df.columns:
        val = df.iloc[0]["u10"]
        # u10 step is 0.25
        assert (val / 0.25).is_integer()

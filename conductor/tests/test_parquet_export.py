import pytest
import numpy as np
from pathlib import Path
from datetime import datetime, timezone
from slicer.core import BoundingBox, WeatherSeed
from slicer.export import SeedExporter

@pytest.fixture
def sample_seed():
    """Create a sample WeatherSeed for export testing."""
    lats = np.array([20.0, 20.25, 20.5], dtype=np.float32)
    lons = np.array([200.0, 200.25, 200.5], dtype=np.float32)
    times = [datetime(2026, 1, 19, 0, tzinfo=timezone.utc)]
    
    u10 = np.random.rand(1, 3, 3).astype(np.float32) * 20.0
    
    return WeatherSeed(
        seed_id="test_seed",
        created_at=datetime.now(timezone.utc),
        model_source="test_model",
        model_run=datetime(2026, 1, 19, 0, tzinfo=timezone.utc),
        bounding_box=BoundingBox(18, 22, 198, 205),
        resolution_deg=0.25,
        forecast_start=times[0],
        forecast_end=times[0],
        time_step_hours=6,
        variables={"u10": u10},
        latitudes=lats,
        longitudes=lons,
        times=times
    )

def test_parquet_export_success(sample_seed, tmp_path):
    """Verify that Parquet export creates a readable file."""
    exporter = SeedExporter(output_dir=tmp_path)
    output_path, stats = exporter.to_parquet(sample_seed, filename="test.parquet")
    
    assert output_path.exists()
    assert stats.format == "parquet"
    assert "u10" in stats.variables
    
    # Read it back to verify content
    import pyarrow.parquet as pq
    table = pq.read_table(output_path)
    df = table.to_pandas()
    
    assert len(df) == 9 # 1 time * 3 lats * 3 lons
    assert "u10" in df.columns
    assert "lat" in df.columns
    assert "lon" in df.columns
    assert "time_epoch" in df.columns

def test_parquet_export_quantization(sample_seed, tmp_path):
    """Verify that quantization is applied during Parquet export."""
    exporter = SeedExporter(output_dir=tmp_path)
    
    # 10.13 / 0.25 = 40.52 -> 41. 41 * 0.25 = 10.25
    sample_seed.variables["u10"][0, 0, 0] = 10.13
    
    output_path, stats = exporter.to_parquet(sample_seed, quantize=True)
    
    import pyarrow.parquet as pq
    df = pq.read_table(output_path).to_pandas()
    
    val = df.iloc[0]["u10"]
    assert val == 10.25

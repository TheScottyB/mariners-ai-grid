import pytest
import xarray as xr
import numpy as np
from slicer.core import BoundingBox
# We'll assume the implementation will be in slicer.core or a new module
# Based on the plan, we might want a dedicated SpatialSlicer class
from slicer.core import SpatialSlicer

@pytest.fixture
def mock_global_dataset():
    """Create a mock global dataset (0.25 deg resolution)."""
    lats = np.arange(90, -90.25, -0.25)
    lons = np.arange(0, 360, 0.25)
    
    data = np.random.rand(len(lats), len(lons))
    ds = xr.Dataset(
        {"u10": (["latitude", "longitude"], data)},
        coords={"latitude": lats, "longitude": lons}
    )
    return ds

def test_spatial_slicer_cropping(mock_global_dataset):
    """Verify that SpatialSlicer crops to the correct bounding box with buffer."""
    slicer = SpatialSlicer(buffer_deg=2.5)
    
    # Target BBox: Hawaii region approx
    bbox = BoundingBox(lat_min=18.0, lat_max=22.0, lon_min=200.0, lon_max=205.0)
    
    cropped_ds = slicer.slice(mock_global_dataset, bbox)
    
    # Check bounds (including 2.5 buffer)
    # Expected: lat [18-2.5, 22+2.5] -> [15.5, 24.5]
    # Expected: lon [200-2.5, 205+2.5] -> [197.5, 207.5]
    
    assert cropped_ds.latitude.max() >= 24.5
    assert cropped_ds.latitude.min() <= 15.5
    assert cropped_ds.longitude.max() >= 207.5
    assert cropped_ds.longitude.min() <= 197.5
    
    # Ensure it's not the WHOLE dataset
    assert len(cropped_ds.latitude) < len(mock_global_dataset.latitude)
    assert len(cropped_ds.longitude) < len(mock_global_dataset.longitude)

def test_spatial_slicer_invalid_bbox(mock_global_dataset):
    """Test handling of invalid bounding boxes."""
    slicer = SpatialSlicer(buffer_deg=2.5)
    
    with pytest.raises(ValueError):
        # lat_min > lat_max
        invalid_bbox = BoundingBox(lat_min=30, lat_max=20, lon_min=0, lon_max=10)
        slicer.slice(mock_global_dataset, invalid_bbox)

def test_spatial_slicer_empty_result(mock_global_dataset):
    """Test fallback when slice returns empty dataset."""
    slicer = SpatialSlicer(buffer_deg=0)
    # BBox outside of mock dataset range (mock is 0-360, but sel is strict)
    # Actually mock is 0-360. Let's try a very small bbox between points.
    bbox = BoundingBox(lat_min=20.1, lat_max=20.2, lon_min=200.1, lon_max=200.2)
    cropped_ds = slicer.slice(mock_global_dataset, bbox)
    assert cropped_ds.latitude.size == 0

import pytest
import xarray as xr
import numpy as np
from slicer.variables import VariablePruner, MARINE_VARIABLES

@pytest.fixture
def mock_full_dataset():
    """Create a mock dataset with more variables than we need."""
    lats = np.arange(20, 25, 1)
    lons = np.arange(200, 205, 1)
    
    # Essential marine vars
    u10 = np.random.rand(len(lats), len(lons))
    v10 = np.random.rand(len(lats), len(lons))
    msl = np.random.rand(len(lats), len(lons))
    
    # Extra irrelevant vars
    temp_soil = np.random.rand(len(lats), len(lons))
    ozone = np.random.rand(len(lats), len(lons))
    
    ds = xr.Dataset(
        {
            "u10": (["latitude", "longitude"], u10),
            "v10": (["latitude", "longitude"], v10),
            "msl": (["latitude", "longitude"], msl),
            "st": (["latitude", "longitude"], temp_soil),
            "o3": (["latitude", "longitude"], ozone),
        },
        coords={"latitude": lats, "longitude": lons}
    )
    return ds

def test_variable_pruning_standard(mock_full_dataset):
    """Verify standard pruning removes non-marine variables."""
    pruner = VariablePruner(variable_set="standard")
    pruned_ds = pruner.prune_dataset(mock_full_dataset)
    
    assert "u10" in pruned_ds
    assert "v10" in pruned_ds
    assert "msl" in pruned_ds
    assert "st" not in pruned_ds
    assert "o3" not in pruned_ds
    assert len(pruned_ds.data_vars) == 3

def test_variable_pruning_minimal(mock_full_dataset):
    """Verify minimal pruning subset."""
    pruner = VariablePruner(variable_set="minimal")
    pruned_ds = pruner.prune_dataset(mock_full_dataset)
    
    # 'minimal' includes swh which is missing in mock_full_dataset
    # The current implementation handles intersection, let's see how it behaves
    assert "u10" in pruned_ds
    assert len(pruned_ds.data_vars) == 3 # u10, v10, msl

def test_variable_pruning_unavailable_variables():
    """Test behavior when no variables match."""
    pruner = VariablePruner(variable_set="standard")
    ds_empty = xr.Dataset(
        {"irrelevant": (["x"], [1, 2, 3])},
        coords={"x": [1, 2, 3]}
    )
    with pytest.raises(ValueError, match="No marine variables found"):
        pruner.prune_dataset(ds_empty)

def test_variable_quantization():
    """Verify quantization reduces precision correctly."""
    pruner = VariablePruner()
    u10_var = MARINE_VARIABLES["u10"] # precision_digits = 2
    
    # 0.5kt precision = 0.257 m/s
    # If precision_digits=2, it rounds to 0.01
    data = np.array([10.12345, 10.56789], dtype=np.float32)
    quantized = pruner.quantize_array(data, u10_var)
    
    assert quantized[0] == 10.12
    assert quantized[1] == 10.57
    assert quantized.dtype == np.float32

def test_variable_quantization_zero_digits():
    """Verify quantization with 0 digits (rounding to nearest integer)."""
    pruner = VariablePruner()
    msl_var = MARINE_VARIABLES["msl"] # precision_digits = 0
    
    data = np.array([101325.6, 98000.2], dtype=np.float32)
    quantized = pruner.quantize_array(data, msl_var)
    
    assert quantized[0] == 101326.0
    assert quantized[1] == 98000.0

def test_estimate_pruned_size():
    """Verify size estimation logic."""
    pruner = VariablePruner(variable_set="minimal")
    # minimal is u10, v10, msl, swh (4 variables)
    # 100x100 grid, 10 time steps
    size = pruner.estimate_pruned_size_mb(100, 100, 10)
    
    # 4 vars * 100 * 100 * 10 * 4 bytes = 1,600,000 bytes
    # compressed (0.25) = 400,000 bytes ≈ 0.38 MB
    assert 0.3 < size < 0.5

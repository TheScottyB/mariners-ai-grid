import pytest
from pathlib import Path
import xarray as xr

# Path to the reference data (expected location)
REFERENCE_DATA_PATH = Path("test_seeds/aifs_sample.grib2")

def test_reference_data_exists():
    """Verify that the reference GRIB2 file exists."""
    if not REFERENCE_DATA_PATH.exists():
        pytest.fail(f"Reference data not found at {REFERENCE_DATA_PATH}. Run 'python scripts/acquire_reference.py' to download it.")

def test_reference_data_integrity():
    """Verify that the GRIB2 file can be opened with xarray/cfgrib and has expected variables."""
    if not REFERENCE_DATA_PATH.exists():
        pytest.skip("Reference data missing")

    try:
        ds = xr.open_dataset(REFERENCE_DATA_PATH, engine="cfgrib")
        
        # Check for standard AIFS marine variables
        # Note: cfgrib might rename variables (e.g., 10u -> u10, 10v -> v10, msl -> msl)
        # We check for existence of at least one valid variable
        assert len(ds.data_vars) > 0, "Dataset contains no variables"
        
        # Check specific expected variables if possible (e.g. u10, v10)
        # cfgrib usually maps 10u -> u10, 10v -> v10
        expected_vars = {'u10', 'v10', 'msl'}
        found_vars = set(ds.data_vars)
        
        # Verify intersection is not empty (at least some expected vars are present)
        assert not expected_vars.isdisjoint(found_vars), f"Expected some of {expected_vars}, found {found_vars}"
        
        ds.close()
    except Exception as e:
        pytest.fail(f"Failed to open reference data with xarray/cfgrib: {e}")

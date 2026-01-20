import pytest

def test_core_dependencies_installed():
    """Verify that all core dependencies for the Slicer are installed and importable."""
    try:
        import xarray
        import pandas
        import pyarrow
        import cfgrib
        import eccodes
        import zstandard
    except ImportError as e:
        pytest.fail(f"Missing core dependency: {e}")

def test_ecmwf_dependencies_installed():
    """Verify ECMWF specific libraries."""
    try:
        import ecmwf.opendata
    except ImportError as e:
        pytest.fail(f"Missing ECMWF dependency: {e}")

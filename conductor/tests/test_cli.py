import pytest
from click.testing import CliRunner
from unittest.mock import MagicMock, patch
from pathlib import Path
from slicer.cli import main

@pytest.fixture
def runner():
    return CliRunner()

@patch("slicer.core.SeedBuilder")
def test_slice_command(mock_seed_builder_class, runner, tmp_path):
    """Test the 'slice' CLI command."""
    # Setup mock
    mock_builder = mock_seed_builder_class.return_value
    output_file = tmp_path / "seed.parquet"
    output_file.touch() # Create dummy file
    mock_builder.build_seed.return_value = output_file
    
    # Run command
    result = runner.invoke(main, [
        "slice",
        "--lat", "21.0",
        "--lon", "-157.0",
        "--radius", "300",
        "--hours", "48",
        "--variables", "minimal",
        "--output", str(tmp_path)
    ])
    
    # Verify execution
    assert result.exit_code == 0
    assert "Success" in result.output
    
    # Verify arguments passed to builder
    mock_builder.build_seed.assert_called_once()
    kwargs = mock_builder.build_seed.call_args.kwargs
    assert kwargs["lat"] == 21.0
    assert kwargs["lon"] == -157.0
    assert kwargs["radius_nm"] == 300.0
    assert kwargs["forecast_hours"] == 48
    assert kwargs["variable_set"] == "minimal"

@patch("slicer.export.SeedExporter.read_protobuf_seed")
def test_info_command(mock_read_seed, runner, tmp_path):
    """Test the 'info' CLI command."""
    # Create a dummy seed file
    seed_file = tmp_path / "test.seed.zst"
    seed_file.touch()
    
    # Mock seed object
    mock_seed = MagicMock()
    mock_seed.seed_id = "test_seed_123"
    mock_seed.model_source = "test_model"
    mock_seed.model_run.strftime.return_value = "2026-01-01 12:00 UTC"
    mock_seed.forecast_start.strftime.return_value = "01/01 12:00"
    mock_seed.forecast_end.strftime.return_value = "01/04 12:00"
    mock_seed.resolution_deg = 0.25
    mock_seed.shape = (10, 20, 30)
    mock_seed.variables = {"u10": [], "v10": []}
    mock_seed.bounding_box.lat_min = 10
    mock_seed.bounding_box.lat_max = 20
    mock_seed.bounding_box.lon_min = -160
    mock_seed.bounding_box.lon_max = -150
    mock_seed.validate.return_value = [] # No issues
    
    mock_read_seed.return_value = mock_seed
    
    # Run command
    result = runner.invoke(main, ["info", str(seed_file)])
    
    # Verify execution
    assert result.exit_code == 0
    assert "Seed ID" in result.output
    assert "test_seed_123" in result.output
    assert "Seed validation passed" in result.output

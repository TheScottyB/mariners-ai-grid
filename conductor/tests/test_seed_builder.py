import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch
from slicer.core import SeedBuilder, BoundingBox

@patch("slicer.aifs.AIFSSlicer")
@patch("slicer.export.SeedExporter")
def test_seed_builder_orchestration(mock_exporter_class, mock_slicer_class, tmp_path):
    """Verify that SeedBuilder calls the components in the correct order."""
    builder = SeedBuilder(cache_dir=tmp_path / "cache", output_dir=tmp_path / "output")
    
    # Setup mocks
    mock_slicer = mock_slicer_class.return_value
    mock_seed = MagicMock()
    mock_slicer.slice.return_value = mock_seed
    
    mock_exporter = mock_exporter_class.return_value
    mock_path = tmp_path / "output" / "test.parquet"
    mock_exporter.to_parquet.return_value = (mock_path, MagicMock())
    
    # Execute
    result_path = builder.build_seed(lat=21.0, lon=-157.0, radius_nm=300, variable_set="minimal")
    
    # Verify BBox creation and Slicer call
    mock_slicer.slice.assert_called_once()
    args, kwargs = mock_slicer.slice.call_args
    bbox = args[0]
    assert isinstance(bbox, BoundingBox)
    assert bbox.lat_min < 21.0 < bbox.lat_max
    assert kwargs["variable_set"] == "minimal"
    
    # Verify Exporter call
    mock_exporter.to_parquet.assert_called_once_with(mock_seed)
    assert result_path == mock_path

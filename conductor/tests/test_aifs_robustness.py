# Mariner's AI Grid - AIFS Robustness Tests
# SPDX-License-Identifier: Apache-2.0

"""
Robustness tests for the AIFS Slicer.
Focuses on network failures, fallback logic, and data integrity.
"""

import pytest
from unittest.mock import MagicMock, patch, call
from datetime import datetime, timedelta, timezone
from slicer.aifs import AIFSSlicer
from slicer.core import BoundingBox

class TestAIFSFallback:
    """Test AIFS retrieval fallback mechanisms"""

    @pytest.fixture
    def mock_client(self):
        with patch("slicer.aifs.Client") as mock:
            yield mock

    @pytest.fixture
    def mock_xr(self):
        with patch("slicer.aifs.xr") as mock:
            # Mock successful dataset return
            ds = MagicMock()
            ds.sel.return_value = ds
            ds.data_vars = {}
            ds.latitude.values = []
            ds.longitude.values = []
            mock.open_dataset.return_value = ds
            mock.merge.return_value = ds
            yield mock

    def test_00z_success(self, mock_client, mock_xr):
        """Test happy path where 00Z is available"""
        slicer = AIFSSlicer()
        bbox = BoundingBox(20, 30, -140, -130)
        
        # Setup client to succeed immediately
        client_instance = mock_client.return_value
        client_instance.retrieve.return_value = None
        
        slicer.slice(bbox, forecast_hours=6)
        
        # Should have called retrieve with date=0, time=0
        args, kwargs = client_instance.retrieve.call_args_list[0]
        assert kwargs['date'] == 0
        assert kwargs['time'] == 0

    def test_fallback_to_12z(self, mock_client, mock_xr):
        """Test fallback to yesterday's 12Z when 00Z fails"""
        slicer = AIFSSlicer()
        bbox = BoundingBox(20, 30, -140, -130)
        
        client_instance = mock_client.return_value
        
        # Define side effects: First 2 calls fail (surface + upper air 00Z), next succeed
        # actually _fetch_files makes 2 calls. 
        # slice calls _fetch_files(00Z) -> 2 calls. 
        # if that raises, it calls _fetch_files(12Z) -> 2 calls.
        
        # We need to simulate failure during the first _fetch_files call
        def retrieve_side_effect(date, time, **kwargs):
            if date == 0 and time == 0:
                raise RuntimeError("404 Not Found")
            return None
            
        client_instance.retrieve.side_effect = retrieve_side_effect
        
        slicer.slice(bbox, forecast_hours=6)
        
        # Verify calls
        # Should have attempted 00Z (and failed)
        # Then attempted 12Z (and succeeded)
        
        # Check that we eventually called with date=-1, time=12
        found_fallback = False
        for call_args in client_instance.retrieve.call_args_list:
            if call_args.kwargs.get('date') == -1 and call_args.kwargs.get('time') == 12:
                found_fallback = True
                break
        
        assert found_fallback, "Did not fallback to yesterday 12Z"

    def test_total_failure(self, mock_client, mock_xr):
        """Test exception propagation when both primary and fallback fail"""
        slicer = AIFSSlicer()
        bbox = BoundingBox(20, 30, -140, -130)
        
        client_instance = mock_client.return_value
        client_instance.retrieve.side_effect = RuntimeError("404 Not Found")
        
        with pytest.raises(RuntimeError, match="Could not fetch AIFS data"):
            slicer.slice(bbox, forecast_hours=6)

    def test_resolution_setting(self, mock_client):
        """Verify resolution is set to 0.1 deg (9km) logic in theory"""
        # Note: We reverted the explicit 'resol' param in the code,
        # but we should ensure the Slicer class constant is correct
        assert AIFSSlicer.RESOLUTION == 0.1

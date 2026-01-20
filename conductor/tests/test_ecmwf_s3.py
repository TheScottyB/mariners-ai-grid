# Mariner's AI Grid - S3 Provider Tests
# SPDX-License-Identifier: Apache-2.0

import pytest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from slicer.s3_provider import S3DataProvider

class TestS3DataProvider:
    """Tests for the S3 Data Provider."""

    def test_grib_url_construction(self):
        provider = S3DataProvider()
        date = datetime(2026, 1, 19)
        url = provider.get_grib_url(date, "12z", "ifs", "0p25", "oper", 0)
        
        expected = "https://ecmwf-forecasts.s3.amazonaws.com/20260119/12z/ifs/0p25/oper/20260119120000-0h-oper-fc.grib2"
        assert url == expected

    def test_fetch_index_real(self):
        """Fetch a real index file from S3 to verify open access."""
        provider = S3DataProvider()
        # Use a recent date that should definitely be there
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1))
        
        # Test 00Z run, 0h step
        url = provider.get_grib_url(yesterday, "00z", "ifs", "0p25", "oper", 0)
        index = provider.get_index(url)
        
        if index:
            assert len(index) > 0
            assert "param" in index[0]
            assert "_offset" in index[0]
            print(f"\n[S3-Test] Successfully fetched index for {yesterday.strftime('%Y-%m-%d')} 00Z")
            print(f"  First parameter: {index[0]['param']}")
        else:
            pytest.skip("S3 data not yet available for target date or network issue")

    def test_byte_range_access(self, tmp_path):
        """Test partial download (Range request) on a real index-derived offset."""
        provider = S3DataProvider()
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1))
        url = provider.get_grib_url(yesterday, "00z", "ifs", "0p25", "oper", 0)
        
        index = provider.get_index(url)
        if not index:
            pytest.skip("Could not get index for range test")
            
        # Try to download the first message only
        first_msg = index[0]
        target = tmp_path / "part.grib2"
        
        success = provider.download_range(url, first_msg['_offset'], first_msg['_length'], target)
        
        assert success
        assert target.exists()
        assert target.stat().st_size == first_msg['_length']
        
        # Verify GRIB magic number
        with open(target, 'rb') as f:
            header = f.read(4)
            assert header == b'GRIB'
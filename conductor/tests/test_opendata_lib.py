# Mariner's AI Grid - ECMWF OpenData Library Test
# SPDX-License-Identifier: Apache-2.0

import pytest
from ecmwf.opendata import Client
import os
from pathlib import Path

class TestECMWFOpenDataLib:
    """
    Tests specific to the ecmwf-opendata library integration.
    Verifies that the high-level client can fetch data from mirrors.
    """

    def test_azure_mirror_0p25(self, tmp_path):
        """Test fetching 0.25 deg data via Azure mirror using the library."""
        print("\n[Lib-Test] Testing Azure Mirror (0.25 deg)...")
        
        client = Client(source="azure", model="ifs", resol="0p25")
        target = tmp_path / "azure_test.grib2"
        
        try:
            # Fetch just one parameter (10u) for one step to keep it light
            client.retrieve(
                date=-1,          # Yesterday (safe availability)
                time=0,           # 00Z
                step=6,
                type="fc",
                param=["10u"],
                target=str(target)
            )
            
            assert target.exists()
            assert target.stat().st_size > 0
            print(f"  ✅ Success: Downloaded {target.stat().st_size} bytes from Azure")
            
        except Exception as e:
            pytest.fail(f"Azure retrieval failed: {e}")

    def test_aws_mirror_0p25(self, tmp_path):
        """Test fetching 0.25 deg data via AWS mirror using the library."""
        print("\n[Lib-Test] Testing AWS Mirror (0.25 deg)...")
        
        client = Client(source="aws", model="ifs", resol="0p25")
        target = tmp_path / "aws_test.grib2"
        
        try:
            client.retrieve(
                date=-1,
                time=0,
                step=6,
                type="fc",
                param=["10u"],
                target=str(target)
            )
            
            assert target.exists()
            assert target.stat().st_size > 0
            print(f"  ✅ Success: Downloaded {target.stat().st_size} bytes from AWS")
            
        except Exception as e:
            pytest.fail(f"AWS retrieval failed: {e}")

if __name__ == "__main__":
    # Allow running directly for quick check
    import sys
    import tempfile
    
    t = TestECMWFOpenDataLib()
    with tempfile.TemporaryDirectory() as td:
        path = Path(td)
        print("Running manual tests...")
        try:
            t.test_azure_mirror_0p25(path)
            t.test_aws_mirror_0p25(path)
            print("\n🎉 All library tests passed!")
        except Exception as e:
            print(f"\n❌ Test failed: {e}")
            sys.exit(1)

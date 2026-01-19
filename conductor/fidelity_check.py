# Mariner's AI Grid - Truth Layer Audit
# SPDX-License-Identifier: Apache-2.0

"""
Fidelity Check: Verifies that the compression pipeline maintains
meteorological accuracy within safe limits (< 0.5 knots).
"""

import numpy as np
import pandas as pd
from slicer.compression import Quantizer
from slicer.quantization_config import get_quantization_rule

def run_fidelity_check():
    print("="*60)
    print("Truth Layer Audit: Fidelity Check")
    print("="*60)

    # 1. Simulate "Original" High-Precision Data
    # 30N, 140W Midpoint wind speed
    # Let's say the GRIB has 15.234567 m/s (~29.6 knots)
    original_ms = 15.234567
    original_knots = original_ms * 1.94384
    
    print(f"\n[Original GRIB]")
    print(f"  Wind Speed: {original_ms:.6f} m/s ({original_knots:.6f} knots)")

    # 2. Apply Slicer Quantization
    rule = get_quantization_rule("u10") # Same rule for scalar speed
    
    # Compress
    # We treat the scalar as a 1-element array for the quantizer
    data_array = np.array([original_ms], dtype=np.float32)
    compressed, params = Quantizer.compress_variable(
        data_array, 
        step=rule.step, 
        precision_bits=rule.bits
    )
    
    # 3. Decompress (What the boat sees)
    restored_array = Quantizer.decompress_variable(compressed, params)
    restored_ms = float(restored_array[0])
    restored_knots = restored_ms * 1.94384
    
    print(f"\n[Compressed Seed]")
    print(f"  Wind Speed: {restored_ms:.6f} m/s ({restored_knots:.6f} knots)")
    print(f"  Step Size:  {rule.step} m/s")
    
    # 4. Calculate Delta
    delta_ms = abs(original_ms - restored_ms)
    delta_knots = abs(original_knots - restored_knots)
    
    print(f"\n[Delta]")
    print(f"  Diff: {delta_knots:.6f} knots")
    
    # 5. Verdict
    THRESHOLD = 0.5 # knots
    if delta_knots < THRESHOLD:
        print(f"\n✅ PASS: Delta ({delta_knots:.4f} kt) < Threshold ({THRESHOLD} kt)")
        print("  Production-grade compression achieved.")
    else:
        print(f"\n❌ FAIL: Delta ({delta_knots:.4f} kt) > Threshold ({THRESHOLD} kt)")
        print("  Compression too aggressive.")

if __name__ == "__main__":
    run_fidelity_check()

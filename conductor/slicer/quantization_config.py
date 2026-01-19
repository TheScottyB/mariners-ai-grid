# Mariner's AI Grid - Quantization Configuration
# SPDX-License-Identifier: Apache-2.0

"""
Quantization strategies for marine variables.
Optimized for satellite bandwidth (Starlink/Iridium).

Strategy:
- Wind: Round to nearest 0.1 m/s (approx 0.2 knots). 
  - Sailors read analog gauges to ~1 kt. 0.2kt is precision surplus.
- Pressure: Round to nearest 10 Pa (0.1 mb/hPa).
  - Standard barometer precision.
- Waves: Round to nearest 0.1 m.
- Direction: Round to nearest 1 degree.
"""

from dataclasses import dataclass
from typing import Dict

@dataclass
class QuantizationRule:
    step: float  # The smallest increment (e.g., 0.1 for 1 decimal place)
    bits: int    # Target bit depth (8, 16) - used for packing hints

# Default quantization rules
# ECMWF native units are SI (m/s, Pa, m, K)
QUANTIZATION_RULES: Dict[str, QuantizationRule] = {
    # Wind Components (m/s) -> 0.1 m/s (~0.2 knots)
    "u10": QuantizationRule(step=0.1, bits=16),
    "v10": QuantizationRule(step=0.1, bits=16),
    "gust": QuantizationRule(step=0.1, bits=16),
    
    # Pressure (Pa) -> 10 Pa (0.1 hPa/mb)
    "msl": QuantizationRule(step=10.0, bits=16),
    
    # Waves (m) -> 0.1 m
    "swh": QuantizationRule(step=0.1, bits=8), # Wave height rarely exceeds 25m, fits in uint8 with 0.1 step? No, 25/0.1 = 250. Fits in 8-bit (0-255).
    
    # Wave Period (s) -> 0.1 s
    "mwp": QuantizationRule(step=0.1, bits=8), # Period < 25s typically
    
    # Direction (degrees) -> 1 degree
    "mwd": QuantizationRule(step=1.0, bits=9), # 0-360 fits in 9 bits (packed into 16)
    
    # Temperature (K) -> 0.1 K
    "t2m": QuantizationRule(step=0.1, bits=16),
    "sst": QuantizationRule(step=0.1, bits=16),
    
    # Precipitation (m) -> 0.0001 m (0.1 mm) - needs high precision for accumulation
    "tp": QuantizationRule(step=0.0001, bits=16),
    
    # GraphCast Upper Air
    "z": QuantizationRule(step=10.0, bits=16), # Geopotential (m^2/s^2) ~ 1m height
    "q": QuantizationRule(step=0.00001, bits=16), # Specific humidity (kg/kg)
    "t": QuantizationRule(step=0.1, bits=16),
    "u": QuantizationRule(step=0.1, bits=16),
    "v": QuantizationRule(step=0.1, bits=16),
}

def get_quantization_rule(var_name: str) -> QuantizationRule:
    """Get rule for variable, default to high precision if unknown."""
    return QUANTIZATION_RULES.get(var_name, QuantizationRule(step=0.000001, bits=32))

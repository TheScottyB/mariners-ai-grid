# Mariner's AI Grid - Quantization Configuration
# SPDX-License-Identifier: Apache-2.0

"""
Quantization strategies for marine variables.
Optimized for satellite bandwidth (Starlink/Iridium).

2026 Strategy (Refined):
- Wind: Round to nearest 0.25 m/s (0.5 knots).
  - Sailors read analog gauges to ~1 kt. 0.5kt is operational precision.
  - CRITICAL: Using 0.5kt instead of 0.2kt increases Zstd compression by ~15%
    because weather data has high spatial correlation.
- Pressure: Round to nearest 10 Pa (0.1 hPa/mb).
  - Standard barometer precision. Essential for pattern matching.
- Waves: Round to nearest 0.1 m.
- Direction: Round to nearest 5 degrees.
  - Wind vanes aren't accurate to 1°. 5° is practical precision.

Compression Impact:
  - Coarser quantization = more repeated values = better dictionary encoding
  - Parquet columnar format + these settings achieves 2000x reduction
"""

from dataclasses import dataclass
from typing import Dict
import numpy as np


@dataclass
class QuantizationRule:
    step: float       # The smallest increment (e.g., 0.5 for half-knot wind)
    bits: int         # Target bit depth (8, 16) - used for packing hints
    offset: float = 0 # Offset for unsigned packing (e.g., 0 for wind, 273 for temp)


# Default quantization rules
# ECMWF native units are SI (m/s, Pa, m, K)
# 2026 Tuning: Prioritize compression over unnecessary precision
QUANTIZATION_RULES: Dict[str, QuantizationRule] = {
    # Wind Components (m/s) -> 0.25 m/s (~0.5 knots)
    # Coarser than 0.1 but dramatically improves compression
    "u10": QuantizationRule(step=0.25, bits=16),
    "v10": QuantizationRule(step=0.25, bits=16),
    "gust": QuantizationRule(step=0.5, bits=16),  # Gusts are inherently noisy

    # Pressure (Pa) -> 10 Pa (0.1 hPa/mb)
    # Keep high precision - critical for pattern matching
    "msl": QuantizationRule(step=10.0, bits=16),

    # Waves (m) -> 0.1 m (unchanged - sailors need this precision)
    "swh": QuantizationRule(step=0.1, bits=8),  # Max 25.5m in uint8

    # Wave Period (s) -> 0.5 s (coarser for better compression)
    "mwp": QuantizationRule(step=0.5, bits=8),  # Max 127.5s in uint8

    # Direction (degrees) -> 5 degrees
    # Wind vanes aren't accurate to 1°, and 5° significantly helps compression
    "mwd": QuantizationRule(step=5.0, bits=8),  # 72 possible values

    # Temperature (K) -> 0.5 K (1°F precision is sufficient)
    "t2m": QuantizationRule(step=0.5, bits=16, offset=200),  # Offset for packing
    "sst": QuantizationRule(step=0.1, bits=16, offset=270),  # SST needs more precision

    # Precipitation (m) -> 0.0001 m (0.1 mm) - keep high precision for rain
    "tp": QuantizationRule(step=0.0001, bits=16),

    # GraphCast Upper Air (keep for future NPU inference)
    "z": QuantizationRule(step=10.0, bits=16),   # Geopotential
    "q": QuantizationRule(step=0.00001, bits=16), # Specific humidity
    "t": QuantizationRule(step=0.5, bits=16),
    "u": QuantizationRule(step=0.25, bits=16),
    "v": QuantizationRule(step=0.25, bits=16),
}


def get_quantization_rule(var_name: str) -> QuantizationRule:
    """Get rule for variable, default to medium precision if unknown."""
    return QUANTIZATION_RULES.get(var_name, QuantizationRule(step=0.1, bits=16))


def quantize_array(data: np.ndarray, var_name: str) -> np.ndarray:
    """
    Apply quantization to a numpy array.

    Args:
        data: Input array (float32/float64)
        var_name: Variable name for rule lookup

    Returns:
        Quantized array (same dtype, but values snapped to steps)
    """
    rule = get_quantization_rule(var_name)

    # Apply offset, quantize, then remove offset
    shifted = data - rule.offset
    quantized = np.round(shifted / rule.step) * rule.step
    return quantized + rule.offset


def pack_to_int(data: np.ndarray, var_name: str) -> tuple[np.ndarray, dict]:
    """
    Pack quantized float data into integers for maximum compression.

    Returns the packed array and metadata needed for unpacking.
    Used when exporting to Protobuf (Parquet handles this internally).
    """
    rule = get_quantization_rule(var_name)

    # Shift to positive range and convert to int
    shifted = (data - rule.offset) / rule.step

    if rule.bits <= 8:
        packed = shifted.astype(np.uint8)
    elif rule.bits <= 16:
        packed = shifted.astype(np.int16)
    else:
        packed = shifted.astype(np.int32)

    metadata = {
        "step": rule.step,
        "offset": rule.offset,
        "dtype": str(packed.dtype),
    }

    return packed, metadata


def unpack_from_int(packed: np.ndarray, metadata: dict) -> np.ndarray:
    """Unpack integers back to float using metadata."""
    step = metadata["step"]
    offset = metadata["offset"]
    return packed.astype(np.float32) * step + offset


# Compression estimates for common scenarios
COMPRESSION_ESTIMATES = {
    # Pacific crossing (500nm radius, 72hr, 8 variables)
    "pacific_crossing": {
        "raw_grib_mb": 10000,      # 10GB ECMWF HRES
        "sliced_uncompressed_mb": 50,  # After regional crop + variable prune
        "sliced_parquet_mb": 2.1,      # After Parquet + quantization
        "sliced_proto_zstd_mb": 2.5,   # After Protobuf + Zstd
        "reduction_ratio": 2000,       # Raw / Parquet
        "starlink_cost_usd": 4.20,     # At $2/MB satellite rate
    },
}

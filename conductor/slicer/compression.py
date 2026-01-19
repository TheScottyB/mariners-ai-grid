# Mariner's AI Grid - Data Compression
# SPDX-License-Identifier: Apache-2.0

"""
Advanced compression logic for Weather Seeds.
Implements:
1. Precision Quantization (Float32 -> Int16/Int8 with scale/offset)
2. Bit-packing (reducing entropy)
3. Zstandard dictionary training (future scope)
"""

import numpy as np
from dataclasses import dataclass
from typing import Tuple

@dataclass
class QuantizationParams:
    scale: float
    offset: float
    min_val: float
    max_val: float
    dtype: np.dtype

class Quantizer:
    """
    Quantizes floating point arrays to integer representations to save space.
    """

    @staticmethod
    def compress_variable(
        data: np.ndarray, 
        step: float = 0.0, 
        precision_bits: int = 16
    ) -> Tuple[np.ndarray, QuantizationParams]:
        """
        Compress float array to integer array with specific step precision.
        
        Args:
            data: Input float array (e.g., wind speed)
            step: Desired resolution (e.g., 0.1 for wind). If 0, uses max range scaling.
            precision_bits: 8 or 16 (target container size)
            
        Returns:
            Tuple of (compressed_array, params)
        """
        # Handle NaNs
        data_clean = np.nan_to_num(data, nan=0.0)
        
        # 1. "Pre-quantize" to grid: Snap values to nearest step
        # This increases entropy (runs of identical values) for Zstd
        if step > 0:
            data_clean = np.round(data_clean / step) * step
        
        min_val = float(data_clean.min())
        max_val = float(data_clean.max())
        
        # 2. Integer Encoding
        # We map the physical range [min, max] to integer range [0, 2^bits - 1]
        # BUT, to preserve the 'step', we ideally want scale = step.
        # Let's check if the range fits with scale=step.
        
        range_val = max_val - min_val
        
        if step > 0:
            # Try to use the step as the scale directly
            # This is "Fixed Point" encoding
            required_steps = range_val / step
            max_int = (2 ** precision_bits) - 1
            
            if required_steps <= max_int:
                scale = step
            else:
                # Fallback: Range is too large for bits at this step size
                # Must reduce precision to fit
                scale = range_val / max_int
        else:
            # Auto-scale mode
            if range_val == 0:
                scale = 1.0
            else:
                max_int = (2 ** precision_bits) - 1
                scale = range_val / max_int
            
        offset = min_val
        
        # Quantize: integer = (value - offset) / scale
        if scale == 0:
            quantized = np.zeros_like(data_clean)
        else:
            quantized = np.round((data_clean - offset) / scale)
            
        # Cast to appropriate type
        if precision_bits <= 8:
            dtype = np.uint8
        elif precision_bits <= 16:
            dtype = np.uint16
        else:
            # 32-bit not implemented yet for proto packing
            dtype = np.uint16 
            
        return quantized.astype(dtype), QuantizationParams(
            scale=scale,
            offset=offset,
            min_val=min_val,
            max_val=max_val,
            dtype=dtype
        )

    @staticmethod
    def decompress_variable(data: np.ndarray, params: QuantizationParams) -> np.ndarray:
        """
        Decompress integer array back to float.
        """
        return params.offset + (data.astype(np.float32) * params.scale)
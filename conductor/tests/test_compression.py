# Mariner's AI Grid - Compression Tests
# SPDX-License-Identifier: Apache-2.0

import numpy as np
import pytest
from slicer.compression import Quantizer

class TestQuantizer:
    
    def test_compress_decompress_16bit(self):
        """Test 16-bit quantization roundtrip"""
        # Create synthetic wind data (0 to 50 m/s)
        original = np.linspace(0, 50, 1000).astype(np.float32)
        
        # Add some random noise
        np.random.seed(42)
        original += np.random.normal(0, 0.5, 1000)
        
        compressed, params = Quantizer.compress_variable(original, precision_bits=16)
        
        assert compressed.dtype == np.uint16
        
        decompressed = Quantizer.decompress_variable(compressed, params)
        
        # Check max error (should be small for 16-bit)
        # Range is 50, steps ~65536 -> resolution ~0.0007
        max_error = np.max(np.abs(original - decompressed))
        assert max_error < 0.01

    def test_compress_decompress_8bit(self):
        """Test 8-bit quantization (lower precision, smaller size)"""
        # Cloud cover (0 to 1)
        original = np.linspace(0, 1, 100).astype(np.float32)
        
        compressed, params = Quantizer.compress_variable(original, precision_bits=8)
        
        assert compressed.dtype == np.uint8
        
        decompressed = Quantizer.decompress_variable(compressed, params)
        
        # Range is 1, steps 255 -> resolution ~0.004
        max_error = np.max(np.abs(original - decompressed))
        assert max_error < 0.01

    def test_constant_field(self):
        """Test compressing a field with zero variance"""
        original = np.ones(100).astype(np.float32) * 101325.0 # Pressure
        
        compressed, params = Quantizer.compress_variable(original, precision_bits=16)
        decompressed = Quantizer.decompress_variable(compressed, params)
        
        assert np.allclose(original, decompressed)

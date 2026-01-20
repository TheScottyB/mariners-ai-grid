import pytest
import numpy as np
from slicer.quantization_config import quantize_array, pack_to_int, unpack_from_int, get_quantization_rule

def test_quantization_wind():
    """Test wind quantization (0.25 m/s steps)."""
    # 10.123 -> 10.125 (closest 0.25 step)
    # 10.400 -> 10.500
    data = np.array([10.123, 10.400], dtype=np.float32)
    quantized = quantize_array(data, "u10")
    
    assert quantized[0] == 10.0 # Wait, 10.123 / 0.25 = 40.492 -> round 40 -> 10.0?
    # No, 10.123 / 0.25 = 40.492. Rounding 40.492 gives 40. 40 * 0.25 = 10.0.
    # Actually, 10.125 / 0.25 = 40.5. Rounding 40.5 might give 40 or 41 depending on tie-breaking.
    
    # Let's use clearer values
    data = np.array([10.0, 10.25, 10.125, 10.13], dtype=np.float32)
    quantized = quantize_array(data, "u10")
    assert quantized[0] == 10.0
    assert quantized[1] == 10.25
    # 10.125 / 0.25 = 40.5. np.round(40.5) is 40.0 (round to even).
    assert quantized[2] == 10.0
    # 10.13 / 0.25 = 40.52. np.round(40.52) is 41.0. 41 * 0.25 = 10.25.
    assert quantized[3] == 10.25

def test_quantization_pressure():
    """Test pressure quantization (10 Pa steps)."""
    data = np.array([101325.0, 101324.0, 101326.0], dtype=np.float32)
    quantized = quantize_array(data, "msl")
    
    # 101325 -> 101330 or 101320?
    # (101325 - 80000) / 10 = 2132.5. np.round(2132.5) = 2132. 2132 * 10 + 80000 = 101320.
    assert quantized[0] == 101320.0 # Round to even
    assert quantized[1] == 101320.0
    assert quantized[2] == 101330.0

def test_pack_unpack_cycle():
    """Verify that packing to int and unpacking preserves quantized values."""
    data = np.array([10.123, 15.678, -5.432], dtype=np.float32)
    var_name = "u10"
    
    quantized_expected = quantize_array(data, var_name)
    packed, meta = pack_to_int(data, var_name)
    unpacked = unpack_from_int(packed, meta)
    
    np.testing.assert_array_almost_equal(unpacked, quantized_expected)
    assert packed.dtype == np.int16

def test_pack_to_int_8bit():
    """Verify 8-bit packing."""
    data = np.array([0, 5, 10, 355], dtype=np.float32)
    var_name = "mwd" # bits=8
    packed, meta = pack_to_int(data, var_name)
    assert packed.dtype == np.uint8
    assert packed[0] == 0
    assert packed[1] == 1 # 5/5
    assert packed[3] == 71 # 355/5

def test_pack_to_int_32bit():
    """Verify 32-bit packing fallback."""
    # Create a dummy rule with 32 bits
    from slicer.quantization_config import QUANTIZATION_RULES, QuantizationRule
    QUANTIZATION_RULES["large_var"] = QuantizationRule(step=1.0, bits=32)
    
    data = np.array([1000000.0], dtype=np.float32)
    packed, meta = pack_to_int(data, "large_var")
    assert packed.dtype == np.int32
    assert packed[0] == 1000000

def test_direction_quantization():
    """Test direction quantization (5 degree steps)."""
    data = np.array([12.0, 13.0, 17.0, 18.0], dtype=np.float32)
    quantized = quantize_array(data, "mwd")
    
    # 12 -> 10
    # 13 -> 15 (13/5 = 2.6 -> 3)
    # 17 -> 15 (17/5 = 3.4 -> 3)
    # 18 -> 20 (18/5 = 3.6 -> 4)
    assert quantized[0] == 10.0
    assert quantized[1] == 15.0
    assert quantized[2] == 15.0
    assert quantized[3] == 20.0

def test_unknown_variable_defaults():
    """Verify that unknown variables use a default rule."""
    data = np.array([1.234, 1.267], dtype=np.float32)
    quantized = quantize_array(data, "unknown_var")
    
    # Default step is 0.1
    assert quantized[0] == pytest.approx(1.2)
    assert quantized[1] == pytest.approx(1.3)

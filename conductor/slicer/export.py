# Mariner's AI Grid - Seed Export Formats
# SPDX-License-Identifier: Apache-2.0

"""
Export WeatherSeed to compact formats for satellite transmission.

Supported formats:
1. Parquet (Apache Arrow) - Columnar, excellent compression, AI-inference ready
2. Protobuf - Ultra-compact binary, cross-platform, mobile-optimized

Both formats use Zstandard compression for best size/speed tradeoff.
Target: Reduce 10GB GRIB to ~5MB Seed.
"""

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional, Union
import io
import json
import logging

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class ExportStats:
    """Statistics from seed export operation"""
    input_bytes: int
    output_bytes: int
    compression_ratio: float
    format: str
    variables: list[str]
    grid_points: int
    time_steps: int
    cost_estimates: dict[str, float]  # Provider -> Cost USD


class SeedExporter:
    """
    Exports WeatherSeed to compact transmission formats.

    Achieves 10GB -> 5MB reduction through:
    1. Geographic cropping (already done by slicer)
    2. Variable pruning (already done by slicer)
    3. Precision reduction (quantization)
    4. Columnar storage (Parquet) or binary packing (Protobuf)
    5. Zstandard compression
    """

    # Compression levels (higher = smaller file, slower encoding)
    COMPRESSION_LEVEL_FAST = 3      # Quick preview
    COMPRESSION_LEVEL_DEFAULT = 9   # Balanced
    COMPRESSION_LEVEL_MAX = 19      # Maximum compression (slow)

    def __init__(
        self,
        output_dir: Optional[Path] = None,
        compression_level: int = COMPRESSION_LEVEL_DEFAULT,
    ):
        """
        Initialize exporter.

        Args:
            output_dir: Directory for exported files
            compression_level: Zstandard level (1-22, default 9)
        """
        self.output_dir = Path(output_dir) if output_dir else Path.cwd()
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.compression_level = compression_level

    def to_parquet(
        self,
        seed: "WeatherSeed",
        filename: Optional[str] = None,
        quantize: bool = True,
    ) -> tuple[Path, ExportStats]:
        """
        Export seed to Parquet format.

        Parquet advantages:
        - Columnar storage (efficient for AI inference)
        - Built-in zstd compression
        - Direct to pandas/numpy/polars
        - Smaller than raw arrays

        Args:
            seed: WeatherSeed to export
            filename: Output filename (default: auto-generated)
            quantize: Apply precision reduction (recommended)

        Returns:
            Tuple of (output path, export statistics)
        """
        import pyarrow as pa
        import pyarrow.parquet as pq

        from slicer.variables import MARINE_VARIABLES, VariablePruner
        from slicer.cost_model import SatelliteCostModel

        if filename is None:
            filename = f"{seed.seed_id}.parquet"

        output_path = self.output_dir / filename

        # Flatten 3D arrays to 2D table (time, lat, lon) -> (row, columns)
        n_times, n_lats, n_lons = seed.shape
        n_rows = n_times * n_lats * n_lons

        # Build coordinate columns
        time_idx = np.repeat(np.arange(n_times), n_lats * n_lons)
        lat_idx = np.tile(np.repeat(np.arange(n_lats), n_lons), n_times)
        lon_idx = np.tile(np.arange(n_lons), n_times * n_lats)

        times_epoch = np.array([
            int(t.timestamp()) for t in seed.times
        ], dtype=np.int64)

        columns = {
            "time_idx": time_idx.astype(np.int16),
            "time_epoch": times_epoch[time_idx],
            "lat": seed.latitudes[lat_idx].astype(np.float32),
            "lon": seed.longitudes[lon_idx].astype(np.float32),
        }

        # Add variable columns
        pruner = VariablePruner("full")
        input_bytes = 0

        for var_name, arr in seed.variables.items():
            input_bytes += arr.nbytes
            flat = arr.flatten()

            # Apply quantization if requested
            if quantize and var_name in MARINE_VARIABLES:
                var_def = MARINE_VARIABLES[var_name]
                flat = pruner.quantize_array(flat, var_def)

            columns[var_name] = flat

        # Create PyArrow table
        table = pa.table(columns)

        # Write with zstd compression
        pq.write_table(
            table,
            output_path,
            compression="zstd",
            compression_level=self.compression_level,
        )

        output_bytes = output_path.stat().st_size

        stats = ExportStats(
            input_bytes=input_bytes,
            output_bytes=output_bytes,
            compression_ratio=input_bytes / output_bytes if output_bytes > 0 else 0,
            format="parquet",
            variables=list(seed.variables.keys()),
            grid_points=n_lats * n_lons,
            time_steps=n_times,
            cost_estimates=SatelliteCostModel.get_all_estimates(output_bytes),
        )

        logger.info(
            f"Exported to Parquet: {output_bytes / 1024:.1f} KB "
            f"({stats.compression_ratio:.1f}x compression)"
        )

        return output_path, stats

    def to_protobuf(
        self,
        seed: "WeatherSeed",
        filename: Optional[str] = None,
        quantize: bool = True,
    ) -> tuple[Path, ExportStats]:
        """
        Export seed to Protobuf format with Zstandard compression.

        Protobuf advantages:
        - Ultra-compact binary format
        - Fast parsing on mobile devices
        - Smaller wire format than Parquet
        - Cross-platform (iOS/Android/Python)

        Args:
            seed: WeatherSeed to export
            filename: Output filename (default: auto-generated)
            quantize: Apply precision reduction

        Returns:
            Tuple of (output path, export statistics)
        """
        import zstandard as zstd
        from schema import weather_seed_pb2
        from slicer.variables import MARINE_VARIABLES
        from slicer.compression import Quantizer
        from slicer.quantization_config import get_quantization_rule
        from slicer.cost_model import SatelliteCostModel

        if filename is None:
            filename = f"{seed.seed_id}.seed.zst"

        output_path = self.output_dir / filename

        # 1. Build Protobuf Message
        pb_seed = weather_seed_pb2.WeatherSeed()
        pb_seed.seed_id = seed.seed_id
        pb_seed.model_source = seed.model_source
        pb_seed.model_run_iso = seed.model_run.isoformat()
        pb_seed.created_at_iso = seed.created_at.isoformat()
        
        # Spatial
        pb_seed.bounding_box.lat_min = seed.bounding_box.lat_min
        pb_seed.bounding_box.lat_max = seed.bounding_box.lat_max
        pb_seed.bounding_box.lon_min = seed.bounding_box.lon_min
        pb_seed.bounding_box.lon_max = seed.bounding_box.lon_max
        pb_seed.resolution_deg = seed.resolution_deg
        
        # Temporal
        pb_seed.forecast_start_iso = seed.forecast_start.isoformat()
        pb_seed.forecast_end_iso = seed.forecast_end.isoformat()
        pb_seed.time_step_hours = seed.time_step_hours
        pb_seed.time_steps_iso.extend([t.isoformat() for t in seed.times])
        
        # Coordinates
        pb_seed.latitudes.extend(seed.latitudes)
        pb_seed.longitudes.extend(seed.longitudes)
        
        # Variable Data
        input_bytes = 0
        
        for var_name in sorted(seed.variables.keys()):
            arr = seed.variables[var_name]
            input_bytes += arr.nbytes
            flat = arr.flatten() # Flatten 3D -> 1D
            
            pb_var = pb_seed.variables.add()
            pb_var.name = var_name

            # Apply advanced quantization
            if quantize:
                rule = get_quantization_rule(var_name)
                # Apply variable-specific step/bits
                q_arr, params = Quantizer.compress_variable(
                    flat, 
                    step=rule.step, 
                    precision_bits=rule.bits
                )
                
                pb_var.data.quantized_values.extend(q_arr.tolist())
                pb_var.data.scale_factor = params.scale
                pb_var.data.add_offset = params.offset
            else:
                # Fallback to raw floats (e.g. unlisted vars or quantize=False)
                pb_var.data.values.extend(flat.tolist())

        # Metadata
        for k, v in seed.metadata.items():
            pb_seed.meta_tags[k] = str(v)

        # 2. Serialize to bytes
        serialized_proto = pb_seed.SerializeToString()

        # 3. Compress with Zstandard
        cctx = zstd.ZstdCompressor(level=self.compression_level)
        compressed_data = cctx.compress(serialized_proto)

        # 4. Write to file
        with open(output_path, "wb") as f:
            f.write(compressed_data)

        output_bytes = output_path.stat().st_size

        stats = ExportStats(
            input_bytes=input_bytes,
            output_bytes=output_bytes,
            compression_ratio=input_bytes / output_bytes if output_bytes > 0 else 0,
            format="protobuf+zstd",
            variables=list(seed.variables.keys()),
            grid_points=len(seed.latitudes) * len(seed.longitudes),
            time_steps=len(seed.times),
            cost_estimates=SatelliteCostModel.get_all_estimates(output_bytes),
        )

        logger.info(
            f"Exported to Protobuf+zstd: {output_bytes / 1024:.1f} KB "
            f"({stats.compression_ratio:.1f}x compression)"
        )

        return output_path, stats

    @staticmethod
    def read_protobuf_seed(filepath: Path) -> "WeatherSeed":
        """
        Read a .seed.zst file back into a WeatherSeed.
        Uses the shared Protobuf schema.
        """
        import zstandard as zstd
        from slicer.core import BoundingBox, WeatherSeed
        from schema import weather_seed_pb2
        from slicer.compression import Quantizer, QuantizationParams
        from datetime import datetime

        # 1. Decompress
        with open(filepath, "rb") as f:
            compressed = f.read()

        dctx = zstd.ZstdDecompressor()
        serialized_proto = dctx.decompress(compressed)

        # 2. Parse Protobuf
        pb_seed = weather_seed_pb2.WeatherSeed()
        pb_seed.ParseFromString(serialized_proto)

        # 3. Reconstruct WeatherSeed
        
        # Coordinates
        lats = np.array(pb_seed.latitudes, dtype=np.float32)
        lons = np.array(pb_seed.longitudes, dtype=np.float32)
        times = [datetime.fromisoformat(t) for t in pb_seed.time_steps_iso]
        
        # Variables
        # Shape: (time, lat, lon)
        shape = (len(times), len(lats), len(lons))
        variables = {}
        
        for pb_var in pb_seed.variables:
            if len(pb_var.data.quantized_values) > 0:
                # Decompress quantized
                q_arr = np.array(pb_var.data.quantized_values, dtype=np.int32)
                params = QuantizationParams(
                    scale=pb_var.data.scale_factor,
                    offset=pb_var.data.add_offset,
                    min_val=0, max_val=0, dtype=np.int32 # Unused for decompression
                )
                flat_arr = Quantizer.decompress_variable(q_arr, params)
            else:
                # Read raw
                flat_arr = np.array(pb_var.data.values, dtype=np.float32)
                
            if len(flat_arr) > 0:
                variables[pb_var.name] = flat_arr.reshape(shape)
            else:
                variables[pb_var.name] = np.zeros(shape, dtype=np.float32)

        return WeatherSeed(
            seed_id=pb_seed.seed_id,
            created_at=datetime.fromisoformat(pb_seed.created_at_iso),
            model_source=pb_seed.model_source,
            model_run=datetime.fromisoformat(pb_seed.model_run_iso),
            bounding_box=BoundingBox(
                lat_min=pb_seed.bounding_box.lat_min,
                lat_max=pb_seed.bounding_box.lat_max,
                lon_min=pb_seed.bounding_box.lon_min,
                lon_max=pb_seed.bounding_box.lon_max
            ),
            resolution_deg=pb_seed.resolution_deg,
            forecast_start=datetime.fromisoformat(pb_seed.forecast_start_iso),
            forecast_end=datetime.fromisoformat(pb_seed.forecast_end_iso),
            time_step_hours=pb_seed.time_step_hours,
            variables=variables,
            latitudes=lats,
            longitudes=lons,
            times=times,
            metadata=dict(pb_seed.meta_tags),
        )


def compare_formats(seed: "WeatherSeed", output_dir: Path) -> dict:
    """
    Compare Parquet vs Protobuf export for a given seed.

    Returns comparison statistics.
    """
    exporter = SeedExporter(output_dir)

    parquet_path, parquet_stats = exporter.to_parquet(seed)
    proto_path, proto_stats = exporter.to_protobuf(seed)

    return {
        "parquet": {
            "path": str(parquet_path),
            "size_kb": parquet_stats.output_bytes / 1024,
            "compression_ratio": parquet_stats.compression_ratio,
            "cost_estimates": parquet_stats.cost_estimates,
        },
        "protobuf": {
            "path": str(proto_path),
            "size_kb": proto_stats.output_bytes / 1024,
            "compression_ratio": proto_stats.compression_ratio,
            "cost_estimates": proto_stats.cost_estimates,
        },
        "recommendation": (
            "protobuf" if proto_stats.output_bytes < parquet_stats.output_bytes
            else "parquet"
        ),
    }

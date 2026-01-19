# Mariner's AI Grid - Weather Data Slicer
# SPDX-License-Identifier: Apache-2.0

"""
Regional weather data slicer for offshore marine navigation.

Transforms 10GB ECMWF HRES GRIB files into ~5MB "Seeds" suitable for
satellite transmission (Starlink/Iridium).

Core operations:
1. Geographical Cropping: Extract 500nm radius around route waypoints
2. Variable Pruning: Select only marine-critical parameters
3. Seed Compression: Zstandard-compressed Protobuf or Parquet output
"""

from slicer.core import (
    BoundingBox,
    WeatherSeed,
    ECMWFHRESSlicer,
)
from slicer.aifs import AIFSSlicer
from slicer.variables import MARINE_VARIABLES, VariablePruner
from slicer.export import SeedExporter

__version__ = "0.1.0"

__all__ = [
    "BoundingBox",
    "WeatherSeed",
    "ECMWFHRESSlicer",
    "AIFSSlicer",
    "MARINE_VARIABLES",
    "VariablePruner",
    "SeedExporter",
]

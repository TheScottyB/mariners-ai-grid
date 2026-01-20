# Mariner's AI Grid - Variable Pruning
# SPDX-License-Identifier: Apache-2.0

"""
Variable pruning configuration for ECMWF HRES marine applications.

ECMWF HRES contains 100+ variables. We only need ~15 for marine navigation.
This module defines the "essential" variable set and handles the pruning logic.

Variable Naming Convention (ECMWF GRIB2):
- shortName: GRIB parameter short name (e.g., "10u", "msl")
- cfVarName: CF-compliant name for xarray (e.g., "u10", "msl")
- paramId: ECMWF parameter ID for CDS API requests
"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional
import numpy as np


class VariableCategory(Enum):
    """Categories of marine weather variables"""
    WIND = "wind"
    PRESSURE = "pressure"
    WAVES = "waves"
    PRECIPITATION = "precipitation"
    VISIBILITY = "visibility"
    TEMPERATURE = "temperature"
    HUMIDITY = "humidity"
    CURRENT = "current"


@dataclass(frozen=True)
class MarineVariable:
    """Definition of a marine-critical weather variable"""

    # Identifiers
    short_name: str          # ECMWF GRIB short name
    param_id: int            # ECMWF parameter ID
    cf_name: str             # CF-compliant variable name

    # Metadata
    category: VariableCategory
    description: str
    units: str

    # Data characteristics
    level_type: str          # "surface", "meanSea", "isobaricInhPa", etc.
    level: Optional[int]     # Pressure level in hPa if applicable

    # Quantization (for compression)
    precision_digits: int    # Significant digits to preserve
    valid_range: tuple[float, float]  # Physical bounds for validation


# ============================================================================
# MARINE VARIABLE DEFINITIONS
# These are the ~15 variables essential for offshore passage planning.
# Pruning from ECMWF HRES's 100+ variables achieves ~90% size reduction.
# ============================================================================

MARINE_VARIABLES: dict[str, MarineVariable] = {
    # === WIND (Critical for sailing) ===
    "u10": MarineVariable(
        short_name="10u",
        param_id=165,
        cf_name="u10",
        category=VariableCategory.WIND,
        description="10m eastward wind component",
        units="m s-1",
        level_type="heightAboveGround",
        level=10,
        precision_digits=2,
        valid_range=(-50.0, 50.0),
    ),
    "v10": MarineVariable(
        short_name="10v",
        param_id=166,
        cf_name="v10",
        category=VariableCategory.WIND,
        description="10m northward wind component",
        units="m s-1",
        level_type="heightAboveGround",
        level=10,
        precision_digits=2,
        valid_range=(-50.0, 50.0),
    ),
    "gust": MarineVariable(
        short_name="gust",
        param_id=49,
        cf_name="i10fg",
        category=VariableCategory.WIND,
        description="10m wind gust since previous post-processing",
        units="m s-1",
        level_type="heightAboveGround",
        level=10,
        precision_digits=2,
        valid_range=(0.0, 100.0),
    ),

    # === PRESSURE (Weather systems) ===
    "msl": MarineVariable(
        short_name="msl",
        param_id=151,
        cf_name="msl",
        category=VariableCategory.PRESSURE,
        description="Mean sea level pressure",
        units="Pa",
        level_type="meanSea",
        level=None,
        precision_digits=0,  # Pressure in Pa, integer sufficient
        valid_range=(87000.0, 108000.0),  # ~870-1080 hPa
    ),

    # === WAVES (From ECMWF WAM model, often coupled with HRES) ===
    "swh": MarineVariable(
        short_name="swh",
        param_id=229,
        cf_name="swh",
        category=VariableCategory.WAVES,
        description="Significant height of combined wind waves and swell",
        units="m",
        level_type="surface",
        level=None,
        precision_digits=2,
        valid_range=(0.0, 25.0),
    ),
    "mwp": MarineVariable(
        short_name="mwp",
        param_id=232,
        cf_name="mwp",
        category=VariableCategory.WAVES,
        description="Mean wave period",
        units="s",
        level_type="surface",
        level=None,
        precision_digits=1,
        valid_range=(0.0, 25.0),
    ),
    "mwd": MarineVariable(
        short_name="mwd",
        param_id=230,
        cf_name="mwd",
        category=VariableCategory.WAVES,
        description="Mean wave direction",
        units="degrees",
        level_type="surface",
        level=None,
        precision_digits=0,  # Direction in integer degrees
        valid_range=(0.0, 360.0),
    ),

    # === PRECIPITATION (Visibility, deck conditions) ===
    "tp": MarineVariable(
        short_name="tp",
        param_id=228,
        cf_name="tp",
        category=VariableCategory.PRECIPITATION,
        description="Total precipitation",
        units="m",
        level_type="surface",
        level=None,
        precision_digits=4,  # mm precision as meters
        valid_range=(0.0, 0.5),  # Up to 500mm
    ),

    # === VISIBILITY ===
    "vis": MarineVariable(
        short_name="vis",
        param_id=20,
        cf_name="vis",
        category=VariableCategory.VISIBILITY,
        description="Visibility",
        units="m",
        level_type="surface",
        level=None,
        precision_digits=0,  # Meter precision sufficient
        valid_range=(0.0, 100000.0),  # Up to 100km
    ),

    # === TEMPERATURE (Comfort, fog prediction) ===
    "t2m": MarineVariable(
        short_name="2t",
        param_id=167,
        cf_name="t2m",
        category=VariableCategory.TEMPERATURE,
        description="2m temperature",
        units="K",
        level_type="heightAboveGround",
        level=2,
        precision_digits=1,
        valid_range=(200.0, 330.0),  # -73C to +57C
    ),
    "d2m": MarineVariable(
        short_name="2d",
        param_id=168,
        cf_name="d2m",
        category=VariableCategory.TEMPERATURE,
        description="2m dewpoint temperature",
        units="K",
        level_type="heightAboveGround",
        level=2,
        precision_digits=1,
        valid_range=(200.0, 320.0),
    ),
    "sst": MarineVariable(
        short_name="sst",
        param_id=34,
        cf_name="sst",
        category=VariableCategory.TEMPERATURE,
        description="Sea surface temperature",
        units="K",
        level_type="surface",
        level=None,
        precision_digits=2,
        valid_range=(270.0, 310.0),  # -3C to +37C
    ),

    # === CLOUDS (Weather assessment) ===
    "tcc": MarineVariable(
        short_name="tcc",
        param_id=164,
        cf_name="tcc",
        category=VariableCategory.VISIBILITY,
        description="Total cloud cover",
        units="(0-1)",
        level_type="surface",
        level=None,
        precision_digits=2,
        valid_range=(0.0, 1.0),
    ),

    # === GRAPHCAST / UPPER AIR (AI Model Inputs) ===
    "z": MarineVariable(
        short_name="z",
        param_id=129,
        cf_name="z",
        category=VariableCategory.PRESSURE,
        description="Geopotential",
        units="m^2 s^-2",
        level_type="isobaricInhPa",
        level=None,  # Multi-level
        precision_digits=0,
        valid_range=(-1000.0, 100000.0),
    ),
    "q": MarineVariable(
        short_name="q",
        param_id=133,
        cf_name="q",
        category=VariableCategory.HUMIDITY,
        description="Specific humidity",
        units="kg kg^-1",
        level_type="isobaricInhPa",
        level=None,
        precision_digits=5,
        valid_range=(0.0, 0.03),
    ),
    "t": MarineVariable(
        short_name="t",
        param_id=130,
        cf_name="t",
        category=VariableCategory.TEMPERATURE,
        description="Temperature",
        units="K",
        level_type="isobaricInhPa",
        level=None,
        precision_digits=1,
        valid_range=(180.0, 330.0),
    ),
    "u": MarineVariable(
        short_name="u",
        param_id=131,
        cf_name="u",
        category=VariableCategory.WIND,
        description="U component of wind",
        units="m s-1",
        level_type="isobaricInhPa",
        level=None,
        precision_digits=1,
        valid_range=(-100.0, 100.0),
    ),
    "v": MarineVariable(
        short_name="v",
        param_id=132,
        cf_name="v",
        category=VariableCategory.WIND,
        description="V component of wind",
        units="m s-1",
        level_type="isobaricInhPa",
        level=None,
        precision_digits=1,
        valid_range=(-100.0, 100.0),
    ),
}

# Minimal subset for extreme bandwidth constraints (Iridium)
MINIMAL_VARIABLES = ["u10", "v10", "msl", "swh"]

# Standard subset for most passages
STANDARD_VARIABLES = ["u10", "v10", "gust", "msl", "swh", "mwp", "mwd", "tp"]

# GraphCast Seed subset (Surface + Key Upper Air)
GRAPHCAST_VARIABLES = [
    "u10", "v10", "msl", "t2m",  # Surface
    "z", "q", "t", "u", "v"      # Upper Air (multi-level)
]

# Full marine subset (all defined variables)
FULL_VARIABLES = list(MARINE_VARIABLES.keys())


class VariablePruner:
    """
    Prunes ECMWF HRES datasets to marine-essential variables only.

    Achieves ~90% size reduction by selecting only navigation-critical
    parameters from the full HRES variable set.
    """

    def __init__(self, variable_set: str = "standard"):
        """
        Initialize pruner with a predefined variable set.

        Args:
            variable_set: One of "minimal", "standard", "full", or custom list
        """
        if variable_set == "minimal":
            self.variables = [MARINE_VARIABLES[v] for v in MINIMAL_VARIABLES]
        elif variable_set == "standard":
            self.variables = [MARINE_VARIABLES[v] for v in STANDARD_VARIABLES]
        elif variable_set == "full" or variable_set == "marine":
            self.variables = list(MARINE_VARIABLES.values())
        elif variable_set == "graphcast":
            self.variables = [MARINE_VARIABLES[v] for v in GRAPHCAST_VARIABLES]
        else:
            raise ValueError(f"Unknown variable set: {variable_set}")

        self._cf_names = {v.cf_name for v in self.variables}
        self._short_names = {v.short_name for v in self.variables}
        self._param_ids = {v.param_id for v in self.variables}

    def get_ecmwf_params(self, level_type: str = "sfc") -> list[str]:
        """
        Get short names for ECMWF retrieval.
        
        Args:
            level_type: "sfc" (surface/heightAboveGround) or "pl" (isobaricInhPa)
        """
        if level_type == "sfc":
            return [v.short_name for v in self.variables if v.level_type != "isobaricInhPa"]
        else:
            return [v.short_name for v in self.variables if v.level_type == "isobaricInhPa"]

    @property
    def cf_names(self) -> list[str]:
        """CF-compliant variable names for xarray selection"""
        return list(self._cf_names)

    @property
    def short_names(self) -> list[str]:
        """GRIB short names for eccodes filtering"""
        return list(self._short_names)

    @property
    def param_ids(self) -> list[int]:
        """ECMWF parameter IDs for CDS API requests"""
        return list(self._param_ids)

    def prune_dataset(self, ds) -> "xarray.Dataset":
        """
        Prune an xarray Dataset to only marine variables.

        Args:
            ds: xarray Dataset with ECMWF HRES data

        Returns:
            Pruned Dataset containing only marine-essential variables
        """
        import xarray as xr

        available = set(ds.data_vars)
        keep = available & self._cf_names

        if not keep:
            # Try short names as fallback
            keep = available & self._short_names

        if not keep:
            raise ValueError(
                f"No marine variables found in dataset. "
                f"Available: {available}, Expected: {self._cf_names}"
            )

        return ds[list(keep)]

    def quantize_array(
        self,
        data: np.ndarray,
        variable: MarineVariable,
    ) -> np.ndarray:
        """
        Quantize array to reduce precision (improves compression).

        Reduces float precision to only significant digits needed
        for each variable type. E.g., pressure doesn't need decimals.

        Args:
            data: Input numpy array
            variable: Variable definition with precision info

        Returns:
            Quantized array (still float32, but reduced entropy)
        """
        # Clip to valid range
        data = np.clip(data, variable.valid_range[0], variable.valid_range[1])

        # Round to specified precision
        if variable.precision_digits == 0:
            return np.round(data).astype(np.float32)
        else:
            factor = 10 ** variable.precision_digits
            return (np.round(data * factor) / factor).astype(np.float32)

    def estimate_pruned_size_mb(
        self,
        lat_points: int,
        lon_points: int,
        time_steps: int,
    ) -> float:
        """
        Estimate compressed size of pruned data.

        Args:
            lat_points: Number of latitude grid points
            lon_points: Number of longitude grid points
            time_steps: Number of forecast time steps

        Returns:
            Estimated size in MB after zstd compression
        """
        n_vars = len(self.variables)
        grid_points = lat_points * lon_points * time_steps

        # float32 = 4 bytes per value
        raw_bytes = n_vars * grid_points * 4

        # Zstd typically achieves 70-80% compression on weather data
        compressed_bytes = raw_bytes * 0.25

        return compressed_bytes / (1024 * 1024)

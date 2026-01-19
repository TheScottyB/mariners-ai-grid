# Mariner's AI Grid - Core Slicer Engine
# SPDX-License-Identifier: Apache-2.0

"""
Core slicing engine for ECMWF HRES data.

This module handles:
1. Geographical cropping via bounding box extraction
2. Connection to ECMWF CDS API for HRES data
3. Coordinate system handling and grid interpolation
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Union
import hashlib
import json
import logging
import tempfile

import numpy as np

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class BoundingBox:
    """
    Geographic bounding box for regional extraction.

    Uses WGS84 coordinates (EPSG:4326).
    Longitude range: -180 to 180 (negative = West)
    Latitude range: -90 to 90 (negative = South)
    """

    lat_min: float
    lat_max: float
    lon_min: float
    lon_max: float

    def __post_init__(self):
        """Validate coordinate ranges"""
        if not -90 <= self.lat_min < self.lat_max <= 90:
            raise ValueError(
                f"Invalid latitude range: {self.lat_min} to {self.lat_max}"
            )
        # Longitude can wrap around antimeridian
        if self.lon_min == self.lon_max:
            raise ValueError("Longitude range cannot be zero")

    @classmethod
    def from_center(
        cls,
        lat: float,
        lon: float,
        radius_nm: float = 500,
    ) -> "BoundingBox":
        """
        Create bounding box from center point and radius.

        Args:
            lat: Center latitude in degrees
            lon: Center longitude in degrees (-180 to 180)
            radius_nm: Radius in nautical miles (default: 500nm)

        Returns:
            BoundingBox encompassing the circular region
        """
        # 1 degree latitude ≈ 60 nautical miles
        lat_degrees = radius_nm / 60.0

        # Longitude degrees depend on latitude (convergence at poles)
        # Protect against division issues near poles
        cos_lat = max(np.cos(np.radians(lat)), 0.01)
        lon_degrees = radius_nm / (60.0 * cos_lat)

        return cls(
            lat_min=max(-90, lat - lat_degrees),
            lat_max=min(90, lat + lat_degrees),
            lon_min=lon - lon_degrees,
            lon_max=lon + lon_degrees,
        )

    @classmethod
    def from_route(
        cls,
        waypoints: list[tuple[float, float]],
        buffer_nm: float = 200,
    ) -> "BoundingBox":
        """
        Create bounding box encompassing a route with buffer.

        Args:
            waypoints: List of (lat, lon) tuples
            buffer_nm: Buffer around route in nautical miles

        Returns:
            BoundingBox containing entire route with buffer
        """
        lats = [wp[0] for wp in waypoints]
        lons = [wp[1] for wp in waypoints]

        center_lat = (max(lats) + min(lats)) / 2
        cos_lat = max(np.cos(np.radians(center_lat)), 0.01)

        lat_buffer = buffer_nm / 60.0
        lon_buffer = buffer_nm / (60.0 * cos_lat)

        return cls(
            lat_min=max(-90, min(lats) - lat_buffer),
            lat_max=min(90, max(lats) + lat_buffer),
            lon_min=min(lons) - lon_buffer,
            lon_max=max(lons) + lon_buffer,
        )

    @property
    def area_sq_nm(self) -> float:
        """Calculate approximate area in square nautical miles"""
        lat_span_nm = (self.lat_max - self.lat_min) * 60
        center_lat = (self.lat_max + self.lat_min) / 2
        lon_span_nm = (
            (self.lon_max - self.lon_min)
            * 60
            * np.cos(np.radians(center_lat))
        )
        return lat_span_nm * lon_span_nm

    def to_cds_area(self) -> list[float]:
        """
        Convert to CDS API area format.

        CDS uses [North, West, South, East] ordering.
        """
        return [self.lat_max, self.lon_min, self.lat_min, self.lon_max]

    def to_dict(self) -> dict:
        """Serialize to dictionary"""
        return {
            "lat_min": self.lat_min,
            "lat_max": self.lat_max,
            "lon_min": self.lon_min,
            "lon_max": self.lon_max,
        }

    def cache_key(self) -> str:
        """Generate cache key for this bounding box (0.25° resolution)"""
        # Round to grid resolution for cache deduplication
        rounded = (
            round(self.lat_min * 4) / 4,
            round(self.lat_max * 4) / 4,
            round(self.lon_min * 4) / 4,
            round(self.lon_max * 4) / 4,
        )
        return hashlib.md5(str(rounded).encode()).hexdigest()[:12]


@dataclass
class WeatherSeed:
    """
    Compressed regional weather data "Seed" for mobile transmission.

    A Seed contains:
    - Geographical subset of global model
    - Only marine-critical variables
    - Compressed to ~5MB for satellite feasibility
    """

    # Identity
    seed_id: str
    created_at: datetime
    model_source: str  # "ecmwf_hres", "gfs", etc.
    model_run: datetime  # Base time of model run

    # Spatial extent
    bounding_box: BoundingBox
    resolution_deg: float  # Grid spacing in degrees

    # Temporal extent
    forecast_start: datetime
    forecast_end: datetime
    time_step_hours: int

    # Data arrays (variable_name -> numpy array)
    # Shape: (time, lat, lon)
    variables: dict[str, np.ndarray] = field(default_factory=dict)

    # Coordinate arrays
    latitudes: np.ndarray = field(default_factory=lambda: np.array([]))
    longitudes: np.ndarray = field(default_factory=lambda: np.array([]))
    times: list[datetime] = field(default_factory=list)

    # Metadata
    metadata: dict = field(default_factory=dict)

    @property
    def shape(self) -> tuple[int, int, int]:
        """Data shape: (time_steps, lat_points, lon_points)"""
        return (
            len(self.times),
            len(self.latitudes),
            len(self.longitudes),
        )

    def size_bytes_uncompressed(self) -> int:
        """Calculate uncompressed data size"""
        total = 0
        for arr in self.variables.values():
            total += arr.nbytes
        total += self.latitudes.nbytes + self.longitudes.nbytes
        return total

    def size_mb_estimated_compressed(self) -> float:
        """Estimate compressed size (zstd typically 70-80% reduction)"""
        return self.size_bytes_uncompressed() * 0.25 / (1024 * 1024)

    def bandwidth_cost_usd(self, provider: str = "starlink") -> float:
        """
        Estimate satellite transmission cost.

        Args:
            provider: "starlink" (~$2/MB) or "iridium" (~$7/MB)
        """
        size_mb = self.size_mb_estimated_compressed()
        rates = {"starlink": 2.0, "iridium": 7.0}
        return size_mb * rates.get(provider, 5.0)

    def validate(self) -> list[str]:
        """Check data integrity, return list of issues"""
        issues = []

        if not self.variables:
            issues.append("No variables present")

        expected_shape = self.shape
        for name, arr in self.variables.items():
            if arr.shape != expected_shape:
                issues.append(
                    f"Variable {name} shape {arr.shape} != expected {expected_shape}"
                )
            if np.isnan(arr).all():
                issues.append(f"Variable {name} is all NaN")

        return issues


class ECMWFHRESSlicer:
    """
    Extracts regional slices from ECMWF HRES (High Resolution) forecasts.

    ECMWF HRES characteristics:
    - Resolution: 0.1° (~9km) native, we use 0.25° for bandwidth
    - Forecast range: 0-240 hours
    - Update frequency: 00Z and 12Z runs
    - File size: ~10GB per run (global)

    This slicer reduces that to ~5MB for a 500nm regional extract.
    """

    # ECMWF HRES grid parameters
    NATIVE_RESOLUTION = 0.1  # degrees
    DEFAULT_RESOLUTION = 0.25  # degrees (for bandwidth optimization)
    MAX_FORECAST_HOURS = 240

    def __init__(
        self,
        cache_dir: Optional[Path] = None,
        resolution: float = DEFAULT_RESOLUTION,
        offline_mode: bool = False,
    ):
        """
        Initialize the ECMWF HRES slicer.

        Args:
            cache_dir: Directory for caching downloaded GRIB files
            resolution: Output grid resolution in degrees
            offline_mode: If True, only use cached data (no API calls)
        """
        self.cache_dir = cache_dir or Path(tempfile.gettempdir()) / "mag_cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.resolution = resolution
        self.offline_mode = offline_mode

        # CDS API client (lazy init)
        self._cds_client = None

    @property
    def cds_client(self):
        """Lazy initialization of CDS API client"""
        if self._cds_client is None:
            try:
                import cdsapi
                self._cds_client = cdsapi.Client()
            except Exception as e:
                logger.warning(f"CDS API client init failed: {e}")
                logger.info("Using mock data mode")
        return self._cds_client

    def slice(
        self,
        bbox: BoundingBox,
        forecast_hours: int = 72,
        time_step_hours: int = 3,
        variables: Optional[list[str]] = None,
        model_run: Optional[datetime] = None,
        model_source: str = "mock_hres",
    ) -> WeatherSeed:
        """
        Extract a regional weather slice.

        Args:
            bbox: Geographic bounding box to extract
            forecast_hours: Hours of forecast to include (max 240)
            time_step_hours: Time step interval
            variables: List of variable names (default: standard marine set)
            model_run: Specific model run time (default: latest available)
            model_source: Label for the model source (used in offline mode)

        Returns:
            WeatherSeed containing the regional extract
        """
        from slicer.variables import STANDARD_VARIABLES, MARINE_VARIABLES

        # Determine variables to extract
        if variables is None:
            var_names = STANDARD_VARIABLES
        else:
            var_names = variables

        var_defs = [MARINE_VARIABLES[v] for v in var_names if v in MARINE_VARIABLES]

        # Determine model run time
        if model_run is None:
            model_run = self._latest_model_run()

        # Check cache first
        cache_key = self._cache_key(bbox, model_run, forecast_hours, var_names)
        cached = self._load_from_cache(cache_key)
        if cached is not None:
            # If we want a specific mock source but cached one is different, we might skip cache
            # But for simplicity, we assume cache is valid or user clears it
            if self.offline_mode and cached.model_source == model_source:
                logger.info(f"Cache hit: {cache_key}")
                return cached

        # Fetch from CDS API or generate mock
        if self.offline_mode or self.cds_client is None:
            seed = self._generate_mock_seed(
                bbox, model_run, forecast_hours, time_step_hours, var_defs, model_source
            )
        else:
            seed = self._fetch_from_cds(
                bbox, model_run, forecast_hours, time_step_hours, var_defs
            )

        # Cache the result
        self._save_to_cache(cache_key, seed)

        return seed

    def _latest_model_run(self) -> datetime:
        """Determine the latest available HRES model run"""
        now = datetime.now(timezone.utc)

        # HRES runs at 00Z and 12Z, available ~6 hours after
        hour = now.hour

        if hour >= 18:  # 12Z run should be available
            run_hour = 12
        elif hour >= 6:  # 00Z run should be available
            run_hour = 0
        else:  # Use previous day's 12Z
            now = now - timedelta(days=1)
            run_hour = 12

        return now.replace(hour=run_hour, minute=0, second=0, microsecond=0)

    def _cache_key(
        self,
        bbox: BoundingBox,
        model_run: datetime,
        forecast_hours: int,
        variables: list[str],
    ) -> str:
        """Generate unique cache key"""
        components = [
            bbox.cache_key(),
            model_run.strftime("%Y%m%d%H"),
            str(forecast_hours),
            hashlib.md5(",".join(sorted(variables)).encode()).hexdigest()[:8],
        ]
        return "_".join(components)

    def _load_from_cache(self, cache_key: str) -> Optional[WeatherSeed]:
        """Load seed from cache if available"""
        cache_path = self.cache_dir / f"{cache_key}.json"
        data_path = self.cache_dir / f"{cache_key}.npz"

        if not cache_path.exists() or not data_path.exists():
            return None

        try:
            with open(cache_path) as f:
                meta = json.load(f)

            data = np.load(data_path, allow_pickle=True)

            return WeatherSeed(
                seed_id=meta["seed_id"],
                created_at=datetime.fromisoformat(meta["created_at"]),
                model_source=meta["model_source"],
                model_run=datetime.fromisoformat(meta["model_run"]),
                bounding_box=BoundingBox(**meta["bounding_box"]),
                resolution_deg=meta["resolution_deg"],
                forecast_start=datetime.fromisoformat(meta["forecast_start"]),
                forecast_end=datetime.fromisoformat(meta["forecast_end"]),
                time_step_hours=meta["time_step_hours"],
                variables={k: data[k] for k in data.files if k not in ["latitudes", "longitudes"]},
                latitudes=data["latitudes"],
                longitudes=data["longitudes"],
                times=[datetime.fromisoformat(t) for t in meta["times"]],
                metadata=meta.get("metadata", {}),
            )
        except Exception as e:
            logger.warning(f"Cache load failed for {cache_key}: {e}")
            return None

    def _save_to_cache(self, cache_key: str, seed: WeatherSeed):
        """Save seed to cache"""
        cache_path = self.cache_dir / f"{cache_key}.json"
        data_path = self.cache_dir / f"{cache_key}.npz"

        try:
            meta = {
                "seed_id": seed.seed_id,
                "created_at": seed.created_at.isoformat(),
                "model_source": seed.model_source,
                "model_run": seed.model_run.isoformat(),
                "bounding_box": seed.bounding_box.to_dict(),
                "resolution_deg": seed.resolution_deg,
                "forecast_start": seed.forecast_start.isoformat(),
                "forecast_end": seed.forecast_end.isoformat(),
                "time_step_hours": seed.time_step_hours,
                "times": [t.isoformat() for t in seed.times],
                "metadata": seed.metadata,
            }

            with open(cache_path, "w") as f:
                json.dump(meta, f)

            arrays = {
                "latitudes": seed.latitudes,
                "longitudes": seed.longitudes,
                **seed.variables,
            }
            np.savez_compressed(data_path, **arrays)

            logger.info(f"Cached seed: {cache_key}")

        except Exception as e:
            logger.warning(f"Cache save failed for {cache_key}: {e}")

    def _fetch_from_cds(
        self,
        bbox: BoundingBox,
        model_run: datetime,
        forecast_hours: int,
        time_step_hours: int,
        var_defs: list,
    ) -> WeatherSeed:
        """
        Fetch data from ECMWF CDS API.

        This performs the actual GRIB download and extraction.
        """
        import xarray as xr
        import cfgrib

        # Build CDS request
        param_ids = [str(v.param_id) for v in var_defs]
        lead_times = list(range(0, forecast_hours + 1, time_step_hours))

        request = {
            "class": "od",
            "stream": "oper",
            "type": "fc",
            "levtype": "sfc",
            "param": "/".join(param_ids),
            "date": model_run.strftime("%Y-%m-%d"),
            "time": model_run.strftime("%H:%M"),
            "step": "/".join(str(h) for h in lead_times),
            "area": bbox.to_cds_area(),  # N/W/S/E
            "grid": f"{self.resolution}/{self.resolution}",
            "format": "grib",
        }

        # Download GRIB file
        grib_path = self.cache_dir / f"temp_{bbox.cache_key()}.grib"

        logger.info(f"Fetching HRES data from CDS: {bbox}")
        self.cds_client.retrieve("reanalysis-era5-single-levels", request, str(grib_path))

        # Parse GRIB to xarray
        ds = xr.open_dataset(grib_path, engine="cfgrib")

        # Extract arrays
        lats = ds.latitude.values
        lons = ds.longitude.values
        times = [
            model_run + timedelta(hours=h)
            for h in lead_times
        ]

        variables = {}
        for var in var_defs:
            if var.cf_name in ds:
                variables[var.cf_name] = ds[var.cf_name].values.astype(np.float32)

        # Cleanup temp file
        grib_path.unlink(missing_ok=True)

        return WeatherSeed(
            seed_id=f"hres_{bbox.cache_key()}_{model_run.strftime('%Y%m%d%H')}",
            created_at=datetime.now(timezone.utc),
            model_source="ecmwf_hres",
            model_run=model_run,
            bounding_box=bbox,
            resolution_deg=self.resolution,
            forecast_start=times[0],
            forecast_end=times[-1],
            time_step_hours=time_step_hours,
            variables=variables,
            latitudes=lats,
            longitudes=lons,
            times=times,
            metadata={
                "cds_request": request,
                "variable_count": len(variables),
            },
        )

    def _generate_mock_seed(
        self,
        bbox: BoundingBox,
        model_run: datetime,
        forecast_hours: int,
        time_step_hours: int,
        var_defs: list,
        model_source: str = "mock_hres",
    ) -> WeatherSeed:
        """
        Generate realistic mock data for testing without CDS access.

        Uses physically plausible value ranges and correlations.
        """
        # Build coordinate arrays
        lats = np.arange(bbox.lat_min, bbox.lat_max + 0.01, self.resolution)
        lons = np.arange(bbox.lon_min, bbox.lon_max + 0.01, self.resolution)
        n_times = forecast_hours // time_step_hours + 1
        times = [
            model_run + timedelta(hours=h)
            for h in range(0, forecast_hours + 1, time_step_hours)
        ]

        shape = (n_times, len(lats), len(lons))

        # Generate mock data with realistic distributions
        np.random.seed(42)  # Reproducible for testing

        variables = {}
        for var in var_defs:
            low, high = var.valid_range
            mid = (low + high) / 2
            spread = (high - low) / 6  # 3-sigma within range

            # Add spatial and temporal structure
            base = np.random.normal(mid, spread, shape)

            # Add large-scale spatial gradient
            lat_grid, lon_grid = np.meshgrid(
                np.linspace(-1, 1, len(lats)),
                np.linspace(-1, 1, len(lons)),
                indexing="ij",
            )
            spatial = lat_grid * spread * 0.3 + lon_grid * spread * 0.2
            spatial = np.broadcast_to(spatial, shape)

            # Add temporal evolution
            time_trend = np.linspace(0, 1, n_times)[:, None, None] * spread * 0.5

            data = np.clip(base + spatial + time_trend, low, high).astype(np.float32)
            variables[var.cf_name] = data

        return WeatherSeed(
            seed_id=f"{model_source.replace('ecmwf_', '')}_{bbox.cache_key()}_{model_run.strftime('%Y%m%d%H')}",
            created_at=datetime.now(timezone.utc),
            model_source=model_source,
            model_run=model_run,
            bounding_box=bbox,
            resolution_deg=self.resolution,
            forecast_start=times[0],
            forecast_end=times[-1],
            time_step_hours=time_step_hours,
            variables=variables,
            latitudes=lats,
            longitudes=lons,
            times=times,
            metadata={
                "mock_data": True,
                "variable_count": len(variables),
            },
        )

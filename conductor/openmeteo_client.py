import requests
import numpy as np
from datetime import datetime, timezone
from slicer.core import WeatherSeed, BoundingBox

# Land mask for ocean-only wave filtering
try:
    from global_land_mask import globe
    HAS_LAND_MASK = True
except ImportError:
    HAS_LAND_MASK = False
    print("[OpenMeteo] WARNING: global-land-mask not installed. Wave data will include land points.")


def is_ocean(lat: float, lon: float) -> bool:
    """
    Check if a point is over ocean (not land).
    Uses global-land-mask package with 1km resolution.
    """
    if not HAS_LAND_MASK:
        return True  # Fallback: assume ocean if no mask available
    return bool(globe.is_ocean(lat, lon))


def create_ocean_mask(lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """
    Create a 2D boolean mask where True = ocean, False = land.

    Args:
        lats: 1D array of latitudes
        lons: 1D array of longitudes

    Returns:
        2D boolean array of shape (len(lats), len(lons))
    """
    if not HAS_LAND_MASK:
        # No land mask available, return all-ocean
        return np.ones((len(lats), len(lons)), dtype=bool)

    # Create meshgrid for vectorized lookup
    lat_grid, lon_grid = np.meshgrid(lats, lons, indexing='ij')

    # globe.is_ocean supports arrays
    ocean_mask = globe.is_ocean(lat_grid, lon_grid)

    return ocean_mask


class OpenMeteoMarineSlicer:
    """
    Slices wave data from Open-Meteo.
    Provides reliable coverage for Great Lakes (Lake Michigan).

    Wave data (swh, mwd, mwp) is filtered to ocean-only points using
    global-land-mask. Land points will have NaN for wave variables.
    """

    MARINE_API_URL = "https://marine-api.open-meteo.com/v1/marine"
    WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast"

    def slice(self, bbox: BoundingBox, forecast_hours: int = 72) -> WeatherSeed:
        print(f"[OpenMeteo] Fetching data for area: {bbox}")

        lat = (bbox.lat_max + bbox.lat_min) / 2
        lon = (bbox.lon_max + bbox.lon_min) / 2

        # 1. Try Marine API
        data = None
        has_marine_data = False
        try:
            params = {
                "latitude": lat,
                "longitude": lon,
                "hourly": "significant_wave_height,mean_wave_direction,mean_wave_period",
                "forecast_days": (forecast_hours // 24) + 1,
                "timezone": "UTC"
            }
            resp = requests.get(self.MARINE_API_URL, params=params)
            if resp.status_code == 200:
                data = resp.json()
                # Check if we actually got wave data (Marine API returns null for land points)
                hourly = data.get("hourly", {})
                swh_data = hourly.get("significant_wave_height", [])
                if swh_data and any(v is not None for v in swh_data):
                    has_marine_data = True
        except Exception as e:
            print(f"[OpenMeteo] Marine API error: {e}")

        # 2. Fallback to Weather API (which works over land/lakes)
        if not data or not has_marine_data:
            print("[OpenMeteo] Marine API failed/not available. Using Weather API...")
            params = {
                "latitude": lat,
                "longitude": lon,
                "hourly": "wind_speed_10m,wind_direction_10m",
                "forecast_days": (forecast_hours // 24) + 1,
                "timezone": "UTC"
            }
            resp = requests.get(self.WEATHER_API_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
            has_marine_data = False

        hourly = data["hourly"]
        times = [datetime.fromisoformat(t.replace('Z', '+00:00')) for t in hourly["time"]]
        n_times = len(times)

        # Generate a 15x15 grid
        grid_size = 15
        lats = np.linspace(bbox.lat_min, bbox.lat_max, grid_size)
        lons = np.linspace(bbox.lon_min, bbox.lon_max, grid_size)

        # Create ocean mask for wave filtering
        ocean_mask = create_ocean_mask(lats, lons)
        ocean_count = np.sum(ocean_mask)
        land_count = ocean_mask.size - ocean_count
        print(f"[OpenMeteo] Grid: {grid_size}x{grid_size} = {ocean_mask.size} points. Ocean: {ocean_count}, Land: {land_count}")

        # Extract wave variables (only for ocean points)
        if has_marine_data:
            # Real marine data from API
            swh_raw = np.array([v if v is not None else np.nan for v in hourly.get("significant_wave_height", [])], dtype=np.float32)
            mwd_raw = np.array([v if v is not None else np.nan for v in hourly.get("mean_wave_direction", [])], dtype=np.float32)
            mwp_raw = np.array([v if v is not None else np.nan for v in hourly.get("mean_wave_period", [])], dtype=np.float32)
        else:
            # No marine data available - use placeholder values
            # These will be masked to ocean-only points
            swh_raw = np.full(n_times, 0.5, dtype=np.float32)  # Placeholder
            mwd_raw = np.full(n_times, 0.0, dtype=np.float32)
            mwp_raw = np.full(n_times, 4.0, dtype=np.float32)

        # Broadcast wave data to grid and apply ocean mask
        swh_grid = np.broadcast_to(swh_raw[:, None, None], (n_times, grid_size, grid_size)).copy()
        mwd_grid = np.broadcast_to(mwd_raw[:, None, None], (n_times, grid_size, grid_size)).copy()
        mwp_grid = np.broadcast_to(mwp_raw[:, None, None], (n_times, grid_size, grid_size)).copy()

        # Apply ocean mask - set land points to NaN for wave data
        land_mask_3d = ~np.broadcast_to(ocean_mask[None, :, :], (n_times, grid_size, grid_size))
        swh_grid[land_mask_3d] = np.nan
        mwd_grid[land_mask_3d] = np.nan
        mwp_grid[land_mask_3d] = np.nan

        # Extract wind variables (available everywhere)
        u_speed = np.array(hourly.get("wind_speed_10m", [0]*n_times), dtype=np.float32) / 3.6  # km/h to m/s
        v_dir = np.array(hourly.get("wind_direction_10m", [0]*n_times), dtype=np.float32)

        rad = np.deg2rad(v_dir)
        u10_flat = -u_speed * np.sin(rad)
        v10_flat = -u_speed * np.cos(rad)

        variables = {
            "swh": swh_grid,
            "mwd": mwd_grid,
            "mwp": mwp_grid,
            "u10": np.broadcast_to(u10_flat[:, None, None], (n_times, grid_size, grid_size)).copy(),
            "v10": np.broadcast_to(v10_flat[:, None, None], (n_times, grid_size, grid_size)).copy(),
        }

        return WeatherSeed(
            seed_id=f"openmeteo_{datetime.now().strftime('%H%M%S')}",
            created_at=datetime.now(timezone.utc),
            model_source="openmeteo",
            model_run=times[0],
            bounding_box=bbox,
            resolution_deg=0.1,
            forecast_start=times[0],
            forecast_end=times[-1],
            time_step_hours=1,
            variables=variables,
            latitudes=lats,
            longitudes=lons,
            times=times,
            metadata={
                "ocean_points": int(ocean_count),
                "land_points": int(land_count),
                "has_marine_data": has_marine_data,
            }
        )

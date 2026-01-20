import requests
import pandas as pd
import numpy as np
from datetime import datetime, timezone
from slicer.core import WeatherSeed, BoundingBox

class OpenMeteoMarineSlicer:
    """
    Slices wave data from Open-Meteo.
    Provides reliable coverage for Great Lakes (Lake Michigan).
    """
    
    MARINE_API_URL = "https://marine-api.open-meteo.com/v1/marine"
    WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast"

    def slice(self, bbox: BoundingBox, forecast_hours: int = 72) -> WeatherSeed:
        print(f"[OpenMeteo] Fetching data for area: {bbox}")
        
        lat = (bbox.lat_max + bbox.lat_min) / 2
        lon = (bbox.lon_max + bbox.lon_min) / 2
        
        # 1. Try Marine API
        data = None
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
        except:
            pass

        # 2. Fallback to Weather API (which works over land/lakes)
        if not data:
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

        hourly = data["hourly"]
        times = [datetime.fromisoformat(t.replace('Z', '+00:00')) for t in hourly["time"]]
        n_times = len(times)
        
        # Extract variables with fallbacks
        swh = np.array(hourly.get("significant_wave_height", [0.5]*n_times), dtype=np.float32)
        mwd = np.array(hourly.get("mean_wave_direction", [0]*n_times), dtype=np.float32)
        mwp = np.array(hourly.get("mean_wave_period", [4.0]*n_times), dtype=np.float32)
        
        u_speed = np.array(hourly.get("wind_speed_10m", [0]*n_times), dtype=np.float32) / 3.6
        v_dir = np.array(hourly.get("wind_direction_10m", [0]*n_times), dtype=np.float32)
        
        rad = np.deg2rad(v_dir)
        u10_flat = -u_speed * np.sin(rad)
        v10_flat = -u_speed * np.cos(rad)

        # Generate a small 15x15 grid
        grid_size = 15
        lats = np.linspace(bbox.lat_min, bbox.lat_max, grid_size)
        lons = np.linspace(bbox.lon_min, bbox.lon_max, grid_size)
        
        variables = {
            "swh": np.broadcast_to(swh[:, None, None], (n_times, grid_size, grid_size)).copy(),
            "mwd": np.broadcast_to(mwd[:, None, None], (n_times, grid_size, grid_size)).copy(),
            "mwp": np.broadcast_to(mwp[:, None, None], (n_times, grid_size, grid_size)).copy(),
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
            times=times
        )

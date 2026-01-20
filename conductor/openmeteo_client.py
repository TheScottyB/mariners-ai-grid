#!/usr/bin/env python3
"""
Open-Meteo API client for ECMWF IFS HRES (9km) weather data.

Open-Meteo provides access to ECMWF 0.1° (9km) HRES forecasts via a
high-performance API with no rate limits for non-commercial use.

This is the recommended way to access 9km resolution data, as the official
ECMWF cloud mirrors (Azure/AWS) only provide 0.25° (25km) resolution.

Usage:
    python openmeteo_client.py --help
    python openmeteo_client.py --lat 47.6 --lon -122.3
    python openmeteo_client.py --route route.json --output forecast.json
"""

import argparse
import json
import sys
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from datetime import datetime, timedelta

try:
    import requests
except ImportError:
    print("Error: requests package not installed")
    print("Install with: uv pip install requests")
    sys.exit(1)


class OpenMeteoClient:
    """Client for Open-Meteo ECMWF HRES API."""
    
    BASE_URL = "https://api.open-meteo.com/v1/forecast"
    
    # Marine-relevant parameters
    MARINE_PARAMS = [
        "temperature_2m",           # 2m temperature (°C)
        "relative_humidity_2m",     # 2m relative humidity (%)
        "pressure_msl",             # Mean sea level pressure (hPa)
        "wind_speed_10m",           # Wind speed at 10m (km/h)
        "wind_direction_10m",       # Wind direction at 10m (°)
        "wind_gusts_10m",           # Wind gusts at 10m (km/h)
        "precipitation",            # Precipitation (mm)
        "visibility",               # Visibility (m)
        "cloud_cover",              # Total cloud cover (%)
    ]
    
    def __init__(self):
        """
        Initialize client.
        
        Note: Open-Meteo automatically selects the best model (usually ECMWF IFS HRES)
        """
        print(f"🌐 Initialized Open-Meteo client")
        print(f"   API: {self.BASE_URL}")
        print(f"   Model: Auto-selected (typically ECMWF IFS HRES 9km)")
    
    def get_point_forecast(
        self,
        latitude: float,
        longitude: float,
        params: Optional[List[str]] = None,
        forecast_days: int = 7,
        past_days: int = 0
    ) -> Dict:
        """
        Get forecast for a single point.
        
        Args:
            latitude: Latitude (-90 to 90)
            longitude: Longitude (-180 to 180)
            params: List of parameters (default: all marine params)
            forecast_days: Number of forecast days (1-16)
            past_days: Number of past days (0-92)
        
        Returns:
            JSON response with forecast data
        """
        if params is None:
            params = self.MARINE_PARAMS
        
        query = {
            "latitude": latitude,
            "longitude": longitude,
            "hourly": ",".join(params),
            "forecast_days": min(forecast_days, 16),
            "past_days": min(past_days, 92),
            "timezone": "UTC"
        }
        
        print(f"\n📍 Querying point: ({latitude:.4f}, {longitude:.4f})")
        print(f"   Parameters: {len(params)} variables")
        print(f"   Forecast: {forecast_days} days")
        
        try:
            response = requests.get(self.BASE_URL, params=query, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            print(f"✅ Retrieved {len(data.get('hourly', {}).get('time', []))} timesteps")
            
            return data
        
        except requests.RequestException as e:
            print(f"❌ API request failed: {e}")
            raise
    
    def get_route_forecast(
        self,
        waypoints: List[Tuple[float, float]],
        params: Optional[List[str]] = None,
        forecast_days: int = 7
    ) -> List[Dict]:
        """
        Get forecasts along a route (multiple waypoints).
        
        Args:
            waypoints: List of (lat, lon) tuples
            params: List of parameters
            forecast_days: Number of forecast days
        
        Returns:
            List of forecast dictionaries (one per waypoint)
        """
        if params is None:
            params = self.MARINE_PARAMS
        
        print(f"\n🗺️  Fetching route forecast for {len(waypoints)} waypoints...")
        
        forecasts = []
        for i, (lat, lon) in enumerate(waypoints, 1):
            print(f"\n[{i}/{len(waypoints)}] Waypoint ({lat:.4f}, {lon:.4f})")
            
            try:
                forecast = self.get_point_forecast(lat, lon, params, forecast_days)
                forecasts.append({
                    "waypoint_index": i - 1,
                    "latitude": lat,
                    "longitude": lon,
                    "forecast": forecast
                })
            except Exception as e:
                print(f"⚠️  Skipping waypoint {i}: {e}")
                continue
        
        print(f"\n✅ Retrieved forecasts for {len(forecasts)}/{len(waypoints)} waypoints")
        return forecasts
    
    def get_grid_forecast(
        self,
        lat_min: float,
        lat_max: float,
        lon_min: float,
        lon_max: float,
        resolution: float = 0.1,
        params: Optional[List[str]] = None,
        forecast_days: int = 7
    ) -> Dict:
        """
        Get forecast for a grid of points.
        
        Args:
            lat_min, lat_max: Latitude bounds
            lon_min, lon_max: Longitude bounds
            resolution: Grid spacing in degrees (default: 0.1° = ~9km)
            params: List of parameters
            forecast_days: Number of forecast days
        
        Returns:
            Dictionary with grid metadata and forecasts
        """
        if params is None:
            params = self.MARINE_PARAMS
        
        # Generate grid points
        import numpy as np
        lats = np.arange(lat_min, lat_max + resolution, resolution)
        lons = np.arange(lon_min, lon_max + resolution, resolution)
        
        grid_points = [(lat, lon) for lat in lats for lon in lons]
        total_points = len(grid_points)
        
        print(f"\n🌍 Generating {len(lats)}x{len(lons)} grid ({total_points} points)")
        print(f"   Bounds: ({lat_min}, {lon_min}) to ({lat_max}, {lon_max})")
        print(f"   Resolution: {resolution}°")
        print(f"   ⚠️  Warning: {total_points} API calls - may take several minutes")
        
        # Fetch forecasts for all grid points
        forecasts = self.get_route_forecast(grid_points, params, forecast_days)
        
        return {
            "grid_metadata": {
                "lat_min": lat_min,
                "lat_max": lat_max,
                "lon_min": lon_min,
                "lon_max": lon_max,
                "resolution": resolution,
                "shape": (len(lats), len(lons)),
                "total_points": total_points
            },
            "forecasts": forecasts
        }
    
    @staticmethod
    def convert_to_dataframe(forecast_data: Dict):
        """Convert forecast to pandas DataFrame (if pandas available)."""
        try:
            import pandas as pd
        except ImportError:
            print("⚠️  pandas not installed - returning raw data")
            return forecast_data
        
        hourly = forecast_data.get("hourly", {})
        if not hourly:
            return None
        
        df = pd.DataFrame(hourly)
        df["time"] = pd.to_datetime(df["time"])
        return df


def main():
    parser = argparse.ArgumentParser(
        description="Fetch ECMWF IFS HRES (9km) forecasts via Open-Meteo API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Single point forecast (Seattle)
  %(prog)s --lat 47.6062 --lon -122.3321
  
  # Custom parameters and forecast length
  %(prog)s --lat 47.6 --lon -122.3 --params wind_speed_10m,wind_direction_10m --days 3
  
  # Route forecast from JSON file
  %(prog)s --route waypoints.json --output route_forecast.json
  
  # Grid forecast (small area)
  %(prog)s --grid 47.0,48.0,-123.0,-122.0 --resolution 0.25 --output grid.json

Waypoints JSON format:
  {
    "waypoints": [
      {"lat": 47.6, "lon": -122.3, "name": "Seattle"},
      {"lat": 48.4, "lon": -123.0, "name": "Victoria"}
    ]
  }

Output includes:
  - Hourly forecasts for 7-16 days (ECMWF HRES 9km model)
  - Temperature, wind, pressure, precipitation, visibility
  - JSON format (easy to process or convert to CSV/DataFrame)

Note: Free for non-commercial use. See https://open-meteo.com/en/terms
        """
    )
    
    parser.add_argument(
        '--lat', type=float,
        help='Latitude (-90 to 90)'
    )
    
    parser.add_argument(
        '--lon', type=float,
        help='Longitude (-180 to 180)'
    )
    
    parser.add_argument(
        '--route',
        help='JSON file with waypoints (see format above)'
    )
    
    parser.add_argument(
        '--grid',
        help='Grid bounds: lat_min,lat_max,lon_min,lon_max (e.g., "47,48,-123,-122")'
    )
    
    parser.add_argument(
        '--resolution', type=float, default=0.1,
        help='Grid resolution in degrees (default: 0.1 = ~9km)'
    )
    
    parser.add_argument(
        '--params', '-p',
        help='Comma-separated parameters (default: all marine params)'
    )
    
    parser.add_argument(
        '--days', '-d', type=int, default=7,
        help='Forecast days (1-16, default: 7)'
    )
    
    
    parser.add_argument(
        '--output', '-o',
        help='Output JSON file (default: print to stdout)'
    )
    
    parser.add_argument(
        '--csv', action='store_true',
        help='Also save as CSV (requires pandas)'
    )
    
    args = parser.parse_args()
    
    # Parse parameters
    params = None
    if args.params:
        params = [p.strip() for p in args.params.split(',')]
    
    # Initialize client
    client = OpenMeteoClient()
    
    # Determine query type and fetch data
    result = None
    
    if args.lat is not None and args.lon is not None:
        # Single point
        result = client.get_point_forecast(
            args.lat, args.lon, params, args.days
        )
    
    elif args.route:
        # Route from file
        with open(args.route) as f:
            route_data = json.load(f)
        
        waypoints = [
            (wp["lat"], wp["lon"]) 
            for wp in route_data.get("waypoints", [])
        ]
        
        result = {
            "route": route_data,
            "forecasts": client.get_route_forecast(waypoints, params, args.days)
        }
    
    elif args.grid:
        # Grid
        bounds = [float(x) for x in args.grid.split(',')]
        if len(bounds) != 4:
            parser.error("--grid requires 4 values: lat_min,lat_max,lon_min,lon_max")
        
        result = client.get_grid_forecast(
            bounds[0], bounds[1], bounds[2], bounds[3],
            args.resolution, params, args.days
        )
    
    else:
        parser.error("Must specify --lat/--lon, --route, or --grid")
    
    # Output results
    if args.output:
        output_path = Path(args.output)
        with open(output_path, 'w') as f:
            json.dump(result, f, indent=2)
        print(f"\n💾 Saved to: {output_path}")
        
        # Also save CSV if requested
        if args.csv and args.lat is not None:
            csv_path = output_path.with_suffix('.csv')
            df = client.convert_to_dataframe(result)
            if df is not None:
                df.to_csv(csv_path, index=False)
                print(f"💾 Saved CSV to: {csv_path}")
    else:
        # Print to stdout
        print("\n" + "="*60)
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

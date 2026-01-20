#!/usr/bin/env python3
"""
ECMWF Forecast Downloader using official ecmwf-opendata API.

This utility uses Azure/AWS/Google cloud mirrors to avoid rate limiting
(HTTP 429 errors) from the main data.ecmwf.int endpoint.

Usage:
    python ecmwf_downloader.py --help
    python ecmwf_downloader.py --resolution 0.25 --params 10u,10v,msl
    python ecmwf_downloader.py --resolution 0.1 --source azure --step 24
"""

import argparse
import sys
from pathlib import Path
from typing import List, Optional
from datetime import datetime

try:
    from ecmwf.opendata import Client
except ImportError:
    print("Error: ecmwf-opendata package not installed")
    print("Install with: uv pip install ecmwf-opendata")
    sys.exit(1)


class ECMWFDownloader:
    """Download ECMWF forecasts using cloud mirrors."""
    
    # Common marine surface parameters
    MARINE_PARAMS = {
        '10u': 'U-component of wind at 10m',
        '10v': 'V-component of wind at 10m',
        'msl': 'Mean sea level pressure',
        '2t': '2m temperature',
        'fg10': 'Wind gust at 10m',
    }
    
    # Wave parameters (separate files)
    WAVE_PARAMS = {
        'swh': 'Significant wave height',
        'mwd': 'Mean wave direction',
        'mwp': 'Mean wave period',
    }
    
    def __init__(self, source: str = "azure", resolution: str = "0.25"):
        """
        Initialize downloader.
        
        Args:
            source: Cloud mirror - "azure", "aws", or "ecmwf" (default: "azure")
            resolution: "0.1" (9km HRES) or "0.25" (25km Open-Data)
        """
        self.source = source
        self.resolution = resolution
        
        # Map resolution to resol parameter for API
        self.resol = "0p1" if resolution == "0.1" else "0p25"
        
        print(f"📡 Initializing ECMWF client...")
        print(f"   Source: {source}")
        print(f"   Resolution: {resolution}° (~{9 if resolution == '0.1' else 25}km)")
        
        self.client = Client(source=source)
    
    def download_forecast(
        self,
        params: List[str],
        date: int = 0,
        time: int = 0,
        step: int = 0,
        output_path: Optional[str] = None,
        stream: str = "oper",
        type_: str = "fc"
    ) -> str:
        """
        Download forecast data.
        
        Args:
            params: List of parameters (e.g., ['10u', '10v', 'msl'])
            date: Days from today (0 = today, -1 = yesterday)
            time: Run hour (0, 6, 12, or 18)
            step: Forecast step in hours (0, 3, 6, ..., 360)
            output_path: Output file path (default: auto-generated)
            stream: Stream type (default: "oper" = operational)
            type_: Type (default: "fc" = forecast)
        
        Returns:
            Path to downloaded file
        """
        if output_path is None:
            # Auto-generate filename
            date_str = "latest" if date == 0 else f"d{date}"
            step_str = f"{step:03d}h"
            param_str = "-".join(params[:3])  # First 3 params
            output_path = f"ecmwf_{self.resol}_{date_str}_{time:02d}z_T{step_str}_{param_str}.grib2"
        
        print(f"\n📥 Downloading forecast...")
        print(f"   Date: {'Today' if date == 0 else f'{date} days ago'}")
        print(f"   Run: {time:02d}z")
        print(f"   Step: T+{step}h")
        print(f"   Parameters: {', '.join(params)}")
        print(f"   Output: {output_path}")
        
        try:
            self.client.retrieve(
                date=date,
                time=time,
                step=step,
                stream=stream,
                type=type_,
                param=params,
                target=output_path,
                resol=self.resol
            )
            
            file_size = Path(output_path).stat().st_size / 1e6
            print(f"✅ Download complete: {file_size:.2f} MB")
            return output_path
            
        except Exception as e:
            print(f"❌ Download failed: {e}")
            raise
    
    def download_timesteps(
        self,
        params: List[str],
        steps: List[int],
        date: int = 0,
        time: int = 0,
        output_dir: str = "."
    ) -> List[str]:
        """
        Download multiple timesteps.
        
        Args:
            params: List of parameters
            steps: List of forecast steps (e.g., [0, 3, 6, 9, 12])
            date: Days from today
            time: Run hour
            output_dir: Output directory
        
        Returns:
            List of downloaded file paths
        """
        output_dir_path = Path(output_dir)
        output_dir_path.mkdir(exist_ok=True, parents=True)
        
        downloaded = []
        total = len(steps)
        
        print(f"\n📦 Downloading {total} timesteps...")
        
        for i, step in enumerate(steps, 1):
            print(f"\n[{i}/{total}] Timestep T+{step}h")
            
            output_file = output_dir_path / f"forecast_{self.resol}_T{step:03d}h.grib2"
            
            try:
                self.download_forecast(
                    params=params,
                    date=date,
                    time=time,
                    step=step,
                    output_path=str(output_file)
                )
                downloaded.append(str(output_file))
            except Exception as e:
                print(f"⚠️  Skipping T+{step}h: {e}")
                continue
        
        print(f"\n✅ Downloaded {len(downloaded)}/{total} timesteps")
        return downloaded


def main():
    parser = argparse.ArgumentParser(
        description="Download ECMWF forecast data using cloud mirrors",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Download latest 0.25° forecast with marine params (no rate limits)
  %(prog)s --params 10u,10v,msl
  
  # Download 0.1° (9km) high-res from Azure mirror
  %(prog)s --resolution 0.1 --source azure --params 10u,10v,msl
  
  # Download 24-hour forecast from 12z run
  %(prog)s --time 12 --step 24 --params 10u,10v,msl,2t
  
  # Download multiple timesteps
  %(prog)s --steps 0,3,6,12,24 --params 10u,10v --output-dir ./forecasts/
  
  # Use AWS mirror instead of Azure
  %(prog)s --source aws --params 10u,10v,msl

Common Parameters:
  Marine Surface: 10u, 10v, msl, 2t, fg10
  Wave (separate): swh, mwd, mwp
        """
    )
    
    parser.add_argument(
        '--resolution', '-r',
        choices=['0.1', '0.25'],
        default='0.25',
        help='Grid resolution: 0.1° (9km HRES) or 0.25° (25km Open-Data, default)'
    )
    
    parser.add_argument(
        '--source', '-s',
        choices=['azure', 'aws', 'ecmwf'],
        default='azure',
        help='Cloud mirror: azure (default), aws, or ecmwf (rate-limited)'
    )
    
    parser.add_argument(
        '--params', '-p',
        required=True,
        help='Comma-separated parameters (e.g., 10u,10v,msl)'
    )
    
    parser.add_argument(
        '--date', '-d',
        type=int,
        default=0,
        help='Days from today: 0 (default, today), -1 (yesterday), etc.'
    )
    
    parser.add_argument(
        '--time', '-t',
        type=int,
        choices=[0, 6, 12, 18],
        default=0,
        help='Run hour: 0 (default), 6, 12, or 18 UTC'
    )
    
    parser.add_argument(
        '--step',
        type=int,
        help='Single forecast step in hours (e.g., 24 for T+24h)'
    )
    
    parser.add_argument(
        '--steps',
        help='Multiple forecast steps (e.g., "0,3,6,12,24" or "0:120:3" for 0-120h every 3h)'
    )
    
    parser.add_argument(
        '--output', '-o',
        help='Output file path (for single step download)'
    )
    
    parser.add_argument(
        '--output-dir',
        default='.',
        help='Output directory (for multiple steps)'
    )
    
    args = parser.parse_args()
    
    # Parse parameters
    params = [p.strip() for p in args.params.split(',')]
    
    # Parse steps
    if args.steps:
        # Support range notation: "0:120:3" means range(0, 121, 3)
        if ':' in args.steps:
            parts = args.steps.split(':')
            start = int(parts[0])
            stop = int(parts[1]) + 1  # Inclusive
            step = int(parts[2]) if len(parts) > 2 else 3
            steps = list(range(start, stop, step))
        else:
            steps = [int(s.strip()) for s in args.steps.split(',')]
    elif args.step is not None:
        steps = [args.step]
    else:
        steps = [0]  # Default to T+0
    
    # Initialize downloader
    downloader = ECMWFDownloader(
        source=args.source,
        resolution=args.resolution
    )
    
    # Download
    if len(steps) == 1:
        # Single timestep
        downloader.download_forecast(
            params=params,
            date=args.date,
            time=args.time,
            step=steps[0],
            output_path=args.output
        )
    else:
        # Multiple timesteps
        downloader.download_timesteps(
            params=params,
            steps=steps,
            date=args.date,
            time=args.time,
            output_dir=args.output_dir
        )


if __name__ == "__main__":
    main()

from pathlib import Path
from ecmwf_downloader import ECMWFDownloader

def main():
    output_dir = Path("test_seeds")
    output_dir.mkdir(exist_ok=True)
    output_path = output_dir / "aifs_sample.grib2"

    if output_path.exists():
        print(f"File {output_path} already exists. Skipping download.")
        return

    print("Downloading reference AIFS data...")
    # Using 0.25 deg for lighter weight reference file, sufficient for integration tests
    downloader = ECMWFDownloader(resolution="0.25", source="azure")
    
    # Params: Wind components and Pressure
    params = ['10u', '10v', 'msl']
    
    try:
        downloader.download_forecast(
            params=params,
            date=0, # Today
            time=0, # 00z run usually available
            step=0, # T+0
            output_path=str(output_path)
        )
        print("Success.")
    except Exception as e:
        print(f"Download failed: {e}")
        # Fallback: try yesterday if today's 00z isn't ready (unlikely for Azure which mirrors fast, but good safety)
        print("Retrying with yesterday's data...")
        try:
            downloader.download_forecast(
                params=params,
                date=-1,
                time=0,
                step=0,
                output_path=str(output_path)
            )
            print("Success (backup date).")
        except Exception as e2:
            print(f"Backup download failed: {e2}")
            exit(1)

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# Mariner's AI Grid - Slicer CLI
# SPDX-License-Identifier: Apache-2.0

"""
Command-line interface for the Weather Data Slicer.

Usage:
    mag-slicer slice --lat 37.0 --lon -135.0 --radius 500 --hours 72
    mag-slicer demo
    mag-slicer info <seed_file>
"""

import logging
import sys
from datetime import datetime
from pathlib import Path

import click
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn

console = Console()
logging.basicConfig(level=logging.INFO)


@click.group()
@click.version_option(version="0.1.0", prog_name="mag-slicer")
def main():
    """
    Mariner's AI Grid - Weather Data Slicer

    Extract regional weather data from ECMWF HRES for offshore navigation.
    Reduces 10GB global files to ~5MB satellite-transmittable Seeds.
    """
    pass


@main.command()
@click.option("--lat", type=float, required=True, help="Center latitude (degrees)")
@click.option("--lon", type=float, required=True, help="Center longitude (degrees)")
@click.option("--radius", type=float, default=500, help="Radius in nautical miles (default: 500)")
@click.option("--hours", type=int, default=72, help="Forecast hours (default: 72)")
@click.option("--step", type=int, default=3, help="Time step hours (default: 3)")
@click.option("--variables", type=str, default="standard",
              help="Variable set: minimal, standard, full (default: standard)")
@click.option("--format", "output_format", type=click.Choice(["parquet", "protobuf", "both"]),
              default="protobuf", help="Output format (default: protobuf)")
@click.option("--output", "-o", type=Path, default=Path("./seeds"),
              help="Output directory (default: ./seeds)")
@click.option("--offline", is_flag=True, help="Use mock data (no CDS API)")
def slice(lat: float, lon: float, radius: float, hours: int, step: int,
          variables: str, output_format: str, output: Path, offline: bool):
    """
    Extract a regional weather slice.

    Example: Extract 500nm around Hawaii approach
        mag-slicer slice --lat 21.3 --lon -157.8 --radius 500 --hours 72
    """
    from slicer.core import BoundingBox, ECMWFHRESSlicer
    from slicer.export import SeedExporter, compare_formats
    from slicer.variables import MINIMAL_VARIABLES, STANDARD_VARIABLES, FULL_VARIABLES

    console.print(Panel.fit(
        "[bold blue]Mariner's AI Grid - Weather Slicer[/]\n"
        f"Extracting {radius}nm radius around ({lat:.2f}°, {lon:.2f}°)",
        border_style="blue"
    ))

    # Create bounding box
    bbox = BoundingBox.from_center(lat, lon, radius)

    console.print(f"\n[dim]Region:[/] {bbox.lat_min:.2f}° to {bbox.lat_max:.2f}°N, "
                  f"{bbox.lon_min:.2f}° to {bbox.lon_max:.2f}°E")
    console.print(f"[dim]Coverage:[/] {bbox.area_sq_nm:,.0f} sq nm")

    # Determine variable set
    var_map = {
        "minimal": MINIMAL_VARIABLES,
        "standard": STANDARD_VARIABLES,
        "full": FULL_VARIABLES,
    }
    var_list = var_map.get(variables, STANDARD_VARIABLES)

    console.print(f"[dim]Variables:[/] {len(var_list)} ({variables})")
    console.print(f"[dim]Forecast:[/] {hours}h at {step}h intervals")

    # Initialize slicer
    slicer = ECMWFHRESSlicer(
        cache_dir=output / ".cache",
        offline_mode=offline,
    )

    # Perform slicing
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task(
            "Extracting regional data..." if not offline else "Generating mock data...",
            total=None
        )

        seed = slicer.slice(
            bbox=bbox,
            forecast_hours=hours,
            time_step_hours=step,
            variables=var_list,
        )

        progress.update(task, completed=True)

    # Display seed info
    table = Table(title="Seed Generated", show_header=False)
    table.add_column("Property", style="cyan")
    table.add_column("Value", style="green")

    table.add_row("Seed ID", seed.seed_id)
    table.add_row("Model Source", seed.model_source)
    table.add_row("Model Run", seed.model_run.strftime("%Y-%m-%d %H:%M UTC"))
    table.add_row("Grid Shape", f"{seed.shape[1]} x {seed.shape[2]} points")
    table.add_row("Time Steps", str(seed.shape[0]))
    table.add_row("Variables", str(len(seed.variables)))
    table.add_row("Raw Size", f"{seed.size_bytes_uncompressed() / 1024:.1f} KB")

    console.print(table)

    # Export
    exporter = SeedExporter(output)

    export_results = []

    if output_format in ("parquet", "both"):
        with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"),
                      console=console) as progress:
            progress.add_task("Exporting to Parquet...", total=None)
            path, stats = exporter.to_parquet(seed)
            export_results.append(("Parquet", path, stats))

    if output_format in ("protobuf", "both"):
        with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"),
                      console=console) as progress:
            progress.add_task("Exporting to Protobuf...", total=None)
            path, stats = exporter.to_protobuf(seed)
            export_results.append(("Protobuf", path, stats))

    # Display export results
    console.print("\n[bold]Export Results:[/]")

    for fmt, path, stats in export_results:
        console.print(Panel.fit(
            f"[bold]{fmt}[/]\n"
            f"File: {path}\n"
            f"Size: [green]{stats.output_bytes / 1024:.1f} KB[/]\n"
            f"Compression: [cyan]{stats.compression_ratio:.1f}x[/]\n"
            f"Est. Starlink Cost: [yellow]${stats.estimated_transfer_cost_usd:.2f}[/]",
            border_style="green"
        ))

    # Summary
    if export_results:
        best = min(export_results, key=lambda x: x[2].output_bytes)
        console.print(f"\n[bold green]Success![/] Recommended format: {best[0]}")
        console.print(f"[dim]File saved to: {best[1]}[/]")


@main.command()
def demo():
    """
    Run demo: San Francisco to Hawaii passage.

    Demonstrates the slicer with realistic Pacific crossing scenario.
    """
    from slicer.core import BoundingBox, ECMWFHRESSlicer
    from slicer.export import SeedExporter, compare_formats

    console.print(Panel.fit(
        "[bold blue]Demo: Pacific Crossing Weather Slice[/]\n"
        "San Francisco to Hawaii - Midpoint extraction",
        border_style="blue"
    ))

    console.print("\n[bold]Scenario:[/]")
    console.print("  Route: San Francisco (37.8°N, 122.4°W) → Honolulu (21.3°N, 157.8°W)")
    console.print("  Midpoint: ~30°N, 140°W")
    console.print("  Coverage: 500nm radius (typical sailing vessel planning window)")
    console.print("  Forecast: 72 hours at 3-hour intervals")

    # Midpoint of SF-Honolulu great circle
    bbox = BoundingBox.from_center(lat=30.0, lon=-140.0, radius_nm=500)

    console.print(f"\n[dim]Bounding box:[/]")
    console.print(f"  Latitude:  {bbox.lat_min:.1f}° to {bbox.lat_max:.1f}°N")
    console.print(f"  Longitude: {bbox.lon_min:.1f}° to {bbox.lon_max:.1f}°W")
    console.print(f"  Area: {bbox.area_sq_nm:,.0f} sq nm\n")

    # Generate mock seed
    slicer = ECMWFHRESSlicer(offline_mode=True)

    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"),
                  console=console) as progress:
        progress.add_task("Generating mock weather data...", total=None)
        seed = slicer.slice(bbox, forecast_hours=72, time_step_hours=3)

    # Display seed characteristics
    table = Table(title="Weather Seed Generated")
    table.add_column("Metric", style="cyan")
    table.add_column("Value", style="green")
    table.add_column("Notes", style="dim")

    table.add_row(
        "Grid Points",
        f"{seed.shape[1]} × {seed.shape[2]}",
        f"= {seed.shape[1] * seed.shape[2]:,} points"
    )
    table.add_row(
        "Time Steps",
        str(seed.shape[0]),
        f"0-72h at 3h intervals"
    )
    table.add_row(
        "Variables",
        str(len(seed.variables)),
        ", ".join(seed.variables.keys())
    )
    table.add_row(
        "Raw Size",
        f"{seed.size_bytes_uncompressed() / 1024:.1f} KB",
        "Before compression"
    )

    console.print(table)

    # Export and compare formats
    output_dir = Path("./demo_seeds")
    comparison = compare_formats(seed, output_dir)

    console.print("\n[bold]Format Comparison:[/]")

    comp_table = Table()
    comp_table.add_column("Format", style="cyan")
    comp_table.add_column("Size", style="green")
    comp_table.add_column("Compression", style="yellow")
    comp_table.add_column("Starlink Cost", style="magenta")

    comp_table.add_row(
        "Parquet",
        f"{comparison['parquet']['size_kb']:.1f} KB",
        f"{comparison['parquet']['compression_ratio']:.1f}x",
        f"${comparison['parquet']['cost_usd']:.2f}",
    )
    comp_table.add_row(
        "Protobuf+zstd",
        f"{comparison['protobuf']['size_kb']:.1f} KB",
        f"{comparison['protobuf']['compression_ratio']:.1f}x",
        f"${comparison['protobuf']['cost_usd']:.2f}",
    )

    console.print(comp_table)

    # Key insights
    console.print(Panel.fit(
        "[bold]Key Insights:[/]\n\n"
        "• [green]10GB global GRIB → ~5MB regional Seed[/] (2000x reduction)\n"
        "• Regional cropping: extracts only 500nm around route\n"
        "• Variable pruning: 100+ variables → 8 marine-essential\n"
        "• Precision quantization: reduces entropy for better compression\n"
        "• Zstandard compression: 70-80% size reduction\n\n"
        f"[bold]Recommended format:[/] {comparison['recommendation'].upper()}\n"
        f"[bold]Files saved to:[/] {output_dir.absolute()}",
        title="Summary",
        border_style="green"
    ))


@main.command()
@click.argument("seed_file", type=Path)
def info(seed_file: Path):
    """
    Display information about a .seed.zst file.
    """
    from slicer.export import SeedExporter

    if not seed_file.exists():
        console.print(f"[red]Error: File not found: {seed_file}[/]")
        sys.exit(1)

    if not seed_file.suffix == ".zst":
        console.print("[yellow]Warning: Expected .seed.zst file[/]")

    try:
        seed = SeedExporter.read_protobuf_seed(seed_file)

        table = Table(title=f"Seed: {seed_file.name}")
        table.add_column("Property", style="cyan")
        table.add_column("Value", style="green")

        table.add_row("Seed ID", seed.seed_id)
        table.add_row("Model Source", seed.model_source)
        table.add_row("Model Run", seed.model_run.strftime("%Y-%m-%d %H:%M UTC"))
        table.add_row("Forecast Range",
                      f"{seed.forecast_start.strftime('%m/%d %H:%M')} → "
                      f"{seed.forecast_end.strftime('%m/%d %H:%M')}")
        table.add_row("Resolution", f"{seed.resolution_deg}°")
        table.add_row("Grid Shape", f"{seed.shape}")
        table.add_row("Variables", ", ".join(sorted(seed.variables.keys())))
        table.add_row("Bounding Box",
                      f"{seed.bounding_box.lat_min:.1f}° to {seed.bounding_box.lat_max:.1f}°N\n"
                      f"{seed.bounding_box.lon_min:.1f}° to {seed.bounding_box.lon_max:.1f}°E")
        table.add_row("File Size", f"{seed_file.stat().st_size / 1024:.1f} KB")

        console.print(table)

        # Validate
        issues = seed.validate()
        if issues:
            console.print("\n[yellow]Validation Issues:[/]")
            for issue in issues:
                console.print(f"  • {issue}")
        else:
            console.print("\n[green]Seed validation passed[/]")

    except Exception as e:
        console.print(f"[red]Error reading seed: {e}[/]")
        sys.exit(1)


@main.command()
@click.option("--lat", type=float, required=True, help="Center latitude")
@click.option("--lon", type=float, required=True, help="Center longitude")
@click.option("--radius", type=float, default=500, help="Radius in nm")
def estimate(lat: float, lon: float, radius: float):
    """
    Estimate download size and cost without fetching data.
    """
    from slicer.core import BoundingBox
    from slicer.variables import VariablePruner

    bbox = BoundingBox.from_center(lat, lon, radius)
    pruner = VariablePruner("standard")

    # Estimate grid size at 0.25° resolution
    lat_points = int((bbox.lat_max - bbox.lat_min) / 0.25) + 1
    lon_points = int((bbox.lon_max - bbox.lon_min) / 0.25) + 1
    time_steps = 25  # 0-72h at 3h intervals

    estimated_mb = pruner.estimate_pruned_size_mb(lat_points, lon_points, time_steps)

    table = Table(title="Size Estimate")
    table.add_column("Metric", style="cyan")
    table.add_column("Value", style="green")

    table.add_row("Region", f"{bbox.lat_min:.1f}° to {bbox.lat_max:.1f}°N, "
                           f"{bbox.lon_min:.1f}° to {bbox.lon_max:.1f}°E")
    table.add_row("Grid Points", f"{lat_points} × {lon_points}")
    table.add_row("Time Steps", str(time_steps))
    table.add_row("Variables", str(len(pruner.variables)))
    table.add_row("Est. Compressed Size", f"{estimated_mb:.2f} MB")
    table.add_row("Est. Starlink Cost", f"${estimated_mb * 2:.2f}")
    table.add_row("Est. Iridium Cost", f"${estimated_mb * 7:.2f}")

    console.print(table)


if __name__ == "__main__":
    main()

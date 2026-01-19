#!/usr/bin/env python3
# Mariner's AI Grid - Slicer CLI
# SPDX-License-Identifier: Apache-2.0

"""
Command-line interface for the Weather Data Slicer.
"""

import logging
import sys
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
    pass


@main.command()
@click.option("--lat", type=float, required=True, help="Center latitude")
@click.option("--lon", type=float, required=True, help="Center longitude")
@click.option("--radius", type=float, default=500, help="Radius (nm)")
@click.option("--hours", type=int, default=72, help="Forecast hours")
@click.option("--step", type=int, default=3, help="Time step hours")
@click.option("--variables", type=str, default="standard", help="Variable set")
@click.option("--format", "output_format", type=click.Choice(["parquet", "protobuf", "both"]), default="protobuf", help="Output format")
@click.option("--output", "-o", type=Path, default=Path("./seeds"), help="Output dir")
@click.option("--offline", is_flag=True, help="Use mock data")
def slice(lat: float, lon: float, radius: float, hours: int, step: int,
          variables: str, output_format: str, output: Path, offline: bool):
    """Extract a regional weather slice."""
    from slicer.core import BoundingBox, ECMWFHRESSlicer
    from slicer.export import SeedExporter
    from slicer.variables import MINIMAL_VARIABLES, STANDARD_VARIABLES, FULL_VARIABLES

    title = "Mariner's AI Grid - Weather Slicer\n"
    title += f"Extracting {radius}nm radius around ({lat:.2f}, {lon:.2f})"
    console.print(Panel.fit(title, border_style="blue"))

    bbox = BoundingBox.from_center(lat, lon, radius)

    region = f"{bbox.lat_min:.2f} to {bbox.lat_max:.2f}N, "
    region += f"{bbox.lon_min:.2f} to {bbox.lon_max:.2f}E"
    console.print("\n[dim]Region:[/]")
    console.print(region)
    
    cov_str = f"{bbox.area_sq_nm:,.0f}"
    console.print(f"[dim]Coverage:[/]{cov_str} sq nm")

    var_map = {
        "minimal": MINIMAL_VARIABLES,
        "standard": STANDARD_VARIABLES,
        "full": FULL_VARIABLES,
    }
    var_list = var_map.get(variables, STANDARD_VARIABLES)

    console.print(f"[dim]Variables:[/]{len(var_list)} ({variables})")
    console.print(f"[dim]Forecast:[/]{hours}h at {step}h intervals")

    slicer = ECMWFHRESSlicer(
        cache_dir=output / ".cache",
        offline_mode=offline,
    )

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

    table = Table(title="Seed Generated", show_header=False)
    table.add_column("Property", style="cyan")
    table.add_column("Value", style="green")

    table.add_row("Seed ID", seed.seed_id)
    table.add_row("Model Source", seed.model_source)
    run_str = seed.model_run.strftime("%Y-%m-%d %H:%M UTC")
    table.add_row("Model Run", run_str)
    
    shape_str = f"{seed.shape[1]} x {seed.shape[2]} points"
    table.add_row("Grid Shape", shape_str)
    
    table.add_row("Time Steps", str(seed.shape[0]))
    table.add_row("Variables", str(len(seed.variables)))
    
    raw_kb = seed.size_bytes_uncompressed() / 1024
    table.add_row("Raw Size", f"{raw_kb:.1f} KB")

    console.print(table)

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

    console.print("\n[bold]Export Results:[/]")

    for fmt, path, stats in export_results:
        costs = stats.cost_estimates
        cost_str = "\n".join([f"  {k}: ${v:.2f}" for k, v in costs.items()])
        
        size_kb = stats.output_bytes / 1024
        comp_ratio = stats.compression_ratio
        
        content = f"[bold]{fmt}[/]\nFile: {path}\n"
        content += f"Size: [green]{size_kb:.1f} KB[/]\n"
        content += f"Compression: [cyan]{comp_ratio:.1f}x[/]\n"
        content += f"[yellow]Satellite Costs (Est.):[/]\n{cost_str}"
        console.print(Panel.fit(content, border_style="green"))

    if export_results:
        best = min(export_results, key=lambda x: x[2].output_bytes)
        console.print(f"\n[bold green]Success![/] Recommended format: {best[0]}")
        console.print(f"[dim]File saved to: {best[1]}[/]")


@main.command()
def demo():
    """Run demo: San Francisco to Hawaii passage."""
    from slicer.core import BoundingBox, ECMWFHRESSlicer
    from slicer.export import SeedExporter, compare_formats

    title = "Demo: Pacific Crossing Weather Slice\n"
    title += "San Francisco to Hawaii - Midpoint extraction"
    console.print(Panel.fit(title, border_style="blue"))

    console.print("\n[bold]Scenario:[/]")
    console.print("  Route: SF (37.8N, 122.4W) -> HNL (21.3N, 157.8W)")
    console.print("  Midpoint: ~30N, 140W")
    console.print("  Coverage: 500nm radius")
    console.print("  Forecast: 72 hours at 3-hour intervals")

    bbox = BoundingBox.from_center(lat=30.0, lon=-140.0, radius_nm=500)

    region = f"Latitude: {bbox.lat_min:.1f} to {bbox.lat_max:.1f}N\n"
    region += f"  Longitude: {bbox.lon_min:.1f} to {bbox.lon_max:.1f}W\n"
    region += f"  Area: {bbox.area_sq_nm:,.0f} sq nm"
    console.print(f"\n[dim]Bounding box:[/]\n  {region}")

    slicer = ECMWFHRESSlicer(offline_mode=True)

    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"),
                  console=console) as progress:
        progress.add_task("Generating mock weather data...", total=None)
        seed = slicer.slice(bbox, forecast_hours=72, time_step_hours=3)

    table = Table(title="Weather Seed Generated")
    table.add_column("Metric", style="cyan")
    table.add_column("Value", style="green")
    table.add_column("Notes", style="dim")

    shape_str = f"{seed.shape[1]} x {seed.shape[2]}"
    pts_str = f"= {seed.shape[1] * seed.shape[2]:,} points"
    table.add_row("Grid Points", shape_str, pts_str)
    
    table.add_row("Time Steps", str(seed.shape[0]), "0-72h at 3h intervals")
    
    vars_str = ", ".join(seed.variables.keys())
    table.add_row("Variables", str(len(seed.variables)), vars_str)
    
    raw_kb = seed.size_bytes_uncompressed() / 1024
    table.add_row("Raw Size", f"{raw_kb:.1f} KB", "Before compression")

    console.print(table)

    output_dir = Path("./demo_seeds")
    comparison = compare_formats(seed, output_dir)

    console.print("\n[bold]Format Comparison:[/]")

    comp_table = Table()
    comp_table.add_column("Format", style="cyan")
    comp_table.add_column("Size", style="green")
    comp_table.add_column("Comp.", style="yellow")
    comp_table.add_column("Starlink", style="magenta")
    comp_table.add_column("Iridium", style="red")

    pq = comparison['parquet']
    pb = comparison['protobuf']
    
    pq_sl = pq['cost_estimates']['starlink']
    pq_ir = pq['cost_estimates']['iridium_certus_100']
    
    pb_sl = pb['cost_estimates']['starlink']
    pb_ir = pb['cost_estimates']['iridium_certus_100']

    comp_table.add_row("Parquet", f"{pq['size_kb']:.1f} KB", f"{pq['compression_ratio']:.1f}x", f"${pq_sl:.2f}", f"${pq_ir:.2f}")
    comp_table.add_row("Protobuf", f"{pb['size_kb']:.1f} KB", f"{pb['compression_ratio']:.1f}x", f"${pb_sl:.2f}", f"${pb_ir:.2f}")

    console.print(comp_table)

    rec = comparison['recommendation'].upper()
    save_path = output_dir.absolute()
    
    summary = "[bold]Key Insights:[/]\n\n"
    summary += "• [green]10GB global GRIB -> ~5MB regional Seed[/]\n"
    summary += "• Regional cropping: extracts only 500nm around route\n"
    summary += "• Variable pruning: 100+ variables -> 8 marine-essential\n"
    summary += "• Precision quantization: reduces entropy\n"
    summary += "• Zstandard compression: 70-80% size reduction\n\n"
    summary += f"[bold]Recommended format:[/]{rec}\n"
    summary += f"[bold]Files saved to:[/]{save_path}"
    
    console.print(Panel.fit(summary, title="Summary", border_style="green"))


@main.command()
@click.argument("seed_file", type=Path)
def info(seed_file: Path):
    """Display information about a .seed.zst file."""
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
        
        run_str = seed.model_run.strftime("%Y-%m-%d %H:%M UTC")
        table.add_row("Model Run", run_str)
        
        start_str = seed.forecast_start.strftime('%m/%d %H:%M')
        end_str = seed.forecast_end.strftime('%m/%d %H:%M')
        table.add_row("Forecast Range", f"{start_str} -> {end_str}")
        
        table.add_row("Resolution", f"{seed.resolution_deg}")
        table.add_row("Grid Shape", f"{seed.shape}")
        
        vars_str = ", ".join(sorted(seed.variables.keys()))
        table.add_row("Variables", vars_str)
        
        bbox_str = f"{seed.bounding_box.lat_min:.1f} to {seed.bounding_box.lat_max:.1f}N\n"
        bbox_str += f"{seed.bounding_box.lon_min:.1f} to {seed.bounding_box.lon_max:.1f}E"
        table.add_row("Bounding Box", bbox_str)
        
        size_kb = seed_file.stat().st_size / 1024
        table.add_row("File Size", f"{size_kb:.1f} KB")

        console.print(table)

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
    """Estimate download size and cost."""
    from slicer.core import BoundingBox
    from slicer.variables import VariablePruner
    from slicer.cost_model import SatelliteCostModel

    bbox = BoundingBox.from_center(lat, lon, radius)
    pruner = VariablePruner("standard")

    lat_points = int((bbox.lat_max - bbox.lat_min) / 0.25) + 1
    lon_points = int((bbox.lon_max - bbox.lon_min) / 0.25) + 1
    time_steps = 25

    est_mb = pruner.estimate_pruned_size_mb(lat_points, lon_points, time_steps)
    costs = SatelliteCostModel.get_all_estimates(int(est_mb * 1024 * 1024))

    table = Table(title="Size Estimate")
    table.add_column("Metric", style="cyan")
    table.add_column("Value", style="green")

    region = f"{bbox.lat_min:.1f} to {bbox.lat_max:.1f}N, "
    region += f"{bbox.lon_min:.1f} to {bbox.lon_max:.1f}E"
    table.add_row("Region", region)
    
    table.add_row("Grid Points", f"{lat_points} x {lon_points}")
    table.add_row("Time Steps", str(time_steps))
    table.add_row("Variables", str(len(pruner.variables)))
    table.add_row("Est. Compressed Size", f"{est_mb:.2f} MB")
    
    table.add_row("Cost: Starlink", f"${costs['starlink']:.2f}")
    table.add_row("Cost: Iridium Certus 100", f"${costs['iridium_certus_100']:.2f}")
    table.add_row("Cost: Iridium Certus 700", f"${costs['iridium_certus_700']:.2f}")
    table.add_row("Cost: KVH VSAT", f"${costs['kvh_vsat']:.2f}")

    console.print(table)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# Mariner's AI Grid - Seed Size Monitor
# SPDX-License-Identifier: Apache-2.0

"""
Monitors generated seed files for satellite-efficiency compliance.

Target: Seeds must be ≤5MB for feasible satellite transmission.

Usage:
    python monitor_seeds.py --watch ./test_seeds
    python monitor_seeds.py --check ./test_seeds
    python monitor_seeds.py --generate-and-watch
"""

import sys
import time
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass

# ANSI colors for terminal output
RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"
BOLD = "\033[1m"

# Satellite efficiency target
TARGET_SIZE_MB = 5.0
TARGET_SIZE_BYTES = int(TARGET_SIZE_MB * 1024 * 1024)

# Warning threshold (80% of target)
WARNING_SIZE_BYTES = int(TARGET_SIZE_BYTES * 0.8)


@dataclass
class SeedFile:
    path: Path
    size_bytes: int

    @property
    def size_mb(self) -> float:
        return self.size_bytes / (1024 * 1024)

    @property
    def size_kb(self) -> float:
        return self.size_bytes / 1024

    @property
    def status(self) -> str:
        if self.size_bytes > TARGET_SIZE_BYTES:
            return "EXCEEDED"
        elif self.size_bytes > WARNING_SIZE_BYTES:
            return "WARNING"
        else:
            return "OK"

    @property
    def starlink_cost(self) -> float:
        return self.size_mb * 2.0

    @property
    def iridium_cost(self) -> float:
        return self.size_mb * 7.0


def scan_seeds(directory: Path) -> list[SeedFile]:
    """Scan directory for seed files"""
    seeds = []
    patterns = ["*.seed.zst", "*.parquet", "*.seed"]

    for pattern in patterns:
        for path in directory.glob(f"**/{pattern}"):
            if path.is_file():
                seeds.append(SeedFile(path=path, size_bytes=path.stat().st_size))

    return sorted(seeds, key=lambda s: s.size_bytes, reverse=True)


def print_seed_report(seeds: list[SeedFile], show_all: bool = True):
    """Print a formatted report of seed files"""
    if not seeds:
        print(f"{YELLOW}No seed files found{RESET}")
        return

    exceeded = [s for s in seeds if s.status == "EXCEEDED"]
    warnings = [s for s in seeds if s.status == "WARNING"]
    ok = [s for s in seeds if s.status == "OK"]

    print(f"\n{BOLD}{'='*70}{RESET}")
    print(f"{BOLD}SEED SIZE MONITOR - Target: ≤{TARGET_SIZE_MB}MB{RESET}")
    print(f"{BOLD}{'='*70}{RESET}")
    print(f"Scanned: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Total files: {len(seeds)}")
    print()

    # Summary
    print(f"{BOLD}Summary:{RESET}")
    print(f"  {GREEN}✓ OK (<4MB):{RESET} {len(ok)}")
    print(f"  {YELLOW}⚠ Warning (4-5MB):{RESET} {len(warnings)}")
    print(f"  {RED}✗ Exceeded (>5MB):{RESET} {len(exceeded)}")
    print()

    # Exceeded - always show
    if exceeded:
        print(f"{RED}{BOLD}ALERT: Seeds exceeding 5MB target:{RESET}")
        print(f"{RED}{'-'*70}{RESET}")
        for seed in exceeded:
            print(f"  {RED}✗{RESET} {seed.path.name}")
            print(f"    Size: {RED}{seed.size_mb:.2f} MB{RESET} ({seed.size_bytes:,} bytes)")
            print(f"    Over by: {RED}{seed.size_mb - TARGET_SIZE_MB:.2f} MB{RESET}")
            print(f"    Starlink: ${seed.starlink_cost:.2f} | Iridium: ${seed.iridium_cost:.2f}")
            print()

    # Warnings
    if warnings:
        print(f"{YELLOW}{BOLD}Warning: Seeds approaching limit (80-100%):{RESET}")
        print(f"{YELLOW}{'-'*70}{RESET}")
        for seed in warnings:
            pct = (seed.size_bytes / TARGET_SIZE_BYTES) * 100
            print(f"  {YELLOW}⚠{RESET} {seed.path.name}: {seed.size_mb:.2f} MB ({pct:.0f}%)")
        print()

    # OK - only if show_all
    if show_all and ok:
        print(f"{GREEN}{BOLD}OK: Seeds within target:{RESET}")
        print(f"{GREEN}{'-'*70}{RESET}")
        for seed in ok:
            pct = (seed.size_bytes / TARGET_SIZE_BYTES) * 100
            print(f"  {GREEN}✓{RESET} {seed.path.name}: {seed.size_kb:.1f} KB ({pct:.0f}%)")
        print()

    # Total stats
    total_bytes = sum(s.size_bytes for s in seeds)
    total_mb = total_bytes / (1024 * 1024)
    print(f"{BOLD}Total size:{RESET} {total_mb:.2f} MB across {len(seeds)} files")
    print(f"{BOLD}Avg size:{RESET} {total_mb/len(seeds):.2f} MB per seed")

    return len(exceeded)


def watch_directory(directory: Path, interval: float = 2.0):
    """Watch directory for new/changed seed files"""
    print(f"{BLUE}Watching for seed files in: {directory}{RESET}")
    print(f"{BLUE}Target size: ≤{TARGET_SIZE_MB}MB{RESET}")
    print(f"{BLUE}Press Ctrl+C to stop{RESET}")
    print()

    seen_files: dict[Path, int] = {}

    try:
        while True:
            seeds = scan_seeds(directory)

            for seed in seeds:
                prev_size = seen_files.get(seed.path)

                if prev_size is None:
                    # New file
                    status_color = RED if seed.status == "EXCEEDED" else (
                        YELLOW if seed.status == "WARNING" else GREEN
                    )
                    status_icon = "✗" if seed.status == "EXCEEDED" else (
                        "⚠" if seed.status == "WARNING" else "✓"
                    )

                    print(f"[{datetime.now().strftime('%H:%M:%S')}] "
                          f"{status_color}{status_icon}{RESET} New: {seed.path.name} "
                          f"({seed.size_kb:.1f} KB)")

                    if seed.status == "EXCEEDED":
                        print(f"  {RED}{BOLD}⚠️  ALERT: Exceeds 5MB target by "
                              f"{seed.size_mb - TARGET_SIZE_MB:.2f} MB!{RESET}")

                    seen_files[seed.path] = seed.size_bytes

                elif prev_size != seed.size_bytes:
                    # Changed file
                    delta = seed.size_bytes - prev_size
                    delta_str = f"+{delta:,}" if delta > 0 else f"{delta:,}"

                    print(f"[{datetime.now().strftime('%H:%M:%S')}] "
                          f"Changed: {seed.path.name} ({delta_str} bytes)")

                    if seed.status == "EXCEEDED" and prev_size <= TARGET_SIZE_BYTES:
                        print(f"  {RED}{BOLD}⚠️  ALERT: Now exceeds 5MB target!{RESET}")

                    seen_files[seed.path] = seed.size_bytes

            time.sleep(interval)

    except KeyboardInterrupt:
        print(f"\n{BLUE}Stopped watching{RESET}")
        print_seed_report(scan_seeds(directory))


def generate_and_monitor():
    """Generate test payloads and monitor their sizes"""
    from functions.test_payloads import TEST_PAYLOADS, save_test_seeds

    output_dir = Path("./test_seeds")

    print(f"{BOLD}Generating test payloads and monitoring sizes...{RESET}")
    print(f"Output: {output_dir.absolute()}")
    print(f"Target: ≤{TARGET_SIZE_MB}MB per seed")
    print()

    # Generate seeds
    save_test_seeds(output_dir)

    # Scan and report
    seeds = scan_seeds(output_dir)
    exceeded_count = print_seed_report(seeds)

    if exceeded_count > 0:
        print(f"\n{RED}{BOLD}⚠️  {exceeded_count} seed(s) exceed the 5MB target!{RESET}")
        sys.exit(1)
    else:
        print(f"\n{GREEN}{BOLD}✓ All seeds within 5MB target{RESET}")
        sys.exit(0)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Monitor seed file sizes")
    parser.add_argument("--watch", type=Path, metavar="DIR",
                        help="Watch directory for seed files")
    parser.add_argument("--check", type=Path, metavar="DIR",
                        help="Check directory once and exit")
    parser.add_argument("--generate-and-watch", action="store_true",
                        help="Generate test payloads and check sizes")
    parser.add_argument("--interval", type=float, default=2.0,
                        help="Watch interval in seconds")

    args = parser.parse_args()

    if args.watch:
        args.watch.mkdir(parents=True, exist_ok=True)
        watch_directory(args.watch, args.interval)
    elif args.check:
        if not args.check.exists():
            print(f"{RED}Directory not found: {args.check}{RESET}")
            sys.exit(1)
        seeds = scan_seeds(args.check)
        exceeded = print_seed_report(seeds)
        sys.exit(1 if exceeded > 0 else 0)
    elif args.generate_and_watch:
        generate_and_monitor()
    else:
        # Default: check common locations
        for check_dir in [Path("./test_seeds"), Path("./demo_seeds"), Path("./seeds")]:
            if check_dir.exists():
                seeds = scan_seeds(check_dir)
                if seeds:
                    print_seed_report(seeds)
                    break
        else:
            print(f"{YELLOW}No seed directories found. Use --watch or --generate-and-watch{RESET}")

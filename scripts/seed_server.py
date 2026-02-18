#!/usr/bin/env python3
"""
Mariner's AI Grid - Development Seed Server

Simple HTTP server for serving weather seed files during local development.
Serves files from conductor/demo_seeds/ on port 8082.

Usage:
    python scripts/seed_server.py

The server will run at http://localhost:8082 and serve:
- Parquet files (.parquet)
- Compressed protobuf seeds (.seed.zst)
"""

import http.server
import socketserver
import json
import subprocess
import hashlib
from pathlib import Path
import sys
import os

PORT = 8089
SEED_DIR = Path(__file__).parent.parent / "conductor" / "demo_seeds"
PROJECT_ROOT = Path(__file__).parent.parent

class SeedHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP handler that serves from demo_seeds directory and handles dynamic slicing"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SEED_DIR), **kwargs)

    def do_POST(self):
        if self.path == '/slice':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            params = json.loads(post_data)
            
            lat = params.get('lat')
            lon = params.get('lon')
            radius = params.get('radius', 300)
            
            print(f"[Seed Server] 🛰️  Requesting REAL slice for: {lat}, {lon} (r={radius}nm)")
            
            try:
                loc_hash = hashlib.md5(f"{lat:.2f}_{lon:.2f}".encode()).hexdigest()[:6]
                print(f"[Seed Server] 🛰️  Requesting REAL slice for: {lat}, {lon} (hash={loc_hash})")
                
                cmd = [
                    "uv", "run", "python", "-m", "slicer.cli", "slice",
                    "--lat", str(lat),
                    "--lon", str(lon),
                    "--radius", str(radius),
                    "--hours", "24",
                    "--output", str(SEED_DIR)
                ]
                
                result = subprocess.run(cmd, cwd=str(PROJECT_ROOT / "conductor"), capture_output=True, text=True)
                
                if result.returncode == 0:
                    # Look for the file with the matching loc_hash
                    pattern = f"*_{loc_hash}.parquet"
                    files = sorted(SEED_DIR.glob(pattern), key=os.path.getmtime, reverse=True)
                    if files:
                        new_file = files[0].name
                        response = {"status": "success", "url": f"http://{self.headers['Host']}/{new_file}", "filename": new_file}
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps(response).encode())
                        return
                
                print(f"[Seed Server] ❌ Slicing failed or no file found. Error: {result.stderr}")
                self.send_error(500, "Slicing failed")
                
            except Exception as e:
                print(f"[Seed Server] ❌ Error: {e}")
                self.send_error(500, str(e))
        else:
            self.send_error(404)

    def end_headers(self):
        # ... (rest of headers)
        # Set proper MIME types
        if self.path.endswith('.parquet'):
            self.send_header('Content-Type', 'application/octet-stream')
        elif self.path.endswith('.seed.zst') or self.path.endswith('.zst'):
            self.send_header('Content-Type', 'application/zstd')
        # Add CORS headers for mobile app access
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

    def do_HEAD(self):
        """Override HEAD to ensure CORS headers are sent"""
        super().do_HEAD()
    
    def do_OPTIONS(self):
        """Handle preflight requests"""
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        """Log with timestamp and IP"""
        print(f"[Seed Server] {self.address_string()} - {format % args}")


def main():
    if not SEED_DIR.exists():
        print(f"❌ Error: Seed directory not found: {SEED_DIR}")
        print("   Run 'cd conductor && uv run mag-slicer demo' to generate demo seeds")
        sys.exit(1)

    # List available seeds
    seeds = list(SEED_DIR.glob("*.seed.zst")) + list(SEED_DIR.glob("*.parquet"))
    if not seeds:
        print(f"⚠️  Warning: No seed files found in {SEED_DIR}")
        print("   Run 'cd conductor && uv run mag-slicer demo' to generate demo seeds")
    else:
        print(f"\n📦 Available seeds ({len(seeds)}):")
        for seed in sorted(seeds):
            size_mb = seed.stat().st_size / (1024 * 1024)
            print(f"   - {seed.name} ({size_mb:.2f} MB)")

    print(f"\n🌐 Starting Seed Server on port {PORT}...")
    print(f"   Directory: {SEED_DIR}")
    print(f"   URL: http://localhost:{PORT}/")
    print(f"   Example: http://localhost:{PORT}/{seeds[0].name if seeds else 'mock_*.seed.zst'}")
    print("\n   Press Ctrl+C to stop\n")

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), SeedHTTPRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\n🛑 Shutting down seed server...")
            httpd.shutdown()


if __name__ == "__main__":
    main()

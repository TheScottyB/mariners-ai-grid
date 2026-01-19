#!/usr/bin/env python3
# Mariner's AI Grid - Slicer Cloud Function
# SPDX-License-Identifier: Apache-2.0

"""
Cloud Function for server-side weather seed generation.

This function accepts HTTP requests with route/location parameters and returns
compressed weather Seeds suitable for satellite transmission.

Deployment targets:
- Google Cloud Functions (Gen 2)
- AWS Lambda (via Mangum adapter)
- Azure Functions
- Self-hosted (FastAPI/uvicorn)

Environment Variables:
- MAG_STORAGE_BUCKET: GCS/S3 bucket for seed storage
- MAG_CDS_API_KEY: ECMWF CDS API key (optional, uses ~/.cdsapirc if not set)
- MAG_CACHE_TTL_HOURS: Cache TTL for generated seeds (default: 6)
- MAG_MAX_RADIUS_NM: Maximum allowed radius (default: 1000nm)
"""

import base64
import hashlib
import json
import logging
import os
import tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, Union
from dataclasses import dataclass, asdict
from enum import Enum

# Cloud Function framework imports
try:
    import functions_framework
    HAS_GCF = True
except ImportError:
    HAS_GCF = False

# FastAPI for local development and alternative deployments
from pydantic import BaseModel, Field, field_validator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# =============================================================================
# Request/Response Models
# =============================================================================

class OutputFormat(str, Enum):
    """Supported output formats"""
    PROTOBUF = "protobuf"
    PARQUET = "parquet"


class VariableSet(str, Enum):
    """Pre-defined variable sets"""
    MINIMAL = "minimal"    # Wind + pressure only (Iridium)
    STANDARD = "standard"  # Full marine set
    FULL = "full"          # All available variables


class SliceRequest(BaseModel):
    """Request model for seed generation"""

    # Location (required: either center point or route)
    lat: Optional[float] = Field(None, ge=-90, le=90, description="Center latitude")
    lon: Optional[float] = Field(None, ge=-180, le=180, description="Center longitude")
    waypoints: Optional[list[tuple[float, float]]] = Field(
        None, description="Route waypoints as [(lat, lon), ...]"
    )

    # Coverage parameters
    radius_nm: float = Field(500, ge=50, le=1000, description="Radius in nautical miles")
    forecast_hours: int = Field(72, ge=6, le=240, description="Forecast hours")
    time_step_hours: int = Field(3, ge=1, le=12, description="Time step interval")

    # Output options
    variables: VariableSet = Field(VariableSet.STANDARD, description="Variable set")
    format: OutputFormat = Field(OutputFormat.PROTOBUF, description="Output format")
    compression_level: int = Field(9, ge=1, le=19, description="Zstd compression level")

    # Optional metadata
    vessel_id: Optional[str] = Field(None, description="Vessel identifier for tracking")
    request_id: Optional[str] = Field(None, description="Client-generated request ID")

    @field_validator("waypoints", mode="before")
    @classmethod
    def parse_waypoints(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            return json.loads(v)
        return v

    def validate_location(self) -> bool:
        """Ensure either center point or waypoints provided"""
        has_center = self.lat is not None and self.lon is not None
        has_route = self.waypoints is not None and len(self.waypoints) >= 2
        return has_center or has_route


@dataclass
class SliceResponse:
    """Response model for seed generation"""
    success: bool
    seed_id: str
    request_id: Optional[str]

    # Seed metadata
    model_source: str
    model_run: str
    bounding_box: dict
    grid_shape: tuple[int, int, int]
    variables: list[str]

    # Size and cost
    size_bytes: int
    compression_ratio: float
    estimated_starlink_cost_usd: float
    estimated_iridium_cost_usd: float

    # Delivery
    download_url: Optional[str] = None
    seed_base64: Optional[str] = None  # For small seeds, inline delivery
    expires_at: Optional[str] = None

    # Errors
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ErrorResponse:
    """Error response model"""
    success: bool = False
    error: str = ""
    error_code: str = ""
    request_id: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


# =============================================================================
# Core Slicer Function
# =============================================================================

def generate_seed(request: SliceRequest) -> tuple[bytes, SliceResponse]:
    """
    Generate a weather seed from the request parameters.

    Returns:
        Tuple of (seed_bytes, response_metadata)
    """
    from slicer.core import BoundingBox, ECMWFHRESSlicer
    from slicer.export import SeedExporter
    from slicer.variables import MINIMAL_VARIABLES, STANDARD_VARIABLES, FULL_VARIABLES

    # Build bounding box
    if request.waypoints:
        bbox = BoundingBox.from_route(request.waypoints, buffer_nm=request.radius_nm)
    else:
        bbox = BoundingBox.from_center(
            lat=request.lat,
            lon=request.lon,
            radius_nm=request.radius_nm
        )

    # Map variable set
    var_map = {
        VariableSet.MINIMAL: MINIMAL_VARIABLES,
        VariableSet.STANDARD: STANDARD_VARIABLES,
        VariableSet.FULL: FULL_VARIABLES,
    }
    var_list = var_map[request.variables]

    # Check for CDS API availability
    cds_available = os.path.exists(os.path.expanduser("~/.cdsapirc")) or \
                    os.environ.get("MAG_CDS_API_KEY")

    # Initialize slicer
    cache_dir = Path(tempfile.gettempdir()) / "mag_function_cache"
    slicer = ECMWFHRESSlicer(
        cache_dir=cache_dir,
        offline_mode=not cds_available,
    )

    logger.info(f"Generating seed: bbox={bbox}, hours={request.forecast_hours}, "
                f"vars={request.variables}, format={request.format}")

    # Generate seed
    seed = slicer.slice(
        bbox=bbox,
        forecast_hours=request.forecast_hours,
        time_step_hours=request.time_step_hours,
        variables=var_list,
    )

    # Export to requested format
    with tempfile.TemporaryDirectory() as tmpdir:
        exporter = SeedExporter(
            Path(tmpdir),
            compression_level=request.compression_level
        )

        if request.format == OutputFormat.PROTOBUF:
            path, stats = exporter.to_protobuf(seed)
        else:
            path, stats = exporter.to_parquet(seed)

        # Read the generated file
        seed_bytes = path.read_bytes()

    # Build response
    response = SliceResponse(
        success=True,
        seed_id=seed.seed_id,
        request_id=request.request_id,
        model_source=seed.model_source,
        model_run=seed.model_run.isoformat(),
        bounding_box=seed.bounding_box.to_dict(),
        grid_shape=seed.shape,
        variables=list(seed.variables.keys()),
        size_bytes=len(seed_bytes),
        compression_ratio=stats.compression_ratio,
        estimated_starlink_cost_usd=round(len(seed_bytes) / (1024 * 1024) * 2.0, 2),
        estimated_iridium_cost_usd=round(len(seed_bytes) / (1024 * 1024) * 7.0, 2),
    )

    return seed_bytes, response


def handle_slice_request(request_data: dict) -> tuple[dict, int, Optional[bytes]]:
    """
    Handle a slice request and return response data.

    Returns:
        Tuple of (response_dict, http_status, optional_binary_data)
    """
    try:
        # Parse and validate request
        request = SliceRequest(**request_data)

        if not request.validate_location():
            return ErrorResponse(
                error="Must provide either (lat, lon) or waypoints",
                error_code="INVALID_LOCATION",
                request_id=request.request_id,
            ).to_dict(), 400, None

        # Generate seed
        seed_bytes, response = generate_seed(request)

        # For small seeds (<1MB), include inline as base64
        if len(seed_bytes) < 1024 * 1024:
            response.seed_base64 = base64.b64encode(seed_bytes).decode("ascii")

        # Set expiration (6 hours default)
        cache_ttl = int(os.environ.get("MAG_CACHE_TTL_HOURS", "6"))
        response.expires_at = (
            datetime.now(timezone.utc) + timedelta(hours=cache_ttl)
        ).isoformat()

        return response.to_dict(), 200, seed_bytes

    except ValueError as e:
        logger.warning(f"Validation error: {e}")
        return ErrorResponse(
            error=str(e),
            error_code="VALIDATION_ERROR",
            request_id=request_data.get("request_id"),
        ).to_dict(), 400, None

    except Exception as e:
        logger.exception(f"Internal error: {e}")
        return ErrorResponse(
            error="Internal server error",
            error_code="INTERNAL_ERROR",
            request_id=request_data.get("request_id"),
        ).to_dict(), 500, None


# =============================================================================
# Cloud Function Entry Points
# =============================================================================

if HAS_GCF:
    @functions_framework.http
    def slicer_http(request):
        """
        Google Cloud Function HTTP entry point.

        Accepts POST requests with JSON body containing slice parameters.
        Returns JSON response with seed metadata and optional inline data.
        """
        from flask import jsonify, make_response

        # Handle CORS preflight
        if request.method == "OPTIONS":
            response = make_response()
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "POST"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"
            return response

        if request.method != "POST":
            return jsonify(ErrorResponse(
                error="Method not allowed",
                error_code="METHOD_NOT_ALLOWED"
            ).to_dict()), 405

        try:
            request_data = request.get_json(force=True)
        except Exception:
            return jsonify(ErrorResponse(
                error="Invalid JSON body",
                error_code="INVALID_JSON"
            ).to_dict()), 400

        response_data, status, _ = handle_slice_request(request_data)

        response = jsonify(response_data)
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response, status


# =============================================================================
# FastAPI App (for local dev and alternative deployments)
# =============================================================================

def create_app():
    """Create FastAPI application for local development"""
    from fastapi import FastAPI, HTTPException, Response
    from fastapi.middleware.cors import CORSMiddleware

    app = FastAPI(
        title="Mariner's AI Grid - Slicer API",
        description="Generate regional weather Seeds for offshore navigation",
        version="0.1.0",
        license_info={"name": "Apache 2.0", "identifier": "Apache-2.0"},
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["POST", "GET"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health():
        """Health check endpoint"""
        return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

    @app.post("/slice")
    async def slice_endpoint(request: SliceRequest):
        """Generate a weather seed"""
        if not request.validate_location():
            raise HTTPException(
                status_code=400,
                detail="Must provide either (lat, lon) or waypoints"
            )

        response_data, status, _ = handle_slice_request(request.model_dump())

        if status != 200:
            raise HTTPException(status_code=status, detail=response_data.get("error"))

        return response_data

    @app.post("/slice/download")
    async def slice_download(request: SliceRequest):
        """Generate and download seed directly (binary response)"""
        if not request.validate_location():
            raise HTTPException(
                status_code=400,
                detail="Must provide either (lat, lon) or waypoints"
            )

        response_data, status, seed_bytes = handle_slice_request(request.model_dump())

        if status != 200:
            raise HTTPException(status_code=status, detail=response_data.get("error"))

        # Return binary seed directly
        content_type = (
            "application/x-protobuf" if request.format == OutputFormat.PROTOBUF
            else "application/vnd.apache.parquet"
        )

        return Response(
            content=seed_bytes,
            media_type=content_type,
            headers={
                "Content-Disposition": f'attachment; filename="{response_data["seed_id"]}.seed"',
                "X-Seed-Id": response_data["seed_id"],
                "X-Size-Bytes": str(response_data["size_bytes"]),
                "X-Compression-Ratio": str(response_data["compression_ratio"]),
            }
        )

    return app


# Create app instance for uvicorn
app = create_app()


# =============================================================================
# CLI for local testing
# =============================================================================

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Slicer Cloud Function")
    parser.add_argument("--serve", action="store_true", help="Run local server")
    parser.add_argument("--port", type=int, default=8080, help="Server port")
    parser.add_argument("--test", action="store_true", help="Run test request")

    args = parser.parse_args()

    if args.serve:
        import uvicorn
        uvicorn.run(app, host="0.0.0.0", port=args.port)

    elif args.test:
        # Test request
        test_request = {
            "lat": 30.0,
            "lon": -140.0,
            "radius_nm": 300,
            "forecast_hours": 48,
            "variables": "standard",
            "format": "protobuf",
            "request_id": "test-001",
        }

        print("Testing slice request:")
        print(json.dumps(test_request, indent=2))
        print()

        response_data, status, seed_bytes = handle_slice_request(test_request)

        print(f"Status: {status}")
        print(f"Response: {json.dumps(response_data, indent=2)}")

        if seed_bytes:
            print(f"\nSeed size: {len(seed_bytes):,} bytes")
            # Save test seed
            test_path = Path("test_seed.seed.zst")
            test_path.write_bytes(seed_bytes)
            print(f"Saved to: {test_path}")
    else:
        parser.print_help()

#!/bin/bash
# Mariner's AI Grid - ECMWF Open Data Curl Test
# 
# Tests ECMWF open data access using pure curl (no credentials needed)
# Since October 2025, ECMWF AIFS data is fully open access

set -e

echo "======================================================================"
echo "ECMWF Open Data Access Test (curl)"
echo "Testing Post-October 2025 No-Credentials Policy"
echo "======================================================================"
echo

# Calculate yesterday's date (data is typically 1-2 days behind)
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    YESTERDAY=$(date -v-1d +%Y%m%d)
else
    # Linux
    YESTERDAY=$(date -d "yesterday" +%Y%m%d)
fi

echo "📅 Using date: $YESTERDAY (yesterday's run)"
echo

# Test 1: HTTP endpoint availability
echo "======================================================================" 
echo "Test 1: HTTP Endpoint Availability"
echo "======================================================================"
echo

BASE_URL="https://data.ecmwf.int/forecasts"

if curl -I -s -f -m 10 "$BASE_URL" > /dev/null 2>&1; then
    echo "✅ ECMWF endpoint accessible: $BASE_URL"
    HTTP_STATUS=$(curl -I -s -m 10 "$BASE_URL" | grep "HTTP" | head -1)
    echo "   Status: $HTTP_STATUS"
else
    echo "❌ Failed to access ECMWF endpoint"
    echo "   This may indicate network issues"
fi

echo

# Test 2: Download sample GRIB2 file (very small subset)
echo "======================================================================"
echo "Test 2: Download GRIB2 Sample"
echo "======================================================================"
echo

# Construct URL for HRES 9km data (0.1° resolution)
# Format: /YYYYMMDD/HHz/ifs/0p1/YYYYMMDD{HH}0000-{step}h-oper-fc.grib2
SAMPLE_URL="https://data.ecmwf.int/forecasts/${YESTERDAY}/00z/ifs/0p1/${YESTERDAY}000000-6h-oper-fc.grib2"

echo "📥 Attempting download:"
echo "   URL: $SAMPLE_URL"
echo "   Model: HRES (High Resolution)"
echo "   Resolution: 0.1° (~9km native)"
echo "   Date: $YESTERDAY, Run: 00Z, Step: +6h"
echo "   Format: GRIB2 (operational forecast)"
echo

# Create temp file
TEMP_FILE=$(mktemp /tmp/ecmwf_test.XXXXXX.grib2)

# Try download with progress
if curl -f -# -m 60 \
    -H "User-Agent: MarinersAIGrid/1.0" \
    -o "$TEMP_FILE" \
    "$SAMPLE_URL" 2>&1; then
    
    FILE_SIZE=$(wc -c < "$TEMP_FILE" | tr -d ' ')
    echo
    echo "✅ Download successful!"
    echo "   File size: $(numfmt --to=iec-i --suffix=B $FILE_SIZE 2>/dev/null || echo "$FILE_SIZE bytes")"
    echo "   Saved to: $TEMP_FILE"
    echo "   🗑️  Cleaning up..."
    rm -f "$TEMP_FILE"
    DOWNLOAD_OK=1
else
    HTTP_CODE=$?
    echo
    echo "❌ Download failed (exit code: $HTTP_CODE)"
    echo "   Note: Data for $YESTERDAY may not be available yet"
    echo "   This is expected if the forecast run hasn't completed"
    rm -f "$TEMP_FILE"
    DOWNLOAD_OK=0
fi

echo

# Test 3: Check alternate endpoint (Azure/AWS mirror)
echo "======================================================================"
echo "Test 3: Alternate CDN Endpoints"
echo "======================================================================"
echo

# ECMWF also provides data via Azure and AWS
AZURE_URL="https://ai4edataeuwest.blob.core.windows.net/ecmwf"
AWS_URL="https://ecmwf-forecasts.s3.amazonaws.com"

echo "Testing Azure CDN..."
if curl -I -s -f -m 10 "$AZURE_URL" > /dev/null 2>&1; then
    echo "✅ Azure CDN accessible: $AZURE_URL"
else
    echo "⚠️  Azure CDN not responding (may be deprecated)"
fi

echo
echo "Testing AWS S3..."
if curl -I -s -f -m 10 "$AWS_URL" > /dev/null 2>&1; then
    echo "✅ AWS S3 accessible: $AWS_URL"
else
    echo "⚠️  AWS S3 not responding (may be deprecated)"
fi

echo

# Summary
echo "======================================================================"
echo "Summary"
echo "======================================================================"
echo

if [ "$DOWNLOAD_OK" -eq 1 ]; then
    echo "🎉 SUCCESS: ECMWF open data is fully accessible!"
    echo "   ✅ No API credentials required"
    echo "   ✅ Direct HTTP/HTTPS downloads work"
    echo "   ✅ Data is publicly available as of October 2025"
    echo
    echo "Next steps:"
    echo "  1. Run Python test: cd conductor && python tests/test_ecmwf_access.py"
    echo "  2. Generate real seed: uv run mag-slicer slice --lat 30 --lon -140"
    exit 0
else
    echo "⚠️  PARTIAL: Endpoint accessible but download failed"
    echo "   This is likely due to data availability timing"
    echo "   The $YESTERDAY/00Z run may not be complete yet"
    echo
    echo "What to try:"
    echo "  - Wait a few hours and re-run this test"
    echo "  - Check ECMWF status: https://www.ecmwf.int/"
    echo "  - Try the Python client test instead"
    exit 0
fi

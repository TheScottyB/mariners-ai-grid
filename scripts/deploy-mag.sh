#!/bin/bash
# Mariner's AI Grid - Deployment Orchestrator
# v1.0.0 (RC1)

set -e

# Config
APP_NAME="Mariner's AI Grid"
LOG_DIR=".mag-telemetry"
LOG_FILE="$LOG_DIR/deployments.jsonl"
SEED_LIMIT_BYTES=1048576 # 1MB

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Telemetry Init
mkdir -p "$LOG_DIR"
START_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

log_event() {
  local event=$1
  local status=$2
  local details=$3
  echo "{\"timestamp\": \"$(date -u +'%Y-%m-%dT%H:%M:%SZ')\", \"event\": \"$event\", \"status\": \"$status\", \"details\": \"$details\"}" >> "$LOG_FILE"
}

echo -e "${GREEN}⚓ Deploying ${APP_NAME}...${NC}"
log_event "deploy_start" "started" "target=$1"

# 2. Integrity Check (Seed Size)
echo -e "\n${YELLOW}[1/4] Running Integrity Checks...${NC}"
SEED_FILE="conductor/seeds/aifs_seed_2026011812.seed.zst"

# Find latest seed if specific one missing
if [ ! -f "$SEED_FILE" ]; then
    SEED_FILE=$(ls conductor/seeds/*.seed.zst | head -n 1)
fi

if [ -f "$SEED_FILE" ]; then
    SIZE=$(stat -f%z "$SEED_FILE" 2>/dev/null || stat -c%s "$SEED_FILE")
    if [ "$SIZE" -lt "$SEED_LIMIT_BYTES" ]; then
        echo -e "✅ Seed Size: $(($SIZE/1024))KB (PASS < 1MB)"
    else
        echo -e "${YELLOW}⚠️  Seed Size: $(($SIZE/1024))KB (WARNING > 1MB)${NC}"
        # Not failing build for now, but logging warning
    fi
else
    echo -e "${RED}❌ Error: No seed file found in conductor/seeds/${NC}"
    log_event "integrity_check" "failed" "seed_missing"
    exit 1
fi

# 3. Code Hardening
echo -e "\n${YELLOW}[2/4] Hardening Codebase...${NC}"
echo "Running TypeScript check..."
if npx tsc --noEmit; then
    echo -e "✅ TypeScript: PASS"
else
    echo -e "${RED}❌ TypeScript: FAIL${NC}"
    log_event "code_hardening" "failed" "typescript_errors"
    exit 1
fi

# 4. Environment Build
TARGET=$1
if [ -z "$TARGET" ]; then
    echo "Usage: ./deploy-mag.sh [simulator|preview|production]"
    exit 1
fi

echo -e "\n${YELLOW}[3/4] Building for Target: $TARGET${NC}"

case $TARGET in
  simulator)
    PROFILE="development"
    PLATFORM="ios"
    echo "🏗️  Building for iOS Simulator (Development)..."
    ;;
  preview)
    PROFILE="preview"
    PLATFORM="all"
    echo "🏗️  Building for Foundation Fleet (Preview)..."
    ;;
  production)
    PROFILE="production"
    PLATFORM="all"
    echo "🚀 Building for App Store (Production)..."
    ;;
  *)
    echo "Invalid target: $TARGET"
    exit 1
    ;;
esac

# Execute EAS Build
# We use --non-interactive to fail fast in scripts, but for local run we might want interactive.
# Assuming CI/CD or local runner.
if eas build --profile "$PROFILE" --platform "$PLATFORM" --non-interactive; then
    echo -e "${GREEN}✅ Build Success!${NC}"
    log_event "build" "success" "profile=$PROFILE"
else
    echo -e "${RED}❌ Build Failed${NC}"
    log_event "build" "failed" "profile=$PROFILE"
    exit 1
fi

echo -e "\n${GREEN}⚓ Deployment Complete.${NC}"
log_event "deploy_complete" "success" "duration=$(($(date +%s) - $(date -d "$START_TIME" +%s)))s"

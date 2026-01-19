#!/bin/bash
# Mariner's AI Grid - Fleet Deployment Script
# Automates EAS builds for the "First Watch" beta test.

set -e

# Configuration
APP_NAME="Mariner's AI Grid"
IOS_BUNDLE_ID="com.thescottybe.marinersaigrid"

echo "⚓ Preparing to deploy ${APP_NAME}..."

# 1. Environment Check
if [ -z "$EXPO_PUBLIC_MAPBOX_TOKEN" ]; then
  echo "❌ Error: EXPO_PUBLIC_MAPBOX_TOKEN is not set."
  echo "   Please export it in your environment."
  exit 1
fi

echo "✅ Environment variables verified."

# 2. Native Fingerprint Check
echo ""
echo "🔍 Checking Native Fingerprint..."
FINGERPRINT=$(npx expo-fingerprint /Users/scottybe/workspace/mariners-ai-grid)
echo "   Fingerprint: $FINGERPRINT"
echo "   (Remote cache will be used if matching build artifacts exist in EAS)"

# 3. Build Selection
echo ""
echo "Select Build Target:"
echo "1) 🛠️  Simulator (Development Build) - For local testing"
echo "2) ⛵ Foundation Fleet (Preview Build) - For beta testers (Ad Hoc)"
echo "3) 🚀 App Store (Production Build) - For TestFlight/Release"
read -p "Enter choice [1-3]: " choice

case $choice in
  1)
    echo ""
    echo "🏗️  Building for iOS Simulator..."
    eas build --profile development --platform ios
    ;;
  2)
    echo ""
    echo "🏗️  Building for Foundation Fleet (Real Devices)..."
    echo "   Ensure devices are registered via 'eas device:create'"
    eas build --profile preview --platform ios
    ;;
  3)
    echo ""
    echo "🏗️  Building for App Store..."
    eas build --profile production --platform ios
    ;;
  *)
    echo "Invalid choice. Exiting."
    exit 1
    ;;
esac

echo ""
echo "✅ Build command initiated. Check EAS dashboard for progress."

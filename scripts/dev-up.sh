#!/bin/bash
# Start backend and frontend development servers

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🚀 Starting Mariner's AI Grid Development Servers..."

# Start seed server (backend)
echo ""
echo "📦 Starting Seed Server (port 8089)..."
python scripts/seed_server.py &
SEED_PID=$!
echo "   PID: $SEED_PID"

# Give seed server a moment to start
sleep 2

# Start Expo MCP server (frontend)
echo ""
echo "📱 Starting Expo MCP Server..."
EXPO_UNSTABLE_MCP_SERVER=1 npx expo start &
EXPO_PID=$!
echo "   PID: $EXPO_PID"

echo ""
echo "✅ All servers started!"
echo ""
echo "   Seed Server:  http://localhost:8089"
echo "   Expo Server:  Check terminal output above"
echo ""
echo "   To stop: pnpm dev-down"
echo ""

# Save PIDs to file for cleanup
echo "$SEED_PID" > /tmp/mag-seed-server.pid
echo "$EXPO_PID" > /tmp/mag-expo-server.pid

# Wait for both processes
wait

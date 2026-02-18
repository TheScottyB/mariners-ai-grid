#!/bin/bash
# Stop backend and frontend development servers

set -e

echo "🛑 Stopping Mariner's AI Grid Development Servers..."

# Kill seed server by port
echo ""
echo "📦 Stopping Seed Server (port 8089)..."
if lsof -ti:8089 > /dev/null 2>&1; then
    lsof -ti:8089 | xargs kill -9 2>/dev/null || true
    echo "   ✓ Stopped"
else
    echo "   (not running)"
fi

# Kill Expo server by PID file or port
echo ""
echo "📱 Stopping Expo Server..."
if [ -f /tmp/mag-expo-server.pid ]; then
    EXPO_PID=$(cat /tmp/mag-expo-server.pid)
    if ps -p "$EXPO_PID" > /dev/null 2>&1; then
        kill -9 "$EXPO_PID" 2>/dev/null || true
        echo "   ✓ Stopped (PID: $EXPO_PID)"
    else
        echo "   (not running)"
    fi
    rm /tmp/mag-expo-server.pid
else
    # Fallback: kill by port (Expo typically uses 8081)
    if lsof -ti:8081 > /dev/null 2>&1; then
        lsof -ti:8081 | xargs kill -9 2>/dev/null || true
        echo "   ✓ Stopped"
    else
        echo "   (not running)"
    fi
fi

# Clean up Metro bundler cache ports too
for port in 8081 19000 19001 19002; do
    if lsof -ti:$port > /dev/null 2>&1; then
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
    fi
done

# Remove PID files
rm -f /tmp/mag-seed-server.pid /tmp/mag-expo-server.pid

echo ""
echo "✅ All servers stopped!"

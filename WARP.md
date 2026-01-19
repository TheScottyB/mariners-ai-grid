# Development Environment Instructions for AI Agents

## Environment Context
You are operating in a **secure local development environment** on macOS:
- **Claude Desktop** (Code agent with MCP filesystem access)
- **Warp Agent** (Terminal agent with full bash/zsh access)
- **Gemini Conductor** (Running in Warp terminal with file system access)
- **Web Access** (Available for documentation, Stack Overflow, API references, etc.)

All agents have **full local file system, bash command, and web access**. This is a trusted development machine.

## Project Device Requirements

This app requires **edge AI inference** with modern hardware:

### iOS
- **Minimum:** iPhone 11 (A13 Bionic), iOS 16.0+
- **Recommended:** iPhone 12+ (A14+) for optimal AI performance
- **Why iOS 16.0?** Lock screen customization, Live Activities API, and modern privacy controls aligned with 2026 standards
- **Build Target:** arm64 only (no x86_64 Intel Mac support)

### Android
- **Minimum:** Snapdragon 865 / Exynos 990 (2020+) with dedicated NPU, Android 8.0+ (API 26)
- **Architecture:** arm64-v8a only (no 32-bit armeabi-v7a support)

### Why These Requirements?
- **Vector Search:** sqlite-vec needs modern 64-bit architecture
- **AI Models:** GraphCast ONNX inference requires Neural Engine/NPU
- **Offline Performance:** Older devices (A12, A11) can't handle real-time weather model execution

## Critical Rules for Environment Variables

### 🔒 DO NOT modify real API keys in `.env` files
- **NEVER replace existing API keys with placeholders**
- **NEVER add placeholder text like `your_token_here` where real keys exist**
- **NEVER request keys that are already present**
- If you need to reference a key, read it from the environment - DO NOT modify the file

### ✅ Safe Operations
```bash
# Read existing keys (ALLOWED)
source .env
echo "Using Mapbox token: ${EXPO_PUBLIC_MAPBOX_TOKEN:0:10}..."

# Use keys in commands without exposing them (ALLOWED)
export MAPBOX_TOKEN=$(grep EXPO_PUBLIC_MAPBOX_TOKEN .env | cut -d '=' -f2)
```

### ❌ Unsafe Operations
```bash
# NEVER DO THIS - destroys real keys
sed -i 's/pk\.ey.*/pk.YOUR_TOKEN_HERE/' .env

# NEVER DO THIS - loses tracking of what keys exist
echo "EXPO_PUBLIC_MAPBOX_TOKEN=your_token_here" > .env
```

## Project-Specific Security Context

### Local AI Inference Architecture
This project uses **local-only AI inference** via:
- ONNX Runtime (cross-platform)
- CoreML (iOS native)
- sqlite-vec (vector search)

**No cloud AI API keys are needed or used for the core application.**

### Required Keys (Only These Two)
1. `EXPO_PUBLIC_MAPBOX_TOKEN` - Public Mapbox token for map rendering
2. `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` - Secret token for iOS/Android builds

### Optional Keys (Cloud Services Only)
- `MAG_API_KEY` - Only for production seed distribution cloud service
- `MAG_CDS_API_KEY` - Only for ECMWF weather data fetching in cloud functions

### Keys That Should NEVER Be Added
- ❌ `ANTHROPIC_API_KEY` - Not used (local inference only)
- ❌ `OPENAI_API_KEY` - Not used (local inference only)  
- ❌ `GEMINI_API_KEY` - Not used (local inference only)
- ❌ Any other AI service keys

## When Another Agent Breaks .env

If you detect that another agent has replaced real keys with placeholders:

1. **STOP immediately** - Do not proceed with builds/operations
2. **Alert the user**: "The .env file has been corrupted. Real API keys were replaced with placeholders."
3. **Do NOT attempt to fix it yourself** - The user needs to restore from backup or keychain
4. **Check git history**: `git diff HEAD .env` to see what was changed

## Environment Variable Best Practices

### Reading Keys
```typescript
// In code - keys are already in process.env via Expo
const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
```

### Setting Keys (First Time Only)
```bash
# Only if file doesn't exist or key is missing
echo "EXPO_PUBLIC_MAPBOX_TOKEN=pk.actual_token" >> .env
```

### Never Do This
```bash
# ❌ Creates template that destroys real values
cat > .env << 'EOF'
EXPO_PUBLIC_MAPBOX_TOKEN=your_token_here
EOF
```

## Validation Checks Before Operations

Before running builds or deploys, verify:
```bash
# Check that keys exist and are not placeholders
if grep -q "your_token_here\|YOUR_TOKEN_HERE\|placeholder" .env; then
  echo "ERROR: .env contains placeholder values"
  exit 1
fi

# Check that required keys are present
if ! grep -q "^EXPO_PUBLIC_MAPBOX_TOKEN=pk\." .env; then
  echo "ERROR: Missing valid Mapbox public token"
  exit 1
fi
```

## Git Tracking & Open Source

This is a **public open source project**. The `.env` file is **NOT tracked in git**:
- `.env` is in `.gitignore` to prevent committing real API keys
- `.env.example` is tracked and contains placeholder values
- Developers must copy `.env.example` to `.env` and add their own keys

When setting up a new development environment:
```bash
cp .env.example .env
# Then edit .env and add real keys from Mapbox dashboard
```

## Summary for Agents

**You are in a trusted local environment with full access. Real keys exist in `.env` - your job is to USE them, not REPLACE them.**

When in doubt: **Read, don't write** to `.env` files.

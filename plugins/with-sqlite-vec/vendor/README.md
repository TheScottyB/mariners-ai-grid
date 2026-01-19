# sqlite-vec Native Libraries

Download the pre-built static/shared libraries from the sqlite-vec releases page
and place them in the appropriate directories.

## Download URL
https://github.com/asg017/sqlite-vec/releases

## Required Files

### iOS (Universal Binary)
Place in `./ios/`:
- `libsqlite_vec.a` - Static library (fat binary for arm64 + x86_64 simulator)
- `sqlite-vec.h` - Header file

### Android (Per-ABI Shared Libraries)
Place in `./android/<abi>/`:
- `arm64-v8a/libsqlite_vec.so` - ARM64 (most modern phones)
- `armeabi-v7a/libsqlite_vec.so` - ARM32 (older devices)
- `x86/libsqlite_vec.so` - x86 emulator
- `x86_64/libsqlite_vec.so` - x86_64 emulator

## Building from Source (Alternative)

If pre-built binaries aren't available for your target version:

```bash
# Clone sqlite-vec
git clone https://github.com/asg017/sqlite-vec.git
cd sqlite-vec

# iOS (requires Xcode)
make ios

# Android (requires NDK)
make android
```

## Version Compatibility

This project targets sqlite-vec v0.1.6+ which supports:
- `vec_f32(dimension)` - 32-bit float vectors
- `vec_int8(dimension)` - 8-bit quantized vectors
- `vec_distance_L2()` - Euclidean distance
- `vec_distance_cosine()` - Cosine similarity

## Usage in Mariner's AI Grid

The vector extension is used for **Atmospheric Pattern Matching**:
- Weather pattern embeddings (temperature, pressure, wind vectors)
- Historical pattern similarity search
- Anomaly detection for hazard prediction

Geographic queries (lat/lon proximity) use bounding box + Haversine
for efficiency, not vector search.

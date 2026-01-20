/**
 * Mariner's AI Grid - Seed Reader
 * Reads, decompresses, and parses local Weather Seeds (.seed.zst).
 * Handles on-the-fly dequantization for satellite-optimized payloads.
 */

import { File } from 'expo-file-system';
import { decompress } from 'fzstd';
import { WeatherSeed, VariableData } from '../schema/schema/weather_seed';
import { WindDataPoint } from '../utils/geoUtils';

export class SeedReader {
  /**
   * Load and parse a local seed file.
   * @param fileUri Local URI to the .seed.zst file
   */
  static async loadSeed(fileUri: string): Promise<WeatherSeed> {
    try {
      console.log(`[SeedReader] Reading: ${fileUri}`);
      
      // Modern API: Use File object
      // fileUri is likely 'file:///...' from legacy code, convert to path if needed
      // But File constructor takes path or uri.
      const file = new File(fileUri);
      
      if (!file.exists) {
        throw new Error(`Seed file not found: ${fileUri}`);
      }

      // 1. Read directly as bytes (Uint8Array)
      const binaryData = await file.bytes();
      
      // 3. Decompress Zstandard
      console.log(`[SeedReader] Decompressing ${binaryData.length} bytes...`);
      const decompressedData = decompress(binaryData);
      console.log(`[SeedReader] Decompressed size: ${decompressedData.length} bytes`);
      
      // 4. Parse Protobuf
      const seed = WeatherSeed.decode(decompressedData);
      
      console.log(`[SeedReader] Parsed Seed: ${seed.seedId} (${seed.modelSource})`);
      return seed;
      
    } catch (error) {
      console.error('[SeedReader] Failed to load seed:', error);
      throw error;
    }
  }

  /**
   * Extract wind data points for a specific time index.
   */
  static extractWindData(seed: WeatherSeed, timeIndex: number = 0): WindDataPoint[] {
    const windData: WindDataPoint[] = [];
    
    // Find U and V variables
    const uVar = seed.variables.find(v => v.name === 'u10' || v.name === 'u');
    const vVar = seed.variables.find(v => v.name === 'v10' || v.name === 'v');
    
    if (!uVar || !vVar || !uVar.data || !vVar.data) {
      console.warn('[SeedReader] Missing wind variables in seed');
      return [];
    }

    const uValues = this.getVariableValues(uVar.data);
    const vValues = this.getVariableValues(vVar.data);

    const { latitudes, longitudes } = seed;
    const nLats = latitudes.length;
    const nLons = longitudes.length;
    
    const layerSize = nLats * nLons;
    const startIndex = timeIndex * layerSize;
    
    if (startIndex >= uValues.length) {
      console.warn(`[SeedReader] Time index ${timeIndex} out of bounds`);
      return [];
    }

    // Iterate grid
    for (let i = 0; i < nLats; i++) {
      for (let j = 0; j < nLons; j++) {
        const flatIdx = startIndex + (i * nLons) + j;
        
        windData.push({
          lat: latitudes[i],
          lon: longitudes[j],
          u10: uValues[flatIdx],
          v10: vValues[flatIdx],
          timestamp: new Date(seed.timeStepsIso[timeIndex]).getTime()
        });
      }
    }
    
    return windData;
  }

  /**
   * Helper to extract float values from either raw or quantized arrays.
   */
  private static getVariableValues(data: VariableData): Float32Array | number[] {
    // 1. If quantized values exist, dequantize
    if (data.quantizedValues && data.quantizedValues.length > 0) {
      const { quantizedValues, scaleFactor, addOffset } = data;
      const count = quantizedValues.length;
      const result = new Float32Array(count);
      
      for (let i = 0; i < count; i++) {
        // Formula: original = offset + (quantized * scale)
        result[i] = addOffset + (quantizedValues[i] * scaleFactor);
      }
      return result;
    }
    
    // 2. Fallback to raw float values
    return data.values || [];
  }
}
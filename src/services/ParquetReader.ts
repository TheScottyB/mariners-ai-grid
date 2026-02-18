/**
 * Mariner's AI Grid - Parquet Reader
 * Reads and parses .parquet weather seeds using pure JS implementation.
 * Replaces apache-arrow's tableFromIPC which is incompatible with Parquet.
 */

import { File } from 'expo-file-system';
import { parquetRead, parquetMetadata } from 'hyparquet/src/index.js';
import { decompress } from 'fzstd';
import { WindDataPoint } from '../utils/geoUtils';

// Define strict types for the seed structure
export interface SeedTimestep {
  validTime: number;
  windData: WindDataPoint[];
  waveData?: any[]; // TODO: Define WaveDataPoint
}

export class ParquetReader {
  /**
   * Parse a Parquet seed file.
   * @param fileUri Local URI to the .parquet file
   */
  static async read(fileUri: string): Promise<SeedTimestep[]> {
    console.log(`[ParquetReader] Reading: ${fileUri}`);
    
    const file = new File(fileUri);
    if (!file.exists) {
      throw new Error(`Parquet file not found: ${fileUri}`);
    }

    const arrayBuffer = (await file.bytes()).buffer; // Ensure ArrayBuffer

    return new Promise((resolve, reject) => {
      try {
        // 1. Get Schema
        const { schema } = parquetMetadata(arrayBuffer);
        // Schema[0] is root. schema[1..] are columns.
        // Map name -> index
        const colMap = new Map<string, number>();
        // hyparquet schema structure: schema element has .name
        // First element is root, skip it.
        for (let i = 1; i < schema.length; i++) {
            colMap.set(schema[i].name, i - 1);
        }

        // 2. Read Data
        parquetRead({
          file: arrayBuffer,
          compressors: {
            ZSTD: (input: Uint8Array, outputLength: number) => decompress(input)
          },
          onComplete: (rows) => {
            console.log(`[ParquetReader] Parsed ${rows.length} rows`);
            try {
              const timesteps = this.processRows(rows, colMap);
              resolve(timesteps);
            } catch (e) {
              reject(e);
            }
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  private static processRows(rows: any[], colMap: Map<string, number>): SeedTimestep[] {
    const timestepMap = new Map<number, SeedTimestep>();

    // Helper to get value
    const getVal = (row: any[], name: string): any => {
        const idx = colMap.get(name);
        if (idx === undefined) return undefined;
        return row[idx];
    };

    // Check required columns
    if (!colMap.has('lat') || !colMap.has('lon') || !colMap.has('time_epoch')) {
        throw new Error('Parquet missing required columns (lat, lon, time_epoch)');
    }

    for (const row of rows) {
        // time_epoch is int64 (BigInt) usually?
        // hyparquet returns numbers or BigInts depending on type.
        // Slicer writes time_epoch as Int64.
        const timeEpoch = Number(getVal(row, 'time_epoch'));
        const validTime = timeEpoch * 1000; // Seconds -> ms
        
        const lat = getVal(row, 'lat');
        const lon = getVal(row, 'lon');
        
        // Wind
        const u10 = getVal(row, 'u10') ?? getVal(row, 'u');
        const v10 = getVal(row, 'v10') ?? getVal(row, 'v');
        
        // Waves
        const swh = getVal(row, 'swh');
        const mwp = getVal(row, 'mwp');
        const mwd = getVal(row, 'mwd');

        if (!timestepMap.has(validTime)) {
            timestepMap.set(validTime, {
                validTime,
                windData: [],
                waveData: []
            });
        }
        
        const ts = timestepMap.get(validTime)!;
        
        // DEBUG: Log first row of each timestep
        if (ts.windData.length === 0) {
            console.log(`[ParquetReader] First row for time ${new Date(validTime).toISOString()}: u10=${u10}, v10=${v10}, swh=${swh}`);
        }

        // Add Wind Point
        if (u10 !== undefined && v10 !== undefined) {
            ts.windData.push({
                lat, lon, u10, v10, 
                timestamp: validTime
            });
        }
        
        // Add Wave Point (if data exists and is valid - NaN means land point)
        if (swh !== undefined && swh !== null && !Number.isNaN(swh)) {
             // Basic WaveDataPoint structure (inferring)
             ts.waveData?.push({
                 lat, lon, swh,
                 mwp: mwp ?? 0,
                 mwd: mwd ?? 0,
                 timestamp: validTime
             });
        }
    }

    return Array.from(timestepMap.values()).sort((a, b) => a.validTime - b.validTime);
  }
}

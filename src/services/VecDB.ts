/**
 * Mariner's AI Grid - VecDB Service
 *
 * Provides vector similarity search using sqlite-vec extension.
 * Used for Atmospheric Pattern Matching - finding historical weather
 * patterns similar to current conditions.
 *
 * Geographic queries (hazard proximity) use bounding box + Haversine
 * for efficiency. Vector search is reserved for high-dimensional
 * atmospheric embeddings.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Atmospheric state vector - captures weather conditions at a point in time.
 * Normalized to [-1, 1] range for cosine similarity.
 */
export interface AtmosphericVector {
  // Surface conditions (normalized)
  temperature: number;      // -1 (cold) to 1 (hot)
  pressure: number;         // -1 (low/storm) to 1 (high/fair)
  humidity: number;         // 0 to 1

  // Wind components (normalized by max expected speed)
  windU: number;            // East-West component
  windV: number;            // North-South component

  // Derived indicators
  pressureTrend: number;    // -1 (falling fast) to 1 (rising fast)
  cloudCover: number;       // 0 to 1

  // Wave conditions (if available)
  waveHeight?: number;      // Normalized
  wavePeriod?: number;      // Normalized
}

/**
 * A stored atmospheric pattern with metadata
 */
export interface AtmosphericPattern {
  id: string;
  vector: Float32Array;
  timestamp: number;
  lat: number;
  lon: number;
  label?: string;           // Human-readable label (e.g., "Pre-squall pattern")
  outcome?: string;         // What happened after this pattern
  source: 'graphcast' | 'observation' | 'historical';
}

/**
 * Vector dimension for atmospheric embeddings
 * 9 core features + optional extensions
 */
const VECTOR_DIMENSION = 16;

/**
 * VecDB - Vector database service for atmospheric pattern matching
 */
export class VecDB {
  private db: SQLiteDatabase;
  private initialized: boolean = false;

  constructor(db: SQLiteDatabase) {
    this.db = db;
  }

  /**
   * Initialize the vector tables and sqlite-vec extension.
   * Must be called before any other operations.
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      // Check if sqlite-vec is available
      const vecCheck = await this.db.getFirstAsync<{ vec_version: string }>(
        "SELECT vec_version() as vec_version"
      );

      if (!vecCheck) {
        console.warn('[VecDB] sqlite-vec extension not loaded');
        return false;
      }

      console.log(`[VecDB] sqlite-vec version: ${vecCheck.vec_version}`);

      // Create the atmospheric patterns table with vector column
      await this.db.execAsync(`
        -- Main patterns table with metadata
        CREATE TABLE IF NOT EXISTS atmospheric_patterns (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          lat REAL NOT NULL,
          lon REAL NOT NULL,
          label TEXT,
          outcome TEXT,
          source TEXT NOT NULL,
          created_at INTEGER DEFAULT (unixepoch())
        );

        -- Virtual table for vector similarity search
        CREATE VIRTUAL TABLE IF NOT EXISTS atmospheric_vectors USING vec0(
          id TEXT PRIMARY KEY,
          embedding float[${VECTOR_DIMENSION}]
        );

        -- Index for temporal queries
        CREATE INDEX IF NOT EXISTS idx_patterns_timestamp
        ON atmospheric_patterns(timestamp);

        -- Index for geographic filtering
        CREATE INDEX IF NOT EXISTS idx_patterns_location
        ON atmospheric_patterns(lat, lon);
      `);

      this.initialized = true;
      console.log('[VecDB] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[VecDB] Initialization failed:', error);
      return false;
    }
  }

  /**
   * Convert an AtmosphericVector to a normalized Float32Array
   */
  vectorToFloat32(atmo: AtmosphericVector): Float32Array {
    const arr = new Float32Array(VECTOR_DIMENSION);

    // Core features (indices 0-8)
    arr[0] = atmo.temperature;
    arr[1] = atmo.pressure;
    arr[2] = atmo.humidity;
    arr[3] = atmo.windU;
    arr[4] = atmo.windV;
    arr[5] = atmo.pressureTrend;
    arr[6] = atmo.cloudCover;
    arr[7] = atmo.waveHeight ?? 0;
    arr[8] = atmo.wavePeriod ?? 0;

    // Reserved for future features (indices 9-15)
    // Could add: visibility, precipitation, swell direction, etc.

    return arr;
  }

  /**
   * Store an atmospheric pattern with its vector embedding
   */
  async storePattern(
    id: string,
    vector: AtmosphericVector | Float32Array,
    metadata: {
      timestamp: number;
      lat: number;
      lon: number;
      label?: string;
      outcome?: string;
      source: 'graphcast' | 'observation' | 'historical';
    }
  ): Promise<void> {
    if (!this.initialized) {
      throw new Error('[VecDB] Not initialized. Call initialize() first.');
    }

    const embedding = vector instanceof Float32Array
      ? vector
      : this.vectorToFloat32(vector);

    // Insert metadata
    await this.db.runAsync(
      `INSERT OR REPLACE INTO atmospheric_patterns
       (id, timestamp, lat, lon, label, outcome, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        metadata.timestamp,
        metadata.lat,
        metadata.lon,
        metadata.label ?? null,
        metadata.outcome ?? null,
        metadata.source,
      ]
    );

    // Insert vector embedding
    // sqlite-vec expects the vector as a blob
    await this.db.runAsync(
      `INSERT OR REPLACE INTO atmospheric_vectors (id, embedding)
       VALUES (?, vec_f32(?))`,
      [id, this.float32ToBlob(embedding)]
    );
  }

  /**
   * Find patterns similar to the given atmospheric state.
   * Uses cosine similarity for matching.
   *
   * @param query - The atmospheric state to match against
   * @param limit - Maximum number of results
   * @param minSimilarity - Minimum similarity threshold (0-1)
   * @returns Array of matching patterns with similarity scores
   */
  async findSimilar(
    query: AtmosphericVector | Float32Array,
    limit: number = 10,
    minSimilarity: number = 0.7
  ): Promise<Array<AtmosphericPattern & { similarity: number }>> {
    if (!this.initialized) {
      throw new Error('[VecDB] Not initialized. Call initialize() first.');
    }

    const embedding = query instanceof Float32Array
      ? query
      : this.vectorToFloat32(query);

    // Use vec_distance_cosine for similarity search
    // Lower distance = more similar, so we compute 1 - distance
    const results = await this.db.getAllAsync<{
      id: string;
      distance: number;
      timestamp: number;
      lat: number;
      lon: number;
      label: string | null;
      outcome: string | null;
      source: string;
    }>(
      `SELECT
         v.id,
         vec_distance_cosine(v.embedding, vec_f32(?)) as distance,
         p.timestamp,
         p.lat,
         p.lon,
         p.label,
         p.outcome,
         p.source
       FROM atmospheric_vectors v
       JOIN atmospheric_patterns p ON v.id = p.id
       WHERE vec_distance_cosine(v.embedding, vec_f32(?)) < ?
       ORDER BY distance ASC
       LIMIT ?`,
      [
        this.float32ToBlob(embedding),
        this.float32ToBlob(embedding),
        1 - minSimilarity, // Convert similarity to distance threshold
        limit,
      ]
    );

    return results.map((row) => ({
      id: row.id,
      vector: new Float32Array(VECTOR_DIMENSION), // We don't return the full vector
      timestamp: row.timestamp,
      lat: row.lat,
      lon: row.lon,
      label: row.label ?? undefined,
      outcome: row.outcome ?? undefined,
      source: row.source as 'graphcast' | 'observation' | 'historical',
      similarity: 1 - row.distance,
    }));
  }

  /**
   * Find patterns similar to query within a geographic bounding box.
   * Combines spatial filtering with vector similarity.
   */
  async findSimilarNearby(
    query: AtmosphericVector | Float32Array,
    centerLat: number,
    centerLon: number,
    radiusDegrees: number,
    limit: number = 10
  ): Promise<Array<AtmosphericPattern & { similarity: number }>> {
    if (!this.initialized) {
      throw new Error('[VecDB] Not initialized. Call initialize() first.');
    }

    const embedding = query instanceof Float32Array
      ? query
      : this.vectorToFloat32(query);

    const results = await this.db.getAllAsync<{
      id: string;
      distance: number;
      timestamp: number;
      lat: number;
      lon: number;
      label: string | null;
      outcome: string | null;
      source: string;
    }>(
      `SELECT
         v.id,
         vec_distance_cosine(v.embedding, vec_f32(?)) as distance,
         p.timestamp,
         p.lat,
         p.lon,
         p.label,
         p.outcome,
         p.source
       FROM atmospheric_vectors v
       JOIN atmospheric_patterns p ON v.id = p.id
       WHERE p.lat BETWEEN ? AND ?
         AND p.lon BETWEEN ? AND ?
       ORDER BY distance ASC
       LIMIT ?`,
      [
        this.float32ToBlob(embedding),
        centerLat - radiusDegrees,
        centerLat + radiusDegrees,
        centerLon - radiusDegrees,
        centerLon + radiusDegrees,
        limit,
      ]
    );

    return results.map((row) => ({
      id: row.id,
      vector: new Float32Array(VECTOR_DIMENSION),
      timestamp: row.timestamp,
      lat: row.lat,
      lon: row.lon,
      label: row.label ?? undefined,
      outcome: row.outcome ?? undefined,
      source: row.source as 'graphcast' | 'observation' | 'historical',
      similarity: 1 - row.distance,
    }));
  }

  /**
   * Predict likely outcome based on similar historical patterns.
   * Returns the most common outcome among similar patterns.
   */
  async predictOutcome(
    query: AtmosphericVector,
    limit: number = 5
  ): Promise<{ outcome: string; confidence: number; matchCount: number } | null> {
    const similar = await this.findSimilar(query, limit, 0.75);

    if (similar.length === 0) return null;

    // Count outcomes
    const outcomeCounts = new Map<string, number>();
    let totalWithOutcome = 0;

    for (const pattern of similar) {
      if (pattern.outcome) {
        const count = outcomeCounts.get(pattern.outcome) || 0;
        outcomeCounts.set(pattern.outcome, count + 1);
        totalWithOutcome++;
      }
    }

    if (totalWithOutcome === 0) return null;

    // Find most common outcome
    let bestOutcome = '';
    let bestCount = 0;

    for (const [outcome, count] of outcomeCounts) {
      if (count > bestCount) {
        bestOutcome = outcome;
        bestCount = count;
      }
    }

    return {
      outcome: bestOutcome,
      confidence: bestCount / totalWithOutcome,
      matchCount: similar.length,
    };
  }

  /**
   * Import historical patterns from GraphCast forecast data.
   * Used to seed the database with known weather scenarios.
   */
  async importFromForecast(
    forecastGrid: Array<{
      lat: number;
      lon: number;
      timestamp: number;
      t2m: number;        // 2m temperature
      msl: number;        // Mean sea level pressure
      u10: number;        // 10m U wind
      v10: number;        // 10m V wind
    }>,
    source: 'graphcast' | 'historical' = 'graphcast'
  ): Promise<number> {
    let imported = 0;

    for (const point of forecastGrid) {
      const id = `${source}_${point.timestamp}_${point.lat.toFixed(2)}_${point.lon.toFixed(2)}`;

      // Normalize values to [-1, 1] range
      const vector: AtmosphericVector = {
        temperature: this.normalizeTemp(point.t2m),
        pressure: this.normalizePressure(point.msl),
        humidity: 0.5, // Default if not provided
        windU: this.normalizeWind(point.u10),
        windV: this.normalizeWind(point.v10),
        pressureTrend: 0, // Would need time series to compute
        cloudCover: 0.5, // Default if not provided
      };

      await this.storePattern(id, vector, {
        timestamp: point.timestamp,
        lat: point.lat,
        lon: point.lon,
        source,
      });

      imported++;
    }

    return imported;
  }

  /**
   * Get statistics about the pattern database
   */
  async getStats(): Promise<{
    totalPatterns: number;
    bySource: Record<string, number>;
    oldestTimestamp: number;
    newestTimestamp: number;
  }> {
    const total = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM atmospheric_patterns'
    );

    const bySource = await this.db.getAllAsync<{ source: string; count: number }>(
      'SELECT source, COUNT(*) as count FROM atmospheric_patterns GROUP BY source'
    );

    const timeRange = await this.db.getFirstAsync<{ oldest: number; newest: number }>(
      'SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM atmospheric_patterns'
    );

    return {
      totalPatterns: total?.count ?? 0,
      bySource: Object.fromEntries(bySource.map((r) => [r.source, r.count])),
      oldestTimestamp: timeRange?.oldest ?? 0,
      newestTimestamp: timeRange?.newest ?? 0,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Convert Float32Array to Blob for sqlite-vec
   */
  private float32ToBlob(arr: Float32Array): ArrayBuffer {
    return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength);
  }

  /**
   * Normalize temperature (Kelvin) to [-1, 1]
   * Assumes range 223K (-50°C) to 323K (50°C)
   */
  private normalizeTemp(kelvin: number): number {
    const celsius = kelvin - 273.15;
    return Math.max(-1, Math.min(1, celsius / 50));
  }

  /**
   * Normalize pressure (Pa) to [-1, 1]
   * Assumes range 97000 Pa (low) to 103000 Pa (high)
   */
  private normalizePressure(pa: number): number {
    const hPa = pa / 100;
    return Math.max(-1, Math.min(1, (hPa - 1000) / 30));
  }

  /**
   * Normalize wind component (m/s) to [-1, 1]
   * Assumes max wind of 40 m/s (~78 knots)
   */
  private normalizeWind(ms: number): number {
    return Math.max(-1, Math.min(1, ms / 40));
  }
}

export default VecDB;

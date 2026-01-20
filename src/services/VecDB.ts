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

import { open, DB } from '@op-engineering/op-sqlite';

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
  source: 'graphcast' | 'observation' | 'historical' | 'grid_fleet' | 'grid_learned';
}

/**
 * Vector dimension for atmospheric embeddings
 * 9 core features + optional extensions
 */
const VECTOR_DIMENSION = 16;

/**
 * VecDB - Vector database service for atmospheric pattern matching
 * 
 * Performance: Uses Synchronous JSI (op-sqlite) for zero-latency queries.
 */
export class VecDB {
  private db: DB;
  private initialized: boolean = false;

  constructor(dbOrName: DB | string = 'mariners_grid.db') {
    if (typeof dbOrName === 'string') {
      this.db = open({ name: dbOrName });
    } else {
      this.db = dbOrName;
    }
  }

  /**
   * Initialize the vector tables and sqlite-vec extension.
   * Must be called before any other operations.
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      // Load sqlite-vec extension (handled automatically by op-sqlite if configured, 
      // but explicit check confirms availability)
      try {
        const version = await this.db.execute('SELECT vec_version();');
        console.log('[VecDB] sqlite-vec Version:', version.rows[0]);
      } catch (vecError: any) {
        console.warn('[VecDB] sqlite-vec extension not loaded:', vecError.message);
        return false;
      }

      // Create the atmospheric patterns table with vector column
      await this.db.executeBatch([
        // Main patterns table with metadata
        ['CREATE TABLE IF NOT EXISTS atmospheric_patterns (id TEXT PRIMARY KEY, timestamp INTEGER NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, label TEXT, outcome TEXT, source TEXT NOT NULL, created_at INTEGER DEFAULT (unixepoch()))'],
        // Virtual table for vector similarity search
        [`CREATE VIRTUAL TABLE IF NOT EXISTS atmospheric_vectors USING vec0(id TEXT PRIMARY KEY, embedding float[${VECTOR_DIMENSION}])`],
        // Index for temporal queries
        ['CREATE INDEX IF NOT EXISTS idx_patterns_timestamp ON atmospheric_patterns(timestamp)'],
        // Index for geographic filtering
        ['CREATE INDEX IF NOT EXISTS idx_patterns_location ON atmospheric_patterns(lat, lon)']
      ]);

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
      source: 'graphcast' | 'observation' | 'historical' | 'grid_fleet' | 'grid_learned';
    }
  ): Promise<void> {
    if (!this.initialized) {
      throw new Error('[VecDB] Not initialized. Call initialize() first.');
    }

    const embedding = vector instanceof Float32Array
      ? vector
      : this.vectorToFloat32(vector);

    // Synchronous execution via JSI
    await this.db.execute(
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
    // Explicitly delete first to ensure idempotency on virtual table
    await this.db.execute(`DELETE FROM atmospheric_vectors WHERE id = ?`, [id]);
    await this.db.execute(
      `INSERT INTO atmospheric_vectors (id, embedding)
       VALUES (?, vec_f32(?))`,
      [id, embedding]
    );
  }

  /**
   * Find patterns similar to the given atmospheric state.
   * Uses cosine similarity for matching.
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

    const result = await this.db.execute(
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
        embedding,
        embedding,
        1 - minSimilarity,
        limit,
      ]
    );

    const rows = result.rows || [];

    return rows.map((row: any) => ({
      id: row.id,
      vector: new Float32Array(VECTOR_DIMENSION),
      timestamp: row.timestamp,
      lat: row.lat,
      lon: row.lon,
      label: row.label ?? undefined,
      outcome: row.outcome ?? undefined,
      source: row.source as any,
      similarity: 1 - row.distance,
    }));
  }

  /**
   * Find patterns similar to query within a geographic bounding box.
   * Combines spatial filtering with vector similarity (The Hybrid Query).
   */
  async findSimilarNearby(
    query: AtmosphericVector | Float32Array,
    centerLat: number,
    centerLon: number,
    radiusDegrees: number,
    limit: number = 10,
    minSimilarity: number = 0.6
  ): Promise<Array<AtmosphericPattern & { similarity: number; distanceNm: number }>> {
    if (!this.initialized) {
      throw new Error('[VecDB] Not initialized. Call initialize() first.');
    }

    const embedding = query instanceof Float32Array
      ? query
      : this.vectorToFloat32(query);

    const result = await this.db.execute(
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
         AND v.embedding MATCH vec_f32(?)
         AND k = ?
         AND vec_distance_cosine(v.embedding, vec_f32(?)) < ?
       ORDER BY distance ASC`,
      [
        embedding,
        centerLat - radiusDegrees,
        centerLat + radiusDegrees,
        centerLon - radiusDegrees,
        centerLon + radiusDegrees,
        embedding,
        limit,
        embedding,
        1 - minSimilarity,
      ]
    );

    const rows = result.rows || [];

    return rows.map((row: any) => ({
      id: row.id,
      vector: new Float32Array(VECTOR_DIMENSION),
      timestamp: row.timestamp,
      lat: row.lat,
      lon: row.lon,
      label: row.label ?? undefined,
      outcome: row.outcome ?? undefined,
      source: row.source as any,
      similarity: 1 - row.distance,
      distanceNm: this.haversineNm(centerLat, centerLon, row.lat, row.lon),
    }));
  }

  /**
   * Natural language "vibe search" - find historical weather that felt like this.
   */
  async vibeSearch(
    currentConditions: AtmosphericVector,
    options: {
      lat?: number;
      lon?: number;
      radiusNm?: number;
      timeRangeMs?: number;
      sourceFilter?: string[];
      outcomeFilter?: string;
      limit?: number;
    } = {}
  ): Promise<Array<AtmosphericPattern & {
    similarity: number;
    distanceNm?: number;
    ageHours: number;
  }>> {
    if (!this.initialized) {
      throw new Error('[VecDB] Not initialized. Call initialize() first.');
    }

    const {
      lat,
      lon,
      radiusNm = 500,
      timeRangeMs,
      sourceFilter,
      outcomeFilter,
      limit = 10,
    } = options;

    const embedding = this.vectorToFloat32(currentConditions);
    const radiusDegrees = radiusNm / 60;

    const conditions: string[] = [];
    const params: any[] = [embedding];

    if (lat !== undefined && lon !== undefined) {
      conditions.push('p.lat BETWEEN ? AND ?');
      conditions.push('p.lon BETWEEN ? AND ?');
      params.push(lat - radiusDegrees, lat + radiusDegrees);
      params.push(lon - radiusDegrees, lon + radiusDegrees);
    }

    if (timeRangeMs) {
      conditions.push('p.timestamp > ?');
      params.push(Date.now() - timeRangeMs);
    }

    if (sourceFilter && sourceFilter.length > 0) {
      conditions.push(`p.source IN (${sourceFilter.map(() => '?').join(', ')})`);
      params.push(...sourceFilter);
    }

    if (outcomeFilter) {
      conditions.push('p.outcome LIKE ?');
      params.push(`%${outcomeFilter}%`);
    }

    const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
    params.push(limit, embedding, 0.4); // minSimilarity threshold for vibe search

    const query = `
      SELECT
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
      WHERE v.embedding MATCH vec_f32(?)
        AND k = ?
        ${whereClause}
        AND vec_distance_cosine(v.embedding, vec_f32(?)) < ?
      ORDER BY distance ASC
    `;

    // Note: op-sqlite handles the param ordering in execute
    const result = await this.db.execute(query, params);
    const rows = result.rows || [];
    const now = Date.now();

    return rows.map((row: any) => ({
      id: row.id,
      vector: new Float32Array(VECTOR_DIMENSION),
      timestamp: row.timestamp,
      lat: row.lat,
      lon: row.lon,
      label: row.label ?? undefined,
      outcome: row.outcome ?? undefined,
      source: row.source as any,
      similarity: 1 - row.distance,
      distanceNm: lat !== undefined && lon !== undefined
        ? this.haversineNm(lat, lon, row.lat, row.lon)
        : undefined,
      ageHours: (now - row.timestamp) / (1000 * 60 * 60),
    }));
  }

  /**
   * Predict likely outcome based on similar historical patterns.
   */
  async predictOutcome(
    query: AtmosphericVector,
    limit: number = 5
  ): Promise<{ outcome: string; confidence: number; matchCount: number } | null> {
    const similar = await this.findSimilar(query, limit, 0.75);
    if (similar.length === 0) return null;

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
   */
  async importFromForecast(
    forecastGrid: Array<{
      lat: number;
      lon: number;
      timestamp: number;
      t2m: number;
      msl: number;
      u10: number;
      v10: number;
    }>,
    source: 'graphcast' | 'historical' = 'graphcast'
  ): Promise<number> {
    let imported = 0;
    for (const point of forecastGrid) {
      const id = `${source}_${point.timestamp}_${point.lat.toFixed(2)}_${point.lon.toFixed(2)}`;
      const vector: AtmosphericVector = {
        temperature: this.normalizeTemp(point.t2m),
        pressure: this.normalizePressure(point.msl),
        humidity: 0.5,
        windU: this.normalizeWind(point.u10),
        windV: this.normalizeWind(point.v10),
        pressureTrend: 0,
        cloudCover: 0.5,
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
    const total = await this.db.execute('SELECT COUNT(*) as count FROM atmospheric_patterns');
    const bySource = await this.db.execute('SELECT source, COUNT(*) as count FROM atmospheric_patterns GROUP BY source');
    const timeRange = await this.db.execute('SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM atmospheric_patterns');

    const totalCount = (total.rows?.[0]?.count as number) ?? 0;
    const sourceRows = bySource.rows || [];
    const rangeRow = timeRange.rows?.[0] as any;

    return {
      totalPatterns: totalCount,
      bySource: Object.fromEntries(sourceRows.map((r: any) => [r.source, r.count as number])),
      oldestTimestamp: (rangeRow?.oldest as number) ?? 0,
      newestTimestamp: (rangeRow?.newest as number) ?? 0,
    };
  }

  // Private helpers
  private normalizeTemp(kelvin: number): number {
    const celsius = kelvin - 273.15;
    return Math.max(-1, Math.min(1, celsius / 50));
  }

  private normalizePressure(pa: number): number {
    const hPa = pa / 100;
    return Math.max(-1, Math.min(1, (hPa - 1000) / 30));
  }

  private normalizeWind(ms: number): number {
    return Math.max(-1, Math.min(1, ms / 40));
  }

  private haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3440.065;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}

export default VecDB;

/**
 * Mariner's AI Grid - Hazard Service
 * Manages the "Waze" social hazard layer with:
 * - Drift prediction based on surface currents
 * - Truth-verification via sensor validation
 * - Decay rate for time-sensitive hazards
 */

import { DB } from '@op-engineering/op-sqlite';
import { Barometer, Accelerometer } from 'expo-sensors';
import { calculateWindSpeed, distanceNM } from '../utils/geoUtils';

export type HazardType =
  | 'debris'
  | 'surge'
  | 'squall'
  | 'fuel_ice'
  | 'whale'
  | 'fishing_gear'
  | 'shallow'
  | 'anchorage'
  | 'other';

export interface HazardReport {
  id?: string;
  type: HazardType;
  description?: string;
  lat: number;
  lon: number;
  reportedAt: number;
  reporterId: string; // Shadow Auth device ID

  // Sensor snapshot for truth verification
  pressureSnapshot?: number;
  motionIntensity?: number;

  // Verification status
  verified: boolean;
  confidence: number; // 0-1
  verificationCount: number;

  // Drift tracking
  originalLat: number;
  originalLon: number;
  lastDriftUpdate?: number;

  // Decay
  decayRate: number; // hours until 50% confidence
  expiresAt: number;
}

export interface SensorSnapshot {
  pressure: number | null;
  motionIntensity: number;
  timestamp: number;
}

/**
 * Decay rates for different hazard types (hours until 50% confidence)
 */
const HAZARD_DECAY_RATES: Record<HazardType, number> = {
  debris: 24,        // Floating debris can persist
  surge: 6,          // Surge conditions change quickly
  squall: 2,         // Weather cells move fast
  fuel_ice: 48,      // Fuel stations / ice are semi-permanent
  whale: 4,          // Marine mammals transit through
  fishing_gear: 72,  // Nets/traps persist
  shallow: 8760,     // Bathymetry doesn't change (1 year)
  anchorage: 168,    // Anchorage conditions weekly
  other: 12,         // Default moderate decay
};

/**
 * Expected pressure ranges for weather-related reports
 */
const WEATHER_PRESSURE_THRESHOLDS = {
  squall: { max: 1005 }, // Low pressure indicates squall validity
  surge: { min: 995, max: 1025 }, // Any pressure valid for surge
};

export class HazardService {
  private db: DB;
  private deviceId: string;

  constructor(db: DB, deviceId: string) {
    this.db = db;
    this.deviceId = deviceId;
  }

  /**
   * Initialize the hazards table schema.
   */
  async initSchema(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS marine_hazards (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        description TEXT,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        location_vec FLOAT[2],
        drift_u REAL DEFAULT 0,
        drift_v REAL DEFAULT 0,
        reported_at INTEGER NOT NULL,
        reporter_id TEXT NOT NULL,
        pressure_snapshot REAL,
        motion_intensity REAL,
        verified INTEGER DEFAULT 0,
        confidence REAL DEFAULT 0.5,
        verification_count INTEGER DEFAULT 0,
        original_lat REAL NOT NULL,
        original_lon REAL NOT NULL,
        last_drift_update INTEGER,
        decay_rate REAL NOT NULL,
        expires_at INTEGER NOT NULL,
        predicted_path_json TEXT
      );`);

    await this.db.execute('CREATE INDEX IF NOT EXISTS idx_hazards_location ON marine_hazards(lat, lon)');
    await this.db.execute('CREATE INDEX IF NOT EXISTS idx_hazards_expires ON marine_hazards(expires_at)');
    await this.db.execute('CREATE INDEX IF NOT EXISTS idx_hazards_type ON marine_hazards(type)');
    
    // Virtual table for high-performance vector spatial search (if not already handled by marine_hazards)
    // Using sqlite-vec v0.2.x features
    await this.db.execute(`
      CREATE VIRTUAL TABLE IF NOT EXISTS marine_hazards_vec USING vec0(
        id TEXT PRIMARY KEY,
        location float[2]
      );
    `);
  }

  /**
   * Capture current sensor data for truth verification.
   */
  async captureSensorSnapshot(): Promise<SensorSnapshot> {
    const timestamp = Date.now();
    let pressure: number | null = null;
    let motionIntensity = 0;

    try {
      // Try to get barometer reading
      const isBarometerAvailable = await Barometer.isAvailableAsync();
      if (isBarometerAvailable) {
        const baroData = await new Promise<{ pressure: number }>((resolve) => {
          const sub = Barometer.addListener((data) => {
            sub.remove();
            resolve(data);
          });
          // Timeout after 1 second
          setTimeout(() => {
            sub.remove();
            resolve({ pressure: 0 });
          }, 1000);
        });
        pressure = baroData.pressure;
      }
    } catch (e) {
      console.log('Barometer unavailable:', e);
    }

    try {
      // Get motion intensity from accelerometer
      const isAccelAvailable = await Accelerometer.isAvailableAsync();
      if (isAccelAvailable) {
        const accelData = await new Promise<{ x: number; y: number; z: number }>((resolve) => {
          const sub = Accelerometer.addListener((data) => {
            sub.remove();
            resolve(data);
          });
          setTimeout(() => {
            sub.remove();
            resolve({ x: 0, y: 0, z: 0 });
          }, 500);
        });
        // Calculate motion intensity as deviation from 1G
        const magnitude = Math.sqrt(
          accelData.x ** 2 + accelData.y ** 2 + accelData.z ** 2
        );
        motionIntensity = Math.abs(magnitude - 1);
      }
    } catch (e) {
      console.log('Accelerometer unavailable:', e);
    }

    return { pressure, motionIntensity, timestamp };
  }

  /**
   * Submit a new hazard report.
   */
  async reportHazard(
    type: HazardType,
    lat: number,
    lon: number,
    description?: string
  ): Promise<HazardReport> {
    const sensors = await this.captureSensorSnapshot();
    const now = Date.now();
    const decayRate = HAZARD_DECAY_RATES[type];

    // Initial confidence based on sensor validation
    let confidence = 0.5;
    if (this.validateSensorData(type, sensors)) {
      confidence = 0.7;
    }

    const report: HazardReport = {
      id: `hazard_${now}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      description,
      lat,
      lon,
      reportedAt: now,
      reporterId: this.deviceId,
      pressureSnapshot: sensors.pressure ?? undefined,
      motionIntensity: sensors.motionIntensity,
      verified: false,
      confidence,
      verificationCount: 0,
      originalLat: lat,
      originalLon: lon,
      decayRate,
      expiresAt: now + decayRate * 60 * 60 * 1000 * 2, // Double decay rate for expiry
    };

    const locationVec = new Float32Array([lat, lon]);

    await this.db.execute(
      `INSERT OR REPLACE INTO marine_hazards (
        id, type, description, lat, lon, location_vec, reported_at, reporter_id,
        pressure_snapshot, motion_intensity, verified, confidence,
        verification_count, original_lat, original_lon, decay_rate, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        report.id ?? "",
        report.type,
        report.description ?? null,
        report.lat,
        report.lon,
        locationVec,
        report.reportedAt,
        report.reporterId,
        report.pressureSnapshot ?? null,
        report.motionIntensity ?? null,
        report.verified ? 1 : 0,
        report.confidence,
        report.verificationCount,
        report.originalLat,
        report.originalLon,
        report.decayRate,
        report.expiresAt,
      ]
    );

    // Also update virtual table for vector search
    await this.db.execute(`DELETE FROM marine_hazards_vec WHERE id = ?`, [report.id as string]);
    await this.db.execute(
      `INSERT INTO marine_hazards_vec (id, location) VALUES (?, vec_f32(?))`,
      [report.id as string, locationVec]
    );

    console.log(`⚓ Mariner's Code: ${type} report logged (confidence: ${confidence.toFixed(2)})`);
    return report;
  }

  /**
   * Validate sensor data against expected ranges for hazard type.
   */
  private validateSensorData(type: HazardType, sensors: SensorSnapshot): boolean {
    if (type === 'squall' && sensors.pressure !== null) {
      // Squall should correlate with low pressure
      return sensors.pressure <= (WEATHER_PRESSURE_THRESHOLDS.squall.max);
    }

    if (type === 'surge') {
      // High motion intensity validates surge report
      return sensors.motionIntensity > 0.3;
    }

    // For other types, just having sensor data increases trust
    return sensors.pressure !== null || sensors.motionIntensity > 0;
  }

  /**
   * Verify an existing hazard (called when another boat confirms it).
   */
  async verifyHazard(hazardId: string): Promise<void> {
    await this.db.execute(
      `UPDATE marine_hazards
       SET verification_count = verification_count + 1,
           confidence = MIN(1.0, confidence + 0.15),
           verified = CASE WHEN verification_count >= 1 THEN 1 ELSE verified END
       WHERE id = ?`,
      [hazardId]
    );
  }

  /**
   * Apply drift to floating hazards based on current data.
   * Called periodically with surface current vectors.
   */
  async applyDrift(
    surfaceCurrentU: number, // m/s eastward
    surfaceCurrentV: number, // m/s northward
    hoursElapsed: number
  ): Promise<number> {
    const driftingTypes: HazardType[] = ['debris', 'whale', 'fishing_gear'];
    const now = Date.now();

    const result = await this.db.execute(
      `SELECT id, lat, lon FROM marine_hazards
       WHERE type IN (${driftingTypes.map(() => '?').join(',')})
       AND expires_at > ?`,
      [...driftingTypes, now]
    );

    const hazards = result.rows || [];
    let updatedCount = 0;

    for (const hazard of hazards) {
      const lat = hazard.lat as number;
      const lon = hazard.lon as number;
      const metersPerDegLat = 111000;
      const metersPerDegLon = 111000 * Math.cos((lat * Math.PI) / 180);

      const driftMetersE = surfaceCurrentU * hoursElapsed * 3600;
      const driftMetersN = surfaceCurrentV * hoursElapsed * 3600;

      const newLon = lon + driftMetersE / metersPerDegLon;
      const newLat = lat + driftMetersN / metersPerDegLat;

      await this.db.execute(
        `UPDATE marine_hazards SET lat = ?, lon = ?, last_drift_update = ? WHERE id = ?`,
        [newLat, newLon, now, hazard.id]
      );
      updatedCount++;
    }

    return updatedCount;
  }

  async getHazardsNear(
    lat: number,
    lon: number,
    radiusNm: number
  ): Promise<HazardReport[]> {
    const now = Date.now();
    const queryVec = new Float32Array([lat, lon]);
    
    /**
     * THE "SURROUNDING" QUERY
     * Uses sqlite-vec v0.2.x features:
     * 1. MATCH query on virtual table
     * 2. distance < radiusNm constraint (range query)
     * 3. Join with metadata table
     */
    const result = await this.db.execute(
      `SELECT h.*, v.distance
       FROM marine_hazards_vec v
       JOIN marine_hazards h ON v.id = h.id
       WHERE v.location MATCH vec_f32(?)
         AND k = 100
         AND v.distance < ?
         AND h.expires_at > ?
       ORDER BY h.reported_at DESC`,
      [queryVec, radiusNm, now]
    );

    const rows = result.rows || [];

    return rows
      .map((row: any) => {
        const ageHours = (now - row.reported_at) / (1000 * 60 * 60);
        const decayFactor = Math.pow(0.5, ageHours / row.decay_rate);
        const decayedConfidence = row.confidence * decayFactor;

        return {
          id: row.id,
          type: row.type as HazardType,
          description: row.description,
          lat: row.lat,
          lon: row.lon,
          reportedAt: row.reported_at,
          reporterId: row.reporter_id,
          pressureSnapshot: row.pressure_snapshot,
          motionIntensity: row.motion_intensity,
          verified: row.verified === 1,
          confidence: decayedConfidence,
          verificationCount: row.verification_count,
          originalLat: row.original_lat,
          originalLon: row.original_lon,
          lastDriftUpdate: row.last_drift_update,
          decayRate: row.decay_rate,
          expiresAt: row.expires_at,
        } as HazardReport;
      })
      .filter((h) => h.confidence > 0.1);
  }

  /**
   * Clean up expired hazards.
   */
  async cleanupExpired(): Promise<number> {
    const result = await this.db.execute(
      `DELETE FROM marine_hazards WHERE expires_at < ?`,
      [Date.now()]
    );
    return result.rowsAffected ?? 0;
  }
}

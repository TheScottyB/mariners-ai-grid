/**
 * Mariner's AI Grid - VesselSnapshot
 *
 * Captures the "Truth Layer" moment when local observations diverge
 * from AI predictions. This is the core of the self-correcting feedback
 * loop that makes the Mariner's Grid smarter over time.
 *
 * When SignalKBridge detects DIVERGENT consensus:
 * 1. Freeze the current telemetry state
 * 2. Package observed vs predicted data
 * 3. Include the 16-dim atmospheric vector for pattern learning
 * 4. Queue for anonymous CC0 upload to the grid
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { DB } from '@op-engineering/op-sqlite';
import { TelemetrySnapshot } from './PatternMatcher';
import { AtmosphericVector } from './VecDB';
import { ConsensusData } from '../components/PatternAlert';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ObservedConditions {
  pressure_hpa: number;
  wind_speed_kts: number;
  wind_direction_deg: number;
  temperature_c?: number;
  humidity_pct?: number;
  wave_height_m?: number;
  wave_period_s?: number;
}

export interface PredictedConditions {
  model_source: string;      // e.g., "ECMWF-AIFS-9km", "GraphCast-0.25deg"
  model_run_time: string;    // ISO timestamp of model run
  forecast_valid_time: string;
  predicted_wind_kts: number;
  predicted_pressure_hpa: number;
  predicted_wave_height_m?: number;
  confidence: number;        // 0-1
}

export interface DivergenceSnapshot {
  // Unique identifier (hash-based, not traceable to vessel)
  snapshot_id: string;

  // When the divergence was detected
  captured_at: string;

  // Anonymized location (rounded to 0.1 degree for privacy)
  location: {
    lat: number;  // Rounded
    lon: number;  // Rounded
    region?: string; // e.g., "North Pacific", "Gulf Stream"
  };

  // The "Ground Truth" from NMEA 2000 / Signal K
  observed: ObservedConditions;

  // The AI prediction that failed
  predicted: PredictedConditions;

  // Magnitude of the divergence
  divergence_metrics: {
    wind_error_kts: number;
    pressure_error_hpa: number;
    wave_error_m?: number;
    severity: 'minor' | 'moderate' | 'severe' | 'critical';
  };

  // The atmospheric vector embedding for pattern learning
  embedding: number[];  // 16-dimensional normalized vector

  // Matched dangerous pattern (if any)
  matched_pattern?: {
    pattern_id: string;
    label: string;
    similarity: number;
  };

  // Metadata for grid learning
  metadata: {
    consensus_level: 'divergent';
    data_quality: 'high' | 'medium' | 'low';
    sensor_sources: string[];  // e.g., ["barometer", "anemometer", "gps"]
    app_version: string;
  };
}

export interface SnapshotQueueItem {
  id: string;
  snapshot: DivergenceSnapshot;
  created_at: number;
  upload_attempts: number;
  last_attempt?: number;
  status: 'pending' | 'uploading' | 'uploaded' | 'failed';
}

// ─────────────────────────────────────────────────────────────────────────────
// VesselSnapshot Class
// ─────────────────────────────────────────────────────────────────────────────

export class VesselSnapshot {
  private db: DB;
  private snapshotDir: string;
  private appVersion: string = '0.1.0';

  constructor(db: DB) {
    this.db = db;
    this.snapshotDir = `${FileSystem.documentDirectory ?? ''}snapshots/`;
  }

  /**
   * Initialize the snapshot storage.
   */
  async initialize(): Promise<void> {
    // Create snapshots directory
    const dirInfo = await FileSystem.getInfoAsync(this.snapshotDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.snapshotDir, { intermediates: true });
    }

    // Create queue table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS snapshot_queue (
        id TEXT PRIMARY KEY,
        snapshot_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        upload_attempts INTEGER DEFAULT 0,
        last_attempt INTEGER,
        status TEXT DEFAULT 'pending'
      );`);

    await this.db.execute('CREATE INDEX IF NOT EXISTS idx_snapshot_status ON snapshot_queue(status)');

    console.log('[VesselSnapshot] Initialized');
  }

  /**
   * Capture a divergence event.
   */
  async captureDivergence(
    telemetry: TelemetrySnapshot,
    vector: AtmosphericVector,
    consensus: ConsensusData,
    prediction?: { windSpeed: number; pressure: number; validTime: Date; model: string }
  ): Promise<DivergenceSnapshot> {
    const snapshotId = await this.generateAnonymousId(telemetry);
    const roundedLat = Math.round(telemetry.position.lat * 10) / 10;
    const roundedLon = Math.round(telemetry.position.lon * 10) / 10;

    const observed: ObservedConditions = {
      pressure_hpa: telemetry.barometer ?? 1013,
      wind_speed_kts: telemetry.trueWindSpeed ?? 0,
      wind_direction_deg: telemetry.trueWindAngle ?? 0,
      temperature_c: telemetry.temperature,
      humidity_pct: telemetry.humidity,
      wave_height_m: telemetry.waveHeight,
      wave_period_s: telemetry.wavePeriod,
    };

    const predicted: PredictedConditions = {
      model_source: prediction?.model ?? 'ECMWF-AIFS-9km',
      model_run_time: new Date().toISOString(),
      forecast_valid_time: prediction?.validTime?.toISOString() ?? new Date().toISOString(),
      predicted_wind_kts: prediction?.windSpeed ?? 10,
      predicted_pressure_hpa: prediction?.pressure ?? 1013,
      confidence: consensus.graphCastPrediction?.confidence ?? 0.8,
    };

    const windError = Math.abs(observed.wind_speed_kts - predicted.predicted_wind_kts);
    const pressureError = Math.abs(observed.pressure_hpa - predicted.predicted_pressure_hpa);
    const severity = this.calculateSeverity(windError, pressureError);
    const embedding = this.vectorToArray(vector);

    const sensorSources: string[] = [];
    if (telemetry.barometer !== undefined) sensorSources.push('barometer');
    if (telemetry.trueWindSpeed !== undefined) sensorSources.push('anemometer');
    if (telemetry.position) sensorSources.push('gps');
    if (telemetry.waveHeight !== undefined) sensorSources.push('wave_sensor');

    const dataQuality = sensorSources.length >= 3 ? 'high' : sensorSources.length >= 2 ? 'medium' : 'low';

    const snapshot: DivergenceSnapshot = {
      snapshot_id: snapshotId,
      captured_at: new Date().toISOString(),
      location: { lat: roundedLat, lon: roundedLon, region: this.determineRegion(roundedLat, roundedLon) },
      observed,
      predicted,
      divergence_metrics: { wind_error_kts: windError, pressure_error_hpa: pressureError, severity },
      embedding,
      matched_pattern: consensus.localMatch ? {
        pattern_id: consensus.localMatch.patternId,
        label: consensus.localMatch.label,
        similarity: consensus.localMatch.similarity,
      } : undefined,
      metadata: {
        consensus_level: 'divergent',
        data_quality: dataQuality,
        sensor_sources: sensorSources,
        app_version: this.appVersion,
      },
    };

    await this.queueSnapshot(snapshot);
    await this.saveForLocalLearning(snapshot);

    console.log(`[VesselSnapshot] Captured divergence: ${snapshotId} (${severity})`);
    return snapshot;
  }

  private async generateAnonymousId(telemetry: TelemetrySnapshot): Promise<string> {
    const salt = await Crypto.getRandomBytesAsync(16);
    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
    const input = [Math.floor(Date.now() / 60000), Math.round(telemetry.position.lat * 10), Math.round(telemetry.position.lon * 10), saltHex].join(':');
    const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
    return `snap_${hash.slice(0, 16)}`;
  }

  private calculateSeverity(windError: number, pressureError: number): 'minor' | 'moderate' | 'severe' | 'critical' {
    if (windError >= 25 || pressureError >= 15) return 'critical';
    if (windError >= 15 || pressureError >= 10) return 'severe';
    if (windError >= 8 || pressureError >= 5) return 'moderate';
    return 'minor';
  }

  private determineRegion(lat: number, lon: number): string {
    if (lat >= 20 && lat <= 50 && lon >= -180 && lon <= -100) return 'North Pacific';
    if (lat >= 20 && lat <= 50 && lon >= -80 && lon <= -10) return 'North Atlantic';
    if (lat >= -10 && lat <= 30 && lon >= -100 && lon <= -70) return 'Caribbean';
    if (lat >= 30 && lat <= 45 && lon >= -85 && lon <= -70) return 'Gulf Stream';
    if (lat >= -60 && lat <= -30) return 'Southern Ocean';
    if (lat >= 0 && lat <= 20 && lon >= -180 && lon <= -80) return 'Tropical Pacific';
    return 'Open Ocean';
  }

  private vectorToArray(vector: AtmosphericVector): number[] {
    return [
      vector.temperature ?? 0, vector.pressure ?? 0, vector.humidity ?? 0,
      vector.windU ?? 0, vector.windV ?? 0, vector.pressureTrend ?? 0,
      vector.cloudCover ?? 0, vector.waveHeight ?? 0, vector.wavePeriod ?? 0,
      0, 0, 0, 0, 0, 0, 0,
    ];
  }

  private async queueSnapshot(snapshot: DivergenceSnapshot): Promise<void> {
    await this.db.execute(
      `INSERT OR REPLACE INTO snapshot_queue (id, snapshot_json, created_at, upload_attempts, status)
       VALUES (?, ?, ?, ?, ?)`,
      [snapshot.snapshot_id, JSON.stringify(snapshot), Date.now(), 0, 'pending']
    );
  }

  private async saveForLocalLearning(snapshot: DivergenceSnapshot): Promise<void> {
    const filename = `${this.snapshotDir}${snapshot.snapshot_id}.json`;
    await FileSystem.writeAsStringAsync(filename, JSON.stringify(snapshot, null, 2));
  }

  async getPendingSnapshots(limit: number = 10): Promise<SnapshotQueueItem[]> {
    const result = await this.db.execute(
      `SELECT * FROM snapshot_queue
       WHERE status = 'pending' AND upload_attempts < 5
       ORDER BY created_at ASC
       LIMIT ?`,
      [limit]
    );
    const rows = result.rows || [];
    return rows.map((row: any) => ({
      id: row.id,
      snapshot: JSON.parse(row.snapshot_json),
      created_at: row.created_at,
      upload_attempts: row.upload_attempts,
      last_attempt: row.last_attempt ?? undefined,
      status: row.status as any,
    }));
  }

  async markUploaded(snapshotId: string): Promise<void> {
    await this.db.execute(`UPDATE snapshot_queue SET status = 'uploaded' WHERE id = ?`, [snapshotId]);
  }

  async recordUploadFailure(snapshotId: string): Promise<void> {
    await this.db.execute(
      `UPDATE snapshot_queue
       SET upload_attempts = upload_attempts + 1, last_attempt = ?, status = CASE WHEN upload_attempts >= 4 THEN 'failed' ELSE 'pending' END
       WHERE id = ?`,
      [Date.now(), snapshotId]
    );
  }

  async getLocalSnapshots(limit: number = 100): Promise<DivergenceSnapshot[]> {
    const files = await FileSystem.readDirectoryAsync(this.snapshotDir);
    const snapshots: DivergenceSnapshot[] = [];
    for (const file of files.slice(0, limit)) {
      if (file.endsWith('.json')) {
        const content = await FileSystem.readAsStringAsync(`${this.snapshotDir}${file}`);
        snapshots.push(JSON.parse(content));
      }
    }
    return snapshots;
  }

  async getStats(): Promise<{
    total_captured: number;
    pending_upload: number;
    uploaded: number;
    failed: number;
    by_severity: Record<string, number>;
  }> {
    const result = await this.db.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'uploaded' THEN 1 ELSE 0 END) as uploaded,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM snapshot_queue
    `);
    const counts = result.rows?.[0] as any;
    const snapshots = await this.getLocalSnapshots(1000);
    const bySeverity: Record<string, number> = { minor: 0, moderate: 0, severe: 0, critical: 0 };
    for (const snap of snapshots) { bySeverity[snap.divergence_metrics.severity]++; }
    return {
      total_captured: (counts?.total as number) ?? 0,
      pending_upload: (counts?.pending as number) ?? 0,
      uploaded: (counts?.uploaded as number) ?? 0,
      failed: (counts?.failed as number) ?? 0,
      by_severity: bySeverity,
    };
  }
}

export default VesselSnapshot;

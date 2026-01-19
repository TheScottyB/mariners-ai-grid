/**
 * Mariner's AI Grid - GridSync Service
 *
 * The "Social Waze" layer that connects all vessels in the fleet.
 * Handles bidirectional sync of divergence snapshots, hazard reports,
 * and pattern updates across the Mariner's AI Grid.
 *
 * Core responsibilities:
 * 1. Upload local divergence snapshots when connectivity available
 * 2. Download relevant snapshots from vessels in your region
 * 3. Sync hazard reports (Waze-style crowd-sourced alerts)
 * 4. Update local VecDB with new patterns learned from the fleet
 *
 * All data is CC0 (public domain) and anonymous by design.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Network from 'expo-network';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import type { SQLiteDatabase } from 'expo-sqlite';
import { VesselSnapshot, DivergenceSnapshot, SnapshotQueueItem } from './VesselSnapshot';
import { VecDB, AtmosphericVector } from './VecDB';
import { MarineHazard } from '../utils/geoUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BACKGROUND_SYNC_TASK = 'MARINERS_GRID_SYNC';

// Grid API endpoints (would be actual URLs in production)
const GRID_API_BASE = 'https://api.mariners-grid.cc0.pub/v1';
const ENDPOINTS = {
  snapshots: `${GRID_API_BASE}/snapshots`,
  hazards: `${GRID_API_BASE}/hazards`,
  patterns: `${GRID_API_BASE}/patterns`,
  health: `${GRID_API_BASE}/health`,
};

// Sync configuration
const SYNC_CONFIG = {
  // How often to attempt background sync (minimum 15 minutes on iOS)
  backgroundIntervalMinutes: 15,

  // Radius to fetch nearby snapshots (nautical miles)
  nearbyRadiusNm: 500,

  // Maximum snapshots to upload per sync
  uploadBatchSize: 10,

  // Maximum snapshots to download per sync
  downloadBatchSize: 50,

  // Retry configuration
  maxRetries: 3,
  retryDelayMs: 5000,

  // Connection types allowed for sync
  allowedConnectionTypes: ['wifi', 'cellular', 'ethernet'] as const,

  // Minimum battery level for background sync
  minBatteryLevel: 0.2,
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  hazardsReceived: number;
  patternsUpdated: number;
  errors: string[];
  durationMs: number;
  connectionType: string;
}

export interface GridHazard extends MarineHazard {
  grid_id: string;
  reporter_region: string;
  verification_count: number;
  first_reported: string;
  last_verified: string;
  expires_at: string;
}

export interface GridPattern {
  pattern_id: string;
  label: string;
  vector: number[];
  outcome: string;
  region: string;
  observation_count: number;
  last_observed: string;
  confidence: number;
}

export interface SyncStatus {
  lastSyncTime: number | null;
  lastSyncResult: SyncResult | null;
  isConnected: boolean;
  connectionType: string | null;
  pendingUploads: number;
  backgroundTaskRegistered: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// GridSync Class
// ─────────────────────────────────────────────────────────────────────────────

export class GridSync {
  private db: SQLiteDatabase;
  private vesselSnapshot: VesselSnapshot;
  private vecDb: VecDB;
  private currentPosition: { lat: number; lon: number } | null = null;
  private lastSyncResult: SyncResult | null = null;
  private lastSyncTime: number | null = null;
  private isSyncing: boolean = false;

  // Callbacks
  private onHazardReceived?: (hazard: GridHazard) => void;
  private onPatternLearned?: (pattern: GridPattern) => void;
  private onSyncComplete?: (result: SyncResult) => void;

  constructor(db: SQLiteDatabase, vesselSnapshot: VesselSnapshot, vecDb: VecDB) {
    this.db = db;
    this.vesselSnapshot = vesselSnapshot;
    this.vecDb = vecDb;
  }

  /**
   * Initialize the GridSync service.
   */
  async initialize(): Promise<void> {
    // Create sync metadata table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS grid_sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS grid_hazards (
        grid_id TEXT PRIMARY KEY,
        hazard_json TEXT NOT NULL,
        received_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        verified_locally INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS grid_patterns (
        pattern_id TEXT PRIMARY KEY,
        pattern_json TEXT NOT NULL,
        received_at INTEGER NOT NULL,
        applied_to_vecdb INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_hazards_expires ON grid_hazards(expires_at);
      CREATE INDEX IF NOT EXISTS idx_patterns_applied ON grid_patterns(applied_to_vecdb);
    `);

    // Load last sync time
    const lastSync = await this.db.getFirstAsync<{ value: string }>(
      `SELECT value FROM grid_sync_meta WHERE key = 'last_sync_time'`
    );
    if (lastSync) {
      this.lastSyncTime = parseInt(lastSync.value, 10);
    }

    console.log('[GridSync] Initialized');
  }

  /**
   * Register background sync task.
   */
  async registerBackgroundSync(): Promise<boolean> {
    try {
      // Define the background task
      TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
        console.log('[GridSync] Background sync triggered');
        try {
          const result = await this.performSync();
          return result.success
            ? BackgroundFetch.BackgroundFetchResult.NewData
            : BackgroundFetch.BackgroundFetchResult.Failed;
        } catch (error) {
          console.error('[GridSync] Background sync error:', error);
          return BackgroundFetch.BackgroundFetchResult.Failed;
        }
      });

      // Register the background fetch
      await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
        minimumInterval: SYNC_CONFIG.backgroundIntervalMinutes * 60,
        stopOnTerminate: false,
        startOnBoot: true,
      });

      console.log('[GridSync] Background sync registered');
      return true;
    } catch (error) {
      console.warn('[GridSync] Failed to register background sync:', error);
      return false;
    }
  }

  /**
   * Set current vessel position (for regional sync).
   */
  setPosition(lat: number, lon: number): void {
    this.currentPosition = { lat, lon };
  }

  /**
   * Register callbacks for sync events.
   */
  onEvents(callbacks: {
    onHazardReceived?: (hazard: GridHazard) => void;
    onPatternLearned?: (pattern: GridPattern) => void;
    onSyncComplete?: (result: SyncResult) => void;
  }): void {
    this.onHazardReceived = callbacks.onHazardReceived;
    this.onPatternLearned = callbacks.onPatternLearned;
    this.onSyncComplete = callbacks.onSyncComplete;
  }

  /**
   * Perform a full sync cycle.
   */
  async performSync(): Promise<SyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        uploaded: 0,
        downloaded: 0,
        hazardsReceived: 0,
        patternsUpdated: 0,
        errors: ['Sync already in progress'],
        durationMs: 0,
        connectionType: 'none',
      };
    }

    this.isSyncing = true;
    const startTime = Date.now();
    const errors: string[] = [];
    let uploaded = 0;
    let downloaded = 0;
    let hazardsReceived = 0;
    let patternsUpdated = 0;

    try {
      // Check connectivity
      const networkState = await Network.getNetworkStateAsync();
      if (!networkState.isConnected) {
        return {
          success: false,
          uploaded: 0,
          downloaded: 0,
          hazardsReceived: 0,
          patternsUpdated: 0,
          errors: ['No network connection'],
          durationMs: Date.now() - startTime,
          connectionType: 'none',
        };
      }

      const connectionType = networkState.type ?? 'unknown';
      console.log(`[GridSync] Starting sync via ${connectionType}`);

      // 1. Upload pending snapshots
      try {
        uploaded = await this.uploadPendingSnapshots();
      } catch (e) {
        errors.push(`Upload failed: ${e}`);
      }

      // 2. Download nearby snapshots
      try {
        downloaded = await this.downloadNearbySnapshots();
      } catch (e) {
        errors.push(`Download failed: ${e}`);
      }

      // 3. Sync hazard reports
      try {
        hazardsReceived = await this.syncHazards();
      } catch (e) {
        errors.push(`Hazard sync failed: ${e}`);
      }

      // 4. Update patterns from fleet learning
      try {
        patternsUpdated = await this.syncPatterns();
      } catch (e) {
        errors.push(`Pattern sync failed: ${e}`);
      }

      // 5. Clean up expired data
      await this.cleanupExpired();

      // Save last sync time
      this.lastSyncTime = Date.now();
      await this.db.runAsync(
        `INSERT OR REPLACE INTO grid_sync_meta (key, value, updated_at) VALUES ('last_sync_time', ?, ?)`,
        [this.lastSyncTime.toString(), this.lastSyncTime]
      );

      const result: SyncResult = {
        success: errors.length === 0,
        uploaded,
        downloaded,
        hazardsReceived,
        patternsUpdated,
        errors,
        durationMs: Date.now() - startTime,
        connectionType,
      };

      this.lastSyncResult = result;
      this.onSyncComplete?.(result);

      console.log(`[GridSync] Sync complete in ${result.durationMs}ms`);
      console.log(`  Uploaded: ${uploaded}, Downloaded: ${downloaded}, Hazards: ${hazardsReceived}, Patterns: ${patternsUpdated}`);

      return result;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Upload pending divergence snapshots to the grid.
   */
  private async uploadPendingSnapshots(): Promise<number> {
    const pending = await this.vesselSnapshot.getPendingSnapshots(SYNC_CONFIG.uploadBatchSize);
    let uploaded = 0;

    for (const item of pending) {
      try {
        // In production, this would be an actual API call
        // For now, simulate the upload
        const success = await this.simulateUpload(item.snapshot);

        if (success) {
          await this.vesselSnapshot.markUploaded(item.id);
          uploaded++;
          console.log(`[GridSync] Uploaded snapshot: ${item.id}`);
        } else {
          await this.vesselSnapshot.recordUploadFailure(item.id);
        }
      } catch (error) {
        await this.vesselSnapshot.recordUploadFailure(item.id);
        console.error(`[GridSync] Failed to upload ${item.id}:`, error);
      }
    }

    return uploaded;
  }

  /**
   * Download snapshots from vessels in the nearby region.
   */
  private async downloadNearbySnapshots(): Promise<number> {
    if (!this.currentPosition) {
      return 0;
    }

    try {
      // In production, this would fetch from the grid API
      // For now, return 0 (no mock data)
      const snapshots = await this.simulateFetchNearbySnapshots(
        this.currentPosition.lat,
        this.currentPosition.lon,
        SYNC_CONFIG.nearbyRadiusNm
      );

      // Store and process downloaded snapshots
      for (const snapshot of snapshots) {
        // Add to local VecDB for pattern learning
        await this.learnFromSnapshot(snapshot);
      }

      return snapshots.length;
    } catch (error) {
      console.error('[GridSync] Failed to download snapshots:', error);
      return 0;
    }
  }

  /**
   * Sync hazard reports with the grid.
   */
  private async syncHazards(): Promise<number> {
    if (!this.currentPosition) {
      return 0;
    }

    try {
      // In production, fetch hazards from grid API
      const hazards = await this.simulateFetchHazards(
        this.currentPosition.lat,
        this.currentPosition.lon,
        SYNC_CONFIG.nearbyRadiusNm
      );

      let received = 0;
      for (const hazard of hazards) {
        // Check if we already have this hazard
        const existing = await this.db.getFirstAsync<{ grid_id: string }>(
          `SELECT grid_id FROM grid_hazards WHERE grid_id = ?`,
          [hazard.grid_id]
        );

        if (!existing) {
          await this.db.runAsync(
            `INSERT INTO grid_hazards (grid_id, hazard_json, received_at, expires_at)
             VALUES (?, ?, ?, ?)`,
            [hazard.grid_id, JSON.stringify(hazard), Date.now(), new Date(hazard.expires_at).getTime()]
          );
          this.onHazardReceived?.(hazard);
          received++;
        }
      }

      return received;
    } catch (error) {
      console.error('[GridSync] Failed to sync hazards:', error);
      return 0;
    }
  }

  /**
   * Sync learned patterns from fleet observations.
   */
  private async syncPatterns(): Promise<number> {
    if (!this.currentPosition) {
      return 0;
    }

    try {
      // In production, fetch patterns from grid API
      const patterns = await this.simulateFetchPatterns(
        this.currentPosition.lat,
        this.currentPosition.lon
      );

      let updated = 0;
      for (const pattern of patterns) {
        // Check if we already have this pattern
        const existing = await this.db.getFirstAsync<{ applied_to_vecdb: number }>(
          `SELECT applied_to_vecdb FROM grid_patterns WHERE pattern_id = ?`,
          [pattern.pattern_id]
        );

        if (!existing) {
          // Store pattern
          await this.db.runAsync(
            `INSERT INTO grid_patterns (pattern_id, pattern_json, received_at, applied_to_vecdb)
             VALUES (?, ?, ?, 0)`,
            [pattern.pattern_id, JSON.stringify(pattern), Date.now()]
          );

          // Apply to VecDB
          await this.applyPatternToVecDb(pattern);
          this.onPatternLearned?.(pattern);
          updated++;
        }
      }

      return updated;
    } catch (error) {
      console.error('[GridSync] Failed to sync patterns:', error);
      return 0;
    }
  }

  /**
   * Learn from a downloaded divergence snapshot.
   */
  private async learnFromSnapshot(snapshot: DivergenceSnapshot): Promise<void> {
    // Convert embedding back to AtmosphericVector
    const vector: AtmosphericVector = {
      temperature: snapshot.embedding[0],
      pressure: snapshot.embedding[1],
      humidity: snapshot.embedding[2],
      windU: snapshot.embedding[3],
      windV: snapshot.embedding[4],
      pressureTrend: snapshot.embedding[5],
      cloudCover: snapshot.embedding[6],
      waveHeight: snapshot.embedding[7],
      wavePeriod: snapshot.embedding[8],
    };

    // Store in VecDB as a learned pattern
    const patternId = `fleet_${snapshot.snapshot_id}`;
    await this.vecDb.storePattern(patternId, vector, {
      timestamp: new Date(snapshot.captured_at).getTime(),
      lat: snapshot.location.lat,
      lon: snapshot.location.lon,
      label: `Fleet: ${snapshot.divergence_metrics.severity} divergence`,
      outcome: `Observed: ${snapshot.observed.wind_speed_kts}kt, ${snapshot.observed.pressure_hpa}hPa`,
      source: 'grid_fleet',
    });
  }

  /**
   * Apply a grid pattern to local VecDB.
   */
  private async applyPatternToVecDb(pattern: GridPattern): Promise<void> {
    const vector: AtmosphericVector = {
      temperature: pattern.vector[0],
      pressure: pattern.vector[1],
      humidity: pattern.vector[2],
      windU: pattern.vector[3],
      windV: pattern.vector[4],
      pressureTrend: pattern.vector[5],
      cloudCover: pattern.vector[6],
      waveHeight: pattern.vector[7],
      wavePeriod: pattern.vector[8],
    };

    await this.vecDb.storePattern(pattern.pattern_id, vector, {
      timestamp: new Date(pattern.last_observed).getTime(),
      lat: 0, // Grid patterns are region-wide
      lon: 0,
      label: pattern.label,
      outcome: pattern.outcome,
      source: 'grid_learned',
    });

    // Mark as applied
    await this.db.runAsync(
      `UPDATE grid_patterns SET applied_to_vecdb = 1 WHERE pattern_id = ?`,
      [pattern.pattern_id]
    );
  }

  /**
   * Clean up expired hazards and old sync data.
   */
  private async cleanupExpired(): Promise<void> {
    const now = Date.now();

    // Remove expired hazards
    await this.db.runAsync(
      `DELETE FROM grid_hazards WHERE expires_at < ?`,
      [now]
    );

    // Remove old sync data (keep last 30 days)
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    await this.db.runAsync(
      `DELETE FROM snapshot_queue WHERE status = 'uploaded' AND created_at < ?`,
      [thirtyDaysAgo]
    );
  }

  /**
   * Get current sync status.
   */
  async getStatus(): Promise<SyncStatus> {
    const networkState = await Network.getNetworkStateAsync();
    const pendingResult = await this.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM snapshot_queue WHERE status = 'pending'`
    );

    let backgroundTaskRegistered = false;
    try {
      const status = await BackgroundFetch.getStatusAsync();
      backgroundTaskRegistered = status === BackgroundFetch.BackgroundFetchStatus.Available;
    } catch {
      // Background fetch not available
    }

    return {
      lastSyncTime: this.lastSyncTime,
      lastSyncResult: this.lastSyncResult,
      isConnected: networkState.isConnected ?? false,
      connectionType: networkState.type ?? null,
      pendingUploads: pendingResult?.count ?? 0,
      backgroundTaskRegistered,
    };
  }

  /**
   * Get active hazards in the current region.
   */
  async getActiveHazards(): Promise<GridHazard[]> {
    const rows = await this.db.getAllAsync<{ hazard_json: string }>(
      `SELECT hazard_json FROM grid_hazards WHERE expires_at > ?`,
      [Date.now()]
    );

    return rows.map(row => JSON.parse(row.hazard_json));
  }

  /**
   * Force an immediate sync (user-triggered).
   */
  async syncNow(): Promise<SyncResult> {
    return this.performSync();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Simulation methods (replace with actual API calls in production)
  // ─────────────────────────────────────────────────────────────────────────

  private async simulateUpload(snapshot: DivergenceSnapshot): Promise<boolean> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    // 95% success rate
    return Math.random() > 0.05;
  }

  private async simulateFetchNearbySnapshots(
    lat: number,
    lon: number,
    radiusNm: number
  ): Promise<DivergenceSnapshot[]> {
    // In production, fetch from grid API
    // For now, return empty (no mock fleet data)
    return [];
  }

  private async simulateFetchHazards(
    lat: number,
    lon: number,
    radiusNm: number
  ): Promise<GridHazard[]> {
    // In production, fetch from grid API
    // For now, return empty (no mock hazards)
    return [];
  }

  private async simulateFetchPatterns(
    lat: number,
    lon: number
  ): Promise<GridPattern[]> {
    // In production, fetch from grid API
    // For now, return empty (no mock patterns)
    return [];
  }
}

export default GridSync;

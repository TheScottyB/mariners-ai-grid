import * as Network from 'expo-network';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import * as BackgroundTask from 'expo-background-task';
import { DB } from '@op-engineering/op-sqlite';
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
  pushTokens: `${GRID_API_BASE}/push-tokens`,
  emergencyBroadcast: `${GRID_API_BASE}/emergency-broadcast`,
};

// Sync configuration
const SYNC_CONFIG = {
  backgroundIntervalMinutes: 15,
  nearbyRadiusNm: 500,
  uploadBatchSize: 10,
  downloadBatchSize: 50,
  maxRetries: 3,
  retryDelayMs: 5000,
  allowedConnectionTypes: ['wifi', 'cellular', 'ethernet'] as const,
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
  pushTokenRegistered: boolean;
}

export interface EmergencyBroadcastData {
  type: 'divergence' | 'gale' | 'storm' | 'hazard';
  severity: 'elevated' | 'high' | 'critical';
  title: string;
  message: string;
  location: { lat: number; lon: number };
  tss: number;  // Trend Severity Score
  timestamp: number;
  sourceVesselHash: string;  // SHA-256 truncated for privacy
}

// ─────────────────────────────────────────────────────────────────────────────
// GridSync Class
// ─────────────────────────────────────────────────────────────────────────────

export class GridSync {
  private db: DB;
  private vesselSnapshot: VesselSnapshot;
  private vecDb: VecDB;
  private currentPosition: { lat: number; lon: number } | null = null;
  private lastSyncResult: SyncResult | null = null;
  private lastSyncTime: number | null = null;
  private isSyncing: boolean = false;
  private pushToken: string | null = null;

  // Callbacks
  private onHazardReceived?: (hazard: GridHazard) => void;
  private onPatternLearned?: (pattern: GridPattern) => void;
  private onSyncComplete?: (result: SyncResult) => void;
  private onEmergencyBroadcast?: (data: EmergencyBroadcastData) => void;

  constructor(db: DB, vesselSnapshot: VesselSnapshot, vecDb: VecDB) {
    this.db = db;
    this.vesselSnapshot = vesselSnapshot;
    this.vecDb = vecDb;
  }

  /**
   * Initialize the GridSync service.
   */
  async initialize(): Promise<void> {
    // Create sync metadata table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS grid_sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );`);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS grid_hazards (
        grid_id TEXT PRIMARY KEY,
        hazard_json TEXT NOT NULL,
        received_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        verified_locally INTEGER DEFAULT 0
      );`);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS grid_patterns (
        pattern_id TEXT PRIMARY KEY,
        pattern_json TEXT NOT NULL,
        received_at INTEGER NOT NULL,
        applied_to_vecdb INTEGER DEFAULT 0
      );`);

    await this.db.execute('CREATE INDEX IF NOT EXISTS idx_hazards_expires ON grid_hazards(expires_at)');
    await this.db.execute('CREATE INDEX IF NOT EXISTS idx_patterns_applied ON grid_patterns(applied_to_vecdb)');

    // Load last sync time
    const result = await this.db.execute(`SELECT value FROM grid_sync_meta WHERE key = 'last_sync_time'`);
    const lastSync = result.rows?.[0];
    if (lastSync) {
      this.lastSyncTime = parseInt(lastSync.value as string, 10);
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
            ? BackgroundTask.BackgroundTaskResult.Success
            : BackgroundTask.BackgroundTaskResult.Failed;
        } catch (error) {
          console.error('[GridSync] Background sync error:', error);
          return BackgroundTask.BackgroundTaskResult.Failed;
        }
      });

      // Register the background task
      await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
        minimumInterval: SYNC_CONFIG.backgroundIntervalMinutes * 60,
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
        success: false, uploaded: 0, downloaded: 0, hazardsReceived: 0,
        patternsUpdated: 0, errors: ['Sync already in progress'], durationMs: 0, connectionType: 'none',
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
      const networkState = await Network.getNetworkStateAsync();
      if (!networkState.isConnected) {
        return {
          success: false, uploaded: 0, downloaded: 0, hazardsReceived: 0,
          patternsUpdated: 0, errors: ['No network connection'], durationMs: Date.now() - startTime, connectionType: 'none',
        };
      }

      const connectionType = networkState.type ?? 'unknown';
      console.log(`[GridSync] Starting sync via ${connectionType}`);

      try { uploaded = await this.uploadPendingSnapshots(); } catch (e) { errors.push(`Upload failed: ${e}`); }
      try { downloaded = await this.downloadNearbySnapshots(); } catch (e) { errors.push(`Download failed: ${e}`); }
      try { hazardsReceived = await this.syncHazards(); } catch (e) { errors.push(`Hazard sync failed: ${e}`); }
      try { patternsUpdated = await this.syncPatterns(); } catch (e) { errors.push(`Pattern sync failed: ${e}`); }

      await this.cleanupExpired();

      this.lastSyncTime = Date.now();
      await this.db.execute(
        `INSERT OR REPLACE INTO grid_sync_meta (key, value, updated_at) VALUES ('last_sync_time', ?, ?)`,
        [this.lastSyncTime.toString(), this.lastSyncTime]
      );

      const result: SyncResult = {
        success: errors.length === 0,
        uploaded, downloaded, hazardsReceived, patternsUpdated,
        errors, durationMs: Date.now() - startTime, connectionType,
      };

      this.lastSyncResult = result;
      this.onSyncComplete?.(result);

      console.log(`[GridSync] Sync complete in ${result.durationMs}ms`);
      return result;
    } finally {
      this.isSyncing = false;
    }
  }

  private async uploadPendingSnapshots(): Promise<number> {
    const pending = await this.vesselSnapshot.getPendingSnapshots(SYNC_CONFIG.uploadBatchSize);
    let uploaded = 0;
    for (const item of pending) {
      try {
        const success = await this.simulateUpload(item.snapshot);
        if (success) {
          await this.vesselSnapshot.markUploaded(item.id);
          uploaded++;
        } else {
          await this.vesselSnapshot.recordUploadFailure(item.id);
        }
      } catch (error) {
        await this.vesselSnapshot.recordUploadFailure(item.id);
      }
    }
    return uploaded;
  }

  private async downloadNearbySnapshots(): Promise<number> {
    if (!this.currentPosition) return 0;
    try {
      const snapshots = await this.simulateFetchNearbySnapshots(this.currentPosition.lat, this.currentPosition.lon, SYNC_CONFIG.nearbyRadiusNm);
      for (const snapshot of snapshots) { await this.learnFromSnapshot(snapshot); }
      return snapshots.length;
    } catch (error) {
      return 0;
    }
  }

  private async syncHazards(): Promise<number> {
    if (!this.currentPosition) return 0;
    try {
      const hazards = await this.simulateFetchHazards(this.currentPosition.lat, this.currentPosition.lon, SYNC_CONFIG.nearbyRadiusNm);
      let received = 0;
      for (const hazard of hazards) {
        const result = await this.db.execute(`SELECT grid_id FROM grid_hazards WHERE grid_id = ?`, [hazard.grid_id]);
        if (!result.rows[0]) {
          await this.db.execute(
            `INSERT OR IGNORE INTO grid_hazards (grid_id, hazard_json, received_at, expires_at)
             VALUES (?, ?, ?, ?)`,
            [hazard.grid_id, JSON.stringify(hazard), Date.now(), new Date(hazard.expires_at).getTime()]
          );
          this.onHazardReceived?.(hazard);
          received++;
        }
      }
      return received;
    } catch (error) {
      return 0;
    }
  }

  private async syncPatterns(): Promise<number> {
    if (!this.currentPosition) return 0;
    try {
      const patterns = await this.simulateFetchPatterns(this.currentPosition.lat, this.currentPosition.lon);
      let updated = 0;
      for (const pattern of patterns) {
        const result = await this.db.execute(`SELECT applied_to_vecdb FROM grid_patterns WHERE pattern_id = ?`, [pattern.pattern_id]);
        if (!result.rows[0]) {
          await this.db.execute(`INSERT OR IGNORE INTO grid_patterns (pattern_id, pattern_json, received_at, applied_to_vecdb) VALUES (?, ?, ?, 0)`, [pattern.pattern_id, JSON.stringify(pattern), Date.now()]);
          await this.applyPatternToVecDb(pattern);
          this.onPatternLearned?.(pattern);
          updated++;
        }
      }
      return updated;
    } catch (error) {
      return 0;
    }
  }

  private async learnFromSnapshot(snapshot: DivergenceSnapshot): Promise<void> {
    const vector: AtmosphericVector = {
      temperature: snapshot.embedding[0], pressure: snapshot.embedding[1], humidity: snapshot.embedding[2],
      windU: snapshot.embedding[3], windV: snapshot.embedding[4], pressureTrend: snapshot.embedding[5],
      cloudCover: snapshot.embedding[6], waveHeight: snapshot.embedding[7], wavePeriod: snapshot.embedding[8],
    };
    await this.vecDb.storePattern(`fleet_${snapshot.snapshot_id}`, vector, {
      timestamp: new Date(snapshot.captured_at).getTime(),
      lat: snapshot.location.lat, lon: snapshot.location.lon,
      label: `Fleet: ${snapshot.divergence_metrics.severity} divergence`,
      outcome: `Observed: ${snapshot.observed.wind_speed_kts}kt, ${snapshot.observed.pressure_hpa}hPa`,
      source: 'grid_fleet',
    });
  }

  private async applyPatternToVecDb(pattern: GridPattern): Promise<void> {
    const vector: AtmosphericVector = {
      temperature: pattern.vector[0], pressure: pattern.vector[1], humidity: pattern.vector[2],
      windU: pattern.vector[3], windV: pattern.vector[4], pressureTrend: pattern.vector[5],
      cloudCover: pattern.vector[6], waveHeight: pattern.vector[7], wavePeriod: pattern.vector[8],
    };
    await this.vecDb.storePattern(pattern.pattern_id, vector, {
      timestamp: new Date(pattern.last_observed).getTime(),
      lat: 0, lon: 0, label: pattern.label, outcome: pattern.outcome, source: 'grid_learned',
    });
    await this.db.execute(`UPDATE grid_patterns SET applied_to_vecdb = 1 WHERE pattern_id = ?`, [pattern.pattern_id]);
  }

  private async cleanupExpired(): Promise<void> {
    const now = Date.now();
    await this.db.execute(`DELETE FROM grid_hazards WHERE expires_at < ?`, [now]);
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    await this.db.execute(`DELETE FROM snapshot_queue WHERE status = 'uploaded' AND created_at < ?`, [thirtyDaysAgo]);
  }

  async getStatus(): Promise<SyncStatus> {
    const networkState = await Network.getNetworkStateAsync();
    const pendingResult = await this.db.execute(`SELECT COUNT(*) as count FROM snapshot_queue WHERE status = 'pending'`);
    
    let isRegistered = false;
    try {
      isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    } catch (e) {}

    return {
      lastSyncTime: this.lastSyncTime, lastSyncResult: this.lastSyncResult,
      isConnected: networkState.isConnected ?? false, connectionType: networkState.type ?? null,
      pendingUploads: (pendingResult.rows?.[0]?.count as number) ?? 0,
      backgroundTaskRegistered: isRegistered, pushTokenRegistered: this.pushToken !== null,
    };
  }

  async getActiveHazards(): Promise<GridHazard[]> {
    const result = await this.db.execute(`SELECT hazard_json FROM grid_hazards WHERE expires_at > ?`, [Date.now()]);
    const rows = result.rows || [];
    return rows.map((row: any) => JSON.parse(row.hazard_json));
  }

  async syncNow(): Promise<SyncResult> {
    return this.performSync();
  }

  private async simulateUpload(snapshot: DivergenceSnapshot): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 150));
    return Math.random() > 0.05;
  }

  private async simulateFetchNearbySnapshots(lat: number, lon: number, radiusNm: number): Promise<DivergenceSnapshot[]> { return []; }
  private async simulateFetchHazards(lat: number, lon: number, radiusNm: number): Promise<GridHazard[]> { return []; }
  private async simulateFetchPatterns(lat: number, lon: number): Promise<GridPattern[]> { return []; }

  async registerPushToken(token: string): Promise<boolean> {
    this.pushToken = token;
    if (!this.currentPosition) return false;
    try {
      await this.db.execute(`INSERT OR REPLACE INTO grid_sync_meta (key, value, updated_at) VALUES ('push_token', ?, ?)`, [token, Date.now()]);
      return true;
    } catch (error) {
      return false;
    }
  }

  async broadcastEmergency(data: EmergencyBroadcastData): Promise<boolean> {
    if (!this.currentPosition) return false;
    try {
      await this.simulateEmergencyBroadcast(data);
      await this.sendLocalEmergencyNotification(data);
      return true;
    } catch (error) {
      return false;
    }
  }

  onEmergency(callback: (data: EmergencyBroadcastData) => void): void {
    this.onEmergencyBroadcast = callback;
  }

  private async sendLocalEmergencyNotification(data: EmergencyBroadcastData): Promise<void> {
    const severityEmoji = { elevated: '🟠', high: '🔴', critical: '🚨' }[data.severity];
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${severityEmoji} ${data.title}`, body: data.message,
        data: { ...data, notificationType: 'emergency_broadcast', priority: 'emergency' },
        sound: true, priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: null,
    });
  }

  private async simulateEmergencyBroadcast(data: EmergencyBroadcastData): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

export default GridSync;

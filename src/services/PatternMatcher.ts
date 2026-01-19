/**
 * Mariner's AI Grid - PatternMatcher
 *
 * The Intelligence Layer: Continuously monitors real-time vessel telemetry
 * from Signal K and compares it against dangerous historical patterns
 * stored in VecDB.
 *
 * When current conditions match a known dangerous pattern (pre-squall,
 * gale development, rogue wave signature), the system triggers alerts.
 *
 * This is the "Vibe Search" - finding atmospheric situations that *feel*
 * like past dangerous events, even if individual metrics don't hit
 * traditional thresholds.
 */

import { VecDB, AtmosphericVector, AtmosphericPattern } from './VecDB';
import { DB } from '@op-engineering/op-sqlite';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DangerLevel = 'info' | 'caution' | 'warning' | 'danger' | 'emergency';

export interface PatternAlert {
  id: string;
  level: DangerLevel;
  title: string;
  description: string;
  matchedPattern: AtmosphericPattern & { similarity: number };
  currentConditions: AtmosphericVector;
  timestamp: number;
  acknowledged: boolean;

  // Recommended actions
  recommendations: string[];

  // Time estimate if available
  estimatedOnset?: string; // e.g., "30-60 minutes"
}

export interface TelemetrySnapshot {
  // From Signal K / NMEA 2000
  position: { lat: number; lon: number };
  heading: number;
  sog: number;         // Speed over ground (knots)

  // Environmental sensors
  barometer?: number;  // hPa
  temperature?: number; // Celsius
  humidity?: number;   // 0-100

  // Wind instruments
  apparentWindSpeed?: number;  // knots
  apparentWindAngle?: number;  // degrees
  trueWindSpeed?: number;      // knots
  trueWindAngle?: number;      // degrees

  // Wave data (if available)
  waveHeight?: number;  // meters
  wavePeriod?: number;  // seconds

  // Derived
  pressureTrend?: number; // hPa change over last hour

  timestamp: number;
}

export interface PatternMatcherConfig {
  // How often to check for pattern matches (ms)
  checkIntervalMs: number;

  // Minimum similarity to trigger an alert (0-1)
  alertThreshold: number;

  // Similarity thresholds for each danger level
  thresholds: {
    caution: number;
    warning: number;
    danger: number;
    emergency: number;
  };

  // Suppress duplicate alerts for this duration (ms)
  alertCooldownMs: number;

  // Enable/disable specific pattern categories
  enabledCategories: {
    squall: boolean;
    gale: boolean;
    rogueWave: boolean;
    rapidPressureDrop: boolean;
    convergenceZone: boolean;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Known Dangerous Pattern Seeds
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pre-seeded dangerous patterns based on maritime meteorology.
 * These are normalized vectors representing conditions that precede
 * dangerous weather events.
 */
export const DANGEROUS_PATTERNS: Array<{
  id: string;
  label: string;
  outcome: string;
  category: keyof PatternMatcherConfig['enabledCategories'];
  vector: AtmosphericVector;
  recommendations: string[];
  estimatedOnset: string;
}> = [
  {
    id: 'pattern_pre_squall_tropical',
    label: 'Pre-Squall (Tropical)',
    outcome: 'Sudden wind shift 25-40kt, heavy rain, reduced visibility',
    category: 'squall',
    vector: {
      temperature: 0.6,        // Warm (tropical)
      pressure: -0.3,          // Slightly falling
      humidity: 0.9,           // Very high
      windU: 0.2,              // Light easterly
      windV: -0.1,             // Slight southerly component
      pressureTrend: -0.5,     // Falling moderately
      cloudCover: 0.8,         // Building
      waveHeight: 0.3,         // Moderate
      wavePeriod: 0.4,         // Medium period
    },
    recommendations: [
      'Reduce sail area immediately',
      'Secure all loose gear on deck',
      'Don foul weather gear',
      'Update position with coast guard if offshore',
    ],
    estimatedOnset: '15-45 minutes',
  },
  {
    id: 'pattern_gale_development',
    label: 'Gale Development',
    outcome: 'Sustained winds 34-47kt developing over 6-12 hours',
    category: 'gale',
    vector: {
      temperature: -0.2,       // Cooling
      pressure: -0.6,          // Dropping significantly
      humidity: 0.7,           // High
      windU: 0.4,              // Increasing westerly
      windV: 0.3,              // Northerly component
      pressureTrend: -0.8,     // Falling rapidly
      cloudCover: 0.9,         // Overcast
      waveHeight: 0.5,         // Building
      wavePeriod: 0.6,         // Longer period swell arriving
    },
    recommendations: [
      'Consider heaving-to or running off',
      'Prepare storm sails',
      'Check bilge pumps',
      'Plot nearest ports of refuge',
      'Inform crew and assign watches',
    ],
    estimatedOnset: '4-8 hours',
  },
  {
    id: 'pattern_rapid_pressure_drop',
    label: 'Bomb Cyclone Signature',
    outcome: 'Explosive cyclogenesis - pressure drop >24mb/24hr',
    category: 'rapidPressureDrop',
    vector: {
      temperature: 0.1,        // Variable
      pressure: -0.9,          // Very low
      humidity: 0.8,           // High
      windU: 0.6,              // Strong
      windV: 0.5,              // Backing wind
      pressureTrend: -1.0,     // Crashing
      cloudCover: 1.0,         // Total overcast
      waveHeight: 0.7,         // Heavy
      wavePeriod: 0.5,         // Confused seas
    },
    recommendations: [
      'MAYDAY preparation - verify EPIRB',
      'Deploy sea anchor or drogue',
      'All crew in harnesses',
      'Close all hatches and ports',
      'Activate AIS MOB if separated',
    ],
    estimatedOnset: '2-6 hours to peak',
  },
  {
    id: 'pattern_rogue_wave_conditions',
    label: 'Rogue Wave Risk',
    outcome: 'Elevated probability of abnormal wave (2x+ significant height)',
    category: 'rogueWave',
    vector: {
      temperature: 0.0,        // Not temperature-dependent
      pressure: -0.2,          // Slight low
      humidity: 0.5,           // Moderate
      windU: 0.7,              // Strong current-opposing wind
      windV: 0.2,              // Cross component
      pressureTrend: -0.3,     // Slight fall
      cloudCover: 0.5,         // Variable
      waveHeight: 0.8,         // Already heavy seas
      wavePeriod: 0.3,         // Short period (wave stacking)
    },
    recommendations: [
      'Maintain vigilant watch',
      'Avoid beam-on orientation',
      'Reduce speed in following seas',
      'Close watertight doors',
      'Consider altering course',
    ],
    estimatedOnset: 'Unpredictable - conditions elevated',
  },
  {
    id: 'pattern_itcz_convergence',
    label: 'ITCZ Convergence Zone',
    outcome: 'Sudden thunderstorms, variable winds, waterspouts possible',
    category: 'convergenceZone',
    vector: {
      temperature: 0.8,        // Hot
      pressure: -0.1,          // Near-normal low
      humidity: 0.95,          // Saturated
      windU: 0.0,              // Light/variable
      windV: 0.0,              // Doldrums-like
      pressureTrend: 0.0,      // Stable (the calm before)
      cloudCover: 0.6,         // Towering cumulus
      waveHeight: 0.2,         // Light chop
      wavePeriod: 0.2,         // Short
    },
    recommendations: [
      'Monitor radar for cell development',
      'Be prepared for 180° wind shifts',
      'Keep motor ready for maneuvering',
      'Watch for waterspout formation',
    ],
    estimatedOnset: 'Minutes to hours - highly variable',
  },
  {
    id: 'pattern_lee_shore_trap',
    label: 'Lee Shore Development',
    outcome: 'Wind shift trapping vessel against coast',
    category: 'gale',
    vector: {
      temperature: -0.3,       // Cooling onshore flow
      pressure: -0.4,          // Dropping
      humidity: 0.6,           // Increasing
      windU: -0.5,             // Shifting onshore
      windV: 0.4,              // Veering
      pressureTrend: -0.6,     // Accelerating drop
      cloudCover: 0.7,         // Building
      waveHeight: 0.4,         // Increasing
      wavePeriod: 0.3,         // Shortening (shoaling)
    },
    recommendations: [
      'Gain sea room immediately',
      'Plot escape routes now',
      'Monitor depth sounder closely',
      'Prepare anchoring gear as last resort',
    ],
    estimatedOnset: '1-4 hours',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PatternMatcher Class
// ─────────────────────────────────────────────────────────────────────────────

export class PatternMatcher {
  private vecDB: VecDB;
  private config: PatternMatcherConfig;
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private recentAlerts: Map<string, number> = new Map(); // pattern_id -> last_alert_time
  private alertHistory: PatternAlert[] = [];

  // Callbacks
  private onAlert?: (alert: PatternAlert) => void;
  private onConditionsUpdate?: (conditions: AtmosphericVector) => void;

  // Telemetry buffer for trend calculation
  private telemetryBuffer: TelemetrySnapshot[] = [];
  private readonly BUFFER_SIZE = 60; // Keep last 60 readings for trend analysis

  constructor(db: DB, config?: Partial<PatternMatcherConfig>) {
    this.vecDB = new VecDB(db);
    this.config = {
      checkIntervalMs: 30000, // Check every 30 seconds
      alertThreshold: 0.75,
      thresholds: {
        caution: 0.70,
        warning: 0.80,
        danger: 0.88,
        emergency: 0.95,
      },
      alertCooldownMs: 15 * 60 * 1000, // 15 minutes between same alerts
      enabledCategories: {
        squall: true,
        gale: true,
        rogueWave: true,
        rapidPressureDrop: true,
        convergenceZone: true,
      },
      ...config,
    };
  }

  /**
   * Initialize the pattern matcher and seed dangerous patterns.
   */
  async initialize(): Promise<boolean> {
    const initialized = await this.vecDB.initialize();
    if (!initialized) {
      console.warn('[PatternMatcher] VecDB initialization failed - vector search unavailable');
      return false;
    }

    // Seed dangerous patterns
    await this.seedDangerousPatterns();

    console.log('[PatternMatcher] Initialized with danger pattern detection');
    return true;
  }

  /**
   * Seed the VecDB with known dangerous patterns.
   */
  private async seedDangerousPatterns(): Promise<void> {
    for (const pattern of DANGEROUS_PATTERNS) {
      await this.vecDB.storePattern(pattern.id, pattern.vector, {
        timestamp: Date.now(),
        lat: 0, // Global patterns
        lon: 0,
        label: pattern.label,
        outcome: pattern.outcome,
        source: 'historical',
      });
    }
    console.log(`[PatternMatcher] Seeded ${DANGEROUS_PATTERNS.length} danger patterns`);
  }

  /**
   * Start continuous monitoring of telemetry.
   */
  start(
    onAlert: (alert: PatternAlert) => void,
    onConditionsUpdate?: (conditions: AtmosphericVector) => void
  ): void {
    if (this.isRunning) return;

    this.onAlert = onAlert;
    this.onConditionsUpdate = onConditionsUpdate;
    this.isRunning = true;

    console.log('[PatternMatcher] Started monitoring');
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('[PatternMatcher] Stopped monitoring');
  }

  /**
   * Process incoming telemetry from Signal K.
   * Call this whenever new sensor data arrives.
   */
  async processTelemetry(telemetry: TelemetrySnapshot): Promise<PatternAlert | null> {
    // Add to buffer
    this.telemetryBuffer.push(telemetry);
    if (this.telemetryBuffer.length > this.BUFFER_SIZE) {
      this.telemetryBuffer.shift();
    }

    // Convert telemetry to atmospheric vector
    const currentConditions = this.telemetryToVector(telemetry);

    // Notify listener of current conditions
    this.onConditionsUpdate?.(currentConditions);

    // Check for pattern matches
    return this.checkPatterns(currentConditions, telemetry.position);
  }

  /**
   * Get median pressure from recent history to filter out NMEA noise spikes.
   */
  private getSmoothedPressure(current: number | undefined): number | undefined {
    if (current === undefined) return undefined;

    // Look at last 4 readings + current (window of 5)
    const recent = this.telemetryBuffer
      .slice(-4)
      .map(t => t.barometer)
      .filter((p): p is number => p !== undefined);
    
    recent.push(current);
    
    if (recent.length === 0) return undefined;

    // Sort for median
    recent.sort((a, b) => a - b);
    const mid = Math.floor(recent.length / 2);
    
    return recent.length % 2 !== 0
      ? recent[mid]
      : (recent[mid - 1] + recent[mid]) / 2;
  }

  /**
   * Convert raw telemetry to normalized atmospheric vector.
   */
  private telemetryToVector(telemetry: TelemetrySnapshot): AtmosphericVector {
    // Calculate pressure trend from buffer
    let pressureTrend = 0;
    
    // Smooth the current pressure reading
    const currentSmoothedPressure = this.getSmoothedPressure(telemetry.barometer);

    if (this.telemetryBuffer.length >= 2 && currentSmoothedPressure !== undefined) {
      const oldestWithPressure = this.telemetryBuffer.find(t => t.barometer);
      
      // We rely on the oldest RAW reading being "good enough" if it was stored 
      // (assuming transient noise is filtered out before acting, 
      // but here we just grab the oldest. Ideally we'd smooth that too).
      if (oldestWithPressure?.barometer) {
        const hourFraction = (telemetry.timestamp - oldestWithPressure.timestamp) / (60 * 60 * 1000);
        
        // Prevent division by zero or extremely small intervals
        if (hourFraction > 0.001) {
          // hPa change per hour, normalized to [-1, 1] (±10 hPa/hr = ±1)
          pressureTrend = Math.max(-1, Math.min(1,
            (currentSmoothedPressure - oldestWithPressure.barometer) / hourFraction / 10
          ));
        }
      }
    }

    // Convert true wind to U/V components
    let windU = 0, windV = 0;
    if (telemetry.trueWindSpeed !== undefined && telemetry.trueWindAngle !== undefined) {
      const windRad = (telemetry.trueWindAngle * Math.PI) / 180;
      // Normalize by 40kt max
      const normalizedSpeed = Math.min(1, telemetry.trueWindSpeed / 40);
      windU = normalizedSpeed * Math.sin(windRad);
      windV = normalizedSpeed * Math.cos(windRad);
    }

    return {
      temperature: telemetry.temperature !== undefined
        ? Math.max(-1, Math.min(1, (telemetry.temperature - 15) / 25)) // 15°C = 0, range -10 to 40
        : 0,
      pressure: currentSmoothedPressure !== undefined
        ? Math.max(-1, Math.min(1, (currentSmoothedPressure - 1013) / 30)) // 1013 hPa = 0
        : 0,
      humidity: telemetry.humidity !== undefined
        ? telemetry.humidity / 100
        : 0.5,
      windU,
      windV,
      pressureTrend,
      cloudCover: 0.5, // Would need sky camera or satellite data
      waveHeight: telemetry.waveHeight !== undefined
        ? Math.min(1, telemetry.waveHeight / 10) // 10m = max
        : undefined,
      wavePeriod: telemetry.wavePeriod !== undefined
        ? Math.min(1, telemetry.wavePeriod / 15) // 15s = max
        : undefined,
    };
  }

  /**
   * Check current conditions against dangerous patterns.
   */
  private async checkPatterns(
    conditions: AtmosphericVector,
    position: { lat: number; lon: number }
  ): Promise<PatternAlert | null> {
    try {
      // Find similar patterns
      const matches = await this.vecDB.findSimilar(
        conditions,
        5, // Top 5 matches
        this.config.alertThreshold
      );

      if (matches.length === 0) return null;

      // Find the most dangerous match
      const bestMatch = matches[0];

      // Check if this is a known dangerous pattern
      const dangerPattern = DANGEROUS_PATTERNS.find(p => p.id === bestMatch.id);
      if (!dangerPattern) return null;

      // Check if category is enabled
      if (!this.config.enabledCategories[dangerPattern.category]) {
        return null;
      }

      // Check cooldown
      const lastAlertTime = this.recentAlerts.get(bestMatch.id);
      if (lastAlertTime && Date.now() - lastAlertTime < this.config.alertCooldownMs) {
        return null;
      }

      // Determine danger level based on similarity
      const level = this.calculateDangerLevel(bestMatch.similarity);

      // Create alert
      const alert: PatternAlert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        level,
        title: dangerPattern.label,
        description: dangerPattern.outcome,
        matchedPattern: bestMatch,
        currentConditions: conditions,
        timestamp: Date.now(),
        acknowledged: false,
        recommendations: dangerPattern.recommendations,
        estimatedOnset: dangerPattern.estimatedOnset,
      };

      // Update cooldown
      this.recentAlerts.set(bestMatch.id, Date.now());

      // Store in history
      this.alertHistory.push(alert);
      if (this.alertHistory.length > 100) {
        this.alertHistory.shift();
      }

      // Trigger callback
      this.onAlert?.(alert);

      console.log(`[PatternMatcher] ⚠️ ALERT: ${alert.title} (${(bestMatch.similarity * 100).toFixed(1)}% match)`);

      return alert;
    } catch (error) {
      console.error('[PatternMatcher] Error checking patterns:', error);
      return null;
    }
  }

  /**
   * Calculate danger level from similarity score.
   */
  private calculateDangerLevel(similarity: number): DangerLevel {
    const { thresholds } = this.config;

    if (similarity >= thresholds.emergency) return 'emergency';
    if (similarity >= thresholds.danger) return 'danger';
    if (similarity >= thresholds.warning) return 'warning';
    if (similarity >= thresholds.caution) return 'caution';
    return 'info';
  }

  /**
   * Acknowledge an alert (user has seen it).
   */
  acknowledgeAlert(alertId: string): void {
    const alert = this.alertHistory.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  /**
   * Get recent alerts.
   */
  getRecentAlerts(limit: number = 10): PatternAlert[] {
    return this.alertHistory
      .slice(-limit)
      .reverse();
  }

  /**
   * Get unacknowledged alerts.
   */
  getActiveAlerts(): PatternAlert[] {
    return this.alertHistory
      .filter(a => !a.acknowledged)
      .reverse();
  }

  /**
   * Manually trigger a pattern check (useful for testing).
   */
  async manualCheck(telemetry: TelemetrySnapshot): Promise<PatternAlert | null> {
    return this.processTelemetry(telemetry);
  }

  /**
   * Get current atmospheric conditions as vector (for display).
   */
  getCurrentConditions(): AtmosphericVector | null {
    if (this.telemetryBuffer.length === 0) return null;
    const latest = this.telemetryBuffer[this.telemetryBuffer.length - 1];
    return this.telemetryToVector(latest);
  }

  /**
   * Export pattern database stats.
   */
  async getStats(): Promise<{
    totalPatterns: number;
    dangerPatterns: number;
    alertsTriggered: number;
    lastCheckTime: number | null;
  }> {
    const dbStats = await this.vecDB.getStats();
    return {
      totalPatterns: dbStats.totalPatterns,
      dangerPatterns: DANGEROUS_PATTERNS.length,
      alertsTriggered: this.alertHistory.length,
      lastCheckTime: this.telemetryBuffer.length > 0
        ? this.telemetryBuffer[this.telemetryBuffer.length - 1].timestamp
        : null,
    };
  }
}

export default PatternMatcher;

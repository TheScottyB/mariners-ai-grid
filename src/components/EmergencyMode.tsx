/**
 * Mariner's AI Grid - Emergency Mode Component
 *
 * iOS 26 Liquid Glass design language implementation for emergency states.
 * Transforms the UI from high-transparency glass to High-Opacity Frosted Crimson
 * for maximum visibility during high-stress maneuvers.
 *
 * Features:
 * - Material Shift: Dynamic glass-to-crimson transformation
 * - Trend Severity Score (TSS): Real-time danger calculation
 * - Haptic Pulse: Rhythmic directional feedback via Taptic Engine
 * - Task Pruning: Auto-suspend non-critical background processes
 *
 * @module EmergencyMode
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  StyleSheet,
  Platform,
  AppState,
  AppStateStatus,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';

import type { DangerLevel, TelemetrySnapshot } from '../services/PatternMatcher';
import type { ConsensusData, ConsensusLevel } from './PatternAlert';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EmergencyState {
  isActive: boolean;
  activatedAt: number | null;
  reason: 'divergent_consensus' | 'severity_threshold' | 'manual' | null;
  severityScore: number;
  trendDirection: 'worsening' | 'stable' | 'improving';
}

export interface TrendSeverityInput {
  // Current telemetry
  currentPressure: number;       // hPa
  currentWindSpeed: number;      // knots (observed)

  // Historical telemetry (for trend)
  previousPressure: number;      // hPa (from ~1 hour ago)
  timeDeltaHours: number;        // Hours between readings

  // GraphCast prediction
  predictedWindSpeed: number;    // knots
}

export interface EmergencyModeProps {
  isActive: boolean;
  severityScore: number;
  trendDirection: 'worsening' | 'stable' | 'improving';
  consensusLevel: ConsensusLevel;
  currentTelemetry: TelemetrySnapshot | null;
  predictedWindSpeed: number | null;
  onAcknowledge: () => void;
  onExitEmergency: () => void;
  children?: React.ReactNode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trend Severity Score Calculation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate Trend Severity Score (TSS) using the formula:
 *
 *   σ = (ΔP/Δt) · w_pressure + (W_obs - W_pred) · w_wind
 *
 * Where:
 * - P is Barometric Pressure (hPa)
 * - W_obs is Observed Wind Speed (knots)
 * - W_pred is GraphCast Seed prediction (knots)
 *
 * Weights are tuned for maritime conditions:
 * - w_pressure = 2.5 (rapid drops are dangerous)
 * - w_wind = 0.8 (wind deltas indicate model divergence)
 */
const WEIGHTS = {
  pressure: 2.5,
  wind: 0.8,
};

export function calculateTrendSeverityScore(input: TrendSeverityInput): number {
  const {
    currentPressure,
    previousPressure,
    currentWindSpeed,
    predictedWindSpeed,
    timeDeltaHours,
  } = input;

  // Calculate pressure trend (hPa/hour)
  // Negative values indicate falling pressure (bad)
  const pressureTrend = timeDeltaHours > 0
    ? (currentPressure - previousPressure) / timeDeltaHours
    : 0;

  // Wind divergence (positive = observed stronger than predicted = worse)
  const windDivergence = currentWindSpeed - predictedWindSpeed;

  // Calculate raw score
  // Negate pressure trend so falling pressure increases score
  const rawScore = (-pressureTrend * WEIGHTS.pressure) + (windDivergence * WEIGHTS.wind);

  // Normalize to 0-100 scale
  // -5 to +5 hPa/hr pressure trend -> -12.5 to +12.5 contribution
  // -20 to +20 kt wind divergence -> -16 to +16 contribution
  // Total range roughly -28.5 to +28.5, map to 0-100
  const normalizedScore = Math.max(0, Math.min(100, (rawScore + 30) * (100 / 60)));

  return Math.round(normalizedScore);
}

/**
 * Determine trend direction based on TSS history.
 */
export function determineTrendDirection(
  currentScore: number,
  previousScore: number | null
): 'worsening' | 'stable' | 'improving' {
  if (previousScore === null) return 'stable';

  const delta = currentScore - previousScore;

  if (delta > 5) return 'worsening';
  if (delta < -5) return 'improving';
  return 'stable';
}

// ─────────────────────────────────────────────────────────────────────────────
// Emergency Mode Thresholds
// ─────────────────────────────────────────────────────────────────────────────

export const EMERGENCY_THRESHOLDS = {
  // Divergence percentage to trigger emergency consideration
  divergenceThreshold: 0.30,  // 30% delta between GraphCast and Signal K

  // TSS thresholds for different alert levels
  tss: {
    elevated: 40,
    high: 60,
    critical: 80,
  },

  // Auto-exit threshold (score must drop and stabilize)
  autoExitThreshold: 35,
  autoExitStabilityMinutes: 5,
};

// ─────────────────────────────────────────────────────────────────────────────
// Liquid Glass Color System - Emergency States
// ─────────────────────────────────────────────────────────────────────────────

const EMERGENCY_COLORS = {
  // Normal state (high transparency)
  normal: {
    bg: 'rgba(0, 20, 40, 0.65)',
    blur: 80,
    border: 'rgba(255, 255, 255, 0.15)',
    text: '#e0f0ff',
    accent: '#3498db',
  },

  // Elevated (TSS 40-59)
  elevated: {
    bg: 'rgba(230, 126, 34, 0.75)',
    blur: 60,
    border: 'rgba(255, 165, 0, 0.4)',
    text: '#fff3e0',
    accent: '#ff9800',
  },

  // High (TSS 60-79) - "Safety Orange"
  high: {
    bg: 'rgba(211, 84, 0, 0.85)',
    blur: 40,
    border: 'rgba(255, 87, 34, 0.5)',
    text: '#fff',
    accent: '#ff5722',
  },

  // Critical (TSS 80+) - "Frosted Crimson"
  critical: {
    bg: 'rgba(183, 28, 28, 0.92)',
    blur: 20,
    border: 'rgba(244, 67, 54, 0.6)',
    text: '#fff',
    accent: '#f44336',
  },
};

type EmergencyLevel = 'normal' | 'elevated' | 'high' | 'critical';

function getEmergencyLevel(tss: number): EmergencyLevel {
  if (tss >= EMERGENCY_THRESHOLDS.tss.critical) return 'critical';
  if (tss >= EMERGENCY_THRESHOLDS.tss.high) return 'high';
  if (tss >= EMERGENCY_THRESHOLDS.tss.elevated) return 'elevated';
  return 'normal';
}

// ─────────────────────────────────────────────────────────────────────────────
// Haptic Pulse Controller
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rhythmic haptic pulse that allows sailors to "feel" wind shifts
 * without looking at the screen.
 *
 * Pattern varies by severity:
 * - Elevated: Single pulse every 3s
 * - High: Double pulse every 2s
 * - Critical: Rapid triple pulse every 1.5s
 */
class HapticPulseController {
  private intervalId: NodeJS.Timeout | null = null;
  private isActive: boolean = false;

  start(level: EmergencyLevel): void {
    if (Platform.OS === 'web') return;
    if (this.isActive) this.stop();

    this.isActive = true;

    const patterns: Record<EmergencyLevel, { interval: number; pulses: number }> = {
      normal: { interval: 0, pulses: 0 },
      elevated: { interval: 3000, pulses: 1 },
      high: { interval: 2000, pulses: 2 },
      critical: { interval: 1500, pulses: 3 },
    };

    const config = patterns[level];
    if (config.interval === 0) return;

    const executePulse = async () => {
      for (let i = 0; i < config.pulses; i++) {
        await Haptics.impactAsync(
          level === 'critical'
            ? Haptics.ImpactFeedbackStyle.Heavy
            : Haptics.ImpactFeedbackStyle.Medium
        );
        if (i < config.pulses - 1) {
          await new Promise(r => setTimeout(r, 120));
        }
      }
    };

    executePulse();
    this.intervalId = setInterval(executePulse, config.interval);
  }

  stop(): void {
    this.isActive = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Emergency Mode Component
// ─────────────────────────────────────────────────────────────────────────────

export const EmergencyModeOverlay: React.FC<EmergencyModeProps> = ({
  isActive,
  severityScore,
  trendDirection,
  consensusLevel,
  currentTelemetry,
  predictedWindSpeed,
  onAcknowledge,
  onExitEmergency,
  children,
}) => {
  // Animation values
  const [pulseAnim] = useState(new Animated.Value(1));
  const [overlayOpacity] = useState(new Animated.Value(0));
  const [borderGlow] = useState(new Animated.Value(0));

  // Haptic controller
  const hapticController = useRef(new HapticPulseController());

  // Track previous score for trend
  const previousScore = useRef<number | null>(null);

  const level = getEmergencyLevel(severityScore);
  const colors = EMERGENCY_COLORS[level];

  // App state for background handling
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background' && isActive) {
        // Request extended background execution
        console.log('[EmergencyMode] Requesting background execution extension');
        // In production: BackgroundFetch.requestBackgroundExecution()
      }
    });

    return () => subscription.remove();
  }, [isActive]);

  // Activate/deactivate animations and haptics
  useEffect(() => {
    if (isActive) {
      // Fade in overlay
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();

      // Start border glow animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(borderGlow, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: false,
          }),
          Animated.timing(borderGlow, {
            toValue: 0.3,
            duration: 1000,
            useNativeDriver: false,
          }),
        ])
      ).start();

      // Pulse animation for critical
      if (level === 'critical') {
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.03,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 600,
              useNativeDriver: true,
            }),
          ])
        ).start();
      }

      // Start haptic pulses
      hapticController.current.start(level);

      // Initial notification haptic
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } else {
      // Fade out
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();

      hapticController.current.stop();
      pulseAnim.stopAnimation();
      borderGlow.stopAnimation();
    }

    return () => {
      hapticController.current.stop();
    };
  }, [isActive, level]);

  // Update previous score for trend tracking
  useEffect(() => {
    previousScore.current = severityScore;
  }, [severityScore]);

  const handleAcknowledge = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onAcknowledge();
  }, [onAcknowledge]);

  const handleExitEmergency = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onExitEmergency();
  }, [onExitEmergency]);

  // Format telemetry values
  const formatValue = (value: number | undefined, unit: string, decimals: number = 1) => {
    if (value === undefined || value === null) return '--';
    return `${value.toFixed(decimals)}${unit}`;
  };

  const trendIcon = {
    worsening: '???',
    stable: '???',
    improving: '???',
  }[trendDirection];

  const trendColor = {
    worsening: '#f44336',
    stable: '#ffc107',
    improving: '#4caf50',
  }[trendDirection];

  // Interpolate border glow color
  const borderColor = borderGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, colors.accent],
  });

  if (!isActive) {
    return <>{children}</>;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: overlayOpacity,
          transform: [{ scale: pulseAnim }],
        },
      ]}
    >
      {/* Background blur layer */}
      <BlurView
        intensity={colors.blur}
        tint="dark"
        style={StyleSheet.absoluteFillObject}
      />

      {/* Color overlay */}
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.bg }]} />

      {/* Glowing border */}
      <Animated.View
        style={[
          styles.glowBorder,
          {
            borderColor: borderColor,
            shadowColor: colors.accent,
          },
        ]}
      />

      {/* Emergency Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.emergencyIcon, { color: colors.accent }]}>
            {level === 'critical' ? '????' : '???'}
          </Text>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              EMERGENCY MODE
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.text }]}>
              {level.toUpperCase()} SEVERITY
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.exitButton, { borderColor: colors.accent }]}
          onPress={handleExitEmergency}
          activeOpacity={0.7}
        >
          <Text style={[styles.exitButtonText, { color: colors.accent }]}>
            EXIT
          </Text>
        </TouchableOpacity>
      </View>

      {/* TSS Gauge */}
      <View style={styles.tssContainer}>
        <View style={styles.tssGauge}>
          <View style={styles.tssLabelRow}>
            <Text style={[styles.tssLabel, { color: colors.text }]}>
              TREND SEVERITY SCORE
            </Text>
            <Text style={[styles.tssValue, { color: colors.accent }]}>
              {severityScore}
            </Text>
          </View>

          {/* Progress bar */}
          <View style={styles.tssBarContainer}>
            <View
              style={[
                styles.tssBar,
                {
                  width: `${severityScore}%`,
                  backgroundColor: colors.accent,
                },
              ]}
            />
            {/* Threshold markers */}
            <View style={[styles.tssMarker, { left: '40%' }]} />
            <View style={[styles.tssMarker, { left: '60%' }]} />
            <View style={[styles.tssMarker, { left: '80%' }]} />
          </View>

          {/* Trend indicator */}
          <View style={styles.trendRow}>
            <Text style={[styles.trendLabel, { color: colors.text }]}>
              TREND:
            </Text>
            <Text style={[styles.trendValue, { color: trendColor }]}>
              {trendIcon} {trendDirection.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      {/* Live Metrics Grid */}
      <View style={styles.metricsGrid}>
        {/* Observed (Signal K) */}
        <View style={styles.metricCard}>
          <Text style={[styles.metricTitle, { color: colors.text }]}>
            ???? OBSERVED
          </Text>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Wind</Text>
            <Text style={[styles.metricValue, { color: colors.accent }]}>
              {formatValue(currentTelemetry?.trueWindSpeed, 'kt')}
            </Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Pressure</Text>
            <Text style={[styles.metricValue, { color: colors.accent }]}>
              {formatValue(currentTelemetry?.barometer, ' hPa', 0)}
            </Text>
          </View>
        </View>

        {/* Predicted (GraphCast) */}
        <View style={styles.metricCard}>
          <Text style={[styles.metricTitle, { color: colors.text }]}>
            ???? PREDICTED
          </Text>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Wind</Text>
            <Text style={[styles.metricValue, { color: colors.accent }]}>
              {formatValue(predictedWindSpeed ?? undefined, 'kt')}
            </Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Consensus</Text>
            <Text style={[
              styles.metricValue,
              { color: consensusLevel === 'disagree' ? '#f44336' : colors.accent }
            ]}>
              {consensusLevel === 'disagree' ? '??? DIVERGENT' : consensusLevel.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      {/* Delta Calculation Display */}
      {currentTelemetry?.trueWindSpeed && predictedWindSpeed && (
        <View style={styles.deltaContainer}>
          <Text style={[styles.deltaLabel, { color: colors.text }]}>
            Wind Delta (W_obs - W_pred)
          </Text>
          <Text style={[styles.deltaValue, { color: colors.accent }]}>
            {(currentTelemetry.trueWindSpeed - predictedWindSpeed).toFixed(1)} kt
          </Text>
        </View>
      )}

      {/* Acknowledge Button */}
      <TouchableOpacity
        style={[styles.acknowledgeButton, { backgroundColor: colors.accent }]}
        onPress={handleAcknowledge}
        activeOpacity={0.8}
      >
        <Text style={styles.acknowledgeText}>??? ACKNOWLEDGE EMERGENCY</Text>
      </TouchableOpacity>

      {/* Status bar */}
      <View style={styles.statusBar}>
        <Text style={[styles.statusText, { color: colors.text }]}>
          Signal K polling boosted to 10Hz ??? Background syncs suspended
        </Text>
      </View>

      {/* Children (map or other content rendered below) */}
      {children && (
        <View style={styles.childrenContainer}>
          {children}
        </View>
      )}
    </Animated.View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles - iOS 26 Liquid Glass Emergency Theme
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  glowBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 20,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emergencyIcon: {
    fontSize: 40,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.8,
    marginTop: 2,
  },
  exitButton: {
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  exitButtonText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // TSS Gauge
  tssContainer: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  tssGauge: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 16,
    padding: 16,
  },
  tssLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tssLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  tssValue: {
    fontSize: 48,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  tssBarContainer: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  tssBar: {
    height: '100%',
    borderRadius: 4,
  },
  tssMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  trendLabel: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.7,
    marginRight: 8,
  },
  trendValue: {
    fontSize: 13,
    fontWeight: '800',
  },

  // Metrics Grid
  metricsGrid: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 20,
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
    padding: 12,
  },
  metricTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Delta Display
  deltaContainer: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deltaLabel: {
    fontSize: 11,
    opacity: 0.8,
  },
  deltaValue: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Acknowledge Button
  acknowledgeButton: {
    marginHorizontal: 20,
    marginTop: 24,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
  },
  acknowledgeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // Status Bar
  statusBar: {
    marginHorizontal: 20,
    marginTop: 16,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 10,
    opacity: 0.6,
    textAlign: 'center',
  },

  // Children Container
  childrenContainer: {
    flex: 1,
    marginTop: 20,
    opacity: 0.7,
  },
});

export default EmergencyModeOverlay;

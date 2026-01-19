/**
 * Mariner's AI Grid - Night Watch Mode Component
 *
 * iOS 26 "Soft Blacks and Charcoals" dark mode implementation designed
 * to preserve the sailor's night vision while maintaining full AI
 * pattern-matching and emergency detection capabilities.
 *
 * Key Design Principles (2026 Dark Mode Standards):
 * - Primary surfaces: #0a0a0a to #1a1a1a (true blacks avoided for OLED uniformity)
 * - Accent colors: Red-shifted spectrum only (>620nm wavelength)
 * - Text: Warm off-whites (#e8e0d8) to reduce blue light
 * - Emergency states: Deep amber/red only (no bright whites)
 * - Minimum contrast ratios maintained for maritime safety
 *
 * Night Vision Science:
 * - Rhodopsin (rod photopigment) regenerates in ~30 minutes of darkness
 * - Blue/white light destroys night adaptation instantly
 * - Red light (>620nm) has minimal impact on scotopic vision
 * - Amber (~590nm) provides slightly better acuity while mostly preserving adaptation
 *
 * @module NightWatchMode
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
  Switch,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

import type { DangerLevel, TelemetrySnapshot } from '../services/PatternMatcher';
import type { ConsensusLevel } from './PatternAlert';
import {
  EmergencyState,
  calculateTrendSeverityScore,
  determineTrendDirection,
  EMERGENCY_THRESHOLDS,
  TrendSeverityInput,
} from './EmergencyMode';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// Night Watch Color System - 2026 "Soft Blacks" Standard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Night Watch color palette optimized for scotopic (night) vision preservation.
 * All colors are red-shifted to minimize rhodopsin bleaching.
 */
export const NIGHT_WATCH_COLORS = {
  // Primary surfaces - "Soft Blacks"
  background: {
    primary: '#0a0a0a',     // Near-black (not pure #000 for OLED uniformity)
    secondary: '#121212',   // Elevated surface
    tertiary: '#1a1a1a',    // Cards and containers
    elevated: '#222222',    // Modals and sheets
  },

  // Text - Warm off-whites (reduced blue)
  text: {
    primary: '#e8e0d8',     // Warm cream (main text)
    secondary: '#a89888',   // Muted warm gray
    tertiary: '#6b5b4b',    // Subtle labels
    disabled: '#3d3530',    // Disabled state
  },

  // Accent colors - Red-shifted spectrum only
  accent: {
    amber: '#cc8844',       // Primary accent (~590nm)
    amberDim: '#8b5a2b',    // Dimmed amber
    red: '#aa3333',         // Alert red (~650nm)
    redDim: '#662222',      // Dimmed red
    deepRed: '#880000',     // Critical state
    maroon: '#551111',      // Emergency background
  },

  // Status indicators
  status: {
    safe: '#4a6b35',        // Muted olive green
    caution: '#8b6914',     // Dark gold
    warning: '#a85000',     // Burnt orange
    danger: '#992222',      // Deep red
    emergency: '#cc0000',   // Bright red (only for critical)
  },

  // Glass effects - Night mode
  glass: {
    tint: 'rgba(10, 10, 10, 0.85)',
    border: 'rgba(136, 85, 51, 0.3)',  // Amber-tinted border
    highlight: 'rgba(204, 136, 68, 0.1)',
  },

  // Consensus indicators (night-adapted)
  consensus: {
    agree: '#4a6b35',       // Muted green
    partial: '#8b6914',     // Dark gold
    disagree: '#aa3333',    // Alert red
    unknown: '#4a4035',     // Warm gray
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Night Watch Emergency Colors
// ─────────────────────────────────────────────────────────────────────────────

const NIGHT_EMERGENCY_COLORS = {
  // Normal night state
  normal: {
    bg: 'rgba(10, 10, 10, 0.92)',
    blur: 20,
    border: NIGHT_WATCH_COLORS.glass.border,
    text: NIGHT_WATCH_COLORS.text.primary,
    accent: NIGHT_WATCH_COLORS.accent.amber,
  },

  // Elevated (TSS 40-59) - Amber warning
  elevated: {
    bg: 'rgba(26, 18, 10, 0.92)',
    blur: 15,
    border: 'rgba(139, 90, 43, 0.5)',
    text: NIGHT_WATCH_COLORS.text.primary,
    accent: NIGHT_WATCH_COLORS.accent.amber,
  },

  // High (TSS 60-79) - Deep amber/orange
  high: {
    bg: 'rgba(30, 15, 8, 0.94)',
    blur: 10,
    border: 'rgba(168, 80, 0, 0.6)',
    text: '#ffd8b0',
    accent: NIGHT_WATCH_COLORS.status.warning,
  },

  // Critical (TSS 80+) - Deep red (still night-safe)
  critical: {
    bg: 'rgba(35, 8, 8, 0.96)',
    blur: 5,
    border: 'rgba(153, 34, 34, 0.7)',
    text: '#ffcccc',
    accent: NIGHT_WATCH_COLORS.status.danger,
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
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface NightWatchModeProps {
  isActive: boolean;
  isEmergency: boolean;
  severityScore: number;
  trendDirection: 'worsening' | 'stable' | 'improving';
  consensusLevel: ConsensusLevel;
  currentTelemetry: TelemetrySnapshot | null;
  predictedWindSpeed: number | null;
  onAcknowledge: () => void;
  onExitEmergency: () => void;
  onToggleNightMode: (enabled: boolean) => void;
  children?: React.ReactNode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Night Watch Haptic Controller
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gentler haptic patterns for night watch - less jarring than daytime.
 * Uses softer impact styles to avoid startling a drowsy watchkeeper.
 */
class NightHapticController {
  private intervalId: NodeJS.Timeout | null = null;
  private isActive: boolean = false;

  start(level: EmergencyLevel): void {
    if (Platform.OS === 'web') return;
    if (this.isActive) this.stop();

    this.isActive = true;

    // Longer intervals, softer haptics for night watch
    const patterns: Record<EmergencyLevel, { interval: number; pulses: number; style: Haptics.ImpactFeedbackStyle }> = {
      normal: { interval: 0, pulses: 0, style: Haptics.ImpactFeedbackStyle.Light },
      elevated: { interval: 5000, pulses: 1, style: Haptics.ImpactFeedbackStyle.Light },
      high: { interval: 3000, pulses: 2, style: Haptics.ImpactFeedbackStyle.Medium },
      critical: { interval: 2000, pulses: 3, style: Haptics.ImpactFeedbackStyle.Medium },
    };

    const config = patterns[level];
    if (config.interval === 0) return;

    const executePulse = async () => {
      for (let i = 0; i < config.pulses; i++) {
        await Haptics.impactAsync(config.style);
        if (i < config.pulses - 1) {
          await new Promise(r => setTimeout(r, 200)); // Slower pulse spacing
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
// Night Watch Status Bar Component
// ─────────────────────────────────────────────────────────────────────────────

interface NightStatusBarProps {
  isEmergency: boolean;
  consensusLevel: ConsensusLevel;
  pollingRate: number;
  signalKStatus: 'connected' | 'disconnected' | 'stale';
}

const NightStatusBar: React.FC<NightStatusBarProps> = ({
  isEmergency,
  consensusLevel,
  pollingRate,
  signalKStatus,
}) => {
  const consensusColors = {
    agree: NIGHT_WATCH_COLORS.consensus.agree,
    partial: NIGHT_WATCH_COLORS.consensus.partial,
    disagree: NIGHT_WATCH_COLORS.consensus.disagree,
    unknown: NIGHT_WATCH_COLORS.consensus.unknown,
  };

  const statusColors = {
    connected: NIGHT_WATCH_COLORS.consensus.agree,
    disconnected: NIGHT_WATCH_COLORS.status.danger,
    stale: NIGHT_WATCH_COLORS.status.caution,
  };

  return (
    <View style={nightStyles.statusBar}>
      {/* Night Mode Indicator */}
      <View style={nightStyles.statusItem}>
        <Text style={nightStyles.statusIcon}>🌙</Text>
        <Text style={nightStyles.statusLabel}>NIGHT</Text>
      </View>

      {/* Signal K Status */}
      <View style={nightStyles.statusItem}>
        <View style={[nightStyles.statusDot, { backgroundColor: statusColors[signalKStatus] }]} />
        <Text style={nightStyles.statusLabel}>
          SK {pollingRate}Hz
        </Text>
      </View>

      {/* Consensus Status */}
      <View style={nightStyles.statusItem}>
        <View style={[nightStyles.statusDot, { backgroundColor: consensusColors[consensusLevel] }]} />
        <Text style={nightStyles.statusLabel}>
          {consensusLevel === 'disagree' ? 'DIV' : consensusLevel.toUpperCase().slice(0, 3)}
        </Text>
      </View>

      {/* Emergency Indicator */}
      {isEmergency && (
        <View style={[nightStyles.statusItem, nightStyles.emergencyIndicator]}>
          <Text style={nightStyles.emergencyText}>EMRG</Text>
        </View>
      )}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Night Watch Metrics Card
// ─────────────────────────────────────────────────────────────────────────────

interface NightMetricsCardProps {
  title: string;
  icon: string;
  metrics: Array<{ label: string; value: string; highlight?: boolean }>;
  accentColor: string;
}

const NightMetricsCard: React.FC<NightMetricsCardProps> = ({
  title,
  icon,
  metrics,
  accentColor,
}) => (
  <View style={nightStyles.metricsCard}>
    <View style={nightStyles.metricsHeader}>
      <Text style={nightStyles.metricsIcon}>{icon}</Text>
      <Text style={[nightStyles.metricsTitle, { color: accentColor }]}>{title}</Text>
    </View>
    {metrics.map((metric, idx) => (
      <View key={idx} style={nightStyles.metricRow}>
        <Text style={nightStyles.metricLabel}>{metric.label}</Text>
        <Text style={[
          nightStyles.metricValue,
          metric.highlight && { color: accentColor }
        ]}>
          {metric.value}
        </Text>
      </View>
    ))}
  </View>
);

// ─────────────────────────────────────────────────────────────────────────────
// Night Watch Mode Overlay Component
// ─────────────────────────────────────────────────────────────────────────────

export const NightWatchModeOverlay: React.FC<NightWatchModeProps> = ({
  isActive,
  isEmergency,
  severityScore,
  trendDirection,
  consensusLevel,
  currentTelemetry,
  predictedWindSpeed,
  onAcknowledge,
  onExitEmergency,
  onToggleNightMode,
  children,
}) => {
  // Animation values
  const [pulseAnim] = useState(new Animated.Value(1));
  const [overlayOpacity] = useState(new Animated.Value(0));

  // Haptic controller
  const hapticController = useRef(new NightHapticController());

  const level = getEmergencyLevel(severityScore);
  const colors = isEmergency ? NIGHT_EMERGENCY_COLORS[level] : NIGHT_EMERGENCY_COLORS.normal;

  // Fade in/out animation
  useEffect(() => {
    Animated.timing(overlayOpacity, {
      toValue: isActive ? 1 : 0,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [isActive]);

  // Emergency state haptics
  useEffect(() => {
    if (isEmergency && isActive) {
      hapticController.current.start(level);

      // Gentle pulse animation for critical only
      if (level === 'critical') {
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.01,
              duration: 1000,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 1000,
              useNativeDriver: true,
            }),
          ])
        ).start();
      }
    } else {
      hapticController.current.stop();
      pulseAnim.stopAnimation();
    }

    return () => {
      hapticController.current.stop();
    };
  }, [isEmergency, isActive, level]);

  const handleAcknowledge = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onAcknowledge();
  }, [onAcknowledge]);

  // Format telemetry values
  const formatValue = (value: number | undefined, unit: string, decimals: number = 1) => {
    if (value === undefined || value === null) return '--';
    return `${value.toFixed(decimals)}${unit}`;
  };

  const trendIcon = {
    worsening: '↑',
    stable: '→',
    improving: '↓',
  }[trendDirection];

  const trendColor = {
    worsening: NIGHT_WATCH_COLORS.status.danger,
    stable: NIGHT_WATCH_COLORS.accent.amber,
    improving: NIGHT_WATCH_COLORS.status.safe,
  }[trendDirection];

  if (!isActive) {
    return <>{children}</>;
  }

  return (
    <Animated.View
      style={[
        nightStyles.container,
        {
          opacity: overlayOpacity,
          transform: [{ scale: pulseAnim }],
          backgroundColor: colors.bg,
        },
      ]}
    >
      {/* Subtle blur layer */}
      <BlurView
        intensity={colors.blur}
        tint="dark"
        style={StyleSheet.absoluteFillObject}
      />

      {/* Night Watch Header */}
      <View style={nightStyles.header}>
        <View style={nightStyles.headerLeft}>
          <Text style={nightStyles.moonIcon}>🌙</Text>
          <View>
            <Text style={[nightStyles.headerTitle, { color: colors.text }]}>
              NIGHT WATCH
            </Text>
            {isEmergency && (
              <Text style={[nightStyles.headerSubtitle, { color: colors.accent }]}>
                ⚠ {level.toUpperCase()} ALERT
              </Text>
            )}
          </View>
        </View>

        <View style={nightStyles.headerControls}>
          <Switch
            value={true}
            onValueChange={onToggleNightMode}
            trackColor={{
              false: NIGHT_WATCH_COLORS.background.tertiary,
              true: NIGHT_WATCH_COLORS.accent.amberDim,
            }}
            thumbColor={NIGHT_WATCH_COLORS.accent.amber}
          />
        </View>
      </View>

      {/* Status Bar */}
      <NightStatusBar
        isEmergency={isEmergency}
        consensusLevel={consensusLevel}
        pollingRate={isEmergency ? 10 : 1}
        signalKStatus={currentTelemetry ? 'connected' : 'disconnected'}
      />

      {/* TSS Display (Night-adapted) */}
      <View style={nightStyles.tssContainer}>
        <View style={nightStyles.tssHeader}>
          <Text style={nightStyles.tssLabel}>SEVERITY</Text>
          <Text style={[nightStyles.tssValue, { color: colors.accent }]}>
            {severityScore}
          </Text>
        </View>

        {/* Minimalist progress bar */}
        <View style={nightStyles.tssBarBg}>
          <View
            style={[
              nightStyles.tssBar,
              {
                width: `${severityScore}%`,
                backgroundColor: colors.accent,
              },
            ]}
          />
        </View>

        {/* Trend */}
        <View style={nightStyles.trendRow}>
          <Text style={nightStyles.trendLabel}>TREND</Text>
          <Text style={[nightStyles.trendValue, { color: trendColor }]}>
            {trendIcon} {trendDirection.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Metrics Grid */}
      <View style={nightStyles.metricsGrid}>
        <NightMetricsCard
          title="OBSERVED"
          icon="⚓"
          accentColor={colors.accent}
          metrics={[
            {
              label: 'Wind',
              value: formatValue(currentTelemetry?.trueWindSpeed, 'kt'),
              highlight: true,
            },
            {
              label: 'Pressure',
              value: formatValue(currentTelemetry?.barometer, 'hPa', 0),
            },
            {
              label: 'Heading',
              value: formatValue(currentTelemetry?.heading, '°', 0),
            },
          ]}
        />

        <NightMetricsCard
          title="PREDICTED"
          icon="🌐"
          accentColor={colors.accent}
          metrics={[
            {
              label: 'Wind',
              value: formatValue(predictedWindSpeed ?? undefined, 'kt'),
              highlight: true,
            },
            {
              label: 'Consensus',
              value: consensusLevel === 'disagree' ? '✗ DIV' : '✓ OK',
              highlight: consensusLevel === 'disagree',
            },
            {
              label: 'Delta',
              value: currentTelemetry?.trueWindSpeed && predictedWindSpeed
                ? `${(currentTelemetry.trueWindSpeed - predictedWindSpeed).toFixed(1)}kt`
                : '--',
            },
          ]}
        />
      </View>

      {/* Emergency Actions */}
      {isEmergency && (
        <View style={nightStyles.emergencyActions}>
          <TouchableOpacity
            style={[nightStyles.acknowledgeBtn, { borderColor: colors.accent }]}
            onPress={handleAcknowledge}
            activeOpacity={0.7}
          >
            <Text style={[nightStyles.acknowledgeBtnText, { color: colors.accent }]}>
              ✓ ACKNOWLEDGE
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={nightStyles.exitBtn}
            onPress={onExitEmergency}
            activeOpacity={0.7}
          >
            <Text style={nightStyles.exitBtnText}>EXIT</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Night Mode Info Footer */}
      <View style={nightStyles.footer}>
        <Text style={nightStyles.footerText}>
          Red-shifted display • Night vision preserved
        </Text>
      </View>

      {/* Children (map rendered with night filter) */}
      {children && (
        <View style={nightStyles.childrenContainer}>
          {children}
        </View>
      )}
    </Animated.View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Night Watch Styles
// ─────────────────────────────────────────────────────────────────────────────

const nightStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  moonIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    color: NIGHT_WATCH_COLORS.text.primary,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Status Bar
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: NIGHT_WATCH_COLORS.background.secondary,
    gap: 16,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusIcon: {
    fontSize: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: NIGHT_WATCH_COLORS.text.secondary,
    letterSpacing: 1,
  },
  emergencyIndicator: {
    backgroundColor: NIGHT_WATCH_COLORS.accent.redDim,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  emergencyText: {
    fontSize: 10,
    fontWeight: '800',
    color: NIGHT_WATCH_COLORS.status.emergency,
    letterSpacing: 1,
  },

  // TSS Display
  tssContainer: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: NIGHT_WATCH_COLORS.background.tertiary,
    borderRadius: 12,
    padding: 16,
  },
  tssHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tssLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: NIGHT_WATCH_COLORS.text.secondary,
  },
  tssValue: {
    fontSize: 36,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  tssBarBg: {
    height: 4,
    backgroundColor: NIGHT_WATCH_COLORS.background.elevated,
    borderRadius: 2,
    overflow: 'hidden',
  },
  tssBar: {
    height: '100%',
    borderRadius: 2,
  },
  trendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  trendLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: NIGHT_WATCH_COLORS.text.tertiary,
  },
  trendValue: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Metrics Grid
  metricsGrid: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 16,
    gap: 12,
  },
  metricsCard: {
    flex: 1,
    backgroundColor: NIGHT_WATCH_COLORS.background.tertiary,
    borderRadius: 12,
    padding: 12,
  },
  metricsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  metricsIcon: {
    fontSize: 14,
  },
  metricsTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  metricLabel: {
    fontSize: 11,
    color: NIGHT_WATCH_COLORS.text.tertiary,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
    color: NIGHT_WATCH_COLORS.text.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Emergency Actions
  emergencyActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 20,
    gap: 12,
  },
  acknowledgeBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  acknowledgeBtnText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  exitBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  exitBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: NIGHT_WATCH_COLORS.text.tertiary,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 10,
    color: NIGHT_WATCH_COLORS.text.tertiary,
  },

  // Children Container
  childrenContainer: {
    flex: 1,
    marginTop: 20,
    opacity: 0.8,
  },
});

export default NightWatchModeOverlay;

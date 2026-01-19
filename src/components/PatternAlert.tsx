/**
 * Mariner's AI Grid - Pattern Alert Component
 *
 * Tactical "Liquid Glass" design with NativeWind v4 styling.
 * Features:
 * - IMO color-coded danger levels with glass morphism
 * - Consensus View: Local Pattern Match vs GraphCast Prediction
 * - Haptic feedback for critical alerts
 * - vibeSearch integration for similar historical outcomes
 *
 * @module PatternAlert
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
  Platform,
  StyleSheet,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

import type { PatternAlert as PatternAlertType, DangerLevel } from '../services/PatternMatcher';
import type { AtmosphericPattern } from '../services/VecDB';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ConsensusData {
  localMatch: {
    patternId: string;
    label: string;
    similarity: number;
    outcome: string;
  };
  graphCastPrediction?: {
    outcome: string;
    confidence: number;
    validTime: Date;
  };
  vibeSearchResults?: Array<AtmosphericPattern & { similarity: number }>;
}

export type ConsensusLevel = 'agree' | 'partial' | 'disagree' | 'unknown';

// ─────────────────────────────────────────────────────────────────────────────
// IMO Standard Alert Colors (Liquid Glass variants)
// ─────────────────────────────────────────────────────────────────────────────

const ALERT_COLORS: Record<DangerLevel, {
  bg: string;
  bgRgba: string;
  border: string;
  text: string;
  icon: string;
}> = {
  info: {
    bg: '#1a237e',
    bgRgba: 'rgba(26, 35, 126, 0.85)',
    border: '#3949ab',
    text: '#e8eaf6',
    icon: 'ℹ️',
  },
  caution: {
    bg: '#33691e',
    bgRgba: 'rgba(51, 105, 30, 0.85)',
    border: '#558b2f',
    text: '#f1f8e9',
    icon: '⚠️',
  },
  warning: {
    bg: '#e65100',
    bgRgba: 'rgba(230, 81, 0, 0.85)',
    border: '#ff9800',
    text: '#fff3e0',
    icon: '⚠️',
  },
  danger: {
    bg: '#b71c1c',
    bgRgba: 'rgba(183, 28, 28, 0.85)',
    border: '#f44336',
    text: '#ffebee',
    icon: '🚨',
  },
  emergency: {
    bg: '#4a148c',
    bgRgba: 'rgba(74, 20, 140, 0.85)',
    border: '#9c27b0',
    text: '#f3e5f5',
    icon: '🆘',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Consensus Utilities
// ─────────────────────────────────────────────────────────────────────────────

function calculateConsensusLevel(consensus?: ConsensusData): ConsensusLevel {
  if (!consensus?.graphCastPrediction) return 'unknown';

  const localOutcome = consensus.localMatch.outcome.toLowerCase();
  const gcOutcome = consensus.graphCastPrediction.outcome.toLowerCase();

  // Exact or near-exact match
  if (localOutcome === gcOutcome ||
      localOutcome.includes(gcOutcome) ||
      gcOutcome.includes(localOutcome)) {
    return 'agree';
  }

  // Partial agreement (same weather family)
  const weatherFamilies = [
    ['gale', 'storm', 'squall', 'wind'],
    ['rain', 'precipitation', 'shower'],
    ['wave', 'swell', 'sea'],
  ];

  for (const family of weatherFamilies) {
    const localInFamily = family.some(w => localOutcome.includes(w));
    const gcInFamily = family.some(w => gcOutcome.includes(w));
    if (localInFamily && gcInFamily) return 'partial';
  }

  return 'disagree';
}

const CONSENSUS_COLORS: Record<ConsensusLevel, {
  bg: string;
  text: string;
  label: string;
  icon: string;
}> = {
  agree: {
    bg: 'rgba(34, 197, 94, 0.2)',
    text: '#4ade80',
    label: 'CONSENSUS',
    icon: '✓',
  },
  partial: {
    bg: 'rgba(245, 158, 11, 0.2)',
    text: '#fbbf24',
    label: 'PARTIAL',
    icon: '≈',
  },
  disagree: {
    bg: 'rgba(239, 68, 68, 0.2)',
    text: '#f87171',
    label: 'DIVERGENT',
    icon: '✗',
  },
  unknown: {
    bg: 'rgba(156, 163, 175, 0.2)',
    text: '#9ca3af',
    label: 'LOCAL ONLY',
    icon: '?',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Consensus View Component
// ─────────────────────────────────────────────────────────────────────────────

interface ConsensusViewProps {
  consensus: ConsensusData;
  textColor: string;
}

const ConsensusView: React.FC<ConsensusViewProps> = ({ consensus, textColor }) => {
  const level = calculateConsensusLevel(consensus);
  const colors = CONSENSUS_COLORS[level];

  return (
    <View style={styles.consensusContainer}>
      {/* Glass header */}
      <View style={[styles.consensusHeader, { backgroundColor: colors.bg }]}>
        <View style={styles.consensusHeaderLeft}>
          <Text style={[styles.consensusIcon, { color: colors.text }]}>{colors.icon}</Text>
          <Text style={[styles.consensusLabel, { color: colors.text }]}>
            {colors.label}
          </Text>
        </View>
        {consensus.graphCastPrediction && (
          <Text style={styles.consensusConfidence}>
            GraphCast {Math.round(consensus.graphCastPrediction.confidence * 100)}% conf.
          </Text>
        )}
      </View>

      {/* Comparison grid */}
      <View style={styles.consensusGrid}>
        <View style={styles.consensusColumn}>
          {/* Local Pattern Column */}
          <View style={[styles.consensusColumnInner, styles.consensusColumnLeft]}>
            <Text style={styles.consensusColumnTitle}>🧭 Local Pattern</Text>
            <Text style={[styles.consensusColumnLabel, { color: textColor }]}>
              {consensus.localMatch.label}
            </Text>
            <Text style={styles.consensusColumnOutcome}>
              {consensus.localMatch.outcome}
            </Text>
            <View style={styles.consensusBadge}>
              <Text style={styles.consensusBadgeText}>
                {Math.round(consensus.localMatch.similarity * 100)}% match
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.consensusColumn}>
          {/* GraphCast Column */}
          <View style={styles.consensusColumnInner}>
            <Text style={styles.consensusColumnTitle}>🌐 GraphCast</Text>
            {consensus.graphCastPrediction ? (
              <>
                <Text style={[styles.consensusColumnLabel, { color: textColor }]}>
                  AI Forecast
                </Text>
                <Text style={styles.consensusColumnOutcome}>
                  {consensus.graphCastPrediction.outcome}
                </Text>
                <View style={styles.consensusBadge}>
                  <Text style={styles.consensusBadgeText}>
                    {Math.round(consensus.graphCastPrediction.confidence * 100)}% conf.
                  </Text>
                </View>
              </>
            ) : (
              <Text style={styles.consensusNoData}>
                No GraphCast data for this region/time
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Historical Matches from vibeSearch */}
      {consensus.vibeSearchResults && consensus.vibeSearchResults.length > 0 && (
        <View style={styles.vibeSearchContainer}>
          <Text style={styles.vibeSearchTitle}>
            📊 Similar Historical Events ({consensus.vibeSearchResults.length})
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {consensus.vibeSearchResults.slice(0, 5).map((result, idx) => (
              <View key={result.id || idx} style={styles.vibeSearchCard}>
                <Text style={styles.vibeSearchSimilarity}>
                  {Math.round(result.similarity * 100)}% similar
                </Text>
                <Text style={styles.vibeSearchOutcome} numberOfLines={2}>
                  {result.outcome || 'Unknown outcome'}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface PatternAlertProps {
  alert: PatternAlertType;
  consensus?: ConsensusData;
  onAcknowledge: (alertId: string) => void;
  onDismiss?: () => void;
  expanded?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern Alert Card Component
// ─────────────────────────────────────────────────────────────────────────────

export const PatternAlertCard: React.FC<PatternAlertProps> = ({
  alert,
  consensus,
  onAcknowledge,
  onDismiss,
  expanded: initialExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [slideAnim] = useState(new Animated.Value(-100));
  const [pulseAnim] = useState(new Animated.Value(1));

  const colors = ALERT_COLORS[alert.level];

  // Slide in animation
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      tension: 50,
      friction: 8,
      useNativeDriver: true,
    }).start();

    // Haptic feedback for dangerous alerts
    if (Platform.OS !== 'web') {
      if (alert.level === 'emergency') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (alert.level === 'danger') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (alert.level === 'warning') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // Extra haptic feedback for DIVERGENT consensus (local vs GraphCast disagree)
      const consensusLevel = calculateConsensusLevel(consensus);
      if (consensusLevel === 'disagree') {
        // Double-tap haptic pattern for divergence
        setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          setTimeout(() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          }, 150);
        }, 300);
      }
    }

    // Pulse animation for critical alerts
    if (alert.level === 'danger' || alert.level === 'emergency') {
      const pulse = Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.02,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]);

      Animated.loop(pulse).start();
    }

    return () => {
      pulseAnim.stopAnimation();
    };
  }, [alert.level]);

  const handleAcknowledge = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onAcknowledge(alert.id);
  }, [alert.id, onAcknowledge]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const similarityPercent = Math.round(alert.matchedPattern.similarity * 100);
  const consensusLevel = calculateConsensusLevel(consensus);

  return (
    <Animated.View
      style={[
        styles.cardContainer,
        {
          transform: [
            { translateY: slideAnim },
            { scale: pulseAnim },
          ],
        },
      ]}
    >
      {/* Glass background with blur */}
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />

      {/* Color overlay */}
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.bgRgba }]} />

      {/* Content container */}
      <View style={[styles.cardContent, { borderColor: colors.border }]}>
        {/* Header */}
        <TouchableOpacity
          style={styles.cardHeader}
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.8}
        >
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.cardIcon}>{colors.icon}</Text>
            <View style={styles.cardTitleContainer}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {alert.title}
              </Text>
              <Text style={[styles.cardSubtitle, { color: colors.text }]}>
                {similarityPercent}% pattern match • {formatTime(alert.timestamp)}
              </Text>
            </View>
          </View>

          <View style={styles.cardHeaderRight}>
            {/* Consensus badge in header */}
            {consensus && (
              <View style={[styles.headerBadge, { backgroundColor: CONSENSUS_COLORS[consensusLevel].bg }]}>
                <Text style={[styles.headerBadgeText, { color: CONSENSUS_COLORS[consensusLevel].text }]}>
                  {CONSENSUS_COLORS[consensusLevel].icon}
                </Text>
              </View>
            )}
            <Text style={[styles.expandIcon, { color: colors.text }]}>
              {expanded ? '▼' : '▶'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Expanded Content */}
        {expanded && (
          <View style={styles.expandedContent}>
            {/* Description */}
            <Text style={[styles.description, { color: colors.text }]}>
              {alert.description}
            </Text>

            {/* Time Estimate */}
            {alert.estimatedOnset && (
              <View style={styles.onsetBadge}>
                <Text style={styles.onsetLabel}>⏱ Estimated Onset</Text>
                <Text style={styles.onsetValue}>{alert.estimatedOnset}</Text>
              </View>
            )}

            {/* Consensus View */}
            {consensus && (
              <ConsensusView consensus={consensus} textColor={colors.text} />
            )}

            {/* Recommendations */}
            <View style={styles.recommendationsContainer}>
              <Text style={[styles.recommendationsTitle, { color: colors.text }]}>
                Recommended Actions
              </Text>
              <ScrollView style={styles.recommendationsList} nestedScrollEnabled>
                {alert.recommendations.map((rec, index) => (
                  <View key={index} style={styles.recommendationItem}>
                    <View style={styles.recommendationNumber}>
                      <Text style={styles.recommendationNumberText}>{index + 1}</Text>
                    </View>
                    <Text style={[styles.recommendationText, { color: colors.text }]}>
                      {rec}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>

            {/* Pattern Details */}
            <View style={styles.patternDetails}>
              <Text style={[styles.patternDetailsText, { color: colors.text }]}>
                Matched Pattern: {alert.matchedPattern.label || alert.matchedPattern.id}
              </Text>
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.acknowledgeButton, { borderColor: colors.border }]}
                onPress={handleAcknowledge}
                activeOpacity={0.7}
              >
                <Text style={[styles.acknowledgeText, { color: colors.text }]}>
                  ✓ Acknowledge
                </Text>
              </TouchableOpacity>

              {onDismiss && (
                <TouchableOpacity style={styles.dismissButton} onPress={onDismiss} activeOpacity={0.7}>
                  <Text style={styles.dismissText}>Dismiss</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>
    </Animated.View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Alert Stack (Multiple Alerts)
// ─────────────────────────────────────────────────────────────────────────────

interface AlertStackProps {
  alerts: PatternAlertType[];
  consensusMap?: Map<string, ConsensusData>;
  onAcknowledge: (alertId: string) => void;
  maxVisible?: number;
}

export const PatternAlertStack: React.FC<AlertStackProps> = ({
  alerts,
  consensusMap,
  onAcknowledge,
  maxVisible = 3,
}) => {
  const visibleAlerts = alerts.slice(0, maxVisible);
  const hiddenCount = Math.max(0, alerts.length - maxVisible);

  if (alerts.length === 0) return null;

  return (
    <View style={styles.stackContainer}>
      {visibleAlerts.map((alert, index) => (
        <PatternAlertCard
          key={alert.id}
          alert={alert}
          consensus={consensusMap?.get(alert.id)}
          onAcknowledge={onAcknowledge}
          expanded={index === 0}
        />
      ))}

      {hiddenCount > 0 && (
        <View style={styles.hiddenCounter}>
          <Text style={styles.hiddenCounterText}>
            +{hiddenCount} more alert{hiddenCount > 1 ? 's' : ''}
          </Text>
        </View>
      )}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles - Liquid Glass Aesthetic
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Card
  cardContainer: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  cardContent: {
    borderWidth: 2,
    borderRadius: 20,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  cardTitleContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardSubtitle: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 2,
  },
  headerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 12,
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  expandIcon: {
    fontSize: 14,
  },

  // Expanded Content
  expandedContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  onsetBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  onsetLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  onsetValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },

  // Consensus View
  consensusContainer: {
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  consensusHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  consensusHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  consensusIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  consensusLabel: {
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 2,
  },
  consensusConfidence: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 11,
  },
  consensusGrid: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    padding: 16,
    flexDirection: 'row',
  },
  consensusColumn: {
    flex: 1,
  },
  consensusColumnInner: {
    paddingLeft: 12,
  },
  consensusColumnLeft: {
    paddingLeft: 0,
    paddingRight: 12,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.1)',
  },
  consensusColumnTitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  consensusColumnLabel: {
    fontWeight: '600',
    fontSize: 13,
    marginBottom: 4,
  },
  consensusColumnOutcome: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    marginBottom: 8,
  },
  consensusBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  consensusBadgeText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  consensusNoData: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 11,
    fontStyle: 'italic',
  },

  // Vibe Search
  vibeSearchContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  vibeSearchTitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  vibeSearchCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 8,
    marginRight: 8,
    minWidth: 120,
  },
  vibeSearchSimilarity: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 10,
  },
  vibeSearchOutcome: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },

  // Recommendations
  recommendationsContainer: {
    marginTop: 16,
  },
  recommendationsTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 12,
  },
  recommendationsList: {
    maxHeight: 150,
  },
  recommendationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  recommendationNumber: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  recommendationNumberText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  recommendationText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },

  // Pattern Details
  patternDetails: {
    marginTop: 16,
    marginBottom: 16,
    opacity: 0.6,
  },
  patternDetailsText: {
    fontSize: 11,
    fontStyle: 'italic',
  },

  // Actions
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  acknowledgeButton: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  acknowledgeText: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  dismissButton: {
    marginLeft: 12,
    padding: 14,
  },
  dismissText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
  },

  // Stack
  stackContainer: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  hiddenCounter: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 4,
  },
  hiddenCounterText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default PatternAlertCard;

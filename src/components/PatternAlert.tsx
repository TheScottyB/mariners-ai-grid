/**
 * Mariner's AI Grid - Pattern Alert Component
 *
 * Displays weather pattern match alerts with:
 * - Color-coded danger levels (IMO standard colors)
 * - Haptic feedback for critical alerts
 * - Expandable recommendations
 * - Acknowledgment flow
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import type { PatternAlert as PatternAlertType, DangerLevel } from '../services/PatternMatcher';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// IMO Standard Alert Colors
// ─────────────────────────────────────────────────────────────────────────────

const ALERT_COLORS: Record<DangerLevel, { bg: string; border: string; text: string; icon: string }> = {
  info: {
    bg: '#1a237e',      // Deep blue
    border: '#3949ab',
    text: '#e8eaf6',
    icon: 'ℹ️',
  },
  caution: {
    bg: '#33691e',      // Green (proceeding with caution)
    border: '#558b2f',
    text: '#f1f8e9',
    icon: '⚠️',
  },
  warning: {
    bg: '#e65100',      // Amber/Orange (IMO warning)
    border: '#ff9800',
    text: '#fff3e0',
    icon: '⚠️',
  },
  danger: {
    bg: '#b71c1c',      // Red (IMO danger)
    border: '#f44336',
    text: '#ffebee',
    icon: '🚨',
  },
  emergency: {
    bg: '#4a148c',      // Purple (catastrophic/MAYDAY)
    border: '#9c27b0',
    text: '#f3e5f5',
    icon: '🆘',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface PatternAlertProps {
  alert: PatternAlertType;
  onAcknowledge: (alertId: string) => void;
  onDismiss?: () => void;
  expanded?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const PatternAlertCard: React.FC<PatternAlertProps> = ({
  alert,
  onAcknowledge,
  onDismiss,
  expanded: initialExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(initialExpanded);
  const slideAnim = useState(new Animated.Value(-100))[0];
  const pulseAnim = useState(new Animated.Value(1))[0];

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

  const handleAcknowledge = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onAcknowledge(alert.id);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const similarityPercent = Math.round(alert.matchedPattern.similarity * 100);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          transform: [
            { translateY: slideAnim },
            { scale: pulseAnim },
          ],
        },
      ]}
    >
      {/* Header */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.8}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.icon}>{colors.icon}</Text>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>
              {alert.title}
            </Text>
            <Text style={[styles.subtitle, { color: colors.text }]}>
              {similarityPercent}% pattern match • {formatTime(alert.timestamp)}
            </Text>
          </View>
        </View>

        <Text style={[styles.expandIcon, { color: colors.text }]}>
          {expanded ? '▼' : '▶'}
        </Text>
      </TouchableOpacity>

      {/* Expanded Content */}
      {expanded && (
        <View style={styles.content}>
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

          {/* Recommendations */}
          <View style={styles.recommendationsContainer}>
            <Text style={[styles.recommendationsTitle, { color: colors.text }]}>
              Recommended Actions:
            </Text>
            <ScrollView style={styles.recommendationsList} nestedScrollEnabled>
              {alert.recommendations.map((rec, index) => (
                <View key={index} style={styles.recommendationItem}>
                  <Text style={styles.recommendationNumber}>{index + 1}</Text>
                  <Text style={[styles.recommendationText, { color: colors.text }]}>
                    {rec}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Pattern Details */}
          <View style={styles.patternDetails}>
            <Text style={[styles.detailsLabel, { color: colors.text }]}>
              Matched Pattern: {alert.matchedPattern.label || alert.matchedPattern.id}
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.acknowledgeButton, { borderColor: colors.border }]}
              onPress={handleAcknowledge}
            >
              <Text style={[styles.acknowledgeText, { color: colors.text }]}>
                ✓ Acknowledge
              </Text>
            </TouchableOpacity>

            {onDismiss && (
              <TouchableOpacity
                style={styles.dismissButton}
                onPress={onDismiss}
              >
                <Text style={styles.dismissText}>Dismiss</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </Animated.View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Alert Stack (Multiple Alerts)
// ─────────────────────────────────────────────────────────────────────────────

interface AlertStackProps {
  alerts: PatternAlertType[];
  onAcknowledge: (alertId: string) => void;
  maxVisible?: number;
}

export const PatternAlertStack: React.FC<AlertStackProps> = ({
  alerts,
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
          onAcknowledge={onAcknowledge}
          expanded={index === 0} // First alert expanded by default
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
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderWidth: 2,
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    fontSize: 28,
    marginRight: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    opacity: 0.8,
    marginTop: 2,
  },
  expandIcon: {
    fontSize: 14,
    marginLeft: 8,
  },
  content: {
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
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  onsetLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  onsetValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  recommendationsContainer: {
    marginBottom: 16,
  },
  recommendationsTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
    color: '#fff',
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 12,
    fontWeight: '700',
    marginRight: 10,
  },
  recommendationText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  patternDetails: {
    marginBottom: 16,
    opacity: 0.7,
  },
  detailsLabel: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  acknowledgeButton: {
    borderWidth: 2,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    flex: 1,
    alignItems: 'center',
  },
  acknowledgeText: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  dismissButton: {
    marginLeft: 12,
    padding: 12,
  },
  dismissText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
  },
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

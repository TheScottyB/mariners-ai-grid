/**
 * Mariner's AI Grid - Pattern Alert Component
 *
 * Tactical "Liquid Glass" design with NativeWind styling.
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
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { styled } from 'nativewind';

import type { PatternAlert as PatternAlertType, DangerLevel } from '../services/PatternMatcher';
import type { AtmosphericPattern } from '../services/VecDB';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// Styled Components
// ─────────────────────────────────────────────────────────────────────────────

const StyledView = styled(View);
const StyledText = styled(Text);
const StyledTouchable = styled(TouchableOpacity);
const StyledScrollView = styled(ScrollView);
const StyledBlur = styled(BlurView);
const StyledAnimatedView = styled(Animated.View);

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

const ALERT_STYLES: Record<DangerLevel, {
  bg: string;
  border: string;
  text: string;
  icon: string;
  blurTint: 'light' | 'dark' | 'default';
}> = {
  info: {
    bg: 'bg-blue-900/80',
    border: 'border-blue-600',
    text: 'text-blue-100',
    icon: 'ℹ️',
    blurTint: 'dark',
  },
  caution: {
    bg: 'bg-green-900/80',
    border: 'border-green-600',
    text: 'text-green-100',
    icon: '⚠️',
    blurTint: 'dark',
  },
  warning: {
    bg: 'bg-orange-700/80',
    border: 'border-orange-500',
    text: 'text-orange-100',
    icon: '⚠️',
    blurTint: 'dark',
  },
  danger: {
    bg: 'bg-red-900/80',
    border: 'border-red-500',
    text: 'text-red-100',
    icon: '🚨',
    blurTint: 'dark',
  },
  emergency: {
    bg: 'bg-purple-900/80',
    border: 'border-purple-500',
    text: 'text-purple-100',
    icon: '🆘',
    blurTint: 'dark',
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

const CONSENSUS_STYLES: Record<ConsensusLevel, {
  bg: string;
  text: string;
  label: string;
  icon: string;
}> = {
  agree: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    label: 'CONSENSUS',
    icon: '✓',
  },
  partial: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-400',
    label: 'PARTIAL',
    icon: '≈',
  },
  disagree: {
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    label: 'DIVERGENT',
    icon: '✗',
  },
  unknown: {
    bg: 'bg-gray-500/20',
    text: 'text-gray-400',
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
  const style = CONSENSUS_STYLES[level];

  return (
    <StyledView className="mt-4 rounded-xl overflow-hidden">
      {/* Glass header */}
      <StyledView className={`${style.bg} px-4 py-2 flex-row items-center justify-between border-b border-white/10`}>
        <StyledView className="flex-row items-center">
          <StyledText className={`${style.text} text-lg mr-2`}>{style.icon}</StyledText>
          <StyledText className={`${style.text} font-bold text-sm tracking-widest`}>
            {style.label}
          </StyledText>
        </StyledView>
        {consensus.graphCastPrediction && (
          <StyledText className="text-white/60 text-xs">
            GraphCast {Math.round(consensus.graphCastPrediction.confidence * 100)}% conf.
          </StyledText>
        )}
      </StyledView>

      {/* Comparison grid */}
      <StyledView className="bg-black/30 p-4">
        <StyledView className="flex-row">
          {/* Local Pattern Column */}
          <StyledView className="flex-1 pr-3 border-r border-white/10">
            <StyledText className="text-white/50 text-xs uppercase tracking-wider mb-2">
              🧭 Local Pattern
            </StyledText>
            <StyledText className={`${textColor} font-semibold text-sm mb-1`}>
              {consensus.localMatch.label}
            </StyledText>
            <StyledText className="text-white/70 text-xs mb-2">
              {consensus.localMatch.outcome}
            </StyledText>
            <StyledView className="bg-white/10 rounded-full px-2 py-1 self-start">
              <StyledText className="text-white/80 text-xs font-mono">
                {Math.round(consensus.localMatch.similarity * 100)}% match
              </StyledText>
            </StyledView>
          </StyledView>

          {/* GraphCast Column */}
          <StyledView className="flex-1 pl-3">
            <StyledText className="text-white/50 text-xs uppercase tracking-wider mb-2">
              🌐 GraphCast
            </StyledText>
            {consensus.graphCastPrediction ? (
              <>
                <StyledText className={`${textColor} font-semibold text-sm mb-1`}>
                  AI Forecast
                </StyledText>
                <StyledText className="text-white/70 text-xs mb-2">
                  {consensus.graphCastPrediction.outcome}
                </StyledText>
                <StyledView className="bg-white/10 rounded-full px-2 py-1 self-start">
                  <StyledText className="text-white/80 text-xs font-mono">
                    {Math.round(consensus.graphCastPrediction.confidence * 100)}% conf.
                  </StyledText>
                </StyledView>
              </>
            ) : (
              <StyledText className="text-white/40 text-xs italic">
                No GraphCast data for this region/time
              </StyledText>
            )}
          </StyledView>
        </StyledView>

        {/* Historical Matches from vibeSearch */}
        {consensus.vibeSearchResults && consensus.vibeSearchResults.length > 0 && (
          <StyledView className="mt-4 pt-4 border-t border-white/10">
            <StyledText className="text-white/50 text-xs uppercase tracking-wider mb-2">
              📊 Similar Historical Events ({consensus.vibeSearchResults.length})
            </StyledText>
            <StyledScrollView horizontal showsHorizontalScrollIndicator={false}>
              {consensus.vibeSearchResults.slice(0, 5).map((result, idx) => (
                <StyledView
                  key={result.id || idx}
                  className="bg-white/5 rounded-lg p-2 mr-2 min-w-[120px]"
                >
                  <StyledText className="text-white/60 text-xs">
                    {Math.round(result.similarity * 100)}% similar
                  </StyledText>
                  <StyledText className="text-white/90 text-xs font-medium mt-1" numberOfLines={2}>
                    {result.outcome || 'Unknown outcome'}
                  </StyledText>
                </StyledView>
              ))}
            </StyledScrollView>
          </StyledView>
        )}
      </StyledView>
    </StyledView>
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

  const style = ALERT_STYLES[alert.level];

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

  return (
    <StyledAnimatedView
      className="mx-4 my-2 overflow-hidden rounded-2xl"
      style={{
        transform: [
          { translateY: slideAnim },
          { scale: pulseAnim },
        ],
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 12,
      }}
    >
      {/* Glass background with blur */}
      <StyledBlur
        intensity={40}
        tint={style.blurTint}
        className="absolute inset-0"
      />

      {/* Color overlay */}
      <StyledView className={`absolute inset-0 ${style.bg}`} />

      {/* Content container */}
      <StyledView className={`border-2 ${style.border} rounded-2xl overflow-hidden`}>
        {/* Header */}
        <StyledTouchable
          className="flex-row items-center justify-between p-4"
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.8}
        >
          <StyledView className="flex-row items-center flex-1">
            <StyledText className="text-3xl mr-3">{style.icon}</StyledText>
            <StyledView className="flex-1">
              <StyledText className={`${style.text} text-lg font-extrabold tracking-wide`}>
                {alert.title}
              </StyledText>
              <StyledText className={`${style.text} opacity-70 text-xs mt-0.5`}>
                {similarityPercent}% pattern match • {formatTime(alert.timestamp)}
              </StyledText>
            </StyledView>
          </StyledView>

          <StyledView className="flex-row items-center">
            {/* Consensus badge in header */}
            {consensus && (
              <StyledView className={`${CONSENSUS_STYLES[calculateConsensusLevel(consensus)].bg} px-2 py-1 rounded-full mr-3`}>
                <StyledText className={`${CONSENSUS_STYLES[calculateConsensusLevel(consensus)].text} text-xs font-bold`}>
                  {CONSENSUS_STYLES[calculateConsensusLevel(consensus)].icon}
                </StyledText>
              </StyledView>
            )}
            <StyledText className={`${style.text} text-sm`}>
              {expanded ? '▼' : '▶'}
            </StyledText>
          </StyledView>
        </StyledTouchable>

        {/* Expanded Content */}
        {expanded && (
          <StyledView className="px-4 pb-4">
            {/* Description */}
            <StyledText className={`${style.text} text-sm leading-5 mb-4`}>
              {alert.description}
            </StyledText>

            {/* Time Estimate */}
            {alert.estimatedOnset && (
              <StyledView className="bg-black/30 rounded-xl p-3 mb-4 flex-row items-center justify-between">
                <StyledText className="text-white/80 text-xs font-semibold">
                  ⏱ Estimated Onset
                </StyledText>
                <StyledText className="text-white font-bold text-base">
                  {alert.estimatedOnset}
                </StyledText>
              </StyledView>
            )}

            {/* Consensus View */}
            {consensus && (
              <ConsensusView consensus={consensus} textColor={style.text} />
            )}

            {/* Recommendations */}
            <StyledView className="mt-4">
              <StyledText className={`${style.text} text-xs font-bold uppercase tracking-widest mb-3`}>
                Recommended Actions
              </StyledText>
              <StyledScrollView className="max-h-36" nestedScrollEnabled>
                {alert.recommendations.map((rec, index) => (
                  <StyledView key={index} className="flex-row items-start mb-2">
                    <StyledView className="bg-white/20 w-6 h-6 rounded-full items-center justify-center mr-3">
                      <StyledText className="text-white text-xs font-bold">
                        {index + 1}
                      </StyledText>
                    </StyledView>
                    <StyledText className={`${style.text} flex-1 text-sm leading-5`}>
                      {rec}
                    </StyledText>
                  </StyledView>
                ))}
              </StyledScrollView>
            </StyledView>

            {/* Pattern Details */}
            <StyledView className="mt-4 mb-4 opacity-60">
              <StyledText className={`${style.text} text-xs italic`}>
                Matched Pattern: {alert.matchedPattern.label || alert.matchedPattern.id}
              </StyledText>
            </StyledView>

            {/* Actions */}
            <StyledView className="flex-row items-center">
              <StyledTouchable
                className={`flex-1 border-2 ${style.border} rounded-xl py-3 items-center`}
                onPress={handleAcknowledge}
                activeOpacity={0.7}
              >
                <StyledText className={`${style.text} text-sm font-bold uppercase tracking-wider`}>
                  ✓ Acknowledge
                </StyledText>
              </StyledTouchable>

              {onDismiss && (
                <StyledTouchable
                  className="ml-3 p-3"
                  onPress={onDismiss}
                  activeOpacity={0.7}
                >
                  <StyledText className="text-white/50 text-xs">
                    Dismiss
                  </StyledText>
                </StyledTouchable>
              )}
            </StyledView>
          </StyledView>
        )}
      </StyledView>
    </StyledAnimatedView>
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
    <StyledView className="absolute top-16 left-0 right-0 z-50">
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
        <StyledView className="self-center bg-black/70 px-4 py-2 rounded-full mt-1">
          <StyledText className="text-white text-xs font-semibold">
            +{hiddenCount} more alert{hiddenCount > 1 ? 's' : ''}
          </StyledText>
        </StyledView>
      )}
    </StyledView>
  );
};

export default PatternAlertCard;

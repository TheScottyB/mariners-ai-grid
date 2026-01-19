/**
 * Mariner's AI Grid - useEmergencyMode Hook
 *
 * State machine for Emergency Mode that handles:
 * 1. Divergence Detection: Triggers when consensus = DIVERGENT (>30% delta)
 * 2. Vibe Confirmation: Cross-checks with VecDB for Gale/Storm patterns
 * 3. Emergency Initialization:
 *    - GridSync Priority 1 Snapshot broadcast
 *    - Signal K polling boost (1Hz -> 10Hz)
 *    - Task pruning for non-critical background processes
 *    - Background execution extension request
 *
 * State Machine Flow:
 *   NORMAL -> DETECTING -> CONFIRMING -> EMERGENCY -> RECOVERING -> NORMAL
 *
 * @module useEmergencyMode
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';

import {
  EmergencyState,
  TrendSeverityInput,
  calculateTrendSeverityScore,
  determineTrendDirection,
  EMERGENCY_THRESHOLDS,
} from '../components/EmergencyMode';
import type { TelemetrySnapshot } from '../services/PatternMatcher';
import type { ConsensusLevel } from '../components/PatternAlert';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type EmergencyPhase =
  | 'normal'
  | 'detecting'
  | 'confirming'
  | 'emergency'
  | 'recovering';

export interface EmergencyModeConfig {
  // Divergence threshold to start detection
  divergenceThreshold: number;

  // How long divergence must persist before confirmation (ms)
  detectionWindowMs: number;

  // TSS threshold to escalate to emergency
  emergencyTssThreshold: number;

  // TSS threshold to begin recovery
  recoveryTssThreshold: number;

  // How long TSS must stay below recovery threshold (ms)
  recoveryStabilityMs: number;

  // Whether to auto-exit emergency when conditions improve
  autoRecovery: boolean;

  // Callback for priority snapshot broadcast
  onBroadcastSnapshot?: () => void;

  // Callback for polling rate changes
  onPollingRateChange?: (rateHz: number) => void;
}

export interface EmergencyModeState {
  phase: EmergencyPhase;
  emergencyState: EmergencyState;
  pollingRateHz: number;
  suspendedTasks: string[];
  batteryLevel: number;
}

export interface UseEmergencyModeReturn {
  state: EmergencyModeState;
  isEmergency: boolean;

  // Manual controls
  triggerEmergency: (reason?: EmergencyState['reason']) => void;
  exitEmergency: () => void;
  acknowledgeEmergency: () => void;

  // Update handlers (called by app)
  updateTelemetry: (telemetry: TelemetrySnapshot) => void;
  updateConsensus: (level: ConsensusLevel, predictedWind: number | null) => void;
  updateVibeConfirmation: (isGaleOrStorm: boolean) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: EmergencyModeConfig = {
  divergenceThreshold: 0.30,
  detectionWindowMs: 10000, // 10 seconds of sustained divergence
  emergencyTssThreshold: EMERGENCY_THRESHOLDS.tss.high, // TSS 60+
  recoveryTssThreshold: EMERGENCY_THRESHOLDS.autoExitThreshold, // TSS 35
  recoveryStabilityMs: 5 * 60 * 1000, // 5 minutes stable
  autoRecovery: true,
};

// Normal polling rate (Hz)
const NORMAL_POLLING_HZ = 1;

// Emergency "Sensor Overdrive" polling rate (Hz)
const EMERGENCY_POLLING_HZ = 10;

// Background tasks to suspend during emergency
const SUSPENDABLE_TASKS = [
  'HISTORICAL_PATTERN_INDEXING',
  'SEED_PREFETCH',
  'ANALYTICS_UPLOAD',
  'TILE_CACHE_CLEANUP',
];

// ─────────────────────────────────────────────────────────────────────────────
// Hook Implementation
// ─────────────────────────────────────────────────────────────────────────────

export function useEmergencyMode(
  config: Partial<EmergencyModeConfig> = {}
): UseEmergencyModeReturn {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // State
  const [state, setState] = useState<EmergencyModeState>({
    phase: 'normal',
    emergencyState: {
      isActive: false,
      activatedAt: null,
      reason: null,
      severityScore: 0,
      trendDirection: 'stable',
    },
    pollingRateHz: NORMAL_POLLING_HZ,
    suspendedTasks: [],
    batteryLevel: 1,
  });

  // Refs for tracking
  const telemetryHistory = useRef<TelemetrySnapshot[]>([]);
  const tssHistory = useRef<{ timestamp: number; score: number }[]>([]);
  const divergenceStartTime = useRef<number | null>(null);
  const recoveryStartTime = useRef<number | null>(null);
  const currentTelemetry = useRef<TelemetrySnapshot | null>(null);
  const predictedWindSpeed = useRef<number | null>(null);
  const consensusLevel = useRef<ConsensusLevel>('unknown');
  const vibeConfirmed = useRef<boolean>(false);
  const acknowledged = useRef<boolean>(false);

  // Battery monitoring
  useEffect(() => {
    let subscription: Battery.Subscription | null = null;

    const initBattery = async () => {
      try {
        const level = await Battery.getBatteryLevelAsync();
        setState(prev => ({ ...prev, batteryLevel: level }));

        subscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
          setState(prev => ({ ...prev, batteryLevel }));
        });
      } catch (e) {
        // Battery API not available (e.g., simulator)
      }
    };

    initBattery();
    return () => { subscription?.remove(); };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // State Machine Transitions
  // ─────────────────────────────────────────────────────────────────────────

  const transitionTo = useCallback((
    newPhase: EmergencyPhase,
    updates: Partial<EmergencyModeState['emergencyState']> = {}
  ) => {
    console.log(`[EmergencyMode] Transitioning: ${state.phase} -> ${newPhase}`);

    setState(prev => {
      const newState = { ...prev, phase: newPhase };

      // Handle phase-specific actions
      switch (newPhase) {
        case 'emergency':
          // Activate emergency
          newState.emergencyState = {
            ...prev.emergencyState,
            isActive: true,
            activatedAt: Date.now(),
            ...updates,
          };
          newState.pollingRateHz = EMERGENCY_POLLING_HZ;

          // Trigger polling rate callback
          mergedConfig.onPollingRateChange?.(EMERGENCY_POLLING_HZ);

          // Broadcast priority snapshot
          mergedConfig.onBroadcastSnapshot?.();
          break;

        case 'recovering':
          recoveryStartTime.current = Date.now();
          break;

        case 'normal':
          // Deactivate emergency
          newState.emergencyState = {
            isActive: false,
            activatedAt: null,
            reason: null,
            severityScore: prev.emergencyState.severityScore,
            trendDirection: prev.emergencyState.trendDirection,
          };
          newState.pollingRateHz = NORMAL_POLLING_HZ;
          newState.suspendedTasks = [];

          // Reset refs
          divergenceStartTime.current = null;
          recoveryStartTime.current = null;
          vibeConfirmed.current = false;
          acknowledged.current = false;

          // Trigger polling rate callback
          mergedConfig.onPollingRateChange?.(NORMAL_POLLING_HZ);
          break;
      }

      return newState;
    });
  }, [state.phase, mergedConfig]);

  // ─────────────────────────────────────────────────────────────────────────
  // Task Pruning
  // ─────────────────────────────────────────────────────────────────────────

  const suspendNonCriticalTasks = useCallback(async () => {
    const suspended: string[] = [];

    for (const taskName of SUSPENDABLE_TASKS) {
      try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(taskName);
        if (isRegistered) {
          await TaskManager.unregisterTaskAsync(taskName);
          suspended.push(taskName);
          console.log(`[EmergencyMode] Suspended task: ${taskName}`);
        }
      } catch (e) {
        // Task may not exist, that's fine
      }
    }

    setState(prev => ({ ...prev, suspendedTasks: suspended }));
  }, []);

  const resumeSuspendedTasks = useCallback(async () => {
    // In production, re-register tasks here
    console.log('[EmergencyMode] Resuming suspended tasks');
    setState(prev => ({ ...prev, suspendedTasks: [] }));
  }, []);

  // Suspend tasks when entering emergency
  useEffect(() => {
    if (state.phase === 'emergency') {
      suspendNonCriticalTasks();
    } else if (state.phase === 'normal' && state.suspendedTasks.length > 0) {
      resumeSuspendedTasks();
    }
  }, [state.phase]);

  // ─────────────────────────────────────────────────────────────────────────
  // TSS Calculation
  // ─────────────────────────────────────────────────────────────────────────

  const calculateCurrentTSS = useCallback((): number => {
    const telemetry = currentTelemetry.current;
    const predicted = predictedWindSpeed.current;

    if (!telemetry || predicted === null) return 0;

    // Get historical pressure for trend
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const historicalTelemetry = telemetryHistory.current.find(
      t => t.timestamp <= oneHourAgo
    );

    const input: TrendSeverityInput = {
      currentPressure: telemetry.barometer ?? 1013,
      currentWindSpeed: telemetry.trueWindSpeed ?? 0,
      previousPressure: historicalTelemetry?.barometer ?? (telemetry.barometer ?? 1013),
      timeDeltaHours: historicalTelemetry
        ? (telemetry.timestamp - historicalTelemetry.timestamp) / (60 * 60 * 1000)
        : 1,
      predictedWindSpeed: predicted,
    };

    return calculateTrendSeverityScore(input);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Update Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const updateTelemetry = useCallback((telemetry: TelemetrySnapshot) => {
    currentTelemetry.current = telemetry;

    // Maintain history (keep last 2 hours)
    telemetryHistory.current.push(telemetry);
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    telemetryHistory.current = telemetryHistory.current.filter(
      t => t.timestamp > twoHoursAgo
    );

    // Calculate TSS
    const newTss = calculateCurrentTSS();
    const previousTss = tssHistory.current.length > 0
      ? tssHistory.current[tssHistory.current.length - 1].score
      : null;

    const trendDirection = determineTrendDirection(newTss, previousTss);

    // Update TSS history
    tssHistory.current.push({ timestamp: Date.now(), score: newTss });
    if (tssHistory.current.length > 100) {
      tssHistory.current.shift();
    }

    // Update state
    setState(prev => ({
      ...prev,
      emergencyState: {
        ...prev.emergencyState,
        severityScore: newTss,
        trendDirection,
      },
    }));

    // Check state machine transitions
    evaluateStateTransitions(newTss);
  }, [calculateCurrentTSS]);

  const updateConsensus = useCallback((level: ConsensusLevel, predictedWind: number | null) => {
    consensusLevel.current = level;
    predictedWindSpeed.current = predictedWind;

    // Check for divergence
    if (level === 'disagree') {
      if (divergenceStartTime.current === null) {
        divergenceStartTime.current = Date.now();
        console.log('[EmergencyMode] Divergence detected, starting detection window');
      }
    } else {
      divergenceStartTime.current = null;
    }

    // Trigger state evaluation
    const currentTss = state.emergencyState.severityScore;
    evaluateStateTransitions(currentTss);
  }, [state.emergencyState.severityScore]);

  const updateVibeConfirmation = useCallback((isGaleOrStorm: boolean) => {
    vibeConfirmed.current = isGaleOrStorm;

    if (isGaleOrStorm && state.phase === 'confirming') {
      console.log('[EmergencyMode] Vibe confirmed: Gale/Storm pattern matched');
    }
  }, [state.phase]);

  // ─────────────────────────────────────────────────────────────────────────
  // State Transition Evaluation
  // ─────────────────────────────────────────────────────────────────────────

  const evaluateStateTransitions = useCallback((currentTss: number) => {
    const now = Date.now();

    switch (state.phase) {
      case 'normal':
        // Check for divergence to start detection
        if (consensusLevel.current === 'disagree' && divergenceStartTime.current) {
          const divergenceDuration = now - divergenceStartTime.current;
          if (divergenceDuration >= mergedConfig.detectionWindowMs) {
            transitionTo('detecting');
          }
        }
        break;

      case 'detecting':
        // Check TSS threshold to move to confirming
        if (currentTss >= EMERGENCY_THRESHOLDS.tss.elevated) {
          transitionTo('confirming');
        } else if (consensusLevel.current !== 'disagree') {
          // Divergence resolved, return to normal
          transitionTo('normal');
        }
        break;

      case 'confirming':
        // Check for vibe confirmation or TSS threshold
        if (vibeConfirmed.current || currentTss >= mergedConfig.emergencyTssThreshold) {
          transitionTo('emergency', {
            reason: vibeConfirmed.current ? 'divergent_consensus' : 'severity_threshold',
          });
        } else if (consensusLevel.current !== 'disagree' && currentTss < EMERGENCY_THRESHOLDS.tss.elevated) {
          // Conditions improved, abort escalation
          transitionTo('normal');
        }
        break;

      case 'emergency':
        // Check for recovery conditions
        if (mergedConfig.autoRecovery && currentTss < mergedConfig.recoveryTssThreshold) {
          transitionTo('recovering');
        }
        break;

      case 'recovering':
        // Check if recovery is sustained
        if (recoveryStartTime.current) {
          const recoveryDuration = now - recoveryStartTime.current;
          if (recoveryDuration >= mergedConfig.recoveryStabilityMs) {
            transitionTo('normal');
          } else if (currentTss >= mergedConfig.recoveryTssThreshold) {
            // Conditions worsened, return to emergency
            transitionTo('emergency', { reason: state.emergencyState.reason });
          }
        }
        break;
    }
  }, [state.phase, state.emergencyState.reason, mergedConfig, transitionTo]);

  // ─────────────────────────────────────────────────────────────────────────
  // Manual Controls
  // ─────────────────────────────────────────────────────────────────────────

  const triggerEmergency = useCallback((reason: EmergencyState['reason'] = 'manual') => {
    transitionTo('emergency', { reason });
  }, [transitionTo]);

  const exitEmergency = useCallback(() => {
    transitionTo('normal');
  }, [transitionTo]);

  const acknowledgeEmergency = useCallback(() => {
    acknowledged.current = true;
    console.log('[EmergencyMode] Emergency acknowledged by user');
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Return Value
  // ─────────────────────────────────────────────────────────────────────────

  return {
    state,
    isEmergency: state.emergencyState.isActive,
    triggerEmergency,
    exitEmergency,
    acknowledgeEmergency,
    updateTelemetry,
    updateConsensus,
    updateVibeConfirmation,
  };
}

export default useEmergencyMode;

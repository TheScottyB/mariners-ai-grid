/**
 * Mariner's AI Grid - Power Save Mode Hook
 * Reduces map refresh rate and background processing during long steady tacks.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as Battery from 'expo-battery';

export interface PowerSaveConfig {
  lowBatteryThreshold: number; // 0-1, default 0.2 (20%)
  idleTimeoutMs: number; // Time without heading change to trigger, default 5 min
  headingChangeThreshold: number; // Degrees, ignore changes smaller than this
}

export interface PowerSaveState {
  isEnabled: boolean;
  reason: 'manual' | 'low_battery' | 'steady_tack' | null;
  targetFps: number;
  batteryLevel: number;
}

const DEFAULT_CONFIG: PowerSaveConfig = {
  lowBatteryThreshold: 0.2,
  idleTimeoutMs: 5 * 60 * 1000, // 5 minutes
  headingChangeThreshold: 5, // degrees
};

export function usePowerSaveMode(
  currentHeading: number,
  config: Partial<PowerSaveConfig> = {}
) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const [state, setState] = useState<PowerSaveState>({
    isEnabled: false,
    reason: null,
    targetFps: 60,
    batteryLevel: 1,
  });

  const [manualOverride, setManualOverride] = useState<boolean | null>(null);
  const lastHeadingChange = useRef<number>(Date.now());
  const lastHeading = useRef<number>(currentHeading);

  // Monitor battery level
  useEffect(() => {
    let subscription: Battery.Subscription | null = null;

    const initBattery = async () => {
      const level = await Battery.getBatteryLevelAsync();
      setState((prev) => ({ ...prev, batteryLevel: level }));

      subscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
        setState((prev) => ({ ...prev, batteryLevel }));
      });
    };

    initBattery();

    return () => {
      subscription?.remove();
    };
  }, []);

  // Detect steady tack (no significant heading change)
  useEffect(() => {
    const headingDelta = Math.abs(currentHeading - lastHeading.current);

    // Normalize for compass wrap-around
    const normalizedDelta = headingDelta > 180 ? 360 - headingDelta : headingDelta;

    if (normalizedDelta > mergedConfig.headingChangeThreshold) {
      lastHeadingChange.current = Date.now();
      lastHeading.current = currentHeading;
    }
  }, [currentHeading, mergedConfig.headingChangeThreshold]);

  // Determine power save state
  useEffect(() => {
    const checkPowerSave = () => {
      // Manual override takes precedence
      if (manualOverride !== null) {
        setState((prev) => ({
          ...prev,
          isEnabled: manualOverride,
          reason: manualOverride ? 'manual' : null,
          targetFps: manualOverride ? 1 : 60,
        }));
        return;
      }

      // Low battery check
      if (state.batteryLevel < mergedConfig.lowBatteryThreshold) {
        setState((prev) => ({
          ...prev,
          isEnabled: true,
          reason: 'low_battery',
          targetFps: 1,
        }));
        return;
      }

      // Steady tack check
      const timeSinceHeadingChange = Date.now() - lastHeadingChange.current;
      if (timeSinceHeadingChange > mergedConfig.idleTimeoutMs) {
        setState((prev) => ({
          ...prev,
          isEnabled: true,
          reason: 'steady_tack',
          targetFps: 5, // Slightly higher for steady tack vs low battery
        }));
        return;
      }

      // Normal operation
      setState((prev) => ({
        ...prev,
        isEnabled: false,
        reason: null,
        targetFps: 60,
      }));
    };

    checkPowerSave();

    // Re-check periodically for steady tack detection
    const interval = setInterval(checkPowerSave, 30000);
    return () => clearInterval(interval);
  }, [
    state.batteryLevel,
    manualOverride,
    mergedConfig.lowBatteryThreshold,
    mergedConfig.idleTimeoutMs,
  ]);

  const enablePowerSave = useCallback(() => {
    setManualOverride(true);
  }, []);

  const disablePowerSave = useCallback(() => {
    setManualOverride(false);
  }, []);

  const resetToAuto = useCallback(() => {
    setManualOverride(null);
  }, []);

  return {
    ...state,
    enablePowerSave,
    disablePowerSave,
    resetToAuto,
    isManualOverride: manualOverride !== null,
  };
}

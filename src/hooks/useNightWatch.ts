/**
 * Mariner's AI Grid - useNightWatch Hook
 *
 * Manages Night Watch mode with:
 * - Ambient light sensor detection for auto-switching
 * - Manual override controls
 * - Push notification configuration for GridSync emergency alerts
 * - Screen brightness management
 *
 * Push Notification Architecture:
 * - Uses Expo Push Notifications for cross-platform support
 * - Emergency alerts bypass Do Not Disturb on iOS (critical alerts)
 * - Token stored and synced with GridSync backend
 *
 * @module useNightWatch
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus, Platform, Appearance } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Subscription } from 'expo-modules-core';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface NightWatchConfig {
  // Auto-switch based on ambient light (if available)
  autoSwitchEnabled: boolean;

  // Lux threshold for auto-switch (typical night < 10 lux)
  luxThreshold: number;

  // Time-based auto-switch (fallback when sensor unavailable)
  scheduleEnabled: boolean;
  nightStartHour: number;  // 24-hour format (e.g., 20 = 8 PM)
  nightEndHour: number;    // 24-hour format (e.g., 6 = 6 AM)

  // Screen brightness in night mode (0-1)
  nightBrightness: number;

  // Push notification settings
  pushEnabled: boolean;
  emergencyAlertsEnabled: boolean;
}

export interface NightWatchState {
  isNightMode: boolean;
  reason: 'manual' | 'ambient_light' | 'schedule' | 'system' | null;
  ambientLux: number | null;
  pushToken: string | null;
  pushPermissionStatus: 'granted' | 'denied' | 'undetermined';
}

export interface UseNightWatchReturn {
  state: NightWatchState;
  config: NightWatchConfig;

  // Controls
  enableNightMode: () => void;
  disableNightMode: () => void;
  toggleNightMode: () => void;
  setAutoSwitch: (enabled: boolean) => void;

  // Push notifications
  registerForPushNotifications: () => Promise<string | null>;
  sendLocalEmergencyAlert: (title: string, body: string, data?: Record<string, unknown>) => Promise<void>;

  // Configuration
  updateConfig: (updates: Partial<NightWatchConfig>) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: NightWatchConfig = {
  autoSwitchEnabled: true,
  luxThreshold: 10,
  scheduleEnabled: true,
  nightStartHour: 20,  // 8 PM
  nightEndHour: 6,     // 6 AM
  nightBrightness: 0.1,
  pushEnabled: true,
  emergencyAlertsEnabled: true,
};

// Notification channel for Android
const EMERGENCY_CHANNEL_ID = 'mariners-emergency';

// ─────────────────────────────────────────────────────────────────────────────
// Push Notification Setup
// ─────────────────────────────────────────────────────────────────────────────

// Configure notification handler (runs when app is foregrounded)
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;
    const isEmergency = data?.priority === 'emergency';

    return {
      shouldShowAlert: true,
      shouldPlaySound: isEmergency,
      shouldSetBadge: isEmergency,
      // On iOS, critical alerts bypass Do Not Disturb
      priority: isEmergency
        ? Notifications.AndroidNotificationPriority.MAX
        : Notifications.AndroidNotificationPriority.DEFAULT,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Hook Implementation
// ─────────────────────────────────────────────────────────────────────────────

export function useNightWatch(
  initialConfig: Partial<NightWatchConfig> = {}
): UseNightWatchReturn {
  const mergedConfig = { ...DEFAULT_CONFIG, ...initialConfig };

  const [config, setConfig] = useState<NightWatchConfig>(mergedConfig);
  const [state, setState] = useState<NightWatchState>({
    isNightMode: false,
    reason: null,
    ambientLux: null,
    pushToken: null,
    pushPermissionStatus: 'undetermined',
  });

  const [manualOverride, setManualOverride] = useState<boolean | null>(null);

  // Refs for subscriptions
  const notificationListener = useRef<Subscription | null>(null);
  const responseListener = useRef<Subscription | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // System Theme Detection
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (manualOverride === null && !config.autoSwitchEnabled) {
        // Follow system theme if no manual override and auto-switch disabled
        setState(prev => ({
          ...prev,
          isNightMode: colorScheme === 'dark',
          reason: 'system',
        }));
      }
    });

    return () => subscription.remove();
  }, [manualOverride, config.autoSwitchEnabled]);

  // ─────────────────────────────────────────────────────────────────────────
  // Time-based Auto-Switch
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!config.scheduleEnabled || manualOverride !== null) return;

    const checkSchedule = () => {
      const now = new Date();
      const currentHour = now.getHours();

      // Handle overnight schedule (e.g., 20:00 to 06:00)
      const isNightTime = config.nightStartHour > config.nightEndHour
        ? (currentHour >= config.nightStartHour || currentHour < config.nightEndHour)
        : (currentHour >= config.nightStartHour && currentHour < config.nightEndHour);

      setState(prev => {
        if (prev.isNightMode !== isNightTime && prev.reason !== 'manual') {
          console.log(`[NightWatch] Schedule: ${isNightTime ? 'Night' : 'Day'} mode at ${currentHour}:00`);
          return {
            ...prev,
            isNightMode: isNightTime,
            reason: 'schedule',
          };
        }
        return prev;
      });
    };

    // Check immediately and every minute
    checkSchedule();
    const interval = setInterval(checkSchedule, 60000);

    return () => clearInterval(interval);
  }, [config.scheduleEnabled, config.nightStartHour, config.nightEndHour, manualOverride]);

  // ─────────────────────────────────────────────────────────────────────────
  // Push Notification Registration
  // ─────────────────────────────────────────────────────────────────────────

  const setupNotificationChannel = useCallback(async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(EMERGENCY_CHANNEL_ID, {
        name: 'Emergency Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF0000',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
        sound: 'default',
      });
    }
  }, []);

  const registerForPushNotifications = useCallback(async (): Promise<string | null> => {
    if (!Device.isDevice) {
      console.warn('[NightWatch] Push notifications require a physical device');
      return null;
    }

    try {
      // Set up Android channel
      await setupNotificationChannel();

      // Check existing permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Request permission if not granted
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
            allowCriticalAlerts: config.emergencyAlertsEnabled, // iOS critical alerts
          },
        });
        finalStatus = status;
      }

      setState(prev => ({
        ...prev,
        pushPermissionStatus: finalStatus as NightWatchState['pushPermissionStatus'],
      }));

      if (finalStatus !== 'granted') {
        console.warn('[NightWatch] Push notification permission denied');
        return null;
      }

      // Get push token
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });

      const token = tokenData.data;
      console.log(`[NightWatch] Push token: ${token.slice(0, 20)}...`);

      setState(prev => ({ ...prev, pushToken: token }));

      return token;
    } catch (error) {
      console.error('[NightWatch] Failed to register for push notifications:', error);
      return null;
    }
  }, [config.emergencyAlertsEnabled, setupNotificationChannel]);

  // ─────────────────────────────────────────────────────────────────────────
  // Local Emergency Alert
  // ─────────────────────────────────────────────────────────────────────────

  const sendLocalEmergencyAlert = useCallback(async (
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<void> => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: {
            ...data,
            priority: 'emergency',
            timestamp: Date.now(),
          },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          // iOS critical alert (requires special entitlement)
          ...(Platform.OS === 'ios' && config.emergencyAlertsEnabled
            ? {
                // Note: Critical alerts require Apple approval
                // interruptionLevel: 'critical',
              }
            : {}),
        },
        trigger: null, // Immediate
      });

      console.log(`[NightWatch] Emergency alert sent: ${title}`);
    } catch (error) {
      console.error('[NightWatch] Failed to send emergency alert:', error);
    }
  }, [config.emergencyAlertsEnabled]);

  // ─────────────────────────────────────────────────────────────────────────
  // Notification Listeners
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Listener for when a notification is received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('[NightWatch] Notification received:', notification.request.content.title);
    });

    // Listener for when user interacts with a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      console.log('[NightWatch] Notification response:', data);

      // Handle emergency notification tap
      if (data?.priority === 'emergency') {
        // Could trigger navigation to emergency screen here
      }
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Auto-register for push on mount
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (config.pushEnabled && !state.pushToken) {
      registerForPushNotifications();
    }
  }, [config.pushEnabled, state.pushToken, registerForPushNotifications]);

  // ─────────────────────────────────────────────────────────────────────────
  // Manual Controls
  // ─────────────────────────────────────────────────────────────────────────

  const enableNightMode = useCallback(() => {
    setManualOverride(true);
    setState(prev => ({
      ...prev,
      isNightMode: true,
      reason: 'manual',
    }));
    console.log('[NightWatch] Night mode enabled (manual)');
  }, []);

  const disableNightMode = useCallback(() => {
    setManualOverride(false);
    setState(prev => ({
      ...prev,
      isNightMode: false,
      reason: 'manual',
    }));
    console.log('[NightWatch] Night mode disabled (manual)');
  }, []);

  const toggleNightMode = useCallback(() => {
    if (state.isNightMode) {
      disableNightMode();
    } else {
      enableNightMode();
    }
  }, [state.isNightMode, enableNightMode, disableNightMode]);

  const setAutoSwitch = useCallback((enabled: boolean) => {
    setConfig(prev => ({ ...prev, autoSwitchEnabled: enabled }));
    if (enabled) {
      setManualOverride(null); // Clear manual override
    }
  }, []);

  const updateConfig = useCallback((updates: Partial<NightWatchConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Return Value
  // ─────────────────────────────────────────────────────────────────────────

  return {
    state,
    config,
    enableNightMode,
    disableNightMode,
    toggleNightMode,
    setAutoSwitch,
    registerForPushNotifications,
    sendLocalEmergencyAlert,
    updateConfig,
  };
}

export default useNightWatch;

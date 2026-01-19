/**
 * Mariner's AI Grid - First Watch Onboarding
 *
 * The "First Watch" is the bridge between a technical prototype and a validated
 * maritime tool. For the 20 beta-testers, this screen is the training manual
 * that ensures they reach the "Aha!" moment—seeing their first local AI consensus
 * —without getting lost in the technical details.
 *
 * 2026 Liquid Glass Aesthetic:
 * - Value-first flow: Demonstrates seed power before asking for Signal K config
 * - Progressive permissions: Location/Bluetooth only when contextually needed
 * - Auto-completion: Signal K heartbeat auto-checks the milestone with haptic
 *
 * Four Milestones:
 * 1. Secure the Bridge - Signal K WebSocket handshake
 * 2. Load the Seed - 1.25MB "Pacific Starter" download (resumable)
 * 3. Verify the Grid - Local AI consensus validation
 * 4. Sign the Code - Mariner's Code data sharing opt-in
 *
 * @module FirstWatchOnboarding
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Animated,
  Dimensions,
  StyleSheet,
  Platform,
  ActivityIndicator,
  ScrollView,
  Switch,
  Linking,
  KeyboardAvoidingView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { Paths, Directory, File } from 'expo-file-system';
import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  createDownloadResumable,
  type DownloadProgressData,
} from 'expo-file-system/legacy';
import * as Network from 'expo-network';
import Constants from 'expo-constants';

import { SignalKBridge } from '../services/SignalKBridge';
import { SeedManager, SeedMetadata } from '../services/SeedManager';
import { NIGHT_WATCH_COLORS } from './NightWatchMode';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Configuration
// ─────────────────────────────────────────────────────────────────────────────

const ONBOARDING_COMPLETE_KEY = 'first_watch_complete';
const SIGNAL_K_URL_KEY = 'signal_k_server_url';
const MARINERS_CODE_ENABLED_KEY = 'mariners_code_enabled';

// Default Pacific Starter seed URL (replace with your actual hosted seed)
const DEFAULT_SEED_URL = 'https://mariners-ai-grid.s3.amazonaws.com/seeds/pacific_starter_v1.parquet';

// EAS Analytics events (would integrate with your analytics service)
const ANALYTICS_EVENTS = {
  ONBOARDING_STARTED: 'onboarding_started',
  BRIDGE_CONNECTED: 'bridge_connected',
  BRIDGE_FAILED: 'bridge_failed',
  SEED_DOWNLOAD_STARTED: 'seed_download_started',
  SEED_DOWNLOAD_COMPLETE: 'seed_download_complete',
  SEED_DOWNLOAD_FAILED: 'seed_download_failed',
  CONSENSUS_VERIFIED: 'consensus_verified',
  MARINERS_CODE_OPTED_IN: 'mariners_code_opted_in',
  ONBOARDING_COMPLETE: 'onboarding_complete',
};

// 2026 Liquid Glass Colors
const LIQUID_GLASS_COLORS = {
  background: {
    primary: 'rgba(0, 27, 58, 0.95)',  // Deep navy with translucency
    glass: 'rgba(0, 40, 80, 0.65)',
    card: 'rgba(0, 50, 100, 0.4)',
    elevated: 'rgba(10, 60, 110, 0.8)',
  },
  accent: {
    primary: '#00BFFF',      // Sky blue
    success: '#00E676',      // Vibrant green
    warning: '#FFB300',      // Amber
    error: '#FF5252',        // Red
    muted: 'rgba(0, 191, 255, 0.5)',
  },
  text: {
    primary: '#E0F7FA',      // Cyan-tinted white
    secondary: '#90CAF9',    // Soft blue
    muted: 'rgba(224, 247, 250, 0.6)',
  },
  border: {
    glass: 'rgba(255, 255, 255, 0.12)',
    active: 'rgba(0, 191, 255, 0.4)',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type OnboardingStep = 'bridge' | 'seed' | 'verify' | 'code';

interface StepConfig {
  id: OnboardingStep;
  title: string;
  subtitle: string;
  icon: string;
  description: string;
}

const STEPS: StepConfig[] = [
  {
    id: 'bridge',
    title: '1. SECURE THE BRIDGE',
    subtitle: 'Connect to Signal K',
    icon: '⚓',
    description: 'Link your device to the boat\'s NMEA 2000 network via Signal K to establish the "Truth Layer".',
  },
  {
    id: 'seed',
    title: '2. LOAD THE SEED',
    subtitle: 'Download 72-Hour Forecast',
    icon: '🌊',
    description: 'Download your first AI weather seed (1.25MB). This compact file contains a complete 72-hour regional forecast—no ongoing data costs.',
  },
  {
    id: 'verify',
    title: '3. VERIFY THE GRID',
    subtitle: 'Check AI Consensus',
    icon: '✓',
    description: 'Compare the GraphCast prediction against your live Signal K telemetry. When they match, you\'ll see the CONSENSUS badge turn green.',
  },
  {
    id: 'code',
    title: '4. SIGN THE CODE',
    subtitle: 'Join the Fleet',
    icon: '🤝',
    description: 'Enable anonymous data sharing to help protect the fleet. Your boat becomes a "living sensor" in the Mariner\'s AI Grid.',
  },
];

export interface FirstWatchOnboardingProps {
  onComplete: () => void;
  signalKBridge: SignalKBridge;
  seedManager?: SeedManager;
}

interface MilestoneStatus {
  bridge: 'pending' | 'checking' | 'connected' | 'failed';
  seed: 'pending' | 'downloading' | 'complete' | 'failed';
  verify: 'pending' | 'checking' | 'consensus' | 'divergent';
  code: 'pending' | 'accepted';
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics Helper (placeholder for EAS integration)
// ─────────────────────────────────────────────────────────────────────────────

const trackEvent = async (event: string, properties?: Record<string, any>) => {
  // EAS Analytics integration would go here
  // For now, just log to console for debugging
  console.log(`[Analytics] ${event}`, properties || '');

  // In production, you would call:
  // await Analytics.track(event, { ...properties, timestamp: Date.now() });
};

// ─────────────────────────────────────────────────────────────────────────────
// Resumable Download Manager (for Iridium/satellite recovery)
// ─────────────────────────────────────────────────────────────────────────────

interface DownloadProgress {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
  percentage: number;
}

class ResumableDownloadManager {
  private downloadResumable: ReturnType<typeof createDownloadResumable> | null = null;
  private resumeDataKey: string;

  constructor(seedId: string) {
    this.resumeDataKey = `download_resume_${seedId}`;
  }

  async startOrResume(
    url: string,
    localPath: string,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<string> {
    // Check for existing resume data
    const resumeDataStr = await SecureStore.getItemAsync(this.resumeDataKey);

    const progressCallback = (downloadProgress: DownloadProgressData) => {
      const percentage = downloadProgress.totalBytesExpectedToWrite > 0
        ? (downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100
        : 0;

      onProgress({
        totalBytesWritten: downloadProgress.totalBytesWritten,
        totalBytesExpectedToWrite: downloadProgress.totalBytesExpectedToWrite,
        percentage,
      });
    };

    if (resumeDataStr) {
      console.log('[Download] Resuming interrupted download...');
      const resumeData = JSON.parse(resumeDataStr);
      // For resumable downloads, we need to create a new one with the resume data
      this.downloadResumable = createDownloadResumable(
        url,
        localPath,
        {},
        progressCallback,
        resumeData
      );
    } else {
      this.downloadResumable = createDownloadResumable(
        url,
        localPath,
        {},
        progressCallback
      );
    }

    try {
      const result = await this.downloadResumable.downloadAsync();
      // Clear resume data on success
      await SecureStore.deleteItemAsync(this.resumeDataKey);

      if (!result?.uri) {
        throw new Error('Download returned no URI');
      }

      return result.uri;
    } catch (error) {
      // Save resume data for future recovery
      if (this.downloadResumable) {
        const pauseResult = await this.downloadResumable.pauseAsync();
        await SecureStore.setItemAsync(
          this.resumeDataKey,
          JSON.stringify(pauseResult.resumeData)
        );
      }
      throw error;
    }
  }

  async cancel() {
    if (this.downloadResumable) {
      await this.downloadResumable.pauseAsync();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step Components
// ─────────────────────────────────────────────────────────────────────────────

interface BridgeStepProps {
  status: MilestoneStatus['bridge'];
  onConnect: (url: string) => Promise<void>;
  onTroubleshoot: () => void;
  currentUrl: string;
  onUrlChange: (url: string) => void;
}

const BridgeStep: React.FC<BridgeStepProps> = ({
  status,
  onConnect,
  onTroubleshoot,
  currentUrl,
  onUrlChange,
}) => {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await onConnect(currentUrl);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <View style={styles.stepContent}>
      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Signal K Server URL</Text>
        <TextInput
          style={styles.textInput}
          value={currentUrl}
          onChangeText={onUrlChange}
          placeholder="ws://192.168.1.100:3000/signalk/v1/stream"
          placeholderTextColor={LIQUID_GLASS_COLORS.text.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={styles.inputHint}>
          Usually your boat's Raspberry Pi IP address on port 3000
        </Text>
      </View>

      {status === 'connected' && (
        <View style={styles.successBadge}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successText}>Signal K Connected</Text>
        </View>
      )}

      {status === 'failed' && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            Connection failed. Check your WiFi and Signal K server.
          </Text>
          <TouchableOpacity
            style={styles.troubleshootButton}
            onPress={onTroubleshoot}
          >
            <Text style={styles.troubleshootButtonText}>Troubleshoot</Text>
          </TouchableOpacity>
        </View>
      )}

      {status !== 'connected' && (
        <TouchableOpacity
          style={[
            styles.primaryButton,
            (isConnecting || status === 'checking') && styles.buttonDisabled,
          ]}
          onPress={handleConnect}
          disabled={isConnecting || status === 'checking'}
        >
          {isConnecting || status === 'checking' ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Connect to Bridge</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Signal K Setup Help Link */}
      <TouchableOpacity
        style={styles.helpLink}
        onPress={() => Linking.openURL('https://www.youtube.com/watch?v=2JMXPGDS_Wo')}
      >
        <Text style={styles.helpLinkText}>
          New to Signal K? Watch setup guide →
        </Text>
      </TouchableOpacity>
    </View>
  );
};

interface SeedStepProps {
  status: MilestoneStatus['seed'];
  progress: DownloadProgress | null;
  onDownload: () => Promise<void>;
  seedMetadata: SeedMetadata | null;
  error: string | null;
}

const SeedStep: React.FC<SeedStepProps> = ({
  status,
  progress,
  onDownload,
  seedMetadata,
  error,
}) => {
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <View style={styles.stepContent}>
      {/* Seed Info Card */}
      <View style={styles.seedInfoCard}>
        <View style={styles.seedInfoHeader}>
          <Text style={styles.seedInfoTitle}>Pacific Starter Seed</Text>
          <Text style={styles.seedInfoSize}>~1.25 MB</Text>
        </View>
        <Text style={styles.seedInfoDesc}>
          72-hour ECMWF-AIFS forecast • 9km resolution • Covers 20°N-60°N, 120°W-170°W
        </Text>
        <View style={styles.seedInfoStats}>
          <View style={styles.seedInfoStat}>
            <Text style={styles.seedInfoStatValue}>$0.00</Text>
            <Text style={styles.seedInfoStatLabel}>Data Cost</Text>
          </View>
          <View style={styles.seedInfoStat}>
            <Text style={styles.seedInfoStatValue}>72hr</Text>
            <Text style={styles.seedInfoStatLabel}>Forecast</Text>
          </View>
          <View style={styles.seedInfoStat}>
            <Text style={styles.seedInfoStatValue}>10-day</Text>
            <Text style={styles.seedInfoStatLabel}>Patterns</Text>
          </View>
        </View>
      </View>

      {/* Progress Bar */}
      {status === 'downloading' && progress && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <Animated.View
              style={[
                styles.progressBar,
                { width: `${progress.percentage}%` },
              ]}
            />
          </View>
          <View style={styles.progressStats}>
            <Text style={styles.progressText}>
              {formatBytes(progress.totalBytesWritten)} / {formatBytes(progress.totalBytesExpectedToWrite)}
            </Text>
            <Text style={styles.progressPercent}>
              {progress.percentage.toFixed(0)}%
            </Text>
          </View>
          <Text style={styles.progressHint}>
            Resumable download—safe to lose connection
          </Text>
        </View>
      )}

      {/* Success State */}
      {status === 'complete' && seedMetadata && (
        <View style={styles.successBadge}>
          <Text style={styles.successIcon}>✓</Text>
          <View>
            <Text style={styles.successText}>Seed Loaded</Text>
            <Text style={styles.successSubtext}>
              {seedMetadata.timestepCount} forecast hours ready
            </Text>
          </View>
        </View>
      )}

      {/* Error State */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Download Button */}
      {status !== 'complete' && status !== 'downloading' && (
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={onDownload}
        >
          <Text style={styles.primaryButtonText}>Download Seed</Text>
        </TouchableOpacity>
      )}

      {status === 'downloading' && (
        <TouchableOpacity
          style={[styles.primaryButton, styles.buttonSecondary]}
          disabled
        >
          <ActivityIndicator color={LIQUID_GLASS_COLORS.accent.primary} size="small" />
          <Text style={[styles.primaryButtonText, styles.buttonTextSecondary]}>
            Downloading...
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

interface VerifyStepProps {
  status: MilestoneStatus['verify'];
  observedWind: number | null;
  predictedWind: number | null;
  observedPressure: number | null;
  onVerify: () => void;
}

const VerifyStep: React.FC<VerifyStepProps> = ({
  status,
  observedWind,
  predictedWind,
  observedPressure,
  onVerify,
}) => {
  const delta = observedWind !== null && predictedWind !== null
    ? Math.abs(observedWind - predictedWind)
    : null;

  const isConsensus = delta !== null && delta < 5; // Within 5 knots = consensus

  return (
    <View style={styles.stepContent}>
      {/* Consensus Comparison */}
      <View style={styles.consensusGrid}>
        <View style={styles.consensusColumn}>
          <Text style={styles.consensusLabel}>OBSERVED</Text>
          <Text style={styles.consensusIcon}>⚓</Text>
          <Text style={styles.consensusValue}>
            {observedWind !== null ? `${observedWind.toFixed(1)} kt` : '--'}
          </Text>
          <Text style={styles.consensusSublabel}>
            {observedPressure !== null ? `${observedPressure.toFixed(0)} hPa` : '--'}
          </Text>
        </View>

        <View style={styles.consensusDivider}>
          <View style={[
            styles.consensusBadge,
            isConsensus ? styles.consensusBadgeGreen : styles.consensusBadgeRed,
          ]}>
            <Text style={styles.consensusBadgeText}>
              {isConsensus ? '✓ CONSENSUS' : '✗ DIVERGENT'}
            </Text>
          </View>
          {delta !== null && (
            <Text style={styles.deltaText}>Δ {delta.toFixed(1)} kt</Text>
          )}
        </View>

        <View style={styles.consensusColumn}>
          <Text style={styles.consensusLabel}>PREDICTED</Text>
          <Text style={styles.consensusIcon}>🌐</Text>
          <Text style={styles.consensusValue}>
            {predictedWind !== null ? `${predictedWind.toFixed(1)} kt` : '--'}
          </Text>
          <Text style={styles.consensusSublabel}>ECMWF-AIFS</Text>
        </View>
      </View>

      {status === 'consensus' && (
        <View style={styles.successBadge}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successText}>Grid Verified</Text>
        </View>
      )}

      {status === 'divergent' && (
        <View style={[styles.successBadge, styles.warningBadge]}>
          <Text style={styles.warningIcon}>⚠</Text>
          <View>
            <Text style={styles.warningText}>Divergence Detected</Text>
            <Text style={styles.warningSubtext}>
              Local conditions differ from prediction—this is valuable data!
            </Text>
          </View>
        </View>
      )}

      {(status === 'pending' || status === 'checking') && (
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={onVerify}
          disabled={status === 'checking'}
        >
          {status === 'checking' ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Verify Consensus</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};

interface CodeStepProps {
  status: MilestoneStatus['code'];
  onOptIn: (enabled: boolean) => void;
  isEnabled: boolean;
}

const CodeStep: React.FC<CodeStepProps> = ({
  status,
  onOptIn,
  isEnabled,
}) => {
  return (
    <View style={styles.stepContent}>
      {/* Mariner's Code Explanation */}
      <View style={styles.codeExplanation}>
        <Text style={styles.codeQuote}>
          "When all vessels share their truth, the fleet sees clearly."
        </Text>
        <Text style={styles.codeText}>
          By enabling the Mariner's Code, your boat anonymously contributes real-time
          observations to the grid. This crowdsourced "Surface Truth" helps every
          mariner in your region—like Waze for the ocean.
        </Text>
      </View>

      {/* Data Sharing Toggle */}
      <View style={styles.codeToggleRow}>
        <View style={styles.codeToggleInfo}>
          <Text style={styles.codeToggleLabel}>Anonymous Data Sharing</Text>
          <Text style={styles.codeToggleSublabel}>
            Wind, pressure, position (no personal data)
          </Text>
        </View>
        <Switch
          value={isEnabled}
          onValueChange={onOptIn}
          trackColor={{
            false: LIQUID_GLASS_COLORS.background.card,
            true: LIQUID_GLASS_COLORS.accent.muted,
          }}
          thumbColor={isEnabled ? LIQUID_GLASS_COLORS.accent.primary : '#ccc'}
        />
      </View>

      {/* Privacy Assurance */}
      <View style={styles.privacyNote}>
        <Text style={styles.privacyIcon}>🔒</Text>
        <Text style={styles.privacyText}>
          All data is anonymized with your Shadow ID. No personal information
          is ever transmitted. You can disable this at any time in Settings.
        </Text>
      </View>

      {status === 'accepted' && (
        <View style={styles.successBadge}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successText}>Welcome to the Fleet</Text>
        </View>
      )}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Troubleshoot Modal
// ─────────────────────────────────────────────────────────────────────────────

interface TroubleshootModalProps {
  visible: boolean;
  onClose: () => void;
  networkInfo: { ssid: string | null; isConnected: boolean } | null;
}

const TroubleshootModal: React.FC<TroubleshootModalProps> = ({
  visible,
  onClose,
  networkInfo,
}) => {
  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>Troubleshoot Connection</Text>

        <View style={styles.troubleshootItem}>
          <Text style={styles.troubleshootIcon}>
            {networkInfo?.isConnected ? '✓' : '✗'}
          </Text>
          <View>
            <Text style={styles.troubleshootLabel}>WiFi Connected</Text>
            <Text style={styles.troubleshootValue}>
              {networkInfo?.ssid || 'Not connected'}
            </Text>
          </View>
        </View>

        <View style={styles.troubleshootChecklist}>
          <Text style={styles.troubleshootCheckTitle}>Checklist:</Text>
          <Text style={styles.troubleshootCheckItem}>
            1. Device is on boat WiFi (not cellular)
          </Text>
          <Text style={styles.troubleshootCheckItem}>
            2. Signal K server is running on Raspberry Pi
          </Text>
          <Text style={styles.troubleshootCheckItem}>
            3. Port 3000 is not blocked by firewall
          </Text>
          <Text style={styles.troubleshootCheckItem}>
            4. URL format: ws://IP:3000/signalk/v1/stream
          </Text>
        </View>

        <TouchableOpacity style={styles.modalButton} onPress={onClose}>
          <Text style={styles.modalButtonText}>Got it</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export const FirstWatchOnboarding: React.FC<FirstWatchOnboardingProps> = ({
  onComplete,
  signalKBridge,
  seedManager: externalSeedManager,
}) => {
  // State
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [milestoneStatus, setMilestoneStatus] = useState<MilestoneStatus>({
    bridge: 'pending',
    seed: 'pending',
    verify: 'pending',
    code: 'pending',
  });
  const [signalKUrl, setSignalKUrl] = useState(Constants.expoConfig?.extra?.signalKUrl || 'ws://192.168.1.1:3000/signalk/v1/stream');
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [seedMetadata, setSeedMetadata] = useState<SeedMetadata | null>(null);
  const [marinersCodeEnabled, setMarinersCodeEnabled] = useState(false);
  const [troubleshootVisible, setTroubleshootVisible] = useState(false);
  const [networkInfo, setNetworkInfo] = useState<{ ssid: string | null; isConnected: boolean } | null>(null);

  // Telemetry from Signal K
  const [observedWind, setObservedWind] = useState<number | null>(null);
  const [observedPressure, setObservedPressure] = useState<number | null>(null);
  const [predictedWind, setPredictedWind] = useState<number | null>(null);

  // Refs
  const seedManagerRef = useRef<SeedManager>(externalSeedManager || new SeedManager());
  const downloadManagerRef = useRef<ResumableDownloadManager | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const onboardingStartTime = useRef(Date.now());

  // Initialize
  useEffect(() => {
    const init = async () => {
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_STARTED);

      // Load saved Signal K URL
      const savedUrl = await SecureStore.getItemAsync(SIGNAL_K_URL_KEY);
      if (savedUrl) setSignalKUrl(savedUrl);

      // Initialize seed manager if not provided
      if (!externalSeedManager) {
        await seedManagerRef.current.initialize();
      }

      // Check network state
      const state = await Network.getNetworkStateAsync();
      setNetworkInfo({
        ssid: null, // expo-network doesn't expose SSID directly
        isConnected: state.isConnected ?? false,
      });
    };

    init();
  }, []);

  // Auto-detect Signal K connection
  useEffect(() => {
    const statusHandler = (status: 'connected' | 'disconnected' | 'stale') => {
      if (status === 'connected' && milestoneStatus.bridge !== 'connected') {
        setMilestoneStatus(prev => ({ ...prev, bridge: 'connected' }));
        // Haptic celebration
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        trackEvent(ANALYTICS_EVENTS.BRIDGE_CONNECTED, {
          timeToConnect: Date.now() - onboardingStartTime.current,
        });
      }
    };

    const telemetryHandler = (snapshot: any) => {
      if (snapshot.trueWindSpeed !== undefined) {
        setObservedWind(snapshot.trueWindSpeed);
      }
      if (snapshot.barometer !== undefined) {
        setObservedPressure(snapshot.barometer);
      }
    };

    signalKBridge.onStatusChange(statusHandler);
    signalKBridge.onTelemetry(telemetryHandler);

    return () => {
      // Cleanup would go here if SignalKBridge supported removing listeners
    };
  }, [signalKBridge, milestoneStatus.bridge]);

  // Handle step transitions
  const animateToStep = useCallback((stepIndex: number) => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: stepIndex,
        duration: 0,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
    setCurrentStep(stepIndex);
  }, [fadeAnim, slideAnim]);

  // Step 1: Connect to Signal K
  const handleConnectBridge = useCallback(async (url: string) => {
    setMilestoneStatus(prev => ({ ...prev, bridge: 'checking' }));

    try {
      await SecureStore.setItemAsync(SIGNAL_K_URL_KEY, url);
      signalKBridge.setServerUrl(url);

      // Attempt connection with timeout
      const connectionPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);

        signalKBridge.onStatusChange((status) => {
          if (status === 'connected') {
            clearTimeout(timeout);
            resolve();
          }
        });

        signalKBridge.connect(() => {});
      });

      await connectionPromise;
      setMilestoneStatus(prev => ({ ...prev, bridge: 'connected' }));

    } catch (error) {
      setMilestoneStatus(prev => ({ ...prev, bridge: 'failed' }));
      trackEvent(ANALYTICS_EVENTS.BRIDGE_FAILED, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [signalKBridge]);

  // Step 2: Download Seed
  const handleDownloadSeed = useCallback(async () => {
    setMilestoneStatus(prev => ({ ...prev, seed: 'downloading' }));
    setDownloadError(null);

    trackEvent(ANALYTICS_EVENTS.SEED_DOWNLOAD_STARTED);
    const downloadStartTime = Date.now();

    try {
      // Use resumable download manager
      downloadManagerRef.current = new ResumableDownloadManager('pacific_starter');

      const localPath = `${documentDirectory}seeds/pacific_starter_v1.parquet`;

      // Ensure directory exists
      const dirInfo = await getInfoAsync(`${documentDirectory}seeds/`);
      if (!dirInfo.exists) {
        await makeDirectoryAsync(`${documentDirectory}seeds/`, { intermediates: true });
      }

      await downloadManagerRef.current.startOrResume(
        DEFAULT_SEED_URL,
        localPath,
        setDownloadProgress
      );

      // Import the downloaded seed
      const metadata = await seedManagerRef.current.importLocalSeed(localPath, 'starlink');
      setSeedMetadata(metadata);

      // Set a mock predicted wind for demo (in production, this comes from the seed)
      setPredictedWind(12.5);

      setMilestoneStatus(prev => ({ ...prev, seed: 'complete' }));

      // Haptic celebration
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      trackEvent(ANALYTICS_EVENTS.SEED_DOWNLOAD_COMPLETE, {
        downloadTime: Date.now() - downloadStartTime,
        fileSizeBytes: metadata.fileSizeBytes,
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Download failed';
      setDownloadError(errorMsg);
      setMilestoneStatus(prev => ({ ...prev, seed: 'failed' }));

      trackEvent(ANALYTICS_EVENTS.SEED_DOWNLOAD_FAILED, { error: errorMsg });
    }
  }, []);

  // Step 3: Verify Consensus
  const handleVerifyConsensus = useCallback(() => {
    setMilestoneStatus(prev => ({ ...prev, verify: 'checking' }));

    // Simulate brief check
    setTimeout(() => {
      const delta = observedWind !== null && predictedWind !== null
        ? Math.abs(observedWind - predictedWind)
        : null;

      const isConsensus = delta !== null && delta < 5;

      setMilestoneStatus(prev => ({
        ...prev,
        verify: isConsensus ? 'consensus' : 'divergent',
      }));

      // Haptic feedback
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(
          isConsensus
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning
        );
      }

      trackEvent(ANALYTICS_EVENTS.CONSENSUS_VERIFIED, {
        isConsensus,
        delta,
        observedWind,
        predictedWind,
      });
    }, 1500);
  }, [observedWind, predictedWind]);

  // Step 4: Opt into Mariner's Code
  const handleCodeOptIn = useCallback(async (enabled: boolean) => {
    setMarinersCodeEnabled(enabled);
    await SecureStore.setItemAsync(MARINERS_CODE_ENABLED_KEY, enabled ? 'true' : 'false');

    if (enabled) {
      setMilestoneStatus(prev => ({ ...prev, code: 'accepted' }));

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      trackEvent(ANALYTICS_EVENTS.MARINERS_CODE_OPTED_IN);
    }
  }, []);

  // Complete onboarding
  const handleComplete = useCallback(async () => {
    await SecureStore.setItemAsync(ONBOARDING_COMPLETE_KEY, 'true');

    trackEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETE, {
      totalTime: Date.now() - onboardingStartTime.current,
      bridgeStatus: milestoneStatus.bridge,
      seedStatus: milestoneStatus.seed,
      verifyStatus: milestoneStatus.verify,
      codeStatus: milestoneStatus.code,
    });

    onComplete();
  }, [onComplete, milestoneStatus]);

  // Check if current step is complete
  const isStepComplete = (step: number): boolean => {
    switch (step) {
      case 0: return milestoneStatus.bridge === 'connected';
      case 1: return milestoneStatus.seed === 'complete';
      case 2: return milestoneStatus.verify === 'consensus' || milestoneStatus.verify === 'divergent';
      case 3: return milestoneStatus.code === 'accepted';
      default: return false;
    }
  };

  // Can proceed to next step?
  const canProceed = isStepComplete(currentStep);

  // All steps complete?
  const allComplete = STEPS.every((_, idx) => isStepComplete(idx));

  // Render step content
  const renderStepContent = () => {
    const step = STEPS[currentStep];

    switch (step.id) {
      case 'bridge':
        return (
          <BridgeStep
            status={milestoneStatus.bridge}
            onConnect={handleConnectBridge}
            onTroubleshoot={() => setTroubleshootVisible(true)}
            currentUrl={signalKUrl}
            onUrlChange={setSignalKUrl}
          />
        );
      case 'seed':
        return (
          <SeedStep
            status={milestoneStatus.seed}
            progress={downloadProgress}
            onDownload={handleDownloadSeed}
            seedMetadata={seedMetadata}
            error={downloadError}
          />
        );
      case 'verify':
        return (
          <VerifyStep
            status={milestoneStatus.verify}
            observedWind={observedWind}
            predictedWind={predictedWind}
            observedPressure={observedPressure}
            onVerify={handleVerifyConsensus}
          />
        );
      case 'code':
        return (
          <CodeStep
            status={milestoneStatus.code}
            onOptIn={handleCodeOptIn}
            isEnabled={marinersCodeEnabled}
          />
        );
    }
  };

  return (
    <View style={styles.container}>
      <BlurView
        intensity={40}
        tint="dark"
        style={StyleSheet.absoluteFillObject}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerIcon}>⚓</Text>
            <Text style={styles.headerTitle}>FIRST WATCH</Text>
            <Text style={styles.headerSubtitle}>
              Complete these milestones to activate your AI Grid connection
            </Text>
          </View>

          {/* Progress Indicators */}
          <View style={styles.progressIndicators}>
            {STEPS.map((step, idx) => (
              <TouchableOpacity
                key={step.id}
                style={[
                  styles.progressDot,
                  idx === currentStep && styles.progressDotActive,
                  isStepComplete(idx) && styles.progressDotComplete,
                ]}
                onPress={() => {
                  // Allow going back to completed steps
                  if (idx <= currentStep || isStepComplete(idx - 1)) {
                    animateToStep(idx);
                  }
                }}
              >
                {isStepComplete(idx) ? (
                  <Text style={styles.progressDotCheck}>✓</Text>
                ) : (
                  <Text style={styles.progressDotNumber}>{idx + 1}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Current Step Card */}
          <Animated.View
            style={[
              styles.stepCard,
              { opacity: fadeAnim },
            ]}
          >
            <View style={styles.stepHeader}>
              <Text style={styles.stepIcon}>{STEPS[currentStep].icon}</Text>
              <View>
                <Text style={styles.stepTitle}>{STEPS[currentStep].title}</Text>
                <Text style={styles.stepSubtitle}>{STEPS[currentStep].subtitle}</Text>
              </View>
            </View>

            <Text style={styles.stepDescription}>
              {STEPS[currentStep].description}
            </Text>

            {renderStepContent()}
          </Animated.View>

          {/* Navigation */}
          <View style={styles.navigation}>
            {currentStep > 0 && (
              <TouchableOpacity
                style={styles.navButtonBack}
                onPress={() => animateToStep(currentStep - 1)}
              >
                <Text style={styles.navButtonBackText}>← Back</Text>
              </TouchableOpacity>
            )}

            <View style={{ flex: 1 }} />

            {currentStep < STEPS.length - 1 ? (
              <TouchableOpacity
                style={[
                  styles.navButtonNext,
                  !canProceed && styles.buttonDisabled,
                ]}
                onPress={() => animateToStep(currentStep + 1)}
                disabled={!canProceed}
              >
                <Text style={styles.navButtonNextText}>
                  Next →
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.completeButton,
                  !allComplete && styles.buttonDisabled,
                ]}
                onPress={handleComplete}
                disabled={!allComplete}
              >
                <Text style={styles.completeButtonText}>
                  Set Sail 🚀
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Skip for now (dev only) */}
          {__DEV__ && (
            <TouchableOpacity
              style={styles.skipButton}
              onPress={handleComplete}
            >
              <Text style={styles.skipButtonText}>Skip (Dev Only)</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Troubleshoot Modal */}
      <TroubleshootModal
        visible={troubleshootVisible}
        onClose={() => setTroubleshootVisible(false)}
        networkInfo={networkInfo}
      />
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LIQUID_GLASS_COLORS.background.primary,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: LIQUID_GLASS_COLORS.text.primary,
    letterSpacing: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: LIQUID_GLASS_COLORS.text.secondary,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
  },

  // Progress Indicators
  progressIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  progressDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: LIQUID_GLASS_COLORS.background.card,
    borderWidth: 2,
    borderColor: LIQUID_GLASS_COLORS.border.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressDotActive: {
    borderColor: LIQUID_GLASS_COLORS.accent.primary,
    backgroundColor: LIQUID_GLASS_COLORS.background.elevated,
  },
  progressDotComplete: {
    backgroundColor: LIQUID_GLASS_COLORS.accent.success,
    borderColor: LIQUID_GLASS_COLORS.accent.success,
  },
  progressDotNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: LIQUID_GLASS_COLORS.text.muted,
  },
  progressDotCheck: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // Step Card
  stepCard: {
    backgroundColor: LIQUID_GLASS_COLORS.background.glass,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: LIQUID_GLASS_COLORS.border.glass,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: LIQUID_GLASS_COLORS.accent.primary,
    letterSpacing: 2,
  },
  stepSubtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: LIQUID_GLASS_COLORS.text.primary,
    marginTop: 2,
  },
  stepDescription: {
    fontSize: 14,
    color: LIQUID_GLASS_COLORS.text.secondary,
    lineHeight: 22,
    marginBottom: 24,
  },
  stepContent: {
    gap: 16,
  },

  // Input
  inputContainer: {
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: LIQUID_GLASS_COLORS.text.secondary,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: LIQUID_GLASS_COLORS.background.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: LIQUID_GLASS_COLORS.text.primary,
    borderWidth: 1,
    borderColor: LIQUID_GLASS_COLORS.border.glass,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  inputHint: {
    fontSize: 11,
    color: LIQUID_GLASS_COLORS.text.muted,
    marginTop: 6,
  },

  // Buttons
  primaryButton: {
    backgroundColor: LIQUID_GLASS_COLORS.accent.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: LIQUID_GLASS_COLORS.accent.primary,
  },
  buttonTextSecondary: {
    color: LIQUID_GLASS_COLORS.accent.primary,
  },
  troubleshootButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: LIQUID_GLASS_COLORS.accent.warning,
  },
  troubleshootButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: LIQUID_GLASS_COLORS.accent.warning,
  },
  helpLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  helpLinkText: {
    fontSize: 13,
    color: LIQUID_GLASS_COLORS.accent.muted,
  },

  // Success/Error States
  successBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.3)',
    gap: 12,
  },
  successIcon: {
    fontSize: 24,
    color: LIQUID_GLASS_COLORS.accent.success,
  },
  successText: {
    fontSize: 16,
    fontWeight: '700',
    color: LIQUID_GLASS_COLORS.accent.success,
  },
  successSubtext: {
    fontSize: 12,
    color: LIQUID_GLASS_COLORS.text.secondary,
    marginTop: 2,
  },
  warningBadge: {
    backgroundColor: 'rgba(255, 179, 0, 0.15)',
    borderColor: 'rgba(255, 179, 0, 0.3)',
  },
  warningIcon: {
    fontSize: 24,
    color: LIQUID_GLASS_COLORS.accent.warning,
  },
  warningText: {
    fontSize: 16,
    fontWeight: '700',
    color: LIQUID_GLASS_COLORS.accent.warning,
  },
  warningSubtext: {
    fontSize: 12,
    color: LIQUID_GLASS_COLORS.text.secondary,
    marginTop: 2,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 82, 82, 0.15)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.3)',
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: LIQUID_GLASS_COLORS.accent.error,
  },

  // Seed Info Card
  seedInfoCard: {
    backgroundColor: LIQUID_GLASS_COLORS.background.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: LIQUID_GLASS_COLORS.border.glass,
  },
  seedInfoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  seedInfoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: LIQUID_GLASS_COLORS.text.primary,
  },
  seedInfoSize: {
    fontSize: 14,
    fontWeight: '600',
    color: LIQUID_GLASS_COLORS.accent.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  seedInfoDesc: {
    fontSize: 12,
    color: LIQUID_GLASS_COLORS.text.muted,
    marginBottom: 16,
  },
  seedInfoStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  seedInfoStat: {
    alignItems: 'center',
  },
  seedInfoStatValue: {
    fontSize: 18,
    fontWeight: '800',
    color: LIQUID_GLASS_COLORS.accent.success,
  },
  seedInfoStatLabel: {
    fontSize: 10,
    color: LIQUID_GLASS_COLORS.text.muted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Progress Bar
  progressContainer: {
    gap: 8,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: LIQUID_GLASS_COLORS.background.card,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: LIQUID_GLASS_COLORS.accent.primary,
    borderRadius: 4,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: {
    fontSize: 12,
    color: LIQUID_GLASS_COLORS.text.secondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '700',
    color: LIQUID_GLASS_COLORS.accent.primary,
  },
  progressHint: {
    fontSize: 11,
    color: LIQUID_GLASS_COLORS.text.muted,
    fontStyle: 'italic',
  },

  // Consensus Grid
  consensusGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: LIQUID_GLASS_COLORS.background.card,
    borderRadius: 16,
    padding: 20,
  },
  consensusColumn: {
    alignItems: 'center',
    flex: 1,
  },
  consensusLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: LIQUID_GLASS_COLORS.text.muted,
    letterSpacing: 1,
    marginBottom: 8,
  },
  consensusIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  consensusValue: {
    fontSize: 20,
    fontWeight: '800',
    color: LIQUID_GLASS_COLORS.text.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  consensusSublabel: {
    fontSize: 10,
    color: LIQUID_GLASS_COLORS.text.muted,
    marginTop: 4,
  },
  consensusDivider: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  consensusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 8,
  },
  consensusBadgeGreen: {
    backgroundColor: 'rgba(0, 230, 118, 0.2)',
  },
  consensusBadgeRed: {
    backgroundColor: 'rgba(255, 82, 82, 0.2)',
  },
  consensusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: LIQUID_GLASS_COLORS.text.primary,
    letterSpacing: 1,
  },
  deltaText: {
    fontSize: 11,
    color: LIQUID_GLASS_COLORS.text.muted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Mariner's Code
  codeExplanation: {
    backgroundColor: LIQUID_GLASS_COLORS.background.card,
    borderRadius: 16,
    padding: 20,
    borderLeftWidth: 3,
    borderLeftColor: LIQUID_GLASS_COLORS.accent.primary,
  },
  codeQuote: {
    fontSize: 16,
    fontStyle: 'italic',
    color: LIQUID_GLASS_COLORS.text.primary,
    marginBottom: 12,
  },
  codeText: {
    fontSize: 14,
    color: LIQUID_GLASS_COLORS.text.secondary,
    lineHeight: 22,
  },
  codeToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: LIQUID_GLASS_COLORS.background.card,
    borderRadius: 12,
    padding: 16,
  },
  codeToggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  codeToggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: LIQUID_GLASS_COLORS.text.primary,
  },
  codeToggleSublabel: {
    fontSize: 12,
    color: LIQUID_GLASS_COLORS.text.muted,
    marginTop: 2,
  },
  privacyNote: {
    flexDirection: 'row',
    backgroundColor: LIQUID_GLASS_COLORS.background.card,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  privacyIcon: {
    fontSize: 20,
  },
  privacyText: {
    flex: 1,
    fontSize: 12,
    color: LIQUID_GLASS_COLORS.text.muted,
    lineHeight: 18,
  },

  // Navigation
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: LIQUID_GLASS_COLORS.border.glass,
  },
  navButtonBack: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  navButtonBackText: {
    fontSize: 14,
    color: LIQUID_GLASS_COLORS.text.secondary,
  },
  navButtonNext: {
    backgroundColor: LIQUID_GLASS_COLORS.accent.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  navButtonNextText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  completeButton: {
    backgroundColor: LIQUID_GLASS_COLORS.accent.success,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  completeButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  skipButton: {
    alignItems: 'center',
    marginTop: 20,
  },
  skipButtonText: {
    fontSize: 12,
    color: LIQUID_GLASS_COLORS.text.muted,
  },

  // Modal
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 10000,
  },
  modalContent: {
    backgroundColor: LIQUID_GLASS_COLORS.background.elevated,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: LIQUID_GLASS_COLORS.border.glass,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: LIQUID_GLASS_COLORS.text.primary,
    marginBottom: 20,
    textAlign: 'center',
  },
  troubleshootItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LIQUID_GLASS_COLORS.background.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  troubleshootIcon: {
    fontSize: 20,
    color: LIQUID_GLASS_COLORS.accent.success,
  },
  troubleshootLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: LIQUID_GLASS_COLORS.text.primary,
  },
  troubleshootValue: {
    fontSize: 12,
    color: LIQUID_GLASS_COLORS.text.secondary,
    marginTop: 2,
  },
  troubleshootChecklist: {
    marginBottom: 20,
  },
  troubleshootCheckTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: LIQUID_GLASS_COLORS.text.primary,
    marginBottom: 12,
  },
  troubleshootCheckItem: {
    fontSize: 13,
    color: LIQUID_GLASS_COLORS.text.secondary,
    marginBottom: 8,
    paddingLeft: 8,
  },
  modalButton: {
    backgroundColor: LIQUID_GLASS_COLORS.accent.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Check if onboarding is complete
// ─────────────────────────────────────────────────────────────────────────────

export async function isOnboardingComplete(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(ONBOARDING_COMPLETE_KEY);
  return value === 'true';
}

export async function resetOnboarding(): Promise<void> {
  await SecureStore.deleteItemAsync(ONBOARDING_COMPLETE_KEY);
}

export default FirstWatchOnboarding;

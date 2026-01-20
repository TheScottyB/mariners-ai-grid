import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useRef, useCallback, createContext, useContext } from 'react';
import { open, DB } from '@op-engineering/op-sqlite';
import { IdentityService, MarinerIdentity } from './src/services/IdentityService';
import { SignalKBridge } from './src/services/SignalKBridge';
import { windDataToGeoJSON, generateStressTestGrid, waveDataToGeoJSON } from './src/utils/geoUtils';
import MarinerMap, { VesselLocation } from './src/components/MarinerMap';
import { HazardReportingModal } from './src/components/HazardReportingModal';
import { PatternAlertStack, ConsensusData } from './src/components/PatternAlert';
import { useSeedManager } from './src/hooks/useSeedManager';
import { PatternMatcher, PatternAlert as PatternAlertType, TelemetrySnapshot } from './src/services/PatternMatcher';
import { VecDB } from './src/services/VecDB';
import { VesselSnapshot } from './src/services/VesselSnapshot';
import { GridSync } from './src/services/GridSync';
import { HazardService } from './src/services/HazardService';
import { TruthChecker, DivergenceReport } from './src/services/TruthChecker';
import { DebrisPredictor } from './src/services/DebrisPredictor';
import { TelemetryService, TelemetrySource } from './src/services/TelemetryService';
import { DevMenu } from './src/components/DevMenu';
import { FAB } from './src/components/FAB';
import FirstWatchOnboarding, { isOnboardingComplete } from './src/components/FirstWatchOnboarding';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import type { FeatureCollection, Point, LineString } from 'geojson';

import { RemoteConfig } from './src/services/RemoteConfig';
import { SQLiteContext, useSQLiteContext } from './src/context/SQLiteContext';

export default function App() {
  const [identity, setIdentity] = useState<MarinerIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [forecastData, setForecastData] = useState<FeatureCollection<Point> | undefined>(undefined);
  
  // Stress Test State
  const [isStressTestActive, setIsStressTestActive] = useState(false);
  const [stressTestData, setStressTestData] = useState<FeatureCollection<Point> | undefined>(undefined);
  
  // Hazard Reporting State
  const [reportingVisible, setReportingVisible] = useState(false);
  const [reportLocation, setReportLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Vessel State (Real-time from Signal K)
  const [vesselLocation, setVesselLocation] = useState<VesselLocation>({
    lat: 37.8, // Default to SF Bay for development
    lng: -122.4,
    heading: 0,
    sog: 0,
    timestamp: Date.now(),
  });

  // Pattern Alert State
  const [activeAlerts, setActiveAlerts] = useState<PatternAlertType[]>([]);
  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState<Set<string>>(new Set());
  const [consensusMap, setConsensusMap] = useState<Map<string, ConsensusData>>(new Map());
  const [lastDivergence, setLastDivergence] = useState<DivergenceReport | null>(null);
  const [debrisPaths, setDebrisPaths] = useState<FeatureCollection<LineString> | undefined>(undefined);
  const [telemetrySource, setTelemetrySource] = useState<TelemetrySource>('device');
  const [devMenuVisible, setDevMenuVisible] = useState(false);
  const [isDownloadingSeed, setIsDownloadingSeed] = useState(false);

  const skBridge = useRef(new SignalKBridge());
  const headerTapCount = useRef(0);
  const headerTapTimer = useRef<NodeJS.Timeout | null>(null);
  const patternMatcherRef = useRef<PatternMatcher | null>(null);
  const vecDbRef = useRef<VecDB | null>(null);
  const vesselSnapshotRef = useRef<VesselSnapshot | null>(null);
  const gridSyncRef = useRef<GridSync | null>(null);
  const truthCheckerRef = useRef<TruthChecker | null>(null);
  const debrisPredictorRef = useRef<DebrisPredictor | null>(null);
  const telemetryServiceRef = useRef<TelemetryService | null>(null);
  const dbRef = useRef<DB | null>(null);
  const lastTelemetryRef = useRef<TelemetrySnapshot | null>(null);
  const activeSeedRef = useRef<any>(null); // Ref to current seed from manager
  const servicesInitializedRef = useRef(false);

  // Weather Seed Manager
  const seedManager = useSeedManager({
    autoSelectForPosition: { lat: vesselLocation.lat, lon: vesselLocation.lng },
  });

  // Keep track of active seed for TruthChecker
  useEffect(() => {
    activeSeedRef.current = seedManager.activeSeed;
  }, [seedManager.activeSeed]);

  // Stress Test Effect
  useEffect(() => {
    if (!isStressTestActive) {
      setStressTestData(undefined);
      return;
    }

    const interval = setInterval(() => {
      const grid = generateStressTestGrid(vesselLocation.lat, vesselLocation.lng);
      setStressTestData(waveDataToGeoJSON(grid));
    }, 100); // 10Hz update rate for stress test

    return () => clearInterval(interval);
  }, [isStressTestActive, vesselLocation.lat, vesselLocation.lng]);

  const initializeServices = useCallback(async () => {
    if (servicesInitializedRef.current) return;
    servicesInitializedRef.current = true;

    let driftInterval: NodeJS.Timeout | null = null;
    try {
      // 0. Initialize Remote Config
      await RemoteConfig.getInstance().initialize();

      // 1. Initialize op-sqlite (Synchronous JSI)
      console.log('[App] Initializing op-sqlite (Zero Latency)...');
      const db = open({ name: 'mariners_grid.db' });
      dbRef.current = db;

      // 2. Initialize VecDB
      const vecDb = new VecDB(db);
      await vecDb.initialize().catch(e => console.warn('[App] VecDB init failed:', e));
      vecDbRef.current = vecDb;

      // Initialize VesselSnapshot
      const vesselSnapshot = new VesselSnapshot(db);
      await vesselSnapshot.initialize().catch(e => console.warn('[App] VesselSnapshot init failed:', e));
      vesselSnapshotRef.current = vesselSnapshot;

      // Initialize HazardService and create schema
      const hazardService = new HazardService(db, identity?.deviceId || 'unknown');
      await hazardService.initSchema().catch(e => console.warn('[App] HazardService init failed:', e));

      // Initialize TruthChecker
      const truthChecker = new TruthChecker(vesselSnapshot, vecDb);
      truthCheckerRef.current = truthChecker;

      // Initialize DebrisPredictor
      const debrisPredictor = new DebrisPredictor(db, hazardService);
      debrisPredictorRef.current = debrisPredictor;
      
      // Initial forecast run
      await debrisPredictor.forecastDrift().catch(e => console.warn('[App] Initial drift forecast failed:', e));
      const initialPaths = await debrisPredictor.getPredictedPathsGeoJSON();
      setDebrisPaths(initialPaths);

      // Periodic drift update
      driftInterval = setInterval(async () => {
        if (debrisPredictorRef.current) {
          await debrisPredictorRef.current.forecastDrift();
          const paths = await debrisPredictorRef.current.getPredictedPathsGeoJSON();
          setDebrisPaths(paths);
        }
      }, 15 * 60 * 1000);

      // Initialize GridSync
      const gridSync = new GridSync(db, vesselSnapshot, vecDb);
      await gridSync.initialize().catch(e => console.warn('[App] GridSync init failed:', e));
      await gridSync.registerBackgroundSync().catch(e => console.warn('[App] Background sync registration failed:', e));
      gridSyncRef.current = gridSync;

      // Initialize TelemetryService
      const telemetryService = TelemetryService.getInstance(skBridge.current);
      await telemetryService.initialize();
      telemetryServiceRef.current = telemetryService;
      setTelemetrySource(telemetryService.getSource());

      // Replace direct Signal K listeners with TelemetryService listeners
      telemetryService.onTelemetry(async (snapshot) => {
        // Update vessel location for map
        setVesselLocation({
          lat: snapshot.position.lat,
          lng: snapshot.position.lon,
          heading: snapshot.heading,
          sog: snapshot.sog,
          timestamp: snapshot.timestamp,
        });

        // 1. Process for pattern matching (alerts)
        if (patternMatcherRef.current) {
          patternMatcherRef.current.processTelemetry(snapshot);
        }
        lastTelemetryRef.current = snapshot;

        // 2. Process for Truth Checking (divergence detection)
        if (truthCheckerRef.current && activeSeedRef.current) {
          const rawSeed = seedManager.getRawSeed(activeSeedRef.current.id);
          if (rawSeed) {
            const report = await truthCheckerRef.current.check(
              snapshot, 
              rawSeed, 
              seedManager.activeTimestep
            );
            
            setLastDivergence(report);

            if (report.isDivergent) {
              console.log(`[App] AI Grid Divergence Level: ${report.level}`);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
          }
        }
      });

      // Connect Signal K (Still needs manual connect if signalk is chosen source)
      skBridge.current.connect();

      // Initialize Pattern Matcher

    } catch (error) {
      console.error('[App] Failed to initialize services:', error);
    }
    return () => {
      if (driftInterval) clearInterval(driftInterval);
    };
  }, [acknowledgedAlerts, identity?.deviceId, seedManager]);

  useEffect(() => {
    async function checkFirstWatch() {
      const idService = IdentityService.getInstance();
      const user = await idService.getOrInitializeIdentity();
      setIdentity(user);

      const complete = await isOnboardingComplete();
      if (!complete) {
        setShowOnboarding(true);
        setLoading(false);
      } else {
        await initializeServices();
        setLoading(false);
      }
    }
    checkFirstWatch();

    return () => {
      skBridge.current.disconnect();
      patternMatcherRef.current?.stop();
    };
  }, [initializeServices]);

  const handleOnboardingComplete = async () => {
    setShowOnboarding(false);
    setLoading(true);
    await initializeServices();
    setLoading(false);
  };

  const handleAcknowledgeAlert = useCallback((alertId: string) => {
    setAcknowledgedAlerts(prev => new Set(prev).add(alertId));
    setActiveAlerts(prev => prev.filter(a => a.id !== alertId));
  }, []);

  const handleHeaderPress = () => {
    headerTapCount.current += 1;
    if (headerTapCount.current === 3) {
      setDevMenuVisible(true);
      headerTapCount.current = 0;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }

    if (headerTapTimer.current) clearTimeout(headerTapTimer.current);
    headerTapTimer.current = setTimeout(() => {
      headerTapCount.current = 0;
    }, 500);
  };

  const handleDownloadSeed = async () => {
    if (isDownloadingSeed) return;
    setIsDownloadingSeed(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    try {
      // For MVP Explorer Mode, we fetch the static Pacific/McHenry starter seed
      await seedManager.downloadSeed(
        'http://192.168.12.172:8082/mock_a9cafafcfcb1_2026011900.seed.zst'
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Seed Downloaded", "New weather data is active.");
    } catch (e) {
      console.warn("Seed download failed:", e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Download Failed", "Check internet connection.");
    } finally {
      setIsDownloadingSeed(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00BFFF" />
        <Text style={styles.loadingText}>Initializing AI Grid...</Text>
      </View>
    );
  }

  if (showOnboarding) {
    return (
      <FirstWatchOnboarding 
        onComplete={handleOnboardingComplete}
        signalKBridge={skBridge.current}
      />
    );
  }

  return (
    <SQLiteContext.Provider value={dbRef.current}>
      <SafeAreaView style={styles.container}>
        <TouchableOpacity activeOpacity={1} onPress={handleHeaderPress} style={styles.header}>
          <Text style={styles.title}>MARINER'S AI</Text>
          <View style={styles.identityBadge}>
            <Text style={styles.badgeText}>ID: {identity?.deviceId.slice(0, 8)}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.mapWrapper}>
          <MarinerMap
            vesselLocation={vesselLocation}
            forecastData={seedManager.windGeoJSON || forecastData}
            waveData={stressTestData || seedManager.waveGeoJSON || undefined}
            debrisPaths={debrisPaths}
            onReportHazard={(loc) => {
              setReportLocation(loc);
              setReportingVisible(true);
            }}
            featureFlags={RemoteConfig.getInstance().getAllFlags()}
            onWarningPress={handleDownloadSeed}
          />

          <PatternAlertStack
            alerts={activeAlerts}
            consensusMap={consensusMap}
            onAcknowledge={handleAcknowledgeAlert}
          />
          
          <FAB 
            icon="⬇️" 
            label="Fetch Seed" 
            onPress={handleDownloadSeed} 
            loading={isDownloadingSeed}
          />
        </View>

        <HazardReportingModal
          visible={reportingVisible}
          location={reportLocation}
          onClose={() => setReportingVisible(false)}
          onSubmit={async (partial) => {
            Alert.alert("Report Sent", "Observation shared with AI Grid.");
            setReportingVisible(false);
          }}
        />

        <StatusBar style="light" />
      </SafeAreaView>

      <DevMenu 
        visible={devMenuVisible}
        onClose={() => setDevMenuVisible(false)}
        telemetrySource={telemetrySource}
        onSourceChange={(src) => {
          if (telemetryServiceRef.current) {
            telemetryServiceRef.current.setSource(src);
            setTelemetrySource(src);
          }
        }}
        vesselLocation={vesselLocation}
        isStressTestActive={isStressTestActive}
        onToggleStressTest={setIsStressTestActive}
      />
    </SQLiteContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#001B3A' },
  loadingContainer: { flex: 1, backgroundColor: '#001B3A', alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#E0F7FA', marginTop: 20 },
  header: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, backgroundColor: '#001B3A', borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.1)' },
  title: { fontSize: 20, fontWeight: '900', color: '#E0F7FA', letterSpacing: 2 },
  identityBadge: { backgroundColor: 'rgba(0, 191, 255, 0.2)', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: '#00BFFF' },
  badgeText: { color: '#00BFFF', fontSize: 10, fontWeight: 'bold' },
  mapWrapper: { flex: 1 }
});

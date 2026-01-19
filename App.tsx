import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useRef, useCallback, createContext, useContext } from 'react';
import { open, DB } from '@op-engineering/op-sqlite';
import { IdentityService, MarinerIdentity } from './src/services/IdentityService';
import { SignalKBridge } from './src/services/SignalKBridge';
import { windDataToGeoJSON } from './src/utils/geoUtils';
import MarinerMap, { VesselLocation } from './src/components/MarinerMap';
import { HazardReportingModal } from './src/components/HazardReportingModal';
import { PatternAlertStack, ConsensusData } from './src/components/PatternAlert';
import { useSeedManager } from './src/hooks/useSeedManager';
import { PatternMatcher, PatternAlert as PatternAlertType, TelemetrySnapshot } from './src/services/PatternMatcher';
import { VecDB } from './src/services/VecDB';
import { VesselSnapshot } from './src/services/VesselSnapshot';
import { GridSync } from './src/services/GridSync';
import { HazardService } from './src/services/HazardService';
import FirstWatchOnboarding, { isOnboardingComplete } from './src/components/FirstWatchOnboarding';
import type { FeatureCollection, Point } from 'geojson';

import { RemoteConfig } from './src/services/RemoteConfig';

// Compatibility context for components using useSQLiteContext
export const SQLiteContext = createContext<DB | null>(null);
export const useSQLiteContext = () => useContext(SQLiteContext);

export default function App() {
  const [identity, setIdentity] = useState<MarinerIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [forecastData, setForecastData] = useState<FeatureCollection<Point> | undefined>(undefined);
  
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

  const skBridge = useRef(new SignalKBridge());
  const patternMatcherRef = useRef<PatternMatcher | null>(null);
  const vecDbRef = useRef<VecDB | null>(null);
  const vesselSnapshotRef = useRef<VesselSnapshot | null>(null);
  const gridSyncRef = useRef<GridSync | null>(null);
  const dbRef = useRef<DB | null>(null);
  const lastTelemetryRef = useRef<TelemetrySnapshot | null>(null);

  // Weather Seed Manager
  const seedManager = useSeedManager({
    autoSelectForPosition: { lat: vesselLocation.lat, lon: vesselLocation.lng },
  });

  const initializeServices = useCallback(async () => {
    try {
      // 0. Initialize Remote Config
      await RemoteConfig.getInstance().initialize();

      // 1. Initialize op-sqlite (Synchronous JSI)
      // Extension loading is handled automatically via package.json config
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

      // Initialize GridSync
      const gridSync = new GridSync(db, vesselSnapshot, vecDb);
      await gridSync.initialize().catch(e => console.warn('[App] GridSync init failed:', e));
      await gridSync.registerBackgroundSync().catch(e => console.warn('[App] Background sync registration failed:', e));
      gridSyncRef.current = gridSync;

      // Connect Signal K (Mock simulation by default in bridge)
      skBridge.current.connect((delta) => {
        if (delta.updates) {
          delta.updates.forEach((update: any) => {
            update.values.forEach((val: any) => {
              if (val.path === 'navigation.position') {
                setVesselLocation(prev => ({
                  ...prev,
                  lat: val.value.latitude,
                  lng: val.value.longitude,
                  timestamp: Date.now(),
                }));
              }
            });
          });
        }
      });

      // Initialize Pattern Matcher
      const matcher = new PatternMatcher(db);
      await matcher.initialize();
      matcher.start(async (alert) => {
        if (acknowledgedAlerts.has(alert.id)) return;

        // Generate Consensus Data using Vector DB Vibe Search
        if (vecDbRef.current) {
          try {
            const similar = await vecDbRef.current.vibeSearch(alert.currentConditions, { limit: 5 });
            const consensusData: ConsensusData = {
              localMatch: {
                patternId: alert.matchedPattern.id,
                label: alert.matchedPattern.label || 'Unknown Pattern',
                similarity: alert.matchedPattern.similarity,
                outcome: alert.matchedPattern.outcome || 'Uncertain Outcome',
              },
              vibeSearchResults: similar,
            };
            setConsensusMap(prev => new Map(prev).set(alert.id, consensusData));
          } catch (e) {
            console.warn('[App] Consensus generation failed:', e);
          }
        }

        setActiveAlerts(prev => [alert, ...prev.filter(a => a.id !== alert.id)]);
      });
      patternMatcherRef.current = matcher;

      // Connect bridge telemetry to matcher
      skBridge.current.onTelemetry((snapshot) => {
        matcher.processTelemetry(snapshot);
        lastTelemetryRef.current = snapshot;
      });

    } catch (error) {
      console.error('[App] Failed to initialize services:', error);
    }
  }, [acknowledgedAlerts]);

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
        <View style={styles.header}>
          <Text style={styles.title}>MARINER'S AI</Text>
          <View style={styles.identityBadge}>
            <Text style={styles.badgeText}>ID: {identity?.deviceId.slice(0, 8)}</Text>
          </View>
        </View>

        <View style={styles.mapWrapper}>
          <MarinerMap
            vesselLocation={vesselLocation}
            forecastData={seedManager.windGeoJSON || forecastData}
            onReportHazard={(loc) => {
              setReportLocation(loc);
              setReportingVisible(true);
            }}
            featureFlags={RemoteConfig.getInstance().getAllFlags()}
          />

          <PatternAlertStack
            alerts={activeAlerts}
            consensusMap={consensusMap}
            onAcknowledge={handleAcknowledgeAlert}
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

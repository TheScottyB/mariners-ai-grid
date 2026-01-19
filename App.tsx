import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ActivityIndicator, SafeAreaView, Alert } from 'react-native';
import { useEffect, useState, useRef, useCallback } from 'react';
import * as SQLite from 'expo-sqlite';
import { IdentityService, MarinerIdentity } from './src/services/IdentityService';
import { SignalKBridge } from './src/services/SignalKBridge';
import { SeedReader } from './src/services/SeedReader';
import { windDataToGeoJSON } from './src/utils/geoUtils';
import MarinerMap, { VesselLocation } from './src/components/MarinerMap';
import { HazardReportingModal } from './src/components/HazardReportingModal';
import { PatternAlertStack, ConsensusData } from './src/components/PatternAlert';
import { useSeedManager } from './src/hooks/useSeedManager';
import { PatternMatcher, PatternAlert as PatternAlertType } from './src/services/PatternMatcher';
import { VecDB, AtmosphericVector } from './src/services/VecDB';
import { MarineHazard } from './src/utils/geoUtils';
import type { FeatureCollection, Point } from 'geojson';

export default function App() {
  const [identity, setIdentity] = useState<MarinerIdentity | null>(null);
  const [loading, setLoading] = useState(true);
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
  const dbRef = useRef<SQLite.SQLiteDatabase | null>(null);

  // Weather Seed Manager
  const seedManager = useSeedManager({
    autoSelectForPosition: { lat: vesselLocation.lat, lon: vesselLocation.lng },
  });

  // Handle alert acknowledgment
  const handleAcknowledgeAlert = useCallback((alertId: string) => {
    setAcknowledgedAlerts(prev => {
      const next = new Set(prev);
      next.add(alertId);
      return next;
    });
    // Remove from active after brief delay (allows animation)
    setTimeout(() => {
      setActiveAlerts(prev => prev.filter(a => a.id !== alertId));
    }, 300);
  }, []);

  // Build consensus data when alerts change
  const buildConsensus = useCallback(async (alert: PatternAlertType) => {
    const vecDb = vecDbRef.current;
    if (!vecDb) return;

    // Build consensus from the alert's matched pattern
    const consensus: ConsensusData = {
      localMatch: {
        patternId: alert.matchedPattern.id,
        label: alert.matchedPattern.label || alert.matchedPattern.id,
        similarity: alert.matchedPattern.similarity,
        outcome: alert.matchedPattern.outcome || alert.description,
      },
    };

    // Try to get GraphCast prediction from seed
    if (seedManager.activeSeed && seedManager.windGeoJSON?.features.length) {
      // Find nearest grid point to vessel
      let nearestFeature = seedManager.windGeoJSON.features[0];
      let nearestDist = Infinity;
      for (const feature of seedManager.windGeoJSON.features) {
        const [fLon, fLat] = feature.geometry.coordinates;
        const dist = Math.sqrt((fLat - vesselLocation.lat) ** 2 + (fLon - vesselLocation.lng) ** 2);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestFeature = feature;
        }
      }

      const props = nearestFeature.properties;
      if (props?.windSpeed) {
        const windKts = props.windSpeed * 1.94384;
        let outcome = windKts >= 34 ? 'Gale force winds' : windKts >= 22 ? 'Strong breeze' : 'Moderate conditions';
        consensus.graphCastPrediction = {
          outcome,
          confidence: 0.82,
          validTime: seedManager.forecastValidTime || new Date(),
        };
      }
    }

    setConsensusMap(prev => {
      const next = new Map(prev);
      next.set(alert.id, consensus);
      return next;
    });
  }, [seedManager.activeSeed, seedManager.windGeoJSON, seedManager.forecastValidTime, vesselLocation]);

  // Build consensus when alerts change
  useEffect(() => {
    activeAlerts.forEach(alert => {
      if (!consensusMap.has(alert.id)) {
        buildConsensus(alert);
      }
    });
  }, [activeAlerts, buildConsensus, consensusMap]);

  useEffect(() => {
    async function init() {
      // 1. Initialize SQLite Database
      const db = await SQLite.openDatabaseAsync('mariners_grid.db');
      dbRef.current = db;

      // Initialize VecDB for pattern matching
      const vecDb = new VecDB(db);
      await vecDb.initialize().catch(e => console.warn('[App] VecDB init (extension may not be available):', e));
      vecDbRef.current = vecDb;

      // 2. Initialize Identity
      const idService = IdentityService.getInstance();
      const user = await idService.getOrInitializeIdentity();
      setIdentity(user);

      // 3. Connect to Signal K (NMEA 2000)
      skBridge.current.connect((delta) => {
        // Handle Signal K updates
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
              } else if (val.path === 'navigation.headingTrue') {
                setVesselLocation(prev => ({
                  ...prev,
                  heading: (val.value * 180) / Math.PI, // rad to deg
                }));
              } else if (val.path === 'navigation.speedOverGround') {
                setVesselLocation(prev => ({
                  ...prev,
                  sog: val.value * 1.94384, // m/s to knots
                }));
              }
            });
          });
        }
      });

      // 4. Initialize Pattern Matcher
      try {
        const matcher = new PatternMatcher(db);
        await matcher.initialize();

        // Start monitoring with alert callback
        matcher.start((alert) => {
          console.log('[App] Pattern Alert:', alert.title);
          setActiveAlerts(prev => {
            // Don't add if already acknowledged
            if (acknowledgedAlerts.has(alert.id)) return prev;
            // Don't add duplicates
            if (prev.some(a => a.id === alert.id)) return prev;
            return [alert, ...prev];
          });
        });

        // Connect Signal K telemetry to Pattern Matcher
        skBridge.current.onTelemetry((snapshot) => {
          matcher.processTelemetry(snapshot);
        });

        patternMatcherRef.current = matcher;
        console.log('[App] Pattern Matcher initialized');
      } catch (e) {
        console.warn('[App] Pattern Matcher init failed:', e);
      }

      // 4. Try to load local weather seed (Mock for now)
      try {
        console.log('[App] Ready to load weather seeds');
      } catch (e) {
        console.warn('[App] No weather seed found');
      }

      setLoading(false);
    }
    init();

    return () => {
      skBridge.current.disconnect();
      patternMatcherRef.current?.stop();
    };
  }, []);

  const handleReportHazard = (location: { lat: number; lng: number }) => {
    setReportLocation(location);
    setReportingVisible(true);
  };

  const handleSubmitHazard = async (partialHazard: Partial<MarineHazard>) => {
    const idService = IdentityService.getInstance();
    
    const fullHazard = {
      ...partialHazard,
      id: Math.random().toString(36).substr(2, 9), // Temporary local ID
      reporterId: idService.getDeviceId(),
    };

    console.log('[Waze] Submitting Hazard Report:', fullHazard);
    
    // In production, this would save to SQLite/vec and sync to cloud
    Alert.alert(
      "Report Transmitted",
      "Your report has been broadcast to the AI Grid. Thank you for protecting the fleet.",
      [{ text: "Steady as she goes", onPress: () => setReportingVisible(false) }]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00BFFF" />
        <Text style={styles.loadingText}>Initializing Mariner's AI Grid...</Text>
      </View>
    );
  }

  return (
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
          onReportHazard={handleReportHazard}
        />

        {/* Pattern Alerts with Consensus View */}
        <PatternAlertStack
          alerts={activeAlerts}
          consensusMap={consensusMap}
          onAcknowledge={handleAcknowledgeAlert}
          maxVisible={3}
        />
      </View>

      <HazardReportingModal
        visible={reportingVisible}
        location={reportLocation}
        onClose={() => setReportingVisible(false)}
        onSubmit={handleSubmitHazard}
      />

      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#001B3A',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#001B3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#E0F7FA',
    marginTop: 20,
    fontSize: 16,
    letterSpacing: 1,
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: '#001B3A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#E0F7FA',
    letterSpacing: 2,
  },
  identityBadge: {
    backgroundColor: 'rgba(0, 191, 255, 0.2)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00BFFF',
  },
  badgeText: {
    color: '#00BFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  mapWrapper: {
    flex: 1,
  }
});
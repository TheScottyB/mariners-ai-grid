import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ActivityIndicator, SafeAreaView, Alert } from 'react-native';
import { useEffect, useState, useRef } from 'react';
import { IdentityService, MarinerIdentity } from './src/services/IdentityService';
import { SignalKBridge } from './src/services/SignalKBridge';
import { SeedReader } from './src/services/SeedReader';
import { windDataToGeoJSON } from './src/utils/geoUtils';
import MarinerMap, { VesselLocation } from './src/components/MarinerMap';
import { HazardReportingModal } from './src/components/HazardReportingModal';
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

  const skBridge = useRef(new SignalKBridge());

  useEffect(() => {
    async function init() {
      // 1. Initialize Identity
      const idService = IdentityService.getInstance();
      const user = await idService.getOrInitializeIdentity();
      setIdentity(user);
      
      // 2. Connect to Signal K (NMEA 2000)
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

      // 3. Try to load local weather seed (Mock for now)
      try {
        // In a real scenario, this file would be downloaded or Airdropped
        // const seed = await SeedReader.loadSeed(FileSystem.documentDirectory + 'current.seed.zst');
        // const windData = SeedReader.extractWindData(seed, 0); // Current time step
        // setForecastData(windDataToGeoJSON(windData));
        console.log('[App] Ready to load weather seeds');
      } catch (e) {
        console.warn('[App] No weather seed found');
      }

      setLoading(false);
    }
    init();

    return () => {
      skBridge.current.disconnect();
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
          forecastData={forecastData}
          onReportHazard={handleReportHazard}
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
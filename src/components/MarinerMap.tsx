/**
 * Mariner's AI Grid - MarinerMap Tactical Display
 * The operational heart of the app. Integrates:
 * 1. AI Weather Forecast (Wind Barbs from local GraphCast)
 * 2. "Waze" Social Hazards (Crowdsourced marine reports)
 * 3. Real-time Vessel Position (NMEA 2000 via Signal K)
 *
 * Optimized for 60 FPS rendering using Mapbox GL Native + Expo Fabric.
 */

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import Mapbox, {
  MapView,
  Camera,
  ShapeSource,
  SymbolLayer,
  PointAnnotation,
  UserLocation,
} from '@rnmapbox/maps';
import { useSQLiteContext } from '../../App';
import type { FeatureCollection, Point } from 'geojson';

import {
  hazardsToGeoJSON,
  windDataToGeoJSON,
  MarineHazard,
  WindDataPoint,
  distanceNM,
} from '../utils/geoUtils';
import { usePowerSaveMode } from '../hooks/usePowerSaveMode';
import { FeatureFlags } from '../services/RemoteConfig';

// Initialize Mapbox - Token should be in .env as EXPO_PUBLIC_MAPBOX_TOKEN
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '');

export interface VesselLocation {
  lat: number;
  lng: number;
  heading: number; // True heading in degrees
  sog: number; // Speed over ground in knots
  timestamp: number;
}

export interface MarinerMapProps {
  /** GeoJSON FeatureCollection of wind forecast data from local AI */
  forecastData?: FeatureCollection<Point>;
  /** GeoJSON FeatureCollection of wave data */
  waveData?: FeatureCollection<Point>;
  /** Current vessel position from Signal K bridge */
  vesselLocation: VesselLocation;
  /** Search radius for hazards in nautical miles */
  hazardSearchRadiusNm?: number;
  /** Callback when user taps on a hazard */
  onHazardPress?: (hazard: MarineHazard) => void;
  /** Callback when user long-presses to report a new hazard */
  onReportHazard?: (location: { lat: number; lng: number }) => void;
  /** Feature flags for UI toggles */
  featureFlags?: FeatureFlags;
}

export const MarinerMap: React.FC<MarinerMapProps> = ({
  forecastData,
  waveData,
  vesselLocation,
  hazardSearchRadiusNm = 50,
  onHazardPress,
  onReportHazard,
  featureFlags,
}) => {
  const mapRef = useRef<MapView>(null);
  const db = useSQLiteContext();
  const [hazards, setHazards] = useState<MarineHazard[]>([]);
  const [dataFreshness, setDataFreshness] = useState<'fresh' | 'stale' | 'expired'>('fresh');

  // Power Save Mode integration
  const {
    isEnabled: isPowerSaveEnabled,
    targetFps,
    reason: powerSaveReason,
    batteryLevel,
    enablePowerSave,
    disablePowerSave,
  } = usePowerSaveMode(vesselLocation.heading);
  
  // Feature Flags
  const isSocialEnabled = featureFlags?.socialReporting ?? true;
  const isNightWatchEnabled = featureFlags?.nightWatch ?? false;

  // Convert forecast data to GeoJSON if it's raw wind data
  const windGeoJSON = useMemo(() => {
    if (forecastData) return forecastData;
    // Return empty collection if no data
    return {
      type: 'FeatureCollection' as const,
      features: [],
    };
  }, [forecastData]);

  // Fetch "Waze" Social Hazards from local SQLite/vec
  useEffect(() => {
    if (!isSocialEnabled || !db) {
        setHazards([]);
        return;
    }

    const fetchHazards = async () => {
      try {
        const latDelta = hazardSearchRadiusNm / 60; // 1 degree ≈ 60nm
        const lonDelta = hazardSearchRadiusNm / (60 * Math.cos((vesselLocation.lat * Math.PI) / 180));

        const result = await db.execute(
          `SELECT * FROM marine_hazards
           WHERE lat BETWEEN ? AND ?
           AND lon BETWEEN ? AND ?
           AND reported_at > ?
           ORDER BY reported_at DESC
           LIMIT 100`,
          [
            vesselLocation.lat - latDelta,
            vesselLocation.lat + latDelta,
            vesselLocation.lng - lonDelta,
            vesselLocation.lng + lonDelta,
            Date.now() - 24 * 60 * 60 * 1000, // Last 24 hours
          ]
        );

        const results = result.rows || [];

        // Filter by actual distance (bounding box is approximate)
        const filtered = results.filter(
          (h: any) => distanceNM(vesselLocation.lat, vesselLocation.lng, h.lat, h.lon) <= hazardSearchRadiusNm
        );

        setHazards(filtered.map((h: any) => ({
          id: h.id,
          type: h.type,
          description: h.description,
          lat: h.lat,
          lon: h.lon,
          reportedAt: h.reported_at,
          reporterId: h.reporter_id,
          verified: !!h.verified,
          confidence: h.confidence,
        })));
      } catch (error) {
        // Table might not exist yet - that's OK for MVP
        console.log('Hazard fetch skipped:', error);
      }
    };

    fetchHazards();
    // Refresh hazards every 30 seconds
    const interval = setInterval(fetchHazards, 30000);
    return () => clearInterval(interval);
  }, [vesselLocation.lat, vesselLocation.lng, hazardSearchRadiusNm, db, isSocialEnabled]);

  // Check data freshness (for the "Amber Warning" system)
  useEffect(() => {
    if (!forecastData || !forecastData.features.length) {
      setDataFreshness('expired');
      return;
    }

    const latestTimestamp = Math.max(
      ...forecastData.features
        .map((f) => f.properties?.timestamp as number)
        .filter(Boolean)
    );

    const ageHours = (Date.now() - latestTimestamp) / (1000 * 60 * 60);

    if (ageHours < 6) {
      setDataFreshness('fresh');
    } else if (ageHours < 12) {
      setDataFreshness('stale');
    } else {
      setDataFreshness('expired');
    }
  }, [forecastData]);

  // Handle long press for hazard reporting
  const handleLongPress = (event: any) => {
    if (!isSocialEnabled) return;
    
    const { geometry } = event;
    if (geometry && onReportHazard) {
      onReportHazard({
        lat: geometry.coordinates[1],
        lng: geometry.coordinates[0],
      });
    }
  };

  // Convert hazards to GeoJSON
  const hazardGeoJSON = useMemo(() => hazardsToGeoJSON(hazards), [hazards]);

  return (
    <View style={styles.container}>
      {/* Data Freshness Warning Banner */}
      {dataFreshness !== 'fresh' && (
        <View
          style={[
            styles.warningBanner,
            dataFreshness === 'stale' ? styles.warningAmber : styles.warningRed,
          ]}
        >
          <Text style={styles.warningText}>
            {dataFreshness === 'stale'
              ? '⚠️ Weather data is 6-12 hours old'
              : '🔴 Weather data expired - seek fresh download'}
          </Text>
        </View>
      )}

      {/* Power Save Mode Indicator */}
      {isPowerSaveEnabled && (
        <TouchableOpacity style={styles.powerSaveBanner} onPress={disablePowerSave}>
          <Text style={styles.powerSaveText}>
            🔋 Power Save ({powerSaveReason}) - Tap to disable
          </Text>
        </TouchableOpacity>
      )}

      <MapView
        ref={mapRef}
        style={styles.map}
        styleURL={isNightWatchEnabled ? Mapbox.StyleURL.Dark : Mapbox.StyleURL.Outdoors} 
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={true}
        scaleBarEnabled={true}
        onLongPress={handleLongPress}
        // Apply power save mode FPS limit
        // Note: Mapbox doesn't directly support FPS limiting,
        // but we can reduce animation smoothness
      >
        <Camera
          zoomLevel={8}
          centerCoordinate={[vesselLocation.lng, vesselLocation.lat]}
          followUserLocation={false} // We use vessel location from Signal K
          animationMode="flyTo"
          animationDuration={isPowerSaveEnabled ? 0 : 500}
        />

        {/* User's device location (backup if no Signal K) */}
        <UserLocation visible={false} />

        {/* 1.5. The Wave Layer (Directional Arrows) */}
        {waveData && waveData.features.length > 0 && (
          <ShapeSource id="waveSource" shape={waveData}>
            <SymbolLayer
              id="waveArrows"
              style={{
                iconImage: ['get', 'iconName'],
                iconRotate: ['get', 'mwd'],
                iconSize: ['get', 'iconSize'],
                iconOpacity: 0.6,
                iconAllowOverlap: false,
              }}
            />
          </ShapeSource>
        )}

        {/* 2. The AI Forecast Layer (Wind Barbs) */}
        {windGeoJSON.features.length > 0 && (
          <ShapeSource id="windSource" shape={windGeoJSON}>
            <SymbolLayer
              id="windBarbs"
              style={{
                iconImage: ['get', 'barb_icon'],
                iconRotate: ['get', 'wind_direction'],
                iconAllowOverlap: false, // Auto-declutter at lower zoom
                iconSize: 0.8,
                iconOpacity: dataFreshness === 'expired' ? 0.4 : 0.9,
              }}
            />
          </ShapeSource>
        )}

        {/* 3. The "Waze" Layer (Social Hazard Pins) */}
        {isSocialEnabled && hazardGeoJSON.features.length > 0 && (
          <ShapeSource
            id="hazardSource"
            shape={hazardGeoJSON}
            onPress={(event) => {
              const feature = event.features?.[0];
              if (feature && onHazardPress) {
                const hazard = hazards.find((h) => h.id === feature.id);
                if (hazard) onHazardPress(hazard);
              }
            }}
          >
            <SymbolLayer
              id="hazardIcons"
              style={{
                iconImage: [
                  'match',
                  ['get', 'type'],
                  'debris',
                  'warning-triangle',
                  'surge',
                  'anchor',
                  'whale',
                  'circle',
                  'fishing_gear',
                  'circle',
                  'shallow',
                  'circle',
                  'circle', // default
                ],
                iconSize: 1.2,
                iconColor: ['get', 'iconColor'],
                iconAllowOverlap: true, // Always show hazards
                textField: ['get', 'description'],
                textOffset: [0, 1.5],
                textSize: 12,
                textColor: '#FF4500', // High-visibility safety orange
                textHaloColor: '#000000',
                textHaloWidth: 1,
                textMaxWidth: 10,
              }}
            />
          </ShapeSource>
        )}

        {/* 4. Real-Time Vessel Marker (NMEA 2000 Feed) */}
        <PointAnnotation
          id="vessel"
          coordinate={[vesselLocation.lng, vesselLocation.lat]}
        >
          <View
            style={[
              styles.vesselMarker,
              { transform: [{ rotate: `${vesselLocation.heading}deg` }] },
            ]}
          >
            <View style={styles.vesselTriangle} />
          </View>
        </PointAnnotation>
      </MapView>

      {/* Status Bar Overlay */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          HDG: {Math.round(vesselLocation.heading)}° | SOG: {vesselLocation.sog.toFixed(1)}kt
        </Text>
        <Text style={styles.statusText}>
          🔋 {Math.round(batteryLevel * 100)}%
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#001B3A', // Deep ocean blue
  },
  map: {
    flex: 1,
  },
  warningBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: 8,
    paddingHorizontal: 16,
    zIndex: 100,
  },
  warningAmber: {
    backgroundColor: 'rgba(255, 179, 0, 0.9)', // Signal Amber
  },
  warningRed: {
    backgroundColor: 'rgba(220, 53, 69, 0.9)',
  },
  warningText: {
    color: '#000',
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 14,
  },
  powerSaveBanner: {
    position: 'absolute',
    top: 40,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0, 96, 100, 0.9)', // Surface Teal
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    zIndex: 100,
  },
  powerSaveText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 12,
  },
  vesselMarker: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vesselTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 20,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#00BFFF', // Bright cyan vessel marker
  },
  statusBar: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 27, 58, 0.85)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'monospace',
  },
});

export default MarinerMap;

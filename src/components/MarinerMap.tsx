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
  LineLayer,
  PointAnnotation,
  UserLocation,
  Images,
} from '@rnmapbox/maps';
import { useSQLiteContext } from '../context/SQLiteContext';
import type { FeatureCollection, Point, LineString } from 'geojson';

import {
  hazardsToGeoJSON,
  MarineHazard,
  distanceNM,
} from '../utils/geoUtils';
import { usePowerSaveMode } from '../hooks/usePowerSaveMode';
import { FeatureFlags } from '../services/RemoteConfig';

// Initialize Mapbox - Token should be in .env as EXPO_PUBLIC_MAPBOX_TOKEN
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '');

const WIND_BARBS = {
  'wind-calm': require('../../assets/wind-barbs/wind-calm.png'),
  'wind-5': require('../../assets/wind-barbs/wind-5.png'),
  'wind-10': require('../../assets/wind-barbs/wind-10.png'),
  'wind-15': require('../../assets/wind-barbs/wind-15.png'),
  'wind-20': require('../../assets/wind-barbs/wind-20.png'),
  'wind-25': require('../../assets/wind-barbs/wind-25.png'),
  'wind-30': require('../../assets/wind-barbs/wind-30.png'),
  'wind-35': require('../../assets/wind-barbs/wind-35.png'),
  'wind-40': require('../../assets/wind-barbs/wind-40.png'),
  'wind-45': require('../../assets/wind-barbs/wind-45.png'),
  'wind-50': require('../../assets/wind-barbs/wind-50.png'),
  'wind-55': require('../../assets/wind-barbs/wind-55.png'),
  'wind-60': require('../../assets/wind-barbs/wind-60.png'),
  'wind-65': require('../../assets/wind-barbs/wind-65.png'),
  'wind-65plus': require('../../assets/wind-barbs/wind-65plus.png'),
};

export interface VesselLocation {
  lat: number;
  lng: number;
  heading: number;
  sog: number;
  timestamp: number;
}

export interface MarinerMapProps {
  forecastData?: FeatureCollection<Point>;
  waveData?: FeatureCollection<Point>;
  debrisPaths?: FeatureCollection<LineString>;
  vesselLocation: VesselLocation;
  hazardSearchRadiusNm?: number;
  onHazardPress?: (hazard: MarineHazard) => void;
  onReportHazard?: (location: { lat: number; lng: number }) => void;
  featureFlags?: FeatureFlags;
  onWarningPress?: () => void;
}

export const MarinerMap: React.FC<MarinerMapProps> = ({
  forecastData,
  waveData,
  debrisPaths,
  vesselLocation,
  hazardSearchRadiusNm = 50,
  onHazardPress,
  onReportHazard,
  featureFlags,
  onWarningPress,
}) => {
  const mapRef = useRef<MapView>(null);
  const cameraRef = useRef<Camera>(null);
  const db = useSQLiteContext();
  const [hazards, setHazards] = useState<MarineHazard[]>([]);
  const [dataFreshness, setDataFreshness] = useState<'fresh' | 'stale' | 'expired'>('fresh');

  const {
    isEnabled: isPowerSaveEnabled,
    reason: powerSaveReason,
    batteryLevel,
    disablePowerSave,
  } = usePowerSaveMode(vesselLocation.heading);
  
  const isSocialEnabled = featureFlags?.socialReporting ?? true;
  const isNightWatchEnabled = featureFlags?.nightWatch ?? false;

  const windGeoJSON = useMemo(() => {
    return forecastData || { type: 'FeatureCollection' as const, features: [] };
  }, [forecastData]);

  useEffect(() => {
    if (!isSocialEnabled || !db) {
        setHazards([]);
        return;
    }
    const fetchHazards = async () => {
      try {
        const latDelta = hazardSearchRadiusNm / 60;
        const lonDelta = hazardSearchRadiusNm / (60 * Math.cos((vesselLocation.lat * Math.PI) / 180));
        const result = await db.execute(
          `SELECT * FROM marine_hazards WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND reported_at > ? ORDER BY reported_at DESC LIMIT 100`,
          [vesselLocation.lat - latDelta, vesselLocation.lat + latDelta, vesselLocation.lng - lonDelta, vesselLocation.lng + lonDelta, Date.now() - 24 * 60 * 60 * 1000]
        );
        const results = result.rows || [];
        const filtered = results.filter((h: any) => distanceNM(vesselLocation.lat, vesselLocation.lng, h.lat, h.lon) <= hazardSearchRadiusNm);
        setHazards(filtered.map((h: any) => ({
          id: h.id, type: h.type, description: h.description, lat: h.lat, lon: h.lon, reportedAt: h.reported_at, reporterId: h.reporter_id, verified: !!h.verified, confidence: h.confidence,
        })));
      } catch (error) { console.log('Hazard fetch skipped:', error); }
    };
    fetchHazards();
    const interval = setInterval(fetchHazards, 30000);
    return () => clearInterval(interval);
  }, [vesselLocation.lat, vesselLocation.lng, hazardSearchRadiusNm, db, isSocialEnabled]);

  useEffect(() => {
    if (!forecastData || !forecastData.features.length) {
      setDataFreshness('expired');
      return;
    }
    const latestTimestamp = Math.max(...forecastData.features.map((f) => f.properties?.timestamp as number).filter(Boolean));
    const ageHours = (Date.now() - latestTimestamp) / (1000 * 60 * 60);
    if (ageHours < 6) setDataFreshness('fresh');
    else if (ageHours < 12) setDataFreshness('stale');
    else setDataFreshness('expired');

    // AUTO-CENTER on data when it changes
    if (forecastData.features.length > 0) {
        const features = forecastData.features;
        const lats = features.map(f => (f.geometry as Point).coordinates[1]);
        const lons = features.map(f => (f.geometry as Point).coordinates[0]);
        const centerLat = (Math.max(...lats) + Math.min(...lats)) / 2;
        const centerLon = (Math.max(...lons) + Math.min(...lons)) / 2;
        cameraRef.current?.setCamera({
            centerCoordinate: [centerLon, centerLat],
            zoomLevel: 7,
            animationDuration: 1500,
        });
    }
  }, [forecastData]);

  const handleLongPress = (event: any) => {
    if (!isSocialEnabled) return;
    const { geometry } = event;
    if (geometry && onReportHazard) {
      onReportHazard({ lat: geometry.coordinates[1], lng: geometry.coordinates[0] });
    }
  };

  const hazardGeoJSON = useMemo(() => hazardsToGeoJSON(hazards), [hazards]);

  return (
    <View style={styles.container}>
      {dataFreshness !== 'fresh' && (
        <TouchableOpacity
          style={[styles.warningBanner, dataFreshness === 'stale' ? styles.warningAmber : styles.warningRed]}
          onPress={onWarningPress}
          activeOpacity={0.8}
        >
          <Text style={styles.warningText}>
            {dataFreshness === 'stale' ? '⚠️ Weather data is 6-12 hours old (Tap to Refresh)' : '🔴 Weather data expired - Tap to Download Seed'}
          </Text>
        </TouchableOpacity>
      )}

      {isPowerSaveEnabled && (
        <TouchableOpacity style={styles.powerSaveBanner} onPress={disablePowerSave}>
          <Text style={styles.powerSaveText}>🔋 Power Save ({powerSaveReason}) - Tap to disable</Text>
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
      >
        <Images images={WIND_BARBS} />
        <Camera
          ref={cameraRef}
          zoomLevel={8}
          centerCoordinate={[vesselLocation.lng, vesselLocation.lat]}
          followUserLocation={false}
          animationMode="flyTo"
          animationDuration={isPowerSaveEnabled ? 0 : 500}
        />
        <UserLocation visible={false} />

                  {waveData && waveData.features.length > 0 && (
                    <ShapeSource id="waveSource" shape={waveData}>
                      <SymbolLayer
                        id="waveArrows"
                        style={{
                          textField: '▲',
                          textRotate: ['get', 'mwd'],
                          textSize: ['interpolate', ['linear'], ['get', 'swh'], 0, 8, 5, 24],
                          textColor: '#00BFFF',
                          textOpacity: 0.7,
                          textAllowOverlap: true,
                          textIgnorePlacement: true,
                          textOffset: [0, 1.2], // Offset down so it sits below the wind barb
                        }}
                      />
                    </ShapeSource>
                  )}
        {debrisPaths && debrisPaths.features.length > 0 && (
          <ShapeSource id="debrisPathSource" shape={debrisPaths}>
            <LineLayer id="debrisPathLines" style={{ lineColor: '#FFD700', lineOpacity: 0.4, lineWidth: 2, lineDasharray: [2, 2] }} />
          </ShapeSource>
        )}

                  {windGeoJSON.features.length > 0 && (
                    <ShapeSource id="windSource" shape={windGeoJSON}>
                      <SymbolLayer
                        id="windBarbs"
                        style={{
                          iconImage: ['get', 'barb_icon'],
                          iconRotate: ['get', 'wind_direction'],
                          iconAllowOverlap: true,
                          iconIgnorePlacement: true,
                          iconSize: 1.0,
                          iconOpacity: dataFreshness === 'expired' ? 0.4 : 0.9,
                        }}
                      />
                    </ShapeSource>
                  )}
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
                iconImage: ['match', ['get', 'type'], 'debris', 'warning-triangle', 'surge', 'anchor', 'whale', 'circle', 'fishing_gear', 'circle', 'shallow', 'circle', 'circle'],
                iconSize: 1.2,
                iconColor: ['get', 'iconColor'],
                iconAllowOverlap: true,
                textField: ['get', 'description'],
                textOffset: [0, 1.5],
                textSize: 12,
                textColor: '#FF4500',
                textHaloColor: '#000000',
                textHaloWidth: 1,
                textMaxWidth: 10,
              }}
            />
          </ShapeSource>
        )}

        <PointAnnotation id="vessel" coordinate={[vesselLocation.lng, vesselLocation.lat]}>
          <View style={[styles.vesselMarker, { transform: [{ rotate: `${vesselLocation.heading}deg` }] }]}>
            <View style={styles.vesselTriangle} />
          </View>
        </PointAnnotation>
      </MapView>

      {windGeoJSON.features.length > 0 && (
        <TouchableOpacity
          style={styles.jumpButton}
          onPress={() => {
            const features = windGeoJSON.features;
            const lats = features.map(f => (f.geometry as Point).coordinates[1]);
            const lons = features.map(f => (f.geometry as Point).coordinates[0]);
            const centerLat = (Math.max(...lats) + Math.min(...lats)) / 2;
            const centerLon = (Math.max(...lons) + Math.min(...lons)) / 2;
            cameraRef.current?.setCamera({ centerCoordinate: [centerLon, centerLat], zoomLevel: 6, animationDuration: 1000, animationMode: 'flyTo' });
          }}
        >
          <Text style={styles.jumpButtonText}>📍 Go to Forecast</Text>
        </TouchableOpacity>
      )}

      <View style={styles.statusBar}>
        <Text style={styles.statusText}>HDG: {Math.round(vesselLocation.heading)}° | SOG: {vesselLocation.sog.toFixed(1)}kt</Text>
        <Text style={styles.statusText}>🔋 {Math.round(batteryLevel * 100)}%</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#001B3A' },
  map: { flex: 1 },
  warningBanner: { position: 'absolute', top: 0, left: 0, right: 0, paddingVertical: 8, paddingHorizontal: 16, zIndex: 100 },
  warningAmber: { backgroundColor: 'rgba(255, 179, 0, 0.9)' },
  warningRed: { backgroundColor: 'rgba(220, 53, 69, 0.9)' },
  warningText: { color: '#000', fontWeight: '600', textAlign: 'center', fontSize: 14 },
  powerSaveBanner: { position: 'absolute', top: 40, left: 16, right: 16, backgroundColor: 'rgba(0, 96, 100, 0.9)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, zIndex: 100 },
  powerSaveText: { color: '#fff', textAlign: 'center', fontSize: 12 },
  vesselMarker: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  vesselTriangle: { width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderBottomWidth: 20, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#00BFFF' },
  statusBar: { position: 'absolute', bottom: 16, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'rgba(0, 27, 58, 0.85)', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
  statusText: { color: '#fff', fontSize: 14, fontFamily: 'monospace' },
  jumpButton: { position: 'absolute', top: 100, right: 16, backgroundColor: 'rgba(0, 191, 255, 0.9)', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, zIndex: 100, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5 },
  jumpButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

export default MarinerMap;
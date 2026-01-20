/**
 * Mariner's AI Grid - Geographic Utilities
 * GeoJSON converters and spatial helpers for the tactical display.
 */

import type { FeatureCollection, Point, Feature } from 'geojson';

export interface MarineHazard {
  id: string;
  type: 'debris' | 'surge' | 'whale' | 'fishing_gear' | 'shallow' | 'other';
  description: string;
  lat: number;
  lon: number;
  reportedAt: number;
  reporterId: string; // Shadow Auth ID
  verified: boolean;
  confidence: number; // 0-1 based on reporter trust score
}

export interface WindDataPoint {
  lat: number;
  lon: number;
  u10: number; // U component (m/s)
  v10: number; // V component (m/s)
  timestamp: number;
}

export interface WaveDataPoint {
  lat: number;
  lon: number;
  swh: number; // Significant Wave Height (m)
  mwd: number; // Mean Wave Direction (deg)
  mwp: number; // Mean Wave Period (s)
  timestamp: number;
}

/**
 * Convert wave data to GeoJSON FeatureCollection for Mapbox.
 */
export function waveDataToGeoJSON(waveData: WaveDataPoint[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: waveData.map((point, idx): Feature<Point> => {
      return {
        type: 'Feature',
        id: `wave-${idx}`,
        geometry: {
          type: 'Point',
          coordinates: [point.lon, point.lat],
        },
        properties: {
          swh: point.swh,
          mwd: point.mwd,
          mwp: point.mwp,
          timestamp: point.timestamp,
          // Arrow icon for direction
          iconName: 'wave-direction-arrow',
          // Scaling factor based on wave height
          iconSize: Math.max(0.5, Math.min(2.0, point.swh / 2)),
        },
      };
    }),
  };
}

/**
 * Convert marine hazards to GeoJSON FeatureCollection for Mapbox rendering.
 */
export function hazardsToGeoJSON(hazards: MarineHazard[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: hazards.map((hazard): Feature<Point> => ({
      type: 'Feature',
      id: hazard.id,
      geometry: {
        type: 'Point',
        coordinates: [hazard.lon, hazard.lat],
      },
      properties: {
        type: hazard.type,
        description: hazard.description,
        reportedAt: hazard.reportedAt,
        verified: hazard.verified,
        confidence: hazard.confidence,
        // Icon selection helper
        iconName: getHazardIcon(hazard.type),
        iconColor: hazard.verified ? '#FF4500' : '#FFA500',
      },
    })),
  };
}

/**
 * Convert wind forecast data to GeoJSON with wind barb metadata.
 */
export function windDataToGeoJSON(windData: WindDataPoint[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: windData.map((point, idx): Feature<Point> => {
      const speed = calculateWindSpeed(point.u10, point.v10);
      const direction = calculateWindDirection(point.u10, point.v10);

      return {
        type: 'Feature',
        id: `wind-${idx}`,
        geometry: {
          type: 'Point',
          coordinates: [point.lon, point.lat],
        },
        properties: {
          wind_speed: speed,
          wind_direction: direction,
          barb_icon: getWindBarbIcon(speed),
          u10: point.u10,
          v10: point.v10,
          timestamp: point.timestamp,
        },
      };
    }),
  };
}

/**
 * Calculate wind speed from U/V components.
 * Formula: speed = sqrt(u^2 + v^2)
 */
export function calculateWindSpeed(u: number, v: number): number {
  return Math.sqrt(u * u + v * v);
}

/**
 * Calculate wind direction (meteorological convention: direction wind is FROM).
 * Returns degrees 0-360.
 */
export function calculateWindDirection(u: number, v: number): number {
  // atan2 gives angle in radians, convert to degrees
  // Add 180 because meteorological convention is "from" direction
  let direction = (Math.atan2(-u, -v) * 180) / Math.PI;
  if (direction < 0) direction += 360;
  return direction;
}

/**
 * Get appropriate wind barb icon based on speed (knots).
 * Wind barbs follow WMO standard:
 * - Calm: < 2 kt
 * - Short barb: 5 kt
 * - Long barb: 10 kt
 * - Pennant: 50 kt
 */
export function getWindBarbIcon(speedMs: number): string {
  const speedKt = speedMs * 1.94384; // m/s to knots

  if (speedKt < 2) return 'wind-calm';
  if (speedKt < 7) return 'wind-5';
  if (speedKt < 12) return 'wind-10';
  if (speedKt < 17) return 'wind-15';
  if (speedKt < 22) return 'wind-20';
  if (speedKt < 27) return 'wind-25';
  if (speedKt < 32) return 'wind-30';
  if (speedKt < 37) return 'wind-35';
  if (speedKt < 42) return 'wind-40';
  if (speedKt < 47) return 'wind-45';
  if (speedKt < 52) return 'wind-50';
  if (speedKt < 57) return 'wind-55';
  if (speedKt < 62) return 'wind-60';
  return 'wind-65plus'; // Storm force
}

/**
 * Get hazard icon name based on type.
 */
function getHazardIcon(type: MarineHazard['type']): string {
  const icons: Record<MarineHazard['type'], string> = {
    debris: 'hazard-debris',
    surge: 'hazard-surge',
    whale: 'hazard-whale',
    fishing_gear: 'hazard-fishing',
    shallow: 'hazard-shallow',
    other: 'hazard-other',
  };
  return icons[type] || 'hazard-other';
}

/**
 * Calculate distance between two coordinates in nautical miles.
 * Uses Haversine formula.
 */
export function distanceNM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Mariner's AI Grid - TruthChecker
 * 
 * The "Circular Truth" Loop:
 * Compares real-time sensor data (Ground Truth) from SignalKBridge
 * against the local AI forecasts (GraphCast/IFS) stored in the active Seed.
 * 
 * Logic:
 * 1. Listen for new TelemetrySnapshots from SignalKBridge.
 * 2. Lookup the predicted values for the current time/location from the active WeatherSeed.
 * 3. Calculate divergence (delta) for Wind and Pressure.
 * 4. If divergence > threshold (e.g. 30%), trigger a DivergenceSnapshot.
 * 5. Inform the UI to display 'DIVERGENT' status and cautionary alerts.
 * 
 * SPDX-License-Identifier: Apache-2.0
 */

import { TelemetrySnapshot } from './PatternMatcher';
import { WeatherSeed } from '../schema/schema/weather_seed';
import { VesselSnapshot, DivergenceSnapshot } from './VesselSnapshot';
import { AtmosphericVector, VecDB } from './VecDB';
import { ConsensusLevel } from '../components/PatternAlert';

export interface DivergenceReport {
  level: ConsensusLevel;
  windDeltaKts: number;
  pressureDeltaHpa: number;
  isDivergent: boolean;
  timestamp: number;
}

export class TruthChecker {
  private vesselSnapshot: VesselSnapshot;
  private vecDb: VecDB;
  
  // Thresholds for triggering divergence alerts
  private readonly WIND_THRESHOLD_KTS = 8.0;    // ~30% error at 25kt
  private readonly PRESSURE_THRESHOLD_HPA = 4.0; // Significant weather shift

  constructor(vesselSnapshot: VesselSnapshot, vecDb: VecDB) {
    this.vesselSnapshot = vesselSnapshot;
    this.vecDb = vecDb;
  }

  /**
   * Compare real-time data against predicted data.
   */
  async check(
    telemetry: TelemetrySnapshot, 
    seed: WeatherSeed,
    timeStepIndex: number = 0
  ): Promise<DivergenceReport> {
    
    // 1. Extract predicted values from Seed at nearest grid point
    // For MVP, we use basic nearest-neighbor lookup
    const predicted = this.getNearestPrediction(telemetry.position.lat, telemetry.position.lon, seed, timeStepIndex);
    
    // 2. Calculate deltas
    const windDelta = Math.abs((telemetry.trueWindSpeed || 0) - predicted.windSpeedKts);
    const pressureDelta = Math.abs((telemetry.barometer || 1013) - predicted.pressureHpa);
    
    const isDivergent = windDelta > this.WIND_THRESHOLD_KTS || pressureDelta > this.PRESSURE_THRESHOLD_HPA;
    
    // 3. Determine consensus level
    let level: ConsensusLevel = 'agree';
    if (isDivergent) {
      level = windDelta > 15 || pressureDelta > 8 ? 'disagree' : 'partial';
    } else if (windDelta > 4 || pressureDelta > 2) {
      level = 'partial';
    }

    // 4. If divergent, capture snapshot for grid learning
    if (isDivergent) {
      console.warn(`[TruthChecker] DIVERGENCE DETECTED: Wind Δ ${windDelta.toFixed(1)}kt, Pres Δ ${pressureDelta.toFixed(1)}hPa`);
      
      const currentAtmo: AtmosphericVector = {
        temperature: telemetry.temperature ? (telemetry.temperature - 15) / 25 : 0,
        pressure: telemetry.barometer ? (telemetry.barometer - 1013) / 30 : 0,
        humidity: (telemetry.humidity || 50) / 100,
        windU: telemetry.trueWindSpeed ? (telemetry.trueWindSpeed / 40) * Math.sin((telemetry.trueWindAngle || 0) * Math.PI / 180) : 0,
        windV: telemetry.trueWindSpeed ? (telemetry.trueWindSpeed / 40) * Math.cos((telemetry.trueWindAngle || 0) * Math.PI / 180) : 0,
        pressureTrend: 0, // Would need buffer
        cloudCover: 0.5,
      };

      await this.vesselSnapshot.captureDivergence(
        telemetry,
        currentAtmo,
        { 
          localMatch: {
            patternId: 'divergence_event',
            label: 'Detected Divergence',
            similarity: 0,
            outcome: 'Divergent conditions'
          },
          graphCastPrediction: { 
            confidence: 0.8,
            validTime: new Date(seed.timeStepsIso[timeStepIndex]),
            outcome: 'Forecasted conditions'
          }
        },
        {
          windSpeed: predicted.windSpeedKts,
          pressure: predicted.pressureHpa,
          validTime: new Date(seed.timeStepsIso[timeStepIndex]),
          model: seed.modelSource
        }
      );
    }

    return {
      level,
      windDeltaKts: windDelta,
      pressureDeltaHpa: pressureDelta,
      isDivergent,
      timestamp: Date.now()
    };
  }

  private getNearestPrediction(lat: number, lon: number, seed: WeatherSeed, timeIdx: number) {
    // Simplified nearest neighbor for the 9km/28km grid
    // In production, use bilinear interpolation
    
    const uVar = seed.variables.find(v => v.name === 'u10' || v.name === 'u');
    const vVar = seed.variables.find(v => v.name === 'v10' || v.name === 'v');
    const mslVar = seed.variables.find(v => v.name === 'msl');

    if (!uVar || !vVar) return { windSpeedKts: 0, pressureHpa: 1013 };

    // Find closest indices
    const latIdx = this.findClosestIndex(seed.latitudes, lat);
    const lonIdx = this.findClosestIndex(seed.longitudes, lon);
    
    const latPoints = seed.latitudes.length;
    const lonPoints = seed.longitudes.length;
    const flatIdx = (timeIdx * latPoints * lonPoints) + (latIdx * lonPoints) + lonIdx;

    const getValue = (v: any) => {
      if (!v?.data) return 0;
      if (v.data.quantizedValues?.length) {
        return v.data.addOffset + (v.data.quantizedValues[flatIdx] * v.data.scaleFactor);
      }
      return v.data.values?.[flatIdx] || 0;
    };

    const u = getValue(uVar);
    const v = getValue(vVar);
    const msl = getValue(mslVar);

    return {
      windSpeedKts: Math.sqrt(u*u + v*v) * 1.94384, // m/s to kt
      pressureHpa: msl ? msl / 100 : 1013           // Pa to hPa
    };
  }

  private findClosestIndex(arr: number[], target: number): number {
    let closestIdx = 0;
    let minDiff = Math.abs(arr[0] - target);
    for (let i = 1; i < arr.length; i++) {
      const diff = Math.abs(arr[i] - target);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    return closestIdx;
  }
}

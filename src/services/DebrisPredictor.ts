/**
 * Mariner's AI Grid - Debris Predictor
 * 
 * Implements Lagrangian Drift logic to predict the movement of floating 
 * objects (logs, containers, seaweed) based on surface currents and 
 * local wind vectors.
 * 
 * Strategy:
 * 1. Fetch current velocity from the nearest 9km IFS HRES grid point.
 * 2. Fetch 10m wind velocity from local GraphCast output.
 * 3. Apply the 3% Rule: Debris typically drifts at 3% of wind speed 
 *    plus 100% of surface current velocity.
 * 4. Update the 'location_vec' in marine_hazards for 'Zero Latency' search.
 * 
 * SPDX-License-Identifier: Apache-2.0
 */

import { DB } from '@op-engineering/op-sqlite';
import { HazardService, HazardType } from './HazardService';

export interface DriftVector {
  u: number; // Eastward velocity (m/s)
  v: number; // Northward velocity (m/s)
}

export interface PredictedPathPoint {
  lat: number;
  lon: number;
  timestamp: number;
}

/**
 * Debris coefficients for Lagrangian Drift
 * Based on maritime standards for floating objects.
 */
const DEBRIS_COEFFICIENTS: Record<string, { leeway: number; drag: number }> = {
  'debris': { leeway: 0.03, drag: 1.0 },      // Standard 3% rule
  'fishing_gear': { leeway: 0.02, drag: 1.2 }, // Low profile, high drag
  'whale': { leeway: 0.01, drag: 0.8 },        // Moving, low wind impact
  'other': { leeway: 0.02, drag: 1.0 },        // Default
};

export class DebrisPredictor {
  private db: DB;
  private hazardService: HazardService;

  constructor(db: DB, hazardService: HazardService) {
    this.db = db;
    this.hazardService = hazardService;
  }

  /**
   * Predict future positions for all drifting hazards in 6-hour increments.
   * Stores the full predicted path (24h window) in the database.
   */
  async forecastDrift(forecastHours: number = 24, stepHours: number = 6): Promise<number> {
    const now = Date.now();
    const driftingTypes: HazardType[] = ['debris', 'whale', 'fishing_gear'];
    
    const result = await this.db.execute(
      `SELECT id, lat, lon, type FROM marine_hazards 
       WHERE type IN (${driftingTypes.map(t => `'${t}'`).join(',')})
       AND expires_at > ?`,
      [now]
    );

    const hazards = result.rows || [];
    let updatedCount = 0;

    for (const hazard of hazards) {
      const path: PredictedPathPoint[] = [];
      let currentLat = hazard.lat as number;
      let currentLon = hazard.lon as number;
      const type = hazard.type as string;
      const coeffs = DEBRIS_COEFFICIENTS[type] || DEBRIS_COEFFICIENTS['other'];

      // Generate 6-hour step predictions
      for (let h = stepHours; h <= forecastHours; h += stepHours) {
        // In production, this would lookup environmental vectors for (currentLat, currentLon, now + h)
        // Here we simulate vectors from local inference
        const current = { u: 0.1, v: -0.05 }; // m/s
        const wind = { u: 5.0, v: 2.0 };    // m/s

        // Apply Lagrangian Formula with Drag and Leeway
        const driftU = (current.u * coeffs.drag) + (wind.u * coeffs.leeway);
        const driftV = (current.v * coeffs.drag) + (wind.v * coeffs.leeway);

        const metersPerDegLat = 111000;
        const metersPerDegLon = 111000 * Math.cos((currentLat * Math.PI) / 180);

        currentLat += (driftV * stepHours * 3600) / metersPerDegLat;
        currentLon += (driftU * stepHours * 3600) / metersPerDegLon;

        path.push({
          lat: currentLat,
          lon: currentLon,
          timestamp: now + (h * 60 * 60 * 1000),
        });
      }

      // Update the database with the new predicted path
      await this.db.execute(
        `UPDATE marine_hazards SET predicted_path_json = ? WHERE id = ?`,
        [JSON.stringify(path), hazard.id]
      );
      updatedCount++;
    }

    return updatedCount;
  }

  /**
   * Update current positions based on elapsed time since last sync.
   */
  async updateCurrentPositions(hoursElapsed: number): Promise<number> {
    const now = Date.now();
    const driftingTypes: HazardType[] = ['debris', 'whale', 'fishing_gear'];
    
    const result = await this.db.execute(
      `SELECT id, lat, lon, type FROM marine_hazards 
       WHERE type IN (${driftingTypes.map(t => `'${t}'`).join(',')})
       AND expires_at > ?`,
      [now]
    );

    const hazards = result.rows || [];
    let updatedCount = 0;

    for (const hazard of hazards) {
      const hazardType = hazard.type as string;
      const coeffs = DEBRIS_COEFFICIENTS[hazardType] || DEBRIS_COEFFICIENTS['other'];
      
      // Mock environmental vectors
      const current = { u: 0.1, v: -0.05 };
      const wind = { u: 5.0, v: 2.0 };

      const driftU = (current.u * coeffs.drag) + (wind.u * coeffs.leeway);
      const driftV = (current.v * coeffs.drag) + (wind.v * coeffs.leeway);

      const metersPerDegLat = 111000;
      const metersPerDegLon = 111000 * Math.cos(((hazard.lat as number) * Math.PI) / 180);

      const newLat = (hazard.lat as number) + (driftV * hoursElapsed * 3600) / metersPerDegLat;
      const newLon = (hazard.lon as number) + (driftU * hoursElapsed * 3600) / metersPerDegLon;
      const newVec = new Float32Array([newLat, newLon]);

      await this.db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE marine_hazards SET lat = ?, lon = ?, location_vec = ?, last_drift_update = ? WHERE id = ?`,
          [newLat, newLon, newVec, now, hazard.id]
        );
        await tx.execute(
          `UPDATE marine_hazards_vec SET location = vec_f32(?) WHERE id = ?`,
          [newVec, hazard.id]
        );
      });
      updatedCount++;
    }

    return updatedCount;
  }
}

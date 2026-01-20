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

export class DebrisPredictor {
  private db: DB;
  private hazardService: HazardService;

  // Wind leeway factor (standard maritime 3% rule)
  private readonly WIND_LEEWAY_FACTOR = 0.03;

  constructor(db: DB, hazardService: HazardService) {
    this.db = db;
    this.hazardService = hazardService;
  }

  /**
   * Predict and update positions for all drifting hazards.
   * 
   * @param hoursElapsed Duration since last update
   * @param defaultCurrent Optional default current if no grid data
   */
  async updateDrift(hoursElapsed: number, defaultCurrent?: DriftVector): Promise<number> {
    const now = Date.now();
    
    // 1. Get all active drifting hazards
    const driftingTypes: HazardType[] = ['debris', 'whale', 'fishing_gear'];
    const result = await this.db.execute(
      `SELECT id, lat, lon, type FROM marine_hazards 
       WHERE type IN (${driftingTypes.map(t => `'${t}'`).join(',')})
       AND expires_at > ?`,
      [now]
    );

    const hazards = result.rows || [];
    let updateCount = 0;

    for (const hazard of hazards) {
      // 2. Fetch local environmental vectors (Mocked for now, would pull from local GRIB/Parquet)
      // In production, this calls a Grid Lookup service for the specific lat/lon
      const current = defaultCurrent || { u: 0.1, v: -0.05 }; // m/s
      const wind = { u: 5.0, v: 2.0 }; // m/s (approx 10kt)

      // 3. Apply Lagrangian Drift Formula:
      // V_total = V_current + (WIND_LEEWAY * V_wind)
      const driftU = current.u + (this.WIND_LEEWAY_FACTOR * wind.u);
      const driftV = current.v + (this.WIND_LEEWAY_FACTOR * wind.v);

      // 4. Calculate new coordinates (Approximate spherical)
      const metersPerDegLat = 111000;
      const metersPerDegLon = 111000 * Math.cos(((hazard.lat as number) * Math.PI) / 180);

      const deltaLon = (driftU * hoursElapsed * 3600) / metersPerDegLon;
      const deltaLat = (driftV * hoursElapsed * 3600) / metersPerDegLat;

      const newLat = (hazard.lat as number) + deltaLat;
      const newLon = (hazard.lon as number) + deltaLon;
      const newVec = new Float32Array([newLat, newLon]);

      // 5. Atomic Update: Core table + Vector table
      await this.db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE marine_hazards 
           SET lat = ?, lon = ?, location_vec = ?, drift_u = ?, drift_v = ?, last_drift_update = ? 
           WHERE id = ?`,
          [newLat, newLon, newVec, driftU, driftV, now, hazard.id]
        );
        
        // Update the searchable vector table
        await tx.execute(
          `UPDATE marine_hazards_vec SET location = vec_f32(?) WHERE id = ?`,
          [newVec, hazard.id]
        );
      });

      updateCount++;
    }

    if (updateCount > 0) {
      console.log(`[DebrisPredictor] Updated ${updateCount} hazards using Lagrangian Drift (${hoursElapsed}h)`);
    }

    return updateCount;
  }
}

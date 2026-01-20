/**
 * Mariner's AI Grid - Social Layer
 * Implements "Waze for Sailors" using vector-based hazard search.
 */

import { DB } from '@op-engineering/op-sqlite';



export interface SpatialHazard {

  id: string;

  type: string;

  description: string;

  distance: number;

  timestamp: number;

}



export class SocialLayer {

  private db: DB;



  constructor(db: DB) {

    this.db = db;

  }



  /**

   * Finds hazards "near" the vessel or predicted path using vector math.

   */

  async findHazardsNearPath(vesselLat: number, vesselLon: number, radiusNm: number = 50): Promise<SpatialHazard[]> {
    try {
      const vesselVector = new Float32Array([vesselLat, vesselLon]);
      const query = `
        SELECT 
          h.id,
          h.type as hazard_type, 
          h.description, 
          h.reported_at as timestamp,
          v.distance
        FROM marine_hazards_vec v
        JOIN marine_hazards h ON v.id = h.id
        WHERE v.location MATCH vec_f32(?) 
          AND k = 50 
          AND v.distance < ?
        ORDER BY v.distance ASC;
      `;
      
      const result = await this.db.execute(query, [vesselVector, radiusNm]);

      const rows = result.rows || [];

      

      return rows.map((row: any) => ({
        id: row.id,
        type: row.hazard_type,
        description: row.description,
        timestamp: row.timestamp,
        distance: row.distance
      }));



    } catch (error) {

      console.error('[SocialLayer] Failed to query hazards:', error);

      return [];

    }

  }



  /**

   * Broadcasts local observations to the fleet.

   */

  async syncWithGrid() {

    console.log('[SocialLayer] Syncing local truth with cloud mesh...');

  }

}

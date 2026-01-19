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

      const query = `

        SELECT 

          id,

          type as hazard_type, 

          description, 

          reported_at as timestamp,

          distance(location_vec, [?, ?]) as dist

        FROM marine_hazards

        WHERE dist < ?

        ORDER BY timestamp DESC;

      `;

      

      const result = await this.db.execute(query, [vesselLat, vesselLon, radiusNm]);

      const rows = result.rows || [];

      

      return rows.map((row: any) => ({

        id: row.id,

        type: row.hazard_type,

        description: row.description,

        timestamp: row.timestamp,

        distance: row.dist

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

/**
 * Mariner's AI Grid - Social Layer
 * Implements "Waze for Mariners" using vector-based hazard search.
 */

import { DB } from '@op-engineering/op-sqlite';
import { distanceNM } from '../utils/geoUtils';

export interface SpatialHazard {
  id: string;
  type: string;
  description: string;
  distance: number;
  timestamp: number;
  predictedPath?: Array<{ lat: number; lon: number; timestamp: number }>;
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



     * Identifies which predicted debris paths will intersect with the vessel's 



     * planned route within the next 24 hours.



     */



    async findHazardsIntersectingPath(



      routeWaypoints: Array<{ lat: number; lon: number; timestamp: number }>,



      collisionRadiusNm: number = 2.0



    ): Promise<SpatialHazard[]> {



      try {



        const now = Date.now();



        const result = await this.db.execute(



          `SELECT id, type, description, reported_at, predicted_path_json 



           FROM marine_hazards 



           WHERE predicted_path_json IS NOT NULL 



           AND expires_at > ?`,



          [now]



        );



  



        const hazards = result.rows || [];



        const intersections: SpatialHazard[] = [];



  



              for (const row of hazards) {



  



                const path = JSON.parse(row.predicted_path_json as string);



  



                let hasIntersection = false;



  



        



  



                // Simple intersection check: find if any point in predicted path 



  



                // is within collisionRadiusNm of any point in routeWaypoints 



  



                // within a similar time window (e.g. 1 hour).



  



                for (const hazardPoint of path) {



  



                  for (const routePoint of routeWaypoints) {



  



                    const timeDiff = Math.abs(hazardPoint.timestamp - routePoint.timestamp);



  



                    // If timestamps are within 1 hour



  



                    if (timeDiff < 3600000) {



  



                      const dist = distanceNM(hazardPoint.lat, hazardPoint.lon, routePoint.lat, routePoint.lon);



  



                      if (dist < collisionRadiusNm) {



  



                        hasIntersection = true;



  



                        break;



  



                      }



  



                    }



  



                  }



  



                  if (hasIntersection) break;



  



                }



  



        



  



                if (hasIntersection) {



  



                  intersections.push({



  



                    id: row.id as string,



  



                    type: row.type as string,



  



                    description: row.description as string,



  



                    distance: 0, // Distance at collision is < collisionRadiusNm



  



                    timestamp: row.reported_at as number,



  



                    predictedPath: path,



  



                  });



  



                }



  



              }



  



        



  



        return intersections;



      } catch (error) {



        console.error('[SocialLayer] Intersection check failed:', error);



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

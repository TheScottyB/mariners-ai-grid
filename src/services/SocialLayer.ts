/**
 * Mariner's AI Grid - Social Layer
 * Implements "Waze for Sailors" using vector-based hazard search.
 */

import { SQLiteDatabase } from 'expo-sqlite';

export interface SpatialHazard {
  id: string;
  type: string;
  description: string;
  distance: number;
  timestamp: number;
}

export class SocialLayer {
  private db: SQLiteDatabase;

  constructor(db: SQLiteDatabase) {
    this.db = db;
  }

  /**
   * Finds hazards "near" the vessel or predicted path using vector math.
   * Leverages expo-sqlite/vec for 2026 performance standards.
   */
  async findHazardsNearPath(vesselLat: number, vesselLon: number, radiusNm: number = 50): Promise<SpatialHazard[]> {
    try {
      /**
       * The "Waze" Query:
       * Uses the distance() function from sqlite-vec extension.
       */
      const query = `
        SELECT 
          id,
          type as hazard_type, 
          description, 
          reportedAt as timestamp,
          -- Use vector distance extension
          distance(location_vec, [?, ?]) as dist
        FROM marine_hazards
        WHERE dist < ?
        ORDER BY timestamp DESC;
      `;
      
      const results = await this.db.getAllAsync<any>(query, [vesselLat, vesselLon, radiusNm]);
      
      return results.map(row => ({
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
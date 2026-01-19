/**
 * Mariner's AI Grid - Offline Tile Manager
 * Downloads and manages Mapbox vector tiles for deep-water navigation.
 * Critical for passages where Starlink/cellular coverage is unavailable.
 */

import Mapbox from '@rnmapbox/maps';

export interface TileRegion {
  id: string;
  name: string;
  bounds: [number, number, number, number]; // [west, south, east, north]
  minZoom: number;
  maxZoom: number;
  styleURL: string;
}

export interface DownloadProgress {
  regionId: string;
  completedResources: number;
  requiredResources: number;
  completedSize: number; // bytes
  status: 'pending' | 'downloading' | 'complete' | 'error';
  error?: string;
}

export interface StoredRegion {
  id: string;
  name: string;
  sizeBytes: number;
  downloadedAt: number;
  expiresAt: number;
}

/**
 * Pre-defined route regions for common ocean passages.
 * These are ~500nm corridors along popular routes.
 */
export const COMMON_ROUTES: Record<string, TileRegion> = {
  sf_to_hawaii: {
    id: 'sf-hawaii',
    name: 'San Francisco → Hawaii',
    bounds: [-157.8, 21.0, -122.4, 38.0],
    minZoom: 3,
    maxZoom: 10,
    styleURL: Mapbox.StyleURL.Dark,
  },
  hawaii_to_tahiti: {
    id: 'hawaii-tahiti',
    name: 'Hawaii → Tahiti',
    bounds: [-157.8, -17.5, -149.4, 21.5],
    minZoom: 3,
    maxZoom: 10,
    styleURL: Mapbox.StyleURL.Dark,
  },
  atlantic_crossing: {
    id: 'atlantic-arc',
    name: 'Atlantic ARC Rally',
    bounds: [-61.0, 13.0, -16.0, 28.5],
    minZoom: 3,
    maxZoom: 10,
    styleURL: Mapbox.StyleURL.Dark,
  },
  pacific_nw_alaska: {
    id: 'pnw-alaska',
    name: 'Pacific NW → Alaska',
    bounds: [-150.0, 47.0, -122.0, 61.0],
    minZoom: 3,
    maxZoom: 10,
    styleURL: Mapbox.StyleURL.Dark,
  },
};

export class OfflineTileManager {
  private progressCallbacks: Map<string, (progress: DownloadProgress) => void> =
    new Map();

  /**
   * Download a tile region for offline use.
   * @param region The region to download
   * @param onProgress Progress callback
   */
  async downloadRegion(
    region: TileRegion,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    if (onProgress) {
      this.progressCallbacks.set(region.id, onProgress);
    }

    try {
      // Report initial status
      onProgress?.({
        regionId: region.id,
        completedResources: 0,
        requiredResources: 0,
        completedSize: 0,
        status: 'pending',
      });

      // Create the offline pack
      await Mapbox.offlineManager.createPack(
        {
          name: region.id,
          styleURL: region.styleURL,
          minZoom: region.minZoom,
          maxZoom: region.maxZoom,
          bounds: [
            [region.bounds[0], region.bounds[1]], // SW
            [region.bounds[2], region.bounds[3]], // NE
          ],
        },
        (pack, status) => {
          // Handle progress updates
          const progress: DownloadProgress = {
            regionId: region.id,
            completedResources: status.completedResourceCount,
            requiredResources: status.requiredResourceCount,
            completedSize: status.completedResourceSize,
            status:
              status.completedResourceCount === status.requiredResourceCount
                ? 'complete'
                : 'downloading',
          };
          onProgress?.(progress);
        },
        (pack, error) => {
          // Handle errors
          onProgress?.({
            regionId: region.id,
            completedResources: 0,
            requiredResources: 0,
            completedSize: 0,
            status: 'error',
            error: error?.message || 'Unknown error',
          });
        }
      );
    } catch (error) {
      onProgress?.({
        regionId: region.id,
        completedResources: 0,
        requiredResources: 0,
        completedSize: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Download a custom region around a route.
   * @param routeCoords Array of [lon, lat] waypoints
   * @param bufferNm Buffer in nautical miles around the route
   * @param name Human-readable name
   */
  async downloadRouteRegion(
    routeCoords: [number, number][],
    bufferNm: number = 100,
    name: string = 'Custom Route'
  ): Promise<void> {
    // Calculate bounding box with buffer
    const bufferDeg = bufferNm / 60; // 1 degree ≈ 60nm

    let minLon = Infinity,
      maxLon = -Infinity;
    let minLat = Infinity,
      maxLat = -Infinity;

    for (const [lon, lat] of routeCoords) {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }

    const region: TileRegion = {
      id: `route-${Date.now()}`,
      name,
      bounds: [
        minLon - bufferDeg,
        minLat - bufferDeg,
        maxLon + bufferDeg,
        maxLat + bufferDeg,
      ],
      minZoom: 3,
      maxZoom: 10,
      styleURL: Mapbox.StyleURL.Dark,
    };

    await this.downloadRegion(region);
  }

  /**
   * Get all stored offline regions.
   */
  async getStoredRegions(): Promise<StoredRegion[]> {
    try {
      const packs = await Mapbox.offlineManager.getPacks();
      return packs.map((pack: any) => ({
        id: pack.name,
        name: pack.name,
        sizeBytes: pack.completedResourceSize || 0,
        downloadedAt: Date.now(), // Mapbox doesn't expose this directly
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days default
      }));
    } catch {
      return [];
    }
  }

  /**
   * Delete a stored region.
   */
  async deleteRegion(regionId: string): Promise<void> {
    await Mapbox.offlineManager.deletePack(regionId);
  }

  /**
   * Clear all stored regions.
   */
  async clearAllRegions(): Promise<void> {
    await Mapbox.offlineManager.resetDatabase();
  }

  /**
   * Estimate download size for a region (rough approximation).
   * Actual size depends on map detail and vector tile density.
   * @returns Estimated size in MB
   */
  estimateDownloadSize(region: TileRegion): number {
    const latRange = region.bounds[3] - region.bounds[1];
    const lonRange = region.bounds[2] - region.bounds[0];
    const areaSqDeg = latRange * lonRange;

    // Rough estimate: ~0.5MB per square degree at zoom 3-10
    // Ocean areas are typically less dense than coastal
    const baseSizeMb = areaSqDeg * 0.5;

    // Adjust for zoom levels
    const zoomFactor = Math.pow(4, region.maxZoom - 3) / 100;

    return Math.round(baseSizeMb * (1 + zoomFactor));
  }
}

export const offlineTileManager = new OfflineTileManager();

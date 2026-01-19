/**
 * Mariner's AI Grid - useSeedManager Hook
 *
 * React hook for managing weather seeds in the UI layer.
 * Provides reactive state for:
 * - Current active seed
 * - Forecast timestep navigation
 * - Download progress
 * - Storage status
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { FeatureCollection, Point } from 'geojson';

import { SeedManager, SeedMetadata, SeedTimestep } from '../services/SeedManager';

export interface UseSeedManagerOptions {
  /** Auto-select best seed for position */
  autoSelectForPosition?: { lat: number; lon: number };
  /** Initial timestep offset (hours from now) */
  initialTimestepOffset?: number;
}

export interface UseSeedManagerResult {
  // State
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;

  // Current seed
  activeSeed: SeedMetadata | null;
  activeTimestep: number;
  timestepCount: number;

  // Forecast data (for MarinerMap)
  windGeoJSON: FeatureCollection<Point> | null;
  forecastValidTime: Date | null;

  // Available seeds
  availableSeeds: SeedMetadata[];
  storageUsedMB: number;

  // Actions
  selectSeed: (seedId: string) => Promise<void>;
  setTimestep: (index: number) => void;
  nextTimestep: () => void;
  prevTimestep: () => void;
  downloadSeed: (url: string) => Promise<SeedMetadata>;
  importSeed: (localPath: string) => Promise<SeedMetadata>;
  deleteSeed: (seedId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useSeedManager(options: UseSeedManagerOptions = {}): UseSeedManagerResult {
  const { autoSelectForPosition, initialTimestepOffset = 0 } = options;

  // Refs
  const managerRef = useRef<SeedManager | null>(null);

  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeSeed, setActiveSeed] = useState<SeedMetadata | null>(null);
  const [activeTimestep, setActiveTimestep] = useState(0);
  const [timestepCount, setTimestepCount] = useState(0);

  const [windGeoJSON, setWindGeoJSON] = useState<FeatureCollection<Point> | null>(null);
  const [forecastValidTime, setForecastValidTime] = useState<Date | null>(null);

  const [availableSeeds, setAvailableSeeds] = useState<SeedMetadata[]>([]);
  const [storageUsedMB, setStorageUsedMB] = useState(0);

  // Initialize manager
  useEffect(() => {
    async function init() {
      try {
        const manager = new SeedManager();
        await manager.initialize();
        managerRef.current = manager;

        // Load available seeds
        const seeds = manager.listSeeds();
        setAvailableSeeds(seeds);

        // Calculate storage
        const storage = await manager.getStorageUsed();
        setStorageUsedMB(storage / (1024 * 1024));

        // Auto-select best seed if position provided
        if (autoSelectForPosition && seeds.length > 0) {
          const best = manager.getBestSeed(
            autoSelectForPosition.lat,
            autoSelectForPosition.lon
          );
          if (best) {
            await selectSeedInternal(best.id);
          }
        }

        setIsInitialized(true);
      } catch (e) {
        console.error('[useSeedManager] Init error:', e);
        setError(e instanceof Error ? e.message : 'Failed to initialize');
      }
    }

    init();
  }, []);

  // Auto-update when position changes
  useEffect(() => {
    if (!isInitialized || !autoSelectForPosition || !managerRef.current) return;

    const manager = managerRef.current;
    const best = manager.getBestSeed(
      autoSelectForPosition.lat,
      autoSelectForPosition.lon
    );

    // Only switch if we found a better seed
    if (best && (!activeSeed || best.id !== activeSeed.id)) {
      selectSeedInternal(best.id);
    }
  }, [autoSelectForPosition?.lat, autoSelectForPosition?.lon, isInitialized]);

  // Internal seed selection
  const selectSeedInternal = useCallback(async (seedId: string) => {
    if (!managerRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      const manager = managerRef.current;
      const seeds = manager.listSeeds();
      const metadata = seeds.find((s) => s.id === seedId);

      if (!metadata) {
        throw new Error(`Seed not found: ${seedId}`);
      }

      // Determine initial timestep (closest to "now + offset")
      const targetTime = Date.now() + initialTimestepOffset * 60 * 60 * 1000;
      const timestepIdx = manager.getTimestepIndex(seedId, targetTime);

      // Get wind GeoJSON for this timestep
      const geoJSON = await manager.getWindGeoJSON(seedId, timestepIdx);

      setActiveSeed(metadata);
      setActiveTimestep(timestepIdx);
      setTimestepCount(metadata.timestepCount);
      setWindGeoJSON(geoJSON);

      // Calculate valid time
      const startTime = metadata.forecastStartTime;
      const hourOffset = timestepIdx; // Assuming 1-hour timesteps
      setForecastValidTime(new Date(startTime + hourOffset * 60 * 60 * 1000));

      console.log(`[useSeedManager] Selected seed: ${seedId}, timestep: ${timestepIdx}`);
    } catch (e) {
      console.error('[useSeedManager] Select error:', e);
      setError(e instanceof Error ? e.message : 'Failed to select seed');
    } finally {
      setIsLoading(false);
    }
  }, [initialTimestepOffset]);

  // Public select function
  const selectSeed = useCallback(async (seedId: string) => {
    await selectSeedInternal(seedId);
  }, [selectSeedInternal]);

  // Set timestep
  const setTimestep = useCallback(async (index: number) => {
    if (!managerRef.current || !activeSeed) return;

    const clampedIndex = Math.max(0, Math.min(index, timestepCount - 1));

    try {
      const geoJSON = await managerRef.current.getWindGeoJSON(activeSeed.id, clampedIndex);
      setActiveTimestep(clampedIndex);
      setWindGeoJSON(geoJSON);

      // Update valid time
      const startTime = activeSeed.forecastStartTime;
      setForecastValidTime(new Date(startTime + clampedIndex * 60 * 60 * 1000));
    } catch (e) {
      console.error('[useSeedManager] Timestep error:', e);
    }
  }, [activeSeed, timestepCount]);

  // Navigate timesteps
  const nextTimestep = useCallback(() => {
    setTimestep(activeTimestep + 1);
  }, [activeTimestep, setTimestep]);

  const prevTimestep = useCallback(() => {
    setTimestep(activeTimestep - 1);
  }, [activeTimestep, setTimestep]);

  // Download seed
  const downloadSeed = useCallback(async (url: string): Promise<SeedMetadata> => {
    if (!managerRef.current) {
      throw new Error('SeedManager not initialized');
    }

    setIsLoading(true);
    setError(null);

    try {
      const metadata = await managerRef.current.downloadSeed(url);
      setAvailableSeeds(managerRef.current.listSeeds());
      setStorageUsedMB((await managerRef.current.getStorageUsed()) / (1024 * 1024));

      // Auto-select if no active seed
      if (!activeSeed) {
        await selectSeedInternal(metadata.id);
      }

      return metadata;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Download failed';
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [activeSeed, selectSeedInternal]);

  // Import local seed
  const importSeed = useCallback(async (localPath: string): Promise<SeedMetadata> => {
    if (!managerRef.current) {
      throw new Error('SeedManager not initialized');
    }

    setIsLoading(true);
    setError(null);

    try {
      const metadata = await managerRef.current.importLocalSeed(localPath);
      setAvailableSeeds(managerRef.current.listSeeds());
      setStorageUsedMB((await managerRef.current.getStorageUsed()) / (1024 * 1024));

      // Auto-select
      await selectSeedInternal(metadata.id);

      return metadata;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Import failed';
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [selectSeedInternal]);

  // Delete seed
  const deleteSeed = useCallback(async (seedId: string) => {
    if (!managerRef.current) return;

    await managerRef.current.deleteSeed(seedId);
    setAvailableSeeds(managerRef.current.listSeeds());
    setStorageUsedMB((await managerRef.current.getStorageUsed()) / (1024 * 1024));

    // Clear active if deleted
    if (activeSeed?.id === seedId) {
      setActiveSeed(null);
      setWindGeoJSON(null);
      setForecastValidTime(null);
    }
  }, [activeSeed]);

  // Refresh
  const refresh = useCallback(async () => {
    if (!managerRef.current) return;

    setAvailableSeeds(managerRef.current.listSeeds());
    setStorageUsedMB((await managerRef.current.getStorageUsed()) / (1024 * 1024));
  }, []);

  return {
    isInitialized,
    isLoading,
    error,
    activeSeed,
    activeTimestep,
    timestepCount,
    windGeoJSON,
    forecastValidTime,
    availableSeeds,
    storageUsedMB,
    selectSeed,
    setTimestep,
    nextTimestep,
    prevTimestep,
    downloadSeed,
    importSeed,
    deleteSeed,
    refresh,
  };
}

export default useSeedManager;

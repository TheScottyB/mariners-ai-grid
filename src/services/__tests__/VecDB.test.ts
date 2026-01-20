
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VecDB, AtmosphericVector } from '../VecDB';

// Mock op-sqlite
vi.mock('@op-engineering/op-sqlite', () => ({
  open: vi.fn(() => ({
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    executeBatch: vi.fn().mockResolvedValue({}),
  })),
}));

describe('VecDB Watchkeeper Core', () => {
  let vecdb: VecDB;
  let mockDb: any;

  beforeEach(() => {
    vecdb = new VecDB('test.db');
    // @ts-ignore - access private for testing
    mockDb = vecdb.db;
  });

  describe('Vector Normalization', () => {
    it('should correctly normalize atmospheric inputs to Float32Array', () => {
      const atmo: AtmosphericVector = {
        temperature: 0.5,
        pressure: -0.2,
        humidity: 0.8,
        windU: 0.3,
        windV: -0.1,
        pressureTrend: 0.1,
        cloudCover: 0.4,
        waveHeight: 0.2,
        wavePeriod: 0.6,
      };

      const result = vecdb.vectorToFloat32(atmo);
      
      expect(result).toBeInstanceOf(Float32Array);
      expect(result[0]).toBeCloseTo(0.5);
      expect(result[1]).toBeCloseTo(-0.2);
      expect(result[2]).toBeCloseTo(0.8);
      expect(result[15]).toBe(0); // Padded to 16
    });

    it('should handle missing wave data with defaults', () => {
      const atmo: AtmosphericVector = {
        temperature: 0, pressure: 0, humidity: 0,
        windU: 0, windV: 0, pressureTrend: 0, cloudCover: 0
      };
      const result = vecdb.vectorToFloat32(atmo);
      expect(result[7]).toBe(0); // waveHeight
      expect(result[8]).toBe(0); // wavePeriod
    });
  });

  describe('Geo-Math Accuracy', () => {
    it('should calculate accurate Haversine distance between maritime points', () => {
      // SF to Hawaii (approx 2080nm)
      const sf = { lat: 37.77, lon: -122.41 };
      const hi = { lat: 21.30, lon: -157.85 };
      
      // @ts-ignore - test private method
      const dist = vecdb.haversineNm(sf.lat, sf.lon, hi.lat, hi.lon);
      
      // Expected: ~2080 nm
      expect(dist).toBeGreaterThan(2000);
      expect(dist).toBeLessThan(2200);
    });

    it('should handle small distances accurately (harbor scale)', () => {
      const p1 = { lat: 37.800, lon: -122.400 };
      const p2 = { lat: 37.801, lon: -122.401 };
      
      // @ts-ignore
      const dist = vecdb.haversineNm(p1.lat, p1.lon, p2.lat, p2.lon);
      expect(dist).toBeLessThan(1.0); // Less than 1nm
      expect(dist).toBeGreaterThan(0);
    });
  });

  describe('Hybrid Query Logic', () => {
    it('should construct correct SQL for spatial + vector search', async () => {
      await vecdb.initialize();
      
      const queryAtmo: AtmosphericVector = {
        temperature: 0, pressure: 0, humidity: 0,
        windU: 0, windV: 0, pressureTrend: 0, cloudCover: 0
      };

      await vecdb.findSimilarNearby(queryAtmo, 37, -122, 1.0);

      // Verify the distance constraint is present (vlasky fork feature)
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('vec_distance_cosine'),
        expect.any(Array)
      );
      
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('< ?'),
        expect.any(Array)
      );
    });
  });
});

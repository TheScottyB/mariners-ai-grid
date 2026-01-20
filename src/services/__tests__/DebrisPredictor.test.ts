
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DebrisPredictor } from '../DebrisPredictor';

// Mock op-sqlite
vi.mock('@op-engineering/op-sqlite', () => ({
  open: vi.fn(() => ({
    execute: vi.fn(),
    transaction: vi.fn((cb) => cb({ execute: vi.fn() })),
  })),
}));

describe('DebrisPredictor Lagrangian Logic', () => {
  let predictor: DebrisPredictor;
  let mockDb: any;
  let mockHazardService: any;

  beforeEach(() => {
    mockDb = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
      transaction: vi.fn(async (cb) => {
        const tx = { execute: vi.fn().mockResolvedValue({}) };
        await cb(tx);
      }),
    };
    mockHazardService = {};
    predictor = new DebrisPredictor(mockDb, mockHazardService);
  });

  describe('Drift Physics', () => {
    it('should generate a 24-point path for 24h forecast with 1h steps', async () => {
      // 1. Setup a mock drifting hazard
      const mockHazard = {
        id: 'log-1',
        type: 'debris',
        lat: 34.0,
        lon: -118.0,
      };
      mockDb.execute.mockResolvedValueOnce({ rows: [mockHazard] });

      // 2. Run forecast
      await predictor.forecastDrift(24, 1);

      // 3. Verify DB update call
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE marine_hazards SET predicted_path_json = ?'),
        expect.arrayContaining([expect.any(String), 'log-1'])
      );

      // Extract the JSON path from the call
      const updateCall = mockDb.execute.mock.calls.find((c: any) => c[0].includes('predicted_path_json'));
      const path = JSON.parse(updateCall[1][0]);
      
      expect(path).toHaveLength(24);
      expect(path[0].timestamp).toBeGreaterThan(Date.now());
    });

    it('should apply different leeway/drag for different debris types', async () => {
      // Test 'other' (high freeboard) vs 'whale' (low leeway)
      const hazards = [
        { id: 'container', type: 'other', lat: 0, lon: 0 },
        { id: 'whale', type: 'whale', lat: 0, lon: 0 },
      ];
      mockDb.execute.mockResolvedValueOnce({ rows: hazards });

      await predictor.forecastDrift(1, 1);

      const updateCalls = mockDb.execute.mock.calls.filter((c: any) => c[0].includes('predicted_path_json'));
      
      const containerPath = JSON.parse(updateCalls[0][1][0]);
      const whalePath = JSON.parse(updateCalls[1][1][0]);

      // Container (type: other) has higher leeway (0.05) vs Whale (0.01)
      // So container should drift further given the same mocked environment
      const containerDist = Math.abs(containerPath[0].lat) + Math.abs(containerPath[0].lon);
      const whaleDist = Math.abs(whalePath[0].lat) + Math.abs(whalePath[0].lon);

      expect(containerDist).toBeGreaterThan(whaleDist);
    });
  });

  describe('GeoJSON Generation', () => {
    it('should correctly format predicted paths as LineString Features', async () => {
      const mockPath = JSON.stringify([
        { lat: 34.0, lon: -118.0, timestamp: Date.now() },
        { lat: 34.1, lon: -118.1, timestamp: Date.now() + 3600000 },
      ]);
      
      mockDb.execute.mockResolvedValueOnce({ 
        rows: [{ id: 'h1', type: 'debris', predicted_path_json: mockPath }] 
      });

      const geojson = await predictor.getPredictedPathsGeoJSON();

      expect(geojson.type).toBe('FeatureCollection');
      expect(geojson.features[0].geometry.type).toBe('LineString');
      // GeoJSON is [lon, lat]
      expect(geojson.features[0].geometry.coordinates[0]).toEqual([-118.0, 34.0]);
    });
  });
});

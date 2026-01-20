
import { describe, it, expect, vi } from 'vitest';
import { SeedReader } from '../SeedReader';

// Mock decompress
vi.mock('fzstd', () => ({
  decompress: vi.fn(data => data),
}));

describe('SeedReader Data Extraction', () => {
  describe('Dequantization Logic', () => {
    it('should accurately dequantize wind values using scale and offset', () => {
      // @ts-ignore - test private method
      const result = SeedReader.getVariableValues({
        quantizedValues: [10, 20],
        scaleFactor: 0.1,
        addOffset: 5.0
      });

      // 5.0 + (10 * 0.1) = 6.0
      // 5.0 + (20 * 0.1) = 7.0
      expect(result[0]).toBeCloseTo(6.0);
      expect(result[1]).toBeCloseTo(7.0);
    });

    it('should fallback to raw values if no quantized data present', () => {
      // @ts-ignore
      const result = SeedReader.getVariableValues({
        values: [1.2, 3.4],
        scaleFactor: 0,
        addOffset: 0
      });
      expect(result).toEqual([1.2, 3.4]);
    });
  });

  describe('Wind Extraction', () => {
    it('should extract gridded wind data from a decoded seed', () => {
      const mockSeed: any = {
        latitudes: [34.0],
        longitudes: [-118.0],
        timeStepsIso: [new Date().toISOString()],
        variables: [
          { name: 'u10', data: { values: [5.5] } },
          { name: 'v10', data: { values: [-2.1] } }
        ]
      };

      const windData = SeedReader.extractWindData(mockSeed, 0);
      
      expect(windData).toHaveLength(1);
      expect(windData[0]).toEqual({
        lat: 34.0,
        lon: -118.0,
        u10: 5.5,
        v10: -2.1,
        timestamp: expect.any(Number)
      });
    });

    it('should return empty array if variables are missing', () => {
      const mockSeed: any = {
        latitudes: [0],
        longitudes: [0],
        timeStepsIso: [new Date().toISOString()],
        variables: []
      };
      const result = SeedReader.extractWindData(mockSeed, 0);
      expect(result).toEqual([]);
    });
  });
});

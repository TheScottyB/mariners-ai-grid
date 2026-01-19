
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarinerInference } from '../MarinerInference';
import { WeatherSeed } from '../../schema/schema/weather_seed';

// Mocks
vi.mock('onnxruntime-react-native', () => ({
  InferenceSession: {
    create: vi.fn().mockResolvedValue({
      run: vi.fn().mockResolvedValue({ output: 'mock-tensor' }),
    }),
  },
  Tensor: class {
    constructor(type: string, data: any, dims: any) {
      this.dims = dims;
      this.data = data;
    }
  }
}));

vi.mock('expo-file-system/next', () => {
  return {
    File: class {
      constructor(path: string) {}
      open() { return this; }
      readBytes() { 
        // Return a valid mock Seed Protobuf buffer
        const seed = {
          seedId: 'test',
          modelSource: 'mock',
          modelRunIso: '2026-01-19T00:00:00Z',
          createdAtIso: '2026-01-19T00:00:00Z',
          resolutionDeg: 0.25,
          forecastStartIso: '2026-01-19T00:00:00Z',
          forecastEndIso: '2026-01-20T00:00:00Z',
          timeStepHours: 1,
          timeStepsIso: ['2026-01-19T00:00:00Z'],
          latitudes: [10, 11],
          longitudes: [20],
          variables: [
            { name: 'u10', data: { values: [5.0, 5.5], quantizedValues: [], scaleFactor: 0, addOffset: 0 } },
            { name: 'v10', data: { values: [2.0, 2.5], quantizedValues: [], scaleFactor: 0, addOffset: 0 } }
          ],
          metaTags: {},
        };
        return WeatherSeed.encode(seed).finish();
      }
      get size() { return 100; }
    }
  };
});

// Mock geoUtils
vi.mock('../utils/geoUtils', () => ({
  windDataToGeoJSON: vi.fn().mockReturnValue({ type: 'FeatureCollection', features: [] }),
}));

describe('MarinerInference', () => {
  let inference: MarinerInference;

  beforeEach(() => {
    inference = new MarinerInference('model.onnx');
  });

  it('should initialize session', async () => {
    await inference.initialize();
    // No error throw means success
    expect(true).toBe(true);
  });

  it('should prepare tensors and run forecast', async () => {
    await inference.initialize();
    const result = await inference.runForecast('file://seed.zst');
    
    expect(result).toBeDefined();
    // geoUtils mock returns empty FC
    expect(result.type).toBe('FeatureCollection');
  });
});


import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TruthChecker } from '../TruthChecker';
import { SignalKBridge } from '../SignalKBridge';
import { MockNMEAStreamer } from '../MockNMEAStreamer';
import { WeatherSeed } from '../../schema/schema/weather_seed';

// Mock dependencies
vi.mock('@op-engineering/op-sqlite');
vi.mock('expo-network', () => ({
  getNetworkStateAsync: vi.fn().mockResolvedValue({ isConnected: true }),
}));

describe('Circular Truth Loop Integration', () => {
  let truthChecker: TruthChecker;
  let vesselSnapshot: any;
  let vecDb: any;
  let streamer: MockNMEAStreamer;

  beforeEach(() => {
    vesselSnapshot = { captureDivergence: vi.fn().mockResolvedValue(true) };
    vecDb = {};
    truthChecker = new TruthChecker(vesselSnapshot, vecDb);
    streamer = new MockNMEAStreamer();
  });

  it('should detect divergence when sensors deviate from AI seed', async () => {
    // 1. Create a Mock Seed with predicted 10kt wind
    const mockSeed: any = {
      seedId: 'test-seed',
      modelSource: 'graphcast',
      latitudes: [37.0, 38.0],
      longitudes: [-122.0, -121.0],
      timeStepsIso: [new Date().toISOString()],
      variables: [
        { 
          name: 'u10', 
          data: { values: [5, 5, 5, 5], scaleFactor: 1, addOffset: 0 } 
        },
        { 
          name: 'v10', 
          data: { values: [0, 0, 0, 0], scaleFactor: 1, addOffset: 0 } 
        },
        { 
          name: 'msl', 
          data: { values: [101300, 101300, 101300, 101300], scaleFactor: 1, addOffset: 0 } 
        }
      ]
    };

    // 2. Mock Telemetry with 25kt wind (Significant Divergence)
    const telemetry: any = {
      position: { lat: 37.5, lon: -122.5 },
      trueWindSpeed: 25, // vs ~10kt in seed
      trueWindAngle: 90,
      barometer: 1013,
      timestamp: Date.now()
    };

    // 3. Run Check
    const report = await truthChecker.check(telemetry, mockSeed, 0);

    // 4. Verify
    expect(report.isDivergent).toBe(true);
    expect(report.level).toBe('disagree'); // Based on 15kt difference
    expect(vesselSnapshot.captureDivergence).toHaveBeenCalled();
  });

  it('should report agreement when sensors match AI seed', async () => {
    const mockSeed: any = {
      seedId: 'test-seed',
      latitudes: [37.0, 38.0],
      longitudes: [-122.0, -121.0],
      timeStepsIso: [new Date().toISOString()],
      variables: [
        { name: 'u10', data: { values: [5, 5, 5, 5] } },
        { name: 'v10', data: { values: [0, 0, 0, 0] } },
        { name: 'msl', data: { values: [101300, 101300, 101300, 101300] } }
      ]
    };

    const telemetry: any = {
      position: { lat: 37.5, lon: -122.5 },
      trueWindSpeed: 11, // vs ~10kt in seed (within 8kt threshold)
      barometer: 1013,
      timestamp: Date.now()
    };

    const report = await truthChecker.check(telemetry, mockSeed, 0);
    expect(report.isDivergent).toBe(false);
    expect(report.level).toBe('agree');
  });
});

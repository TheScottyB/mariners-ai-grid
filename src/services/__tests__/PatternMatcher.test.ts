
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PatternMatcher, TelemetrySnapshot } from '../PatternMatcher';
import { VecDB } from '../VecDB';

// Mock dependencies
vi.mock('@op-engineering/op-sqlite', () => ({
  open: vi.fn(() => ({
    execute: vi.fn(),
    executeBatch: vi.fn(),
  })),
}));

vi.mock('../VecDB', () => {
  return {
    VecDB: class {
      initialize = vi.fn().mockResolvedValue(true);
      storePattern = vi.fn().mockResolvedValue(true);
      findSimilar = vi.fn().mockResolvedValue([]);
      getStats = vi.fn().mockResolvedValue({ totalPatterns: 0 });
    },
  };
});

describe('PatternMatcher Noise Robustness', () => {
  let matcher: PatternMatcher;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {}; // Mock DB object
    matcher = new PatternMatcher(mockDb);
    // @ts-ignore - access private property for testing
    matcher.telemetryBuffer = []; 
  });

  it('should calculate stable pressure trend with steady drop', async () => {
    // Simulate 1 hour of steady pressure drop (1013 -> 1003 = -10hPa/hr)
    const startTime = Date.now();
    
    // Fill buffer with 1 hour of data
    for (let i = 0; i <= 60; i++) {
      const time = startTime + (i * 60 * 1000); // 1 minute steps
      // Linear drop from 1013 to 1003
      const pressure = 1013 - (10 * (i / 60)); 
      
      const snapshot: TelemetrySnapshot = {
        position: { lat: 0, lon: 0 },
        heading: 0,
        sog: 0,
        barometer: pressure,
        timestamp: time,
      };
      
      await matcher.processTelemetry(snapshot);
    }

    const conditions = matcher.getCurrentConditions();
    // Trend should be -1.0 (normalized for -10hPa/hr)
    // Allow small epsilon due to float math
    expect(conditions?.pressureTrend).toBeCloseTo(-1.0, 1);
  });

  it('should be robust against single-point noise spikes', async () => {
    // Simulate steady state then ONE massive spike
    const startTime = Date.now();
    
    // 59 minutes of steady 1013 hPa
    for (let i = 0; i < 59; i++) {
       await matcher.processTelemetry({
        position: { lat: 0, lon: 0 },
        heading: 0,
        sog: 0,
        barometer: 1013,
        timestamp: startTime + (i * 60 * 1000),
      });
    }

    // Minute 60: Massive SPIKE to 900 hPa (Sensor error)
    await matcher.processTelemetry({
        position: { lat: 0, lon: 0 },
        heading: 0,
        sog: 0,
        barometer: 900, // Implausible drop (-113 hPa instantaneous)
        timestamp: startTime + (60 * 60 * 1000),
    });

    const conditions = matcher.getCurrentConditions();
    
    // With Median Filter (window=5), the sequence is [1013, 1013, 1013, 1013, 900]
    // Median is 1013.
    // Trend: (1013 - 1013) / 1hr = 0
    expect(conditions?.pressureTrend).toBe(0); 
  });
});

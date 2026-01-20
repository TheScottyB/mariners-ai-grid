
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VecDB, AtmosphericVector } from '../VecDB';

// Mock op-sqlite for performance testing structure
// Note: Real performance must be measured on hardware, 
// this test verifies the overhead of the service layer.
vi.mock('@op-engineering/op-sqlite', () => ({
  open: vi.fn(() => ({
    execute: vi.fn().mockImplementation(async () => {
      // Simulate minimal DB latency (0.5ms)
      await new Promise(r => setTimeout(r, 0.5));
      return { rows: Array(10).fill({ id: 'match', distance: 0.1, timestamp: Date.now(), lat: 0, lon: 0 }) };
    }),
    executeBatch: vi.fn().mockResolvedValue({}),
  })),
}));

describe('Zero-Latency Benchmarking', () => {
  let vecdb: VecDB;

  beforeEach(() => {
    vecdb = new VecDB('bench.db');
  });

  it('should execute Hybrid Query within sub-50ms window (Service Overhead)', async () => {
    await vecdb.initialize();
    
    const queryAtmo: AtmosphericVector = {
      temperature: 0, pressure: 0, humidity: 0,
      windU: 0, windV: 0, pressureTrend: 0, cloudCover: 0
    };

    const startTime = performance.now();
    
    // Run 10 consecutive searches to get an average
    const iterations = 10;
    for (let i = 0; i < iterations; i++) {
      await vecdb.vibeSearch(queryAtmo, { lat: 37, lon: -122, radiusNm: 100 });
    }
    
    const duration = (performance.now() - startTime) / iterations;
    
    console.log(`Average Hybrid Query Service Overhead: ${duration.toFixed(2)}ms`);
    
    // Total overhead should be well under 50ms (ideally < 5ms for service layer)
    expect(duration).toBeLessThan(50);
  });
});

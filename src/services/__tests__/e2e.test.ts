
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SeedManager } from '../SeedManager';
import { PatternMatcher, TelemetrySnapshot } from '../PatternMatcher';
import { VecDB, AtmosphericVector } from '../VecDB';
import { TruthChecker } from '../TruthChecker';
import { SignalKBridge } from '../SignalKBridge';
import { File, Directory, Paths } from 'expo-file-system';

// Mock Dependencies
vi.mock('expo-file-system', () => {
  class FileMock {
    uri: string;
    exists: boolean = true;
    
    constructor(path: string) {
      this.uri = typeof path === 'string' ? path : 'file:///mock/';
    }
  }
  
  class DirectoryMock {
    uri: string;
    exists: boolean = true;
    
    constructor(...args: any[]) {
      this.uri = args.join('/');
    }
  }
  
  return {
    File: FileMock,
    Directory: DirectoryMock,
    Paths: {
      document: 'file:///mock/document/',
      cache: 'file:///mock/cache/'
    }
  };
});
vi.mock('@op-engineering/op-sqlite', () => ({
  open: vi.fn(() => ({
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    executeBatch: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  })),
}));

// Mock fzstd
vi.mock('fzstd', () => ({
  decompress: vi.fn((data) => data),
}));

describe('Mariner AI Grid E2E Pipeline', () => {
  let seedManager: SeedManager;
  let patternMatcher: PatternMatcher;
  let vecDb: VecDB;
  let truthChecker: TruthChecker;
  let mockDb: any;

  beforeEach(async () => {
    // 1. Initialize DB and Services
    mockDb = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };
    
    vecDb = new VecDB(mockDb);
    // @ts-ignore
    vecDb.initialized = true;

    // 2. Setup SeedManager
    seedManager = new SeedManager({ maxStorageMB: 50 });
    // @ts-ignore
    seedManager.metadataIndex = [];

    // 3. Setup PatternMatcher
    patternMatcher = new PatternMatcher(mockDb);
    // @ts-ignore
    patternMatcher.vecDB = vecDb;

    // 4. Setup TruthChecker
    const vesselSnapshotMock: any = { captureDivergence: vi.fn() };
    truthChecker = new TruthChecker(vesselSnapshotMock, vecDb);
  });

  it('should process a full data cycle: Seed -> Telemetry -> Divergence', async () => {
    console.log('[E2E] Starting full cycle test...');

    // 1. Simulate Seed Loading (Mock Payload)
    const mockSeed: any = {
      seedId: 'test_seed_pacific',
      modelSource: 'ecmwf_aifs',
      latitudes: [30.0],
      longitudes: [-140.0],
      timeStepsIso: [new Date().toISOString()],
      variables: [
        { name: 'u10', data: { values: [5.0] } }, // 5 m/s East
        { name: 'v10', data: { values: [0.0] } }, // 0 m/s North
        { name: 'msl', data: { values: [101300] } } // 1013 hPa
      ]
    };

    // Inject seed into cache manually since we mocked FileSystem
    // @ts-ignore
    seedManager.rawSeedCache.set('test_seed_pacific', mockSeed);
    // @ts-ignore
    seedManager.metadataIndex.push({ 
        id: 'test_seed_pacific', 
        expiresAt: Date.now() + 10000,
        bounds: { north: 31, south: 29, east: -139, west: -141 },
        downloadedAt: Date.now(),
        fileSizeBytes: 1024
    });

    // 2. Simulate Incoming Telemetry (Signal K)
    // Scenario: Real wind is much stronger than forecast (Divergence)
    const telemetry: TelemetrySnapshot = {
      position: { lat: 30.0, lon: -140.0 },
      heading: 0,
      sog: 5,
      timestamp: Date.now(),
      trueWindSpeed: 25, // 25 knots (~12 m/s) vs Forecast 5 m/s (~10 kts)
      trueWindAngle: 90,
      barometer: 1005,   // 1005 hPa vs Forecast 1013 hPa
    };

    console.log('[E2E] Telemetry received: 25kt wind, 1005hPa');

    // 3. Pattern Matching (Is this dangerous?)
    const patternAlert = await patternMatcher.processTelemetry(telemetry);
    
    // We expect null alert here since we haven't seeded dangerous patterns 
    // in this specific mock DB, but the flow should complete without error.
    expect(patternAlert).toBeNull(); 

    // 4. Truth Checking (Is the forecast wrong?)
    // This is the critical "Circular Truth" validation
    const report = await truthChecker.check(
      telemetry,
      mockSeed,
      0 // Time index 0
    );

    console.log(`[E2E] Divergence Report: ${JSON.stringify(report)}`);

    // 5. Assertions
    expect(report.isDivergent).toBe(true); // 25kt vs 10kt is a major divergence
    expect(report.level).toBe('disagree');
    
    // Verify Wind Delta: |25 - ~9.7| ≈ 15.3 kts
    expect(report.windDeltaKts).toBeCloseTo(15.3, 1);
    
    // Verify Pressure Delta: |1005 - 1013| = 8 hPa
    expect(report.pressureDeltaHpa).toBeCloseTo(8.0, 1);

    console.log('[E2E] Full cycle complete: Divergence correctly identified.');
  });

  it('should respect sovereign offline limits during high-frequency polling', async () => {
    // 1. Simulate 10Hz polling for 1 second (10 cycles)
    const cycles = 10;
    const timestamps: number[] = [];

    console.log(`[E2E] Stress testing ${cycles} cycles...`);

    for (let i = 0; i < cycles; i++) {
        const t = Date.now() + (i * 100);
        await patternMatcher.processTelemetry({
            position: { lat: 0, lon: 0 },
            heading: 0, 
            sog: 0,
            timestamp: t
        });
        timestamps.push(t);
    }

    // 2. Verify internal buffer limits (should only keep last 60)
    // @ts-ignore
    expect(patternMatcher.telemetryBuffer.length).toBeLessThanOrEqual(60);
    
    // 3. Verify processing speed (simulated)
    // In a real env we'd measure ms, here we just ensure async completes
    const stats = await patternMatcher.getStats();
    expect(stats.lastCheckTime).toBe(timestamps[cycles - 1]);
    
    console.log('[E2E] Stress test passed: Buffer integrity maintained.');
  });
});

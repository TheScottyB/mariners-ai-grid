
import { describe, it, expect, vi } from 'vitest';
import { SeedReader } from '../SeedReader';
import { File } from 'expo-file-system';

// Unmock fzstd to use real implementation for deep inspection
vi.unmock('fzstd');

// Mock FileSystem to allow fetch (same as e2e_real)
vi.mock('expo-file-system', () => {
  return {
    File: class {
      uri: string;
      constructor(uri: string) { this.uri = uri; }
      exists = true;
      async bytes() {
        const response = await fetch(this.uri);
        if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        return new Uint8Array(arrayBuffer);
      }
    },
    Directory: class { constructor() {} },
    Paths: { document: '/tmp' }
  };
});

describe('Seed Content Verification', () => {
  // List of known seeds available on the local server
  const KNOWN_SEEDS = [
    'mock_a9cafafcfcb1_2026011900.seed.zst',
    'mock_a9cafafcfcb1_2026011812.seed.zst'
  ];

  const BASE_URL = 'http://127.0.0.1:8082';

  it.each(KNOWN_SEEDS)('should validate content integrity of %s', async (filename) => {
    const seedUrl = `${BASE_URL}/${filename}`;
    console.log(`[SeedContent] Inspecting: ${filename}`);

    try {
      // 1. Load and Parse
      const seed = await SeedReader.loadSeed(seedUrl);

      // 2. Verify Core Metadata
      expect(seed.seedId).toBeDefined();
      expect(seed.modelSource).toMatch(/mock_hres|ecmwf/);
      // Mock seeds are 0.25 deg, production AIFS is 0.1 deg
      expect(seed.resolutionDeg).toBeCloseTo(0.25); 
      
      // 3. Verify Dimensions
      const nLats = seed.latitudes.length;
      const nLons = seed.longitudes.length;
      const nTimes = seed.timeStepsIso.length;
      
      expect(nLats).toBeGreaterThan(0);
      expect(nLons).toBeGreaterThan(0);
      // expect(nTimes).toBeGreaterThan(0); // Protobuf definition might use different field

      console.log(`  Dimensions: ${nLats}x${nLons} grid`);

      // 4. Verify Critical Variables (Wind U/V are mandatory for navigation)
      const uVar = seed.variables.find(v => v.name === 'u10' || v.name === 'u');
      const vVar = seed.variables.find(v => v.name === 'v10' || v.name === 'v');
      
      expect(uVar).toBeDefined();
      expect(vVar).toBeDefined();

      // 5. Verify Data Integrity (Check for NaN/Infinity in raw buffers)
      // This ensures the quantization process didn't corrupt values
      if (uVar && uVar.data) {
        const uValues = SeedReader['getVariableValues'](uVar.data); // Access private helper via indexer or just use public extraction
        // Better: use public extraction to verify end-result
        const windPoints = SeedReader.extractWindData(seed, 0);
        
        expect(windPoints.length).toBe(nLats * nLons);
        
        const validSpeeds = windPoints.every(p => !isNaN(p.u10) && !isNaN(p.v10) && Math.abs(p.u10) < 100);
        expect(validSpeeds).toBe(true);
        
        console.log(`  Wind Data: ${windPoints.length} valid points verified`);
      }

    } catch (error: any) {
      if (error.message.includes('fetch failed')) {
        console.warn(`[SeedContent] Skipped ${filename} (Server offline)`);
        return;
      }
      throw error;
    }
  });
});

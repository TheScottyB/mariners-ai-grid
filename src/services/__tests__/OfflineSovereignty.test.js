import { describe, it, expect, vi } from 'vitest';
import { VecDB } from '../VecDB';
import * as Network from 'expo-network';

// Mock op-sqlite
vi.mock('@op-engineering/op-sqlite', () => ({
  open: vi.fn(() => ({
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    executeBatch: vi.fn().mockResolvedValue({}),
  })),
}));

// Mock Network
vi.mock('expo-network', () => ({
  getNetworkStateAsync: vi.fn().mockResolvedValue({
    isConnected: false,
    isInternetReachable: false,
    type: 'none',
  }),
  NetworkStateType: { NONE: 'none' }
}));

describe('Offline Sovereignty Field Simulation', () => {
  it('should allow historical pattern search when network is completely offline', async () => {
    const vecdb = new VecDB('offline.db');
    // @ts-ignore
    vecdb.initialized = true; 
    
    const results = await vecdb.findSimilar({
      temperature: 0, pressure: 0, humidity: 0,
      windU: 0, windV: 0, pressureTrend: 0, cloudCover: 0
    });

    expect(results).toBeDefined();
    const state = await Network.getNetworkStateAsync();
    expect(state.isConnected).toBe(false);
  });
});
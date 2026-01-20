import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SeedManager } from '../SeedManager';
import { VecDB } from '../VecDB';

// Mock op-sqlite
vi.mock('@op-engineering/op-sqlite', () => ({
  open: vi.fn(() => ({
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    executeBatch: vi.fn().mockResolvedValue({}),
  })),
}));

// Mock expo-file-system/legacy
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'test://',
  getInfoAsync: vi.fn().mockResolvedValue({ exists: true }),
  makeDirectoryAsync: vi.fn().mockResolvedValue(undefined),
  deleteAsync: vi.fn().mockResolvedValue(undefined),
  writeAsStringAsync: vi.fn().mockResolvedValue(undefined),
  readAsStringAsync: vi.fn().mockResolvedValue('[]'),
  downloadAsync: vi.fn(),
  copyAsync: vi.fn(),
}));

describe('Space Reclamation Audit (LRU Eviction)', () => {
  let manager: SeedManager;

  beforeEach(() => {
    manager = new SeedManager({ maxStorageMB: 10 });
    // @ts-ignore
    manager.metadataIndex = [];
  });

  it('should evict oldest seeds when storage limit is exceeded', async () => {
    const seed1: any = { id: 's1', fileSizeBytes: 5 * 1024 * 1024, downloadedAt: 1000, filename: 'f1' };
    const seed2: any = { id: 's2', fileSizeBytes: 5 * 1024 * 1024, downloadedAt: 2000, filename: 'f2' };
    const seed3: any = { id: 's3', fileSizeBytes: 5 * 1024 * 1024, downloadedAt: 3000, filename: 'f3' };

    // @ts-ignore
    manager.metadataIndex = [seed1, seed2, seed3];

    // @ts-ignore
    await manager.enforceLRU();

    const remaining = manager.listSeeds();
    expect(remaining).toHaveLength(2);
    
    const ids = remaining.map(s => s.id);
    expect(ids).not.toContain('s1'); 
    expect(ids).toContain('s2');
    expect(ids).toContain('s3');
    
        const total = await manager.getStorageUsed();
    
        expect(total).toBe(10 * 1024 * 1024);
    
      });
    
    
    
      it('should reclaim space via optimize and VACUUM commands', async () => {
    
        const mockDb = {
    
          execute: vi.fn().mockResolvedValue({ rows: [] }),
    
        };
    
        const vecdb = new VecDB(mockDb as any);
    
        // @ts-ignore
    
        vecdb.initialized = true;
    
    
    
        await vecdb.optimize();
    
    
    
        // Verify the v0.2.x optimize syntax
    
        expect(mockDb.execute).toHaveBeenCalledWith(
    
          expect.stringContaining('VALUES ("optimize")')
    
        );
    
        
    
        // Verify standard vacuum
    
        expect(mockDb.execute).toHaveBeenCalledWith('VACUUM');
    
      });
    
    });
    
    
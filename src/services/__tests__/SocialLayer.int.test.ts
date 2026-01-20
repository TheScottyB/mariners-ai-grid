
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SocialLayer } from '../SocialLayer';

// Mock op-sqlite
vi.mock('@op-engineering/op-sqlite', () => ({
  open: vi.fn(() => ({
    execute: vi.fn(),
  })),
}));

describe('SocialLayer Integration (Distance Constraints)', () => {
  let socialLayer: SocialLayer;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };
    socialLayer = new SocialLayer(mockDb);
  });

  it('should construct the correct SQL using the vlasky fork syntax', async () => {
    const lat = 37.7749;
    const lon = -122.4194;
    const radius = 10;

    await socialLayer.findHazardsNearPath(lat, lon, radius);

    // Verify SQL syntax
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('v.location MATCH vec_f32(?)'),
      expect.any(Array)
    );

    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('v.distance < ?'),
      expect.any(Array)
    );
    
    // Verify k-nearest parameter is present
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('k = 50'),
      expect.any(Array)
    );
  });

  it('should correctly map result rows to SpatialHazard interface', async () => {
    const mockRows = [
      {
        id: 'h1',
        hazard_type: 'debris',
        description: 'Large log',
        timestamp: 1705600000000,
        distance: 2.5
      },
      {
        id: 'h2',
        hazard_type: 'shallow',
        description: 'Uncharted rock',
        timestamp: 1705600000000,
        distance: 8.1
      }
    ];

    mockDb.execute.mockResolvedValue({ rows: mockRows });

    const results = await socialLayer.findHazardsNearPath(0, 0, 10);

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('h1');
    expect(results[0].distance).toBe(2.5);
    expect(results[1].type).toBe('shallow');
  });

  it('should handle empty result sets gracefully', async () => {
    mockDb.execute.mockResolvedValue({ rows: [] });
    const results = await socialLayer.findHazardsNearPath(0, 0, 50);
    expect(results).toEqual([]);
  });
});

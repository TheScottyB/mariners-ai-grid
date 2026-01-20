
/**
 * Mariner's AI Grid - Sensor Provider
 * 
 * Unifies access to "Truth" data sources.
 * Abstracts away the difference between NMEA 2000 (Signal K) and Device Hardware.
 */

import { TelemetryService, TelemetrySource } from './TelemetryService';
import { TelemetrySnapshot } from './PatternMatcher';

export class SensorProvider {
  private telemetryService: TelemetryService;

  constructor() {
    this.telemetryService = TelemetryService.getInstance();
  }

  /**
   * Get the current "Truth" source.
   */
  getSource(): TelemetrySource {
    return this.telemetryService.getSource();
  }

  /**
   * Get the current truth snapshot.
   * This is the "Ground Truth" used for AI validation.
   */
  getCurrentTruth(): TelemetrySnapshot | null {
    // In a real implementation, this would be a synchronous getter
    // For now, we rely on the subscription model in App.tsx
    return null; 
  }
}

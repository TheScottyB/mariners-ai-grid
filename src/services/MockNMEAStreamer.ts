/**
 * Mariner's AI Grid - Mock NMEA Streamer
 * 
 * Synthetic data injector for Signal K / NMEA 2000 simulations.
 * Used for "Hardware-in-the-Loop" testing and "Circular Truth" validation.
 * 
 * Supports:
 * - Steady state cruising
 * - Rapid pressure drops (Squall simulation)
 * - Divergence injection (Mocking AI vs Sensor mismatch)
 */

export interface MockScenario {
  name: string;
  durationMs: number;
  updateIntervalMs: number;
  generateDelta: (elapsedMs: number) => any;
}

export class MockNMEAStreamer {
  private interval: NodeJS.Timeout | null = null;
  private startTime: number = 0;

  /**
   * Start streaming a scenario to a callback.
   */
  start(scenario: MockScenario, onDelta: (delta: any) => void) {
    this.stop();
    this.startTime = Date.now();
    
    this.interval = setInterval(() => {
      const elapsed = Date.now() - this.startTime;
      if (elapsed > scenario.durationMs) {
        this.stop();
        return;
      }
      
      const delta = scenario.generateDelta(elapsed);
      onDelta(delta);
    }, scenario.updateIntervalMs);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Predefined Scenario: Rapid Squall
   * Simulates a 10hPa pressure drop and 30kt wind increase over 5 minutes.
   */
  static SQUALL_SCENARIO(lat: number, lon: number): MockScenario {
    return {
      name: 'Rapid Squall',
      durationMs: 300000, // 5 minutes
      updateIntervalMs: 1000, // 1Hz
      generateDelta: (elapsed) => {
        const progress = elapsed / 300000;
        const pressure = 1013 - (15 * progress); // 1013 -> 998 hPa
        const windSpeed = 10 + (35 * progress);  // 10 -> 45 knots
        
        return {
          updates: [{
            source: { label: 'mock-sensor' },
            timestamp: new Date().toISOString(),
            values: [
              { path: 'navigation.position', value: { latitude: lat, longitude: lon } },
              { path: 'environment.outside.pressure', value: pressure * 100 }, // hPa to Pa
              { path: 'environment.wind.speedTrue', value: windSpeed / 1.94384 }, // knots to m/s
              { path: 'environment.wind.angleTrueGround', value: 0.5 }, // Rad
            ]
          }]
        };
      }
    };
  }

  /**
   * Predefined Scenario: AI Divergence
   * Simulates conditions that specifically trigger the TruthChecker's 
   * divergence logic (e.g. 10kt wind difference).
   */
  static DIVERGENCE_SCENARIO(lat: number, lon: number, predictedWind: number): MockScenario {
    return {
      name: 'AI Divergence',
      durationMs: 60000,
      updateIntervalMs: 1000,
      generateDelta: () => {
        return {
          updates: [{
            values: [
              { path: 'navigation.position', value: { latitude: lat, longitude: lon } },
              { path: 'environment.outside.pressure', value: 101300 },
              { path: 'environment.wind.speedTrue', value: (predictedWind + 12) / 1.94384 }, // Always +12kt vs prediction
            ]
          }]
        };
      }
    };
  }

  /**
   * Predefined Scenario: Winter Storm (Illinois Scenario)
   * Simulates a deep low pressure system moving through.
   * 1013 -> 985 hPa over 2 hours.
   */
  static WINTER_STORM_SCENARIO(lat: number, lon: number): MockScenario {
    return {
      name: 'Winter Storm',
      durationMs: 7200000, // 2 hours
      updateIntervalMs: 2000, // 0.5Hz
      generateDelta: (elapsed) => {
        const progress = elapsed / 7200000;
        const pressure = 1013 - (28 * progress); // 1013 -> 985 hPa
        const windSpeed = 5 + (45 * progress);   // 5 -> 50 knots
        
        return {
          updates: [{
            source: { label: 'simulated-winter-sensor' },
            timestamp: new Date().toISOString(),
            values: [
              { path: 'navigation.position', value: { latitude: lat, longitude: lon } },
              { path: 'environment.outside.pressure', value: pressure * 100 },
              { path: 'environment.wind.speedTrue', value: windSpeed / 1.94384 },
              { path: 'environment.wind.angleTrueGround', value: 2.1 }, // SW Wind
            ]
          }]
        };
      }
    };
  }
}

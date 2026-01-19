/**
 * MockNMEAStreamer - Signal K WebSocket Server Simulator
 *
 * Simulates a storm scenario for testing PatternAlert DIVERGENT badge:
 * 1. Stable conditions (1013mb, light wind) for 30 seconds
 * 2. Rapid pressure drop to 990mb with 45kt winds over 60 seconds
 *
 * Run with: npx tsx scripts/MockNMEAStreamer.ts
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebSocketServer, WebSocket } from 'ws';

// Signal K delta message format
interface SignalKDelta {
  context: string;
  updates: Array<{
    source: { label: string; type: string };
    timestamp: string;
    values: Array<{
      path: string;
      value: number | { latitude: number; longitude: number };
    }>;
  }>;
}

// Simulation phases
type Phase = 'stable' | 'plummet' | 'peak';

interface SimulationState {
  phase: Phase;
  elapsedMs: number;
  pressure: number;      // Pa (not hPa!)
  windU: number;         // m/s (eastward component)
  windV: number;         // m/s (northward component)
  heading: number;       // radians
  sog: number;           // m/s
  lat: number;
  lon: number;
}

// Configuration
const PORT = 3000;
const TICK_INTERVAL_MS = 1000;  // 1 second updates (Signal K standard)

// Phase durations
const STABLE_DURATION_MS = 30_000;   // 30 seconds of calm
const PLUMMET_DURATION_MS = 60_000;  // 60 seconds of deterioration

// Weather parameters
const STABLE_PRESSURE_PA = 101_300;  // 1013 hPa in Pa
const STORM_PRESSURE_PA = 99_000;    // 990 hPa in Pa
const STABLE_WIND_MS = 3.0;          // ~6 knots
const STORM_WIND_MS = 23.15;         // 45 knots in m/s

// Starting position (mid-Pacific, matches typical seed coverage)
const START_LAT = 30.0;
const START_LON = -140.0;

class MockNMEAStreamer {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private state: SimulationState;
  private intervalId: NodeJS.Timeout | null = null;
  private startTime: number = 0;

  constructor() {
    this.wss = new WebSocketServer({ port: PORT });
    this.state = this.createInitialState();

    this.wss.on('connection', (ws) => {
      console.log(`[SignalK] Client connected. Total: ${this.clients.size + 1}`);
      this.clients.add(ws);

      // Send initial hello message (Signal K protocol)
      ws.send(JSON.stringify({
        name: 'MockNMEAStreamer',
        version: '1.0.0',
        self: 'vessels.urn:mrn:signalk:uuid:mock-vessel',
        roles: ['main', 'master'],
      }));

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`[SignalK] Client disconnected. Total: ${this.clients.size}`);
      });

      ws.on('error', (err) => {
        console.error('[SignalK] WebSocket error:', err.message);
        this.clients.delete(ws);
      });
    });

    this.wss.on('listening', () => {
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║           MOCK NMEA STREAMER - Signal K Simulator            ║
╠══════════════════════════════════════════════════════════════╣
║  WebSocket Server: ws://localhost:${PORT}                      ║
║                                                              ║
║  Scenario: STORM SIMULATION                                  ║
║  ─────────────────────────────────────────────────────────── ║
║  Phase 1 (0-30s):   Stable - 1013mb, 6kt winds               ║
║  Phase 2 (30-90s):  Plummet - Drop to 990mb, 45kt winds      ║
║  Phase 3 (90s+):    Peak Storm - Hold dangerous conditions   ║
║                                                              ║
║  Expected Result:                                            ║
║  • PatternAlert should show DIVERGENT badge                  ║
║  • Local VecDB matches 'Gale' pattern                        ║
║  • GraphCast (from seed) predicts calm                       ║
║  • Haptic feedback should trigger                            ║
╚══════════════════════════════════════════════════════════════╝
`);
    });
  }

  private createInitialState(): SimulationState {
    return {
      phase: 'stable',
      elapsedMs: 0,
      pressure: STABLE_PRESSURE_PA,
      windU: STABLE_WIND_MS * 0.7,  // Light NE wind
      windV: STABLE_WIND_MS * 0.7,
      heading: 4.71,  // ~270° (westward) in radians
      sog: 3.6,       // ~7 knots in m/s
      lat: START_LAT,
      lon: START_LON,
    };
  }

  start(): void {
    this.startTime = Date.now();
    console.log('[Simulation] Starting storm scenario...\n');

    this.intervalId = setInterval(() => {
      this.tick();
    }, TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.wss.close();
    console.log('\n[Simulation] Stopped.');
  }

  private tick(): void {
    this.state.elapsedMs = Date.now() - this.startTime;

    // Update phase
    const prevPhase = this.state.phase;
    if (this.state.elapsedMs < STABLE_DURATION_MS) {
      this.state.phase = 'stable';
    } else if (this.state.elapsedMs < STABLE_DURATION_MS + PLUMMET_DURATION_MS) {
      this.state.phase = 'plummet';
    } else {
      this.state.phase = 'peak';
    }

    // Log phase transitions
    if (prevPhase !== this.state.phase) {
      this.logPhaseTransition(this.state.phase);
    }

    // Update weather based on phase
    this.updateWeather();

    // Broadcast to all connected clients
    const delta = this.buildDelta();
    const message = JSON.stringify(delta);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }

    // Log current state (every 5 seconds)
    if (this.state.elapsedMs % 5000 < TICK_INTERVAL_MS) {
      this.logState();
    }
  }

  private updateWeather(): void {
    switch (this.state.phase) {
      case 'stable':
        // Slight variations for realism
        this.state.pressure = STABLE_PRESSURE_PA + (Math.random() - 0.5) * 100;
        this.state.windU = STABLE_WIND_MS * 0.7 + (Math.random() - 0.5) * 0.5;
        this.state.windV = STABLE_WIND_MS * 0.7 + (Math.random() - 0.5) * 0.5;
        break;

      case 'plummet':
        // Calculate progress through plummet phase (0 to 1)
        const plummetProgress = (this.state.elapsedMs - STABLE_DURATION_MS) / PLUMMET_DURATION_MS;

        // Ease-in curve for dramatic effect
        const eased = this.easeInQuad(plummetProgress);

        // Interpolate pressure (drops faster at end)
        this.state.pressure = STABLE_PRESSURE_PA - (STABLE_PRESSURE_PA - STORM_PRESSURE_PA) * eased;

        // Wind builds exponentially
        const windMagnitude = STABLE_WIND_MS + (STORM_WIND_MS - STABLE_WIND_MS) * eased;
        // Wind shifts to come from the SW (veering)
        const windAngle = Math.PI * 0.25 + (Math.PI * 0.5 * eased);  // 45° to 135°
        this.state.windU = windMagnitude * Math.cos(windAngle);
        this.state.windV = windMagnitude * Math.sin(windAngle);

        // Add gusts (increasing variability)
        const gustFactor = 1 + (Math.random() - 0.5) * 0.3 * eased;
        this.state.windU *= gustFactor;
        this.state.windV *= gustFactor;
        break;

      case 'peak':
        // Hold at storm conditions with strong gusts
        this.state.pressure = STORM_PRESSURE_PA + (Math.random() - 0.5) * 200;

        const peakWind = STORM_WIND_MS * (1 + (Math.random() - 0.5) * 0.4);
        const peakAngle = Math.PI * 0.75 + (Math.random() - 0.5) * 0.3;
        this.state.windU = peakWind * Math.cos(peakAngle);
        this.state.windV = peakWind * Math.sin(peakAngle);
        break;
    }

    // Simulate slight position drift (vessel motion in heavy seas)
    this.state.lat += (Math.random() - 0.5) * 0.001;
    this.state.lon += (Math.random() - 0.5) * 0.001;

    // SOG drops in heavy weather
    if (this.state.phase === 'peak') {
      this.state.sog = 1.5 + Math.random() * 1.0;  // 3-5 knots
    }
  }

  private easeInQuad(t: number): number {
    return t * t;
  }

  private buildDelta(): SignalKDelta {
    const timestamp = new Date().toISOString();

    return {
      context: 'vessels.urn:mrn:signalk:uuid:mock-vessel',
      updates: [
        {
          source: { label: 'MockNMEA', type: 'NMEA2000' },
          timestamp,
          values: [
            // Position
            {
              path: 'navigation.position',
              value: {
                latitude: this.state.lat,
                longitude: this.state.lon,
              },
            },
            // Heading (radians)
            {
              path: 'navigation.headingTrue',
              value: this.state.heading,
            },
            // Speed Over Ground (m/s)
            {
              path: 'navigation.speedOverGround',
              value: this.state.sog,
            },
            // Barometric Pressure (Pa)
            {
              path: 'environment.outside.pressure',
              value: this.state.pressure,
            },
            // Wind - True Wind Speed (m/s)
            {
              path: 'environment.wind.speedTrue',
              value: Math.sqrt(this.state.windU ** 2 + this.state.windV ** 2),
            },
            // Wind - True Wind Angle (radians, relative to vessel heading)
            {
              path: 'environment.wind.angleTrueGround',
              value: Math.atan2(this.state.windV, this.state.windU),
            },
            // Also include U/V components for direct VecDB embedding
            {
              path: 'environment.wind.u10',
              value: this.state.windU,
            },
            {
              path: 'environment.wind.v10',
              value: this.state.windV,
            },
          ],
        },
      ],
    };
  }

  private logPhaseTransition(phase: Phase): void {
    const messages: Record<Phase, string> = {
      stable: '🌤️  PHASE: Stable conditions',
      plummet: '⚠️  PHASE: PRESSURE PLUMMETING - Storm approaching!',
      peak: '🌀  PHASE: PEAK STORM - Gale force conditions!',
    };
    console.log(`\n${'═'.repeat(60)}`);
    console.log(messages[phase]);
    console.log(`${'═'.repeat(60)}\n`);
  }

  private logState(): void {
    const pressureHPa = (this.state.pressure / 100).toFixed(1);
    const windSpeedMs = Math.sqrt(this.state.windU ** 2 + this.state.windV ** 2);
    const windSpeedKts = (windSpeedMs * 1.94384).toFixed(1);
    const elapsed = (this.state.elapsedMs / 1000).toFixed(0);

    const phaseIndicator = {
      stable: '🟢',
      plummet: '🟡',
      peak: '🔴',
    }[this.state.phase];

    console.log(
      `${phaseIndicator} [${elapsed.padStart(3)}s] ` +
      `Pressure: ${pressureHPa}hPa | ` +
      `Wind: ${windSpeedKts}kt | ` +
      `Pos: ${this.state.lat.toFixed(3)}°N, ${this.state.lon.toFixed(3)}°W | ` +
      `Clients: ${this.clients.size}`
    );
  }
}

// Main entry point
const streamer = new MockNMEAStreamer();
streamer.start();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Simulation] Received SIGINT, shutting down...');
  streamer.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  streamer.stop();
  process.exit(0);
});

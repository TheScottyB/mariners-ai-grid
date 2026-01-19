import * as Network from 'expo-network';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { TelemetrySnapshot } from './PatternMatcher';

/**
 * SignalKBridge connects the Expo app to the boat's NMEA 2000 network.
 * It acts as the "Truth Layer" auditor, pulling real-time sensor data
 * to validate and ground the AI forecasts.
 *
 * Focuses on:
 * - PGN 130306 (Wind)
 * - PGN 130311 (Pressure)
 * - PGN 129025 (Position)
 * - PGN 130316 (Temperature)
 * - PGN 130310 (Environmental Parameters)
 */
export class SignalKBridge {
  private ws: ReconnectingWebSocket | null = null;
  private serverUrl: string = "ws://signalk.local:3000/signalk/v1/stream";

  // Accumulated telemetry state (Signal K sends incremental updates)
  private currentTelemetry: Partial<TelemetrySnapshot> = {
    timestamp: Date.now(),
  };

  // Callback for PatternMatcher integration
  private onTelemetrySnapshot?: (snapshot: TelemetrySnapshot) => void;

  /**
   * Initializes the connection and subscribes to marine-critical data.
   */
  async connect(onDataReceived: (data: any) => void) {
    const state = await Network.getNetworkStateAsync();
    
    // Only connect if we are on a Local Network (Boat WiFi)
    // state.isMetered is often true on satellite (Starlink), 
    // but signalk.local is local traffic.
    if (!state.isConnected) {
      console.warn("⚠️ No network connection. Telemetry paused.");
      return;
    }

    console.log(`⚓ Attempting connection to Signal K: ${this.serverUrl}`);
    
    // Using native WebSocket constructor via ReconnectingWebSocket wrapper
    this.ws = new ReconnectingWebSocket(this.serverUrl, [], {
      constructor: WebSocket,
      connectionTimeout: 5000,
    });

    this.ws.onopen = () => {
      console.log("⚓ Connected to Signal K / NMEA 2000 Bridge");

      // Subscribe to all paths needed for PatternMatcher
      const subscription = {
        context: "vessels.self",
        subscribe: [
          // Navigation
          { path: "navigation.position", period: 1000 },
          { path: "navigation.headingTrue", period: 1000 },
          { path: "navigation.speedOverGround", period: 1000 },

          // Wind
          { path: "environment.wind.speedApparent", period: 1000 },
          { path: "environment.wind.angleApparent", period: 1000 },
          { path: "environment.wind.speedTrue", period: 1000 },
          { path: "environment.wind.angleTrueWater", period: 1000 },

          // Atmospheric
          { path: "environment.outside.pressure", period: 5000 },
          { path: "environment.outside.temperature", period: 10000 },
          { path: "environment.outside.humidity", period: 10000 },

          // Waves (if available)
          { path: "environment.water.waves.significantHeight", period: 30000 },
          { path: "environment.water.waves.period", period: 30000 },
        ]
      };
      this.ws?.send(JSON.stringify(subscription));
    };

    this.ws.onmessage = (event) => {
      try {
        const delta = JSON.parse(event.data);

        // Process delta into accumulated telemetry
        this.processDelta(delta);

        // Send raw delta to original callback (for App.tsx vessel tracking)
        onDataReceived(delta);

        // If we have enough data, emit a telemetry snapshot for PatternMatcher
        if (this.hasSufficientTelemetry()) {
          this.emitTelemetrySnapshot();
        }
      } catch (e) {
        console.error("Signal K Parse Error:", e);
      }
    };

    this.ws.onerror = (err) => {
      console.error("Signal K Bridge Error:", err.message);
    };

    this.ws.onclose = () => {
      console.log("⚓ Signal K Bridge Connection Closed");
    };
  }

  /**
   * Updates the server URL (e.g., if discovered via Bonjour/mDNS)
   */
  setServerUrl(url: string) {
    this.serverUrl = url;
    if (this.ws) {
      this.disconnect();
      // Re-connect logic would typically be triggered by UI or manager
    }
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }

  /**
   * Register a callback for complete telemetry snapshots.
   * Used by PatternMatcher for atmospheric pattern detection.
   */
  onTelemetry(callback: (snapshot: TelemetrySnapshot) => void) {
    this.onTelemetrySnapshot = callback;
  }

  /**
   * Process a Signal K delta message into accumulated telemetry.
   */
  private processDelta(delta: any) {
    if (!delta.updates) return;

    this.currentTelemetry.timestamp = Date.now();

    for (const update of delta.updates) {
      for (const val of update.values || []) {
        switch (val.path) {
          // Navigation
          case 'navigation.position':
            this.currentTelemetry.position = {
              lat: val.value.latitude,
              lon: val.value.longitude,
            };
            break;
          case 'navigation.headingTrue':
            this.currentTelemetry.heading = this.radToDeg(val.value);
            break;
          case 'navigation.speedOverGround':
            this.currentTelemetry.sog = this.msToKnots(val.value);
            break;

          // Wind
          case 'environment.wind.speedApparent':
            this.currentTelemetry.apparentWindSpeed = this.msToKnots(val.value);
            break;
          case 'environment.wind.angleApparent':
            this.currentTelemetry.apparentWindAngle = this.radToDeg(val.value);
            break;
          case 'environment.wind.speedTrue':
            this.currentTelemetry.trueWindSpeed = this.msToKnots(val.value);
            break;
          case 'environment.wind.angleTrueWater':
            this.currentTelemetry.trueWindAngle = this.radToDeg(val.value);
            break;

          // Atmospheric
          case 'environment.outside.pressure':
            this.currentTelemetry.barometer = val.value / 100; // Pa to hPa
            break;
          case 'environment.outside.temperature':
            this.currentTelemetry.temperature = val.value - 273.15; // K to C
            break;
          case 'environment.outside.humidity':
            this.currentTelemetry.humidity = val.value * 100; // 0-1 to 0-100
            break;

          // Waves
          case 'environment.water.waves.significantHeight':
            this.currentTelemetry.waveHeight = val.value;
            break;
          case 'environment.water.waves.period':
            this.currentTelemetry.wavePeriod = val.value;
            break;
        }
      }
    }
  }

  /**
   * Check if we have minimum required telemetry for pattern matching.
   */
  private hasSufficientTelemetry(): boolean {
    return !!(
      this.currentTelemetry.position &&
      this.currentTelemetry.barometer // Pressure is critical for weather patterns
    );
  }

  /**
   * Emit a complete telemetry snapshot.
   */
  private emitTelemetrySnapshot() {
    if (!this.onTelemetrySnapshot) return;

    const snapshot: TelemetrySnapshot = {
      position: this.currentTelemetry.position!,
      heading: this.currentTelemetry.heading ?? 0,
      sog: this.currentTelemetry.sog ?? 0,
      barometer: this.currentTelemetry.barometer,
      temperature: this.currentTelemetry.temperature,
      humidity: this.currentTelemetry.humidity,
      apparentWindSpeed: this.currentTelemetry.apparentWindSpeed,
      apparentWindAngle: this.currentTelemetry.apparentWindAngle,
      trueWindSpeed: this.currentTelemetry.trueWindSpeed,
      trueWindAngle: this.currentTelemetry.trueWindAngle,
      waveHeight: this.currentTelemetry.waveHeight,
      wavePeriod: this.currentTelemetry.wavePeriod,
      timestamp: this.currentTelemetry.timestamp!,
    };

    this.onTelemetrySnapshot(snapshot);
  }

  /**
   * Get current accumulated telemetry (for debugging/display).
   */
  getCurrentTelemetry(): Partial<TelemetrySnapshot> {
    return { ...this.currentTelemetry };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Unit conversions
  // ─────────────────────────────────────────────────────────────────────

  private radToDeg(rad: number): number {
    return (rad * 180) / Math.PI;
  }

  private msToKnots(ms: number): number {
    return ms * 1.94384;
  }
}
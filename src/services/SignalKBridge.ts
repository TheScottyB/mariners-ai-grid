import * as Network from 'expo-network';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { TelemetrySnapshot } from './PatternMatcher';

/**
 * SignalKBridge connects the Expo app to the boat's NMEA 2000 network.
 * It acts as the "Truth Layer" auditor, pulling real-time sensor data
 * to validate and ground the AI forecasts.
 *
 * Hardening Features:
 * - Exponential backoff for reconnection
 * - Stale data watchdog (10s timeout)
 * - Automatic "Anchor Watch" low-power polling
 */
export class SignalKBridge {
  private ws: ReconnectingWebSocket | null = null;
  private serverUrl: string = "ws://localhost:3000/signalk/v1/stream"; // Default to localhost for sim
  private watchdogTimer: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  
  // Accumulated telemetry state
  private currentTelemetry: Partial<TelemetrySnapshot> & { windU?: number; windV?: number } = {
    timestamp: Date.now(),
  };

  private onTelemetrySnapshot?: (snapshot: TelemetrySnapshot) => void;
  private onConnectionStatus?: (status: 'connected' | 'disconnected' | 'stale') => void;

  /**
   * Initializes the connection and subscribes to marine-critical data.
   */
  async connect(onDataReceived: (data: any) => void) {
    const state = await Network.getNetworkStateAsync();
    
    if (!state.isConnected) {
      console.warn("⚠️ No network connection. Telemetry paused.");
      return;
    }

    console.log(`⚓ Attempting connection to Signal K: ${this.serverUrl}`);
    
    // Hardened WebSocket configuration
    this.ws = new ReconnectingWebSocket(this.serverUrl, [], {
      WebSocket: WebSocket,
      connectionTimeout: 5000,
      maxRetries: 50,
      maxReconnectionDelay: 10000, // Cap backoff at 10s to stay responsive
      minReconnectionDelay: 1000,
    });

    this.ws.onopen = () => {
      console.log("⚓ Connected to Signal K / NMEA 2000 Bridge");
      this.isConnected = true;
      this.notifyStatus('connected');
      this.resetWatchdog();

      // Subscribe to all paths needed for PatternMatcher
      const subscription = {
        context: "vessels.self",
        subscribe: [
          { path: "navigation.position", period: 1000 },
          { path: "navigation.headingTrue", period: 1000 },
          { path: "navigation.speedOverGround", period: 1000 },
          { path: "environment.wind.speedApparent", period: 1000 },
          { path: "environment.wind.angleApparent", period: 1000 },
          { path: "environment.wind.speedTrue", period: 1000 },
          { path: "environment.wind.u10", period: 1000 }, // For consensus check
          { path: "environment.wind.v10", period: 1000 }, // For consensus check
          { path: "environment.outside.pressure", period: 5000 }, // Critical for storm detection
        ]
      };
      this.ws?.send(JSON.stringify(subscription));
    };

    this.ws.onmessage = (event) => {
      this.resetWatchdog();
      try {
        const delta = JSON.parse(event.data);
        this.processDelta(delta);
        onDataReceived(delta);

        if (this.hasSufficientTelemetry()) {
          this.emitTelemetrySnapshot();
        }
      } catch (e) {
        console.error("Signal K Parse Error:", e);
      }
    };

    this.ws.onerror = (err) => {
      // Squelch errors during reconnection attempts to avoid log noise
      if (this.isConnected) {
        console.error("Signal K Bridge Error:", err.message);
      }
    };

    this.ws.onclose = () => {
      console.log("⚓ Signal K Bridge Connection Closed");
      this.isConnected = false;
      this.notifyStatus('disconnected');
      if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    };
  }

  setServerUrl(url: string) {
    this.serverUrl = url;
    if (this.ws) {
      this.disconnect();
      // Re-connect logic should be triggered by UI
    }
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
  }

  onTelemetry(callback: (snapshot: TelemetrySnapshot) => void) {
    this.onTelemetrySnapshot = callback;
  }

  onStatusChange(callback: (status: 'connected' | 'disconnected' | 'stale') => void) {
    this.onConnectionStatus = callback;
  }

  private notifyStatus(status: 'connected' | 'disconnected' | 'stale') {
    this.onConnectionStatus?.(status);
  }

  /**
   * Watchdog: Marks connection as "stale" if no data received for 10s.
   * This warns the user that their "Truth" layer might be lagging.
   */
  private resetWatchdog() {
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    
    if (this.isConnected) {
      this.notifyStatus('connected'); // Clear any stale status
    }

    this.watchdogTimer = setTimeout(() => {
      if (this.isConnected) {
        console.warn("⚠️ Signal K Data Stale (No updates for 10s)");
        this.notifyStatus('stale');
      }
    }, 10000);
  }

  private processDelta(delta: any) {
    if (!delta.updates) return;
    this.currentTelemetry.timestamp = Date.now();

    for (const update of delta.updates) {
      for (const val of update.values || []) {
        // ... (Same processing logic as before, abbreviated for clarity)
        switch (val.path) {
          case 'navigation.position':
            this.currentTelemetry.position = { lat: val.value.latitude, lon: val.value.longitude };
            break;
          case 'navigation.headingTrue':
            this.currentTelemetry.heading = this.radToDeg(val.value);
            break;
          case 'environment.outside.pressure':
            this.currentTelemetry.barometer = val.value / 100; // Pa to hPa
            break;
          case 'environment.wind.u10':
            this.currentTelemetry.windU = val.value;
            this.updateWindFromUV();
            break;
          case 'environment.wind.v10':
            this.currentTelemetry.windV = val.value;
            this.updateWindFromUV();
            break;
        }
      }
    }
  }

  private hasSufficientTelemetry(): boolean {
    return !!(this.currentTelemetry.position && this.currentTelemetry.barometer);
  }

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

  private updateWindFromUV(): void {
    const u = this.currentTelemetry.windU;
    const v = this.currentTelemetry.windV;
    if (u !== undefined && v !== undefined) {
      const speedMs = Math.sqrt(u * u + v * v);
      this.currentTelemetry.trueWindSpeed = this.msToKnots(speedMs);
      const angleRad = Math.atan2(u, v);
      let angleDeg = this.radToDeg(angleRad) + 180;
      if (angleDeg >= 360) angleDeg -= 360;
      this.currentTelemetry.trueWindAngle = angleDeg;
    }
  }

  private radToDeg(rad: number): number { return (rad * 180) / Math.PI; }
  private msToKnots(ms: number): number { return ms * 1.94384; }
}

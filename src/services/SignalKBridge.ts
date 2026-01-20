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
 * - Emergency "Sensor Overdrive" mode (1Hz -> 10Hz polling)
 */
export class SignalKBridge {
  private ws: ReconnectingWebSocket | null = null;
  private serverUrl: string = "ws://localhost:3000/signalk/v1/stream"; // Default to localhost for sim
  private watchdogTimer: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  private pollingRateHz: number = 1; // Normal: 1Hz, Emergency: 10Hz
  private lastSnapshotTime: number = 0;
  private readonly MIN_SNAPSHOT_INTERVAL_MS = 10000; // 10s min between snapshots

  // Accumulated telemetry state
  private currentTelemetry: Partial<TelemetrySnapshot> & { windU?: number; windV?: number } = {
    timestamp: Date.now(),
  };

  private onTelemetrySnapshot?: (snapshot: TelemetrySnapshot) => void;
  private onConnectionStatus?: (status: 'connected' | 'disconnected' | 'stale') => void;
  private onDataStream?: (data: any) => void;

  /**
   * Initializes the connection and subscribes to marine-critical data.
   */
  async connect(onDataStream?: (data: any) => void) {
    this.onDataStream = onDataStream;
    const state = await Network.getNetworkStateAsync();

    if (!state.isConnected) {
      console.warn("No network connection. Telemetry paused.");
      return;
    }

    console.log(`Attempting connection to Signal K: ${this.serverUrl}`);

    // Hardened WebSocket configuration
    this.ws = new ReconnectingWebSocket(this.serverUrl, [], {
      WebSocket: WebSocket,
      connectionTimeout: 5000,
      maxRetries: 50,
      maxReconnectionDelay: 10000, // Cap backoff at 10s to stay responsive
      minReconnectionDelay: 1000,
    });

    this.ws.onopen = () => {
      console.log("Connected to Signal K / NMEA 2000 Bridge");
      this.isConnected = true;
      this.notifyStatus('connected');
      this.resetWatchdog();
      this.sendSubscription();
    };

    this.ws.onmessage = (event) => {
      this.resetWatchdog();
      try {
        const delta = JSON.parse(event.data);
        this.processDelta(delta);
        this.onDataStream?.(delta);

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

  /**
   * Emergency "Sensor Overdrive" mode - boost polling from 1Hz to 10Hz.
   * This captures rapid pressure drops (dP/dt) characteristic of micro-bursts or squall lines.
   */
  setPollingRate(rateHz: number): void {
    if (rateHz === this.pollingRateHz) return;

    const previousRate = this.pollingRateHz;
    this.pollingRateHz = rateHz;

    console.log(`[SignalKBridge] Polling rate: ${previousRate}Hz -> ${rateHz}Hz`);

    // Re-subscribe with new polling rate
    if (this.isConnected && this.ws) {
      this.sendSubscription();
    }
  }

  /**
   * Get current polling rate.
   */
  getPollingRate(): number {
    return this.pollingRateHz;
  }

  /**
   * Send Signal K subscription with current polling rate.
   */
  private sendSubscription(): void {
    if (!this.ws) return;

    const periodMs = Math.round(1000 / this.pollingRateHz);
    const pressurePeriod = Math.max(periodMs, 500); // Pressure sensor min 500ms

    const subscription = {
      context: "vessels.self",
      subscribe: [
        { path: "navigation.position", period: periodMs },
        { path: "navigation.headingTrue", period: periodMs },
        { path: "navigation.speedOverGround", period: periodMs },
        { path: "environment.wind.speedApparent", period: periodMs },
        { path: "environment.wind.angleApparent", period: periodMs },
        { path: "environment.wind.speedTrue", period: periodMs },
        { path: "environment.wind.u10", period: periodMs },
        { path: "environment.wind.v10", period: periodMs },
        { path: "environment.outside.pressure", period: pressurePeriod },
        { path: "environment.outside.temperature", period: periodMs },
        { path: "environment.outside.humidity", period: periodMs },
      ]
    };

    this.ws.send(JSON.stringify(subscription));
    console.log(`[SignalKBridge] Subscribed at ${this.pollingRateHz}Hz (period: ${periodMs}ms)`);
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

  public processDelta(delta: any) {
    if (!delta.updates) return;
    this.currentTelemetry.timestamp = Date.now();

    for (const update of delta.updates) {
      for (const val of update.values || []) {
        switch (val.path) {
          case 'navigation.position':
            if (val.value && typeof val.value.latitude === 'number' && typeof val.value.longitude === 'number') {
              this.currentTelemetry.position = { lat: val.value.latitude, lon: val.value.longitude };
            }
            break;
          case 'navigation.headingTrue':
            this.currentTelemetry.heading = this.radToDeg(val.value);
            break;
          case 'navigation.speedOverGround':
            this.currentTelemetry.sog = this.msToKnots(val.value);
            break;
          case 'environment.outside.pressure':
            this.currentTelemetry.barometer = val.value / 100; // Pa to hPa
            break;
          case 'environment.outside.temperature':
            this.currentTelemetry.temperature = val.value - 273.15; // K to C
            break;
          case 'environment.outside.humidity':
            this.currentTelemetry.humidity = val.value * 100; // 0-1 to 0-100%
            break;
          case 'environment.wind.speedApparent':
            this.currentTelemetry.apparentWindSpeed = this.msToKnots(val.value);
            break;
          case 'environment.wind.angleApparent':
            this.currentTelemetry.apparentWindAngle = this.radToDeg(val.value);
            break;
          case 'environment.wind.speedTrue':
            this.currentTelemetry.trueWindSpeed = this.msToKnots(val.value);
            break;
          case 'environment.wind.angleTrueGround':
            this.currentTelemetry.trueWindAngle = this.radToDeg(val.value);
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

  public hasSufficientTelemetry(): boolean {
    return !!(this.currentTelemetry.position && this.currentTelemetry.barometer);
  }

  public emitTelemetrySnapshot() {
    if (!this.onTelemetrySnapshot) return;
    
    const now = Date.now();
    if (now - this.lastSnapshotTime < this.MIN_SNAPSHOT_INTERVAL_MS) return;
    
    this.lastSnapshotTime = now;
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

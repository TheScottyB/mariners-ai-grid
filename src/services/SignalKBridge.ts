import * as Network from 'expo-network';
import ReconnectingWebSocket from 'reconnecting-websocket';

/**
 * SignalKBridge connects the Expo app to the boat's NMEA 2000 network.
 * It acts as the "Truth Layer" auditor, pulling real-time sensor data
 * to validate and ground the AI forecasts.
 * 
 * Focuses on:
 * - PGN 130306 (Wind)
 * - PGN 130311 (Pressure)
 * - PGN 129025 (Position)
 */
export class SignalKBridge {
  private ws: ReconnectingWebSocket | null = null;
  private serverUrl: string = "ws://signalk.local:3000/signalk/v1/stream";

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
      
      // Subscribe to Specific PGNs via Signal K Paths
      const subscription = {
        context: "vessels.self",
        subscribe: [
          { path: "environment.wind.speedApparent", period: 1000 },
          { path: "environment.outside.pressure", period: 5000 },
          { path: "navigation.position", period: 1000 }
        ]
      };
      this.ws?.send(JSON.stringify(subscription));
    };

    this.ws.onmessage = (event) => {
      try {
        const delta = JSON.parse(event.data);
        onDataReceived(delta);
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
}
/**
 * Mariner's AI Grid - Telemetry Service
 * 
 * Central orchestrator for all vessel and environmental data.
 * Implements "Explorer Mode" (Standalone) vs "Truth Layer" (NMEA 2000).
 * 
 * Logic:
 * 1. Source Selection: 'signalk' | 'device' | 'mock'
 * 2. Fallback: If Signal K is lost, automatically switch to Device GPS (Explorer Mode).
 * 3. Simulation: Supports 'Mock NMEA' streams for land-based testing.
 * 
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Location from 'expo-location';
import { SignalKBridge } from './SignalKBridge';
import { MockNMEAStreamer, MockScenario } from './MockNMEAStreamer';
import { TelemetrySnapshot } from './PatternMatcher';
import { DB } from '@op-engineering/op-sqlite';

export type TelemetrySource = 'signalk' | 'device' | 'mock';

export interface TelemetryServiceConfig {
  defaultSource: TelemetrySource;
  autoFallback: boolean;
}

export class TelemetryService {
  private static instance: TelemetryService;
  private skBridge: SignalKBridge;
  private streamer: MockNMEAStreamer;
  private source: TelemetrySource = 'device';
  private config: TelemetryServiceConfig;
  
  // Active listeners
  private onTelemetryCallback?: (snapshot: TelemetrySnapshot) => void;
  private onSourceChangeCallback?: (source: TelemetrySource) => void;

  private lastSnapshot: TelemetrySnapshot | null = null;
  
  // Temporary state for partial updates from mock streams
  private vesselState: Partial<TelemetrySnapshot> = {};

  private constructor(skBridge: SignalKBridge) {
    this.skBridge = skBridge;
    this.streamer = new MockNMEAStreamer();
    this.config = {
      defaultSource: 'device',
      autoFallback: true
    };
  }

  static getInstance(skBridge?: SignalKBridge): TelemetryService {
    if (!TelemetryService.instance) {
      if (!skBridge) throw new Error("SignalKBridge required for first initialization");
      TelemetryService.instance = new TelemetryService(skBridge);
    }
    return TelemetryService.instance;
  }

  async initialize() {
    console.log(`[Telemetry] Initializing with source: ${this.source}`);
    
    // 1. Setup Signal K listeners
    this.skBridge.onTelemetry((snapshot) => {
      if (this.source === 'signalk') {
        this.emit(snapshot);
      }
    });

    this.skBridge.onStatusChange((status) => {
      if (status === 'disconnected' && this.source === 'signalk' && this.config.autoFallback) {
        console.warn("[Telemetry] Signal K lost. Falling back to Device GPS (Explorer Mode)");
        this.setSource('device');
      }
    });

    // 2. Setup Device GPS Polling (if needed for standalone)
    this.startDeviceLocationPolling();
  }

  setSource(source: TelemetrySource) {
    if (this.source === source) return;
    
    console.log(`[Telemetry] Switching source: ${this.source} -> ${source}`);
    
    // Stop current mock if active
    if (this.source === 'mock') {
      this.streamer.stop();
    }

    this.source = source;
    this.onSourceChangeCallback?.(source);
  }

  getSource(): TelemetrySource {
    return this.source;
  }

  /**
   * Start a mock scenario (Winter Storm, etc.)
   */
  async startMock(scenario: MockScenario) {
    this.setSource('mock');
    console.log(`[Telemetry] Starting Mock Scenario: ${scenario.name}`);
    
    // Create a temporary handler to capture the snapshot emission from bridge logic
    const originalOnTelemetry = (this.skBridge as any).onTelemetrySnapshot;
    
    (this.skBridge as any).onTelemetrySnapshot = (snapshot: TelemetrySnapshot) => {
      if (this.source === 'mock') {
        this.emit(snapshot);
      }
    };

    this.streamer.start(scenario, (delta) => {
      if (this.source === 'mock') {
        this.skBridge.processDelta(delta);
        if (this.skBridge.hasSufficientTelemetry()) {
          this.skBridge.emitTelemetrySnapshot();
        }
      }
    });
  }

  private emit(snapshot: TelemetrySnapshot) {
    this.lastSnapshot = snapshot;
    this.onTelemetryCallback?.(snapshot);
  }

  onTelemetry(callback: (snapshot: TelemetrySnapshot) => void) {
    this.onTelemetryCallback = callback;
  }

  private async startDeviceLocationPolling() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      await Location.watchPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000,
        distanceInterval: 10,
      }, (location) => {
        if (this.source === 'device') {
          const snapshot: TelemetrySnapshot = {
            position: { lat: location.coords.latitude, lon: location.coords.longitude },
            heading: location.coords.heading || 0,
            sog: location.coords.speed ? (location.coords.speed * 1.94384) : 0,
            timestamp: location.timestamp,
            // Device hardware typically lacks barometer/wind
          };
          this.emit(snapshot);
        }
      });
    } catch (e) {
      console.warn("[Telemetry] Device location polling failed:", e);
    }
  }
}


/**
 * Mariner's AI Grid - Remote Config Service
 * 
 * Manages feature flags for staged rollouts.
 * In a real deployment, this would fetch from a backend or EAS Update extras.
 */

// Conditional import to avoid module not found errors in dev
let Updates: any = null;
try {
  Updates = require('expo-updates');
} catch (e) {
  console.warn('[RemoteConfig] expo-updates not available - using defaults only');
}

export interface FeatureFlags {
  nightWatch: boolean;
  socialReporting: boolean;
  experimentalSlicer: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  nightWatch: false,     // Disabled by default for MVP
  socialReporting: true, // Enabled for "Waze" layer launch
  experimentalSlicer: false,
};

export class RemoteConfig {
  private static instance: RemoteConfig;
  private flags: FeatureFlags = { ...DEFAULT_FLAGS };

  private constructor() {}

  static getInstance(): RemoteConfig {
    if (!RemoteConfig.instance) {
      RemoteConfig.instance = new RemoteConfig();
    }
    return RemoteConfig.instance;
  }

  /**
   * Initialize and fetch remote configuration.
   * Logic:
   * 1. Check EAS Update "extra" field (for OTA updates)
   * 2. Fallback to defaults
   */
  async initialize(): Promise<void> {
    try {
      console.log('[RemoteConfig] Initializing...');
      
      // Check if we are running from an EAS Update
      // In SDK 54, manifest is accessed differently, but for simplicity we stick to defaults for MVP
      // or check channel.
      
      // Simulate remote fetch
      if (Updates && Updates.channel && (Updates.channel === 'preview' || Updates.channel === 'production')) {
          // Could pull from a static JSON endpoint here
      }
      
      // For now, we stick to hardcoded defaults which are safe for offline-first
      console.log('[RemoteConfig] Flags loaded:', this.flags);
      
    } catch (error) {
      console.warn('[RemoteConfig] Failed to load config, using defaults:', error);
    }
  }

  getFeatureFlag(key: keyof FeatureFlags): boolean {
    return this.flags[key];
  }
  
  getAllFlags(): FeatureFlags {
    return { ...this.flags };
  }
}

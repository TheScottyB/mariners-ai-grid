import Constants from 'expo-constants';

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
   * 2. Check Constants.expoConfig "extra" (for base build)
   * 3. Fallback to defaults
   */
  async initialize(): Promise<void> {
    try {
      console.log('[RemoteConfig] Initializing...');
      
      // 1. Start with hardcoded defaults
      let mergedFlags = { ...DEFAULT_FLAGS };

      // 2. Override with base build config if present
      const configFlags = Constants.expoConfig?.extra?.featureFlags;
      if (configFlags) {
        mergedFlags = { ...mergedFlags, ...configFlags };
        console.log('[RemoteConfig] Base flags loaded from app.config.js');
      }

      // 3. Override with dynamic EAS Update extras if present
      if (Updates && Updates.extra && Updates.extra.featureFlags) {
        mergedFlags = { ...mergedFlags, ...Updates.extra.featureFlags };
        console.log('[RemoteConfig] Overrides loaded from EAS Update');
      }
      
      this.flags = mergedFlags;
      console.log('[RemoteConfig] Active Flags:', this.flags);
      
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

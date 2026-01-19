/**
 * Mariner's AI Grid - Identity Service
 * Implements "Shadow Auth" (Device-Level Identity).
 * 
 * Strategy:
 * 1. Check Expo SecureStore for existing 'mariner_device_id'.
 * 2. If missing, generate a new UUIDv4 via expo-crypto.
 * 3. Store persistently.
 * 4. This ID tags all Signal K observations and hazard reports.
 */

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const IDENTITY_KEY = 'mariner_device_id';
const TRUST_SCORE_KEY = 'mariner_trust_score';

export interface MarinerIdentity {
  deviceId: string;
  trustScore: number; // 0.0 to 1.0 (Local-first calculation)
  isNewUser: boolean;
}

export class IdentityService {
  private static instance: IdentityService;
  private currentIdentity: MarinerIdentity | null = null;

  private constructor() {}

  static getInstance(): IdentityService {
    if (!IdentityService.instance) {
      IdentityService.instance = new IdentityService();
    }
    return IdentityService.instance;
  }

  /**
   * Initialize identity on app launch.
   * "Shadow Auth" - No login screen, just instant identity.
   */
  async getOrInitializeIdentity(): Promise<MarinerIdentity> {
    if (this.currentIdentity) {
      return this.currentIdentity;
    }

    try {
      // 1. Try to fetch existing ID
      let deviceId = await SecureStore.getItemAsync(IDENTITY_KEY);
      let trustScoreStr = await SecureStore.getItemAsync(TRUST_SCORE_KEY);
      let isNewUser = false;

      // 2. If missing, generate new (Shadow Registration)
      if (!deviceId) {
        deviceId = Crypto.randomUUID();
        await SecureStore.setItemAsync(IDENTITY_KEY, deviceId);
        await SecureStore.setItemAsync(TRUST_SCORE_KEY, '0.1'); // Start with low trust
        isNewUser = true;
        console.log(`[Identity] New Shadow ID generated: ${deviceId}`);
      } else {
        console.log(`[Identity] Existing Shadow ID loaded: ${deviceId}`);
      }

      this.currentIdentity = {
        deviceId,
        trustScore: parseFloat(trustScoreStr || '0.1'),
        isNewUser
      };

      return this.currentIdentity;

    } catch (error) {
      console.error('[Identity] Failed to initialize shadow auth:', error);
      // Fallback for extreme edge cases (e.g., SecureStore corruption)
      return {
        deviceId: 'anonymous_fallback',
        trustScore: 0.0,
        isNewUser: false
      };
    }
  }

  /**
   * Returns the ID for tagging "Waze" reports (debris, hazards).
   */
  getDeviceId(): string {
    return this.currentIdentity?.deviceId || 'uninitialized';
  }
}

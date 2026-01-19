import { requireNativeModule } from 'expo-modules-core';

// Get the native module
const ExpoSqliteVecLoader = requireNativeModule('ExpoSqliteVecLoader');

/**
 * Loads the sqlite-vec extension into the SQLite environment.
 * This registers the extension globally (auto-extension) so it applies
 * to all future connections.
 * 
 * @param databaseName - Optional name of the database (mostly for logging)
 * @returns Promise<boolean> - true if successful
 */
export async function loadVecExtension(databaseName: string = 'default'): Promise<boolean> {
  try {
    return await ExpoSqliteVecLoader.loadVecExtension(databaseName);
  } catch (e) {
    console.error('[ExpoSqliteVecLoader] Failed to load extension:', e);
    return false;
  }
}
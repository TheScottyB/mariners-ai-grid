import { requireNativeModule } from 'expo-modules-core';

/**
 * Native module for loading sqlite-vec extension into ExpoSQLite databases.
 */
const ExpoSqliteVecLoaderModule = requireNativeModule('ExpoSqliteVecLoader');

/**
 * Load the sqlite-vec extension into the specified database.
 * 
 * This must be called after opening a database with expo-sqlite to enable
 * vector search capabilities.
 * 
 * @param databaseName - The name of the database (e.g., 'mariners_grid.db')
 * @returns Promise that resolves to true if successful, false otherwise
 * 
 * @example
 * ```typescript
 * import * as SQLite from 'expo-sqlite';
 * import { loadVecExtension } from './modules/expo-sqlite-vec-loader';
 * 
 * const db = await SQLite.openDatabaseAsync('mydb.db');
 * const loaded = await loadVecExtension('mydb.db');
 * if (loaded) {
 *   console.log('Vector search enabled!');
 * }
 * ```
 */
export async function loadVecExtension(databaseName: string): Promise<boolean> {
  try {
    return await ExpoSqliteVecLoaderModule.loadVecExtension(databaseName);
  } catch (error) {
    console.error('[loadVecExtension] Failed to load sqlite-vec:', error);
    return false;
  }
}

export default {
  loadVecExtension,
};

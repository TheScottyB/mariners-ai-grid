import ExpoModulesCore
import SQLite3

/**
 * Mariner's AI Grid - sqlite-vec Loader Module
 * 
 * Purpose: Explicitly load sqlite-vec extension into ExpoSQLite databases.
 * 
 * This module registers sqlite-vec as an auto-extension so it's automatically
 * loaded for all database connections. Since sqlite-vec is statically linked,
 * we call the init function directly rather than using sqlite3_load_extension.
 */

// External reference to sqlite3_vec_init from statically linked libsqlite_vec.a
@_silgen_name("sqlite3_vec_init")
func sqlite3_vec_init(
  _ db: OpaquePointer?,
  _ pzErrMsg: UnsafeMutablePointer<UnsafeMutablePointer<Int8>?>?,
  _ pApi: UnsafePointer<sqlite3_api_routines>?
) -> Int32

public class ExpoSqliteVecLoaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoSqliteVecLoader")

    // Called when the module is created
    OnCreate {
      NSLog("[ExpoSqliteVecLoader] Module initialized")
    }

    // Function to load sqlite-vec extension into the default database
    AsyncFunction("loadVecExtension") { (databaseName: String) -> Bool in
      return await self.loadSqliteVecExtension(databaseName: databaseName)
    }
  }

  /**
   * Load the sqlite-vec extension as an auto-extension.
   * 
   * This registers sqlite-vec to be automatically loaded for ALL
   * future database connections, including Expo SQLite's connections.
   * 
   * Returns true if successful, false otherwise.
   */
  private func loadSqliteVecExtension(databaseName: String) async -> Bool {
    NSLog("[ExpoSqliteVecLoader] Registering sqlite-vec as auto-extension")
    
    // Define the auto-extension entry point
    // This closure will be called for every new database connection
    let autoExtension: @convention(c) (OpaquePointer?, UnsafeMutablePointer<UnsafeMutablePointer<Int8>?>?, UnsafePointer<sqlite3_api_routines>?) -> Int32 = { db, pzErrMsg, pApi in
      // Call the statically linked sqlite3_vec_init
      return sqlite3_vec_init(db, pzErrMsg, pApi)
    }
    
    // Register the auto-extension
    let result = sqlite3_auto_extension(unsafeBitCast(autoExtension, to: (@convention(c) () -> Void).self))
    
    if result != SQLITE_OK {
      NSLog("[ExpoSqliteVecLoader] ERROR: Failed to register auto-extension")
      return false
    }
    
    NSLog("[ExpoSqliteVecLoader] ✅ Auto-extension registered successfully")
    
    // Test by opening a temporary connection
    var db: OpaquePointer?
    if sqlite3_open(":memory:", &db) == SQLITE_OK {
      defer { sqlite3_close(db) }
      
      // The auto-extension should have loaded automatically
      var stmt: OpaquePointer?
      if sqlite3_prepare_v2(db, "SELECT vec_version()", -1, &stmt, nil) == SQLITE_OK {
        if sqlite3_step(stmt) == SQLITE_ROW {
          let version = String(cString: sqlite3_column_text(stmt, 0))
          NSLog("[ExpoSqliteVecLoader] ✅ Verified vec_version: \(version)")
        }
        sqlite3_finalize(stmt)
      } else {
        NSLog("[ExpoSqliteVecLoader] WARNING: vec_version() not available - extension may not have loaded")
      }
    }
    
    return true
  }
}

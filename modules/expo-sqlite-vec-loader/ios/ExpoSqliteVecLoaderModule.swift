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
   * Load the sqlite-vec extension into the specified database.
   * 
   * Since sqlite-vec is statically linked, we call the init function directly
   * on the opened database connection.
   * 
   * Returns true if successful, false otherwise.
   */
  private func loadSqliteVecExtension(databaseName: String) async -> Bool {
    NSLog("[ExpoSqliteVecLoader] Attempting to load sqlite-vec for database: \(databaseName)")
    
    // Get the database file path
    guard let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
      NSLog("[ExpoSqliteVecLoader] ERROR: Could not find documents directory")
      return false
    }
    
    let dbPath = documentsPath.appendingPathComponent("SQLite/\(databaseName)").path
    NSLog("[ExpoSqliteVecLoader] Database path: \(dbPath)")
    
    // Open database connection
    var db: OpaquePointer?
    if sqlite3_open(dbPath, &db) != SQLITE_OK {
      NSLog("[ExpoSqliteVecLoader] ERROR: Could not open database at \(dbPath)")
      return false
    }
    
    defer {
      sqlite3_close(db)
    }
    
    // Call the statically linked sqlite3_vec_init function directly
    var errorMsg: UnsafeMutablePointer<Int8>? = nil
    let result = sqlite3_vec_init(db, &errorMsg, nil)
    
    if result != SQLITE_OK {
      let error = errorMsg != nil ? String(cString: errorMsg!) : "Unknown error"
      NSLog("[ExpoSqliteVecLoader] ERROR: Failed to initialize extension: \(error)")
      if errorMsg != nil {
        sqlite3_free(errorMsg)
      }
      return false
    }
    
    NSLog("[ExpoSqliteVecLoader] ✅ Successfully loaded sqlite-vec extension")
    
    // Test the extension
    var stmt: OpaquePointer?
    if sqlite3_prepare_v2(db, "SELECT vec_version()", -1, &stmt, nil) == SQLITE_OK {
      if sqlite3_step(stmt) == SQLITE_ROW {
        let version = String(cString: sqlite3_column_text(stmt, 0))
        NSLog("[ExpoSqliteVecLoader] vec_version: \(version)")
      }
      sqlite3_finalize(stmt)
    }
    
    return true
  }
}

import ExpoModulesCore

public class ExpoSqliteVecLoaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoSqliteVecLoader")

    // Function to load sqlite-vec extension into the default database
    AsyncFunction("loadVecExtension") { (databaseName: String) -> Bool in
      // Call the C helper function
      let rc = install_sqlite_vec_extension()
      
      if rc == 0 {
        print("[ExpoSqliteVecLoader] ✅ Auto-extension registered (Swift->C).")
        return true
      } else {
        print("[ExpoSqliteVecLoader] ❌ Failed to register: \(rc)")
        return false
      }
    }
  }
}

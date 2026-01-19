#include <stdio.h>

/*
 * Mariner's AI Grid - sqlite-vec Auto-Init
 * 
 * Purpose: Register the sqlite-vec extension with Expo's vendored SQLite instance.
 * Strategy: Manually declare the 'exsqlite3_auto_extension' symbol to bypass 
 * header complexity and macro remapping issues.
 */

// Define the function pointer type used by SQLite
typedef void (*sqlite3_loadext_entry)(void);

// 1. The init function from libsqlite_vec.a (standard name)
extern int sqlite3_vec_init(void *db, char **pzErrMsg, const void *pApi);

// 2. The registration function from ExpoSQLite (vendored name)
// Expo vendors SQLite with 'ex' prefix to avoid conflicts with iOS system SQLite.
extern int exsqlite3_auto_extension(sqlite3_loadext_entry xEntryPoint);

__attribute__((constructor)) void register_sqlite_vec(void) {
  fprintf(stderr, "[sqlite-vec] Initializing...\n");
  
  // Call the vendored auto-extension registration
  int rc = exsqlite3_auto_extension((sqlite3_loadext_entry)sqlite3_vec_init);
  
  if (rc == 0) { // 0 is SQLITE_OK
    fprintf(stderr, "[sqlite-vec] SUCCESS: Registered with ExpoSQLite (exsqlite3)\n");
  } else {
    fprintf(stderr, "[sqlite-vec] FAILURE: Could not register extension (Error: %d)\n", rc);
  }
}
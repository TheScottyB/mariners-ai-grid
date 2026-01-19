#include <sqlite3.h>

/*
 * Forward declaration of the sqlite-vec init function.
 * This symbol is exported by libsqlite_vec.a
 */
int sqlite3_vec_init(sqlite3 *db, char **pzErrMsg, const sqlite3_api_routines *pApi);

/*
 * Auto-register the extension with SQLite.
 * This constructor runs when the library is loaded (app startup).
 */
__attribute__((constructor)) void register_sqlite_vec(void) {
  sqlite3_auto_extension((void (*)())sqlite3_vec_init);
}

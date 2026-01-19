#import "ExpoSqliteVecLoaderHelper.h"
#import <stdio.h>

// Declare Expo's symbols
extern int exsqlite3_auto_extension(void (*xEntryPoint)(void));
// Declare our static lib symbol
extern int sqlite3_vec_init(void *db, char **pzErrMsg, const void *pApi);

int install_sqlite_vec_extension(void) {
    // Call Expo's auto_extension with our init function
    return exsqlite3_auto_extension((void (*)(void))sqlite3_vec_init);
}

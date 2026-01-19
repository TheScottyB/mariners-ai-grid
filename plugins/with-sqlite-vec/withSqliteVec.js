/**
 * Expo Config Plugin: with-sqlite-vec
 *
 * Bundles the sqlite-vec extension into the native build for offline
 * vector similarity search. Used for Atmospheric Pattern Matching in
 * the Mariner's AI Grid.
 *
 * sqlite-vec: https://github.com/asg017/sqlite-vec
 *
 * This plugin:
 * 1. iOS: Adds sqlite-vec.a static library and configures Xcode build settings
 * 2. Android: Adds sqlite-vec.so and configures CMake/NDK linking
 */

const {
  withXcodeProject,
  withDangerousMod,
  withGradleProperties,
  withAppBuildGradle,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PLUGIN_NAME = 'withSqliteVec';

/**
 * Main plugin entry point
 */
function withSqliteVec(config, props = {}) {
  const {
    // Version of sqlite-vec to use
    version = '0.1.6',
    // Enable debug logging
    debug = false,
  } = props;

  if (debug) {
    console.log(`[${PLUGIN_NAME}] Configuring sqlite-vec v${version}`);
  }

  // Apply iOS modifications
  config = withSqliteVecIOS(config, { version, debug });

  // Apply Android modifications
  config = withSqliteVecAndroid(config, { version, debug });

  return config;
}

/**
 * iOS Configuration
 * - Adds sqlite-vec static library
 * - Configures build settings for SQLite extension loading
 */
function withSqliteVecIOS(config, { version, debug }) {
  // Step 1: Copy the static library to iOS project
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const iosPath = path.join(projectRoot, 'ios');
      const libDir = path.join(iosPath, 'Libraries', 'sqlite-vec');

      // Create Libraries directory if it doesn't exist
      if (!fs.existsSync(libDir)) {
        fs.mkdirSync(libDir, { recursive: true });
      }

      // Copy the pre-built static library
      // The library should be placed in plugins/with-sqlite-vec/vendor/ios/
      const vendorLibPath = path.join(
        projectRoot,
        'plugins',
        'with-sqlite-vec',
        'vendor',
        'ios',
        'libsqlite_vec.a'
      );

      const headerPath = path.join(
        projectRoot,
        'plugins',
        'with-sqlite-vec',
        'vendor',
        'ios',
        'sqlite-vec.h'
      );

      if (fs.existsSync(vendorLibPath)) {
        fs.copyFileSync(vendorLibPath, path.join(libDir, 'libsqlite_vec.a'));
        if (debug) console.log(`[${PLUGIN_NAME}] Copied libsqlite_vec.a to iOS`);
      } else {
        console.warn(
          `[${PLUGIN_NAME}] WARNING: libsqlite_vec.a not found at ${vendorLibPath}`
        );
        console.warn(
          `[${PLUGIN_NAME}] Download from: https://github.com/asg017/sqlite-vec/releases`
        );
      }

      if (fs.existsSync(headerPath)) {
        fs.copyFileSync(headerPath, path.join(libDir, 'sqlite-vec.h'));
        if (debug) console.log(`[${PLUGIN_NAME}] Copied sqlite-vec.h to iOS`);
      }

      return config;
    },
  ]);

  // Step 2: Modify Xcode project to link the library
  config = withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const targetName = config.modRequest.projectName;

    // Add library search path
    const buildSettings = xcodeProject.getBuildProperty(
      'LIBRARY_SEARCH_PATHS',
      'Debug'
    );

    // Add the Libraries/sqlite-vec directory to search paths
    xcodeProject.addBuildProperty(
      'LIBRARY_SEARCH_PATHS',
      '"$(SRCROOT)/Libraries/sqlite-vec"'
    );

    // Link against libsqlite_vec.a
    // Find the main target and add the library
    const targetUuid = xcodeProject.getFirstTarget().uuid;

    // Add -lsqlite_vec to OTHER_LDFLAGS
    xcodeProject.addBuildProperty('OTHER_LDFLAGS', '-lsqlite_vec');

    // Enable extension loading in SQLite
    // This is critical for sqlite3_load_extension() to work
    xcodeProject.addBuildProperty(
      'OTHER_CFLAGS',
      '-DSQLITE_ENABLE_LOAD_EXTENSION=1'
    );

    if (debug) {
      console.log(`[${PLUGIN_NAME}] Configured Xcode project for sqlite-vec`);
    }

    return config;
  });

  return config;
}

/**
 * Android Configuration
 * - Adds sqlite-vec shared library (.so files for each ABI)
 * - Configures CMake to link the extension
 */
function withSqliteVecAndroid(config, { version, debug }) {
  // Step 1: Copy native libraries to jniLibs
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidPath = path.join(projectRoot, 'android');
      const jniLibsDir = path.join(androidPath, 'app', 'src', 'main', 'jniLibs');

      const abis = ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'];

      for (const abi of abis) {
        const abiDir = path.join(jniLibsDir, abi);
        if (!fs.existsSync(abiDir)) {
          fs.mkdirSync(abiDir, { recursive: true });
        }

        const vendorSoPath = path.join(
          projectRoot,
          'plugins',
          'with-sqlite-vec',
          'vendor',
          'android',
          abi,
          'libsqlite_vec.so'
        );

        if (fs.existsSync(vendorSoPath)) {
          fs.copyFileSync(vendorSoPath, path.join(abiDir, 'libsqlite_vec.so'));
          if (debug) {
            console.log(`[${PLUGIN_NAME}] Copied libsqlite_vec.so for ${abi}`);
          }
        } else {
          if (debug) {
            console.warn(
              `[${PLUGIN_NAME}] WARNING: libsqlite_vec.so not found for ${abi}`
            );
          }
        }
      }

      return config;
    },
  ]);

  // Step 2: Modify build.gradle to enable extension loading
  config = withAppBuildGradle(config, (config) => {
    const buildGradle = config.modResults.contents;

    // Check if we already added our configuration
    if (buildGradle.includes('sqlite-vec-config')) {
      return config;
    }

    // Add NDK configuration for SQLite extension loading
    const ndkConfig = `
    // sqlite-vec-config: Enable SQLite extension loading
    packagingOptions {
        pickFirst 'lib/*/libsqlite_vec.so'
    }
`;

    // Insert before the last closing brace of android { }
    const androidBlockEnd = buildGradle.lastIndexOf('}');
    if (androidBlockEnd !== -1) {
      // Find the android { block
      const androidBlockMatch = buildGradle.match(/android\s*\{/);
      if (androidBlockMatch) {
        // Insert the config at the end of the android block
        const insertIndex = buildGradle.indexOf('}', androidBlockMatch.index);
        config.modResults.contents =
          buildGradle.slice(0, insertIndex) +
          ndkConfig +
          buildGradle.slice(insertIndex);
      }
    }

    if (debug) {
      console.log(`[${PLUGIN_NAME}] Modified build.gradle for sqlite-vec`);
    }

    return config;
  });

  return config;
}

module.exports = withSqliteVec;

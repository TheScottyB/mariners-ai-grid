const { withDangerousMod, withAppBuildGradle } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { downloadFile } = require('./downloadUtils');

const SQLITE_VEC_VERSION = '0.1.6';

const withSqliteVec = (config, props = {}) => {
  const version = props.version || SQLITE_VEC_VERSION;
  const debug = props.debug || false;

  // =========================================================================
  // Android Configuration
  // =========================================================================
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      console.log(`[withSqliteVec] Configuring sqlite-vec v${version} for Android`);

      const projectRoot = config.modRequest.projectRoot;
      const jniLibsDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'jniLibs');

      // Architectures to support
      const archs = {
        'arm64-v8a': 'aarch64',
        'armeabi-v7a': 'armv7',
        'x86': 'x86',
        'x86_64': 'x86_64'
      };

      for (const [androidArch, vecArch] of Object.entries(archs)) {
        const targetDir = path.join(jniLibsDir, androidArch);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        const libPath = path.join(targetDir, 'libsqlite_vec.so');
        if (!fs.existsSync(libPath)) {
          const url = `https://github.com/asg017/sqlite-vec/releases/download/v${version}/sqlite-vec-${version}-loadable-android-${vecArch}.tar.gz`;
          const tarballPath = path.join(targetDir, `sqlite-vec-android-${vecArch}.tar.gz`);
          
          console.log(`[withSqliteVec] Downloading ${url}`);
          try {
            await downloadFile(url, tarballPath);
            console.log(`[withSqliteVec] Downloaded tarball to ${tarballPath}`);
            
            // Extract tarball
            try {
                execSync(`tar -xzf "${tarballPath}" -C "${targetDir}"`);
                
                // Locate libsqlite_vec.so
                // It might be directly in targetDir or in a subdir
                const findLib = (dir) => {
                    const files = fs.readdirSync(dir);
                    for (const file of files) {
                        const fullPath = path.join(dir, file);
                        if (fs.statSync(fullPath).isDirectory()) {
                            const found = findLib(fullPath);
                            if (found) return found;
                        } else if (file === 'libsqlite_vec.so') {
                            return fullPath;
                        }
                    }
                    return null;
                };
                
                // Start search from targetDir
                const foundLibPath = findLib(targetDir);
                
                if (foundLibPath && foundLibPath !== libPath) {
                    fs.renameSync(foundLibPath, libPath);
                    console.log(`[withSqliteVec] Moved ${foundLibPath} to ${libPath}`);
                } else if (!foundLibPath) {
                     // If strictly following the release structure, it might be named differently?
                     // But usually it's libsqlite_vec.so.
                     // Check for any .so file if specific name not found? No, dangerous.
                     throw new Error(`libsqlite_vec.so not found in extracted archive for ${androidArch}`);
                }
                
                // Cleanup: Remove tarball and any remaining subdirectories/files (except the lib itself)
                // Actually, just removing the tarball is safe. Cleaning up extracted debris is harder without knowing structure.
                // We'll trust the user/system to ignore extra files or we can try to clean known dirs.
                fs.unlinkSync(tarballPath);
                
            } catch (extractError) {
                console.error(`[withSqliteVec] Error extracting android tarball: ${extractError.message}`);
                throw extractError;
            }

          } catch (e) {
            console.warn(`[withSqliteVec] WARNING: libsqlite_vec.so not found for ${androidArch}: ${e.message}`);
          }
        }
      }
      return config;
    },
  ]);

  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      let buildGradle = config.modResults.contents;
      if (!buildGradle.includes("jniLibs.useLegacyPackaging")) {
        const packagingOptions = `
    packagingOptions {
        jniLibs.useLegacyPackaging = true
        pickFirst 'lib/x86/libc++_shared.so'
        pickFirst 'lib/x86_64/libc++_shared.so'
        pickFirst 'lib/armeabi-v7a/libc++_shared.so'
        pickFirst 'lib/arm64-v8a/libc++_shared.so'
    }
        `;
        if (buildGradle.includes('android {')) {
          buildGradle = buildGradle.replace('android {', 'android {' + packagingOptions);
        } else {
          console.warn('[withSqliteVec] Could not find android block in build.gradle');
        }
        config.modResults.contents = buildGradle;
        console.log('[withSqliteVec] Modified build.gradle for sqlite-vec');
      }
    } else {
      console.warn('[withSqliteVec] Kotlin build.gradle not supported yet');
    }
    return config;
  });

  // =========================================================================
  // iOS Configuration - Download static libraries and modify Podfile
  // =========================================================================
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      console.log(`[withSqliteVec] Configuring sqlite-vec v${version} for iOS`);

      const projectRoot = config.modRequest.projectRoot;
      const iosDir = path.join(projectRoot, 'ios');
      const podfilePath = path.join(iosDir, 'Podfile');

      // Ensure vendor directory exists
      const vendorDir = path.join(projectRoot, 'plugins', 'with-sqlite-vec', 'vendor', 'ios');
      if (!fs.existsSync(vendorDir)) {
        fs.mkdirSync(vendorDir, { recursive: true });
      }

      // Check for the static library, download if missing
      const libPath = path.join(vendorDir, 'libsqlite_vec.a');

      if (!fs.existsSync(libPath)) {
        // Download static libraries for each architecture and create fat binary
        const archs = [
          { name: 'ios-aarch64', type: 'static-ios-aarch64' },
          { name: 'sim-arm64', type: 'static-iossimulator-aarch64' },
          { name: 'sim-x86_64', type: 'static-iossimulator-x86_64' }
        ];

        const libPaths = [];

        for (const arch of archs) {
          const archDir = path.join(vendorDir, arch.name);
          if (!fs.existsSync(archDir)) {
            fs.mkdirSync(archDir, { recursive: true });
          }

          const archLibPath = path.join(archDir, 'libsqlite_vec.a');
          const tarballUrl = `https://github.com/asg017/sqlite-vec/releases/download/v${version}/sqlite-vec-${version}-${arch.type}.tar.gz`;
          const tarballPath = path.join(archDir, 'sqlite-vec.tar.gz');

          console.log(`[withSqliteVec] Downloading ${arch.name} static library...`);
          try {
            await downloadFile(tarballUrl, tarballPath);
            execSync(`tar -xzf "${tarballPath}" -C "${archDir}"`);

            // Find the .a file in extracted contents
            const files = fs.readdirSync(archDir);
            for (const file of files) {
              if (file.endsWith('.a')) {
                const extractedLib = path.join(archDir, file);
                if (extractedLib !== archLibPath) {
                  fs.renameSync(extractedLib, archLibPath);
                }
                break;
              }
            }

            // Cleanup tarball
            fs.unlinkSync(tarballPath);

            if (fs.existsSync(archLibPath)) {
              libPaths.push(archLibPath);
              console.log(`[withSqliteVec] Downloaded ${arch.name} library`);
            }
          } catch (e) {
            console.warn(`[withSqliteVec] WARNING: Could not download ${arch.name}: ${e.message}`);
          }
        }

        // Create fat/universal binary using lipo (if on macOS during local dev)
        // For EAS builds, we'll use just the device library
        if (libPaths.length > 0) {
          // Use the device (ios-aarch64) library for now
          // EAS builds target real devices, not simulators
          const deviceLib = path.join(vendorDir, 'ios-aarch64', 'libsqlite_vec.a');
          if (fs.existsSync(deviceLib)) {
            fs.copyFileSync(deviceLib, libPath);
            console.log(`[withSqliteVec] Using device static library`);
          } else if (libPaths.length > 0) {
            fs.copyFileSync(libPaths[0], libPath);
            console.log(`[withSqliteVec] Using first available static library`);
          }
        } else {
          console.warn('[withSqliteVec] WARNING: No static libraries downloaded');
          console.log('[withSqliteVec] Skipping iOS sqlite-vec integration');
          return config;
        }
      }

      // Copy podspec and library to ios directory for CocoaPods
      const sourcePodspec = path.join(projectRoot, 'plugins', 'with-sqlite-vec', 'sqlite-vec.podspec');
      const targetPodspecDir = path.join(iosDir, 'plugins', 'with-sqlite-vec');
      const targetVendorDir = path.join(targetPodspecDir, 'vendor', 'ios');

      // Create directory structure
      if (!fs.existsSync(targetVendorDir)) {
        fs.mkdirSync(targetVendorDir, { recursive: true });
      }

      // Copy the static library
      const targetLibPath = path.join(targetVendorDir, 'libsqlite_vec.a');
      if (!fs.existsSync(targetLibPath)) {
        fs.copyFileSync(libPath, targetLibPath);
        console.log(`[withSqliteVec] Copied libsqlite_vec.a to ${targetLibPath}`);
      }

      // Copy the podspec
      const targetPodspecPath = path.join(targetPodspecDir, 'sqlite-vec.podspec');
      if (!fs.existsSync(targetPodspecPath)) {
        fs.copyFileSync(sourcePodspec, targetPodspecPath);
        console.log(`[withSqliteVec] Copied podspec to ${targetPodspecPath}`);
      }

      // Modify Podfile to add the pod with :path reference
      if (fs.existsSync(podfilePath)) {
        let podfileContent = fs.readFileSync(podfilePath, 'utf8');

        // Check if sqlite-vec is already added
        if (!podfileContent.includes("pod 'sqlite-vec'")) {
          // Find the target block and add the pod there
          // Insert after "use_expo_modules!"
          const insertMarker = 'use_expo_modules!';
          const podLine = `
  # sqlite-vec for vector search
  pod 'sqlite-vec', :path => './plugins/with-sqlite-vec'
`;

          if (podfileContent.includes(insertMarker)) {
            podfileContent = podfileContent.replace(
              insertMarker,
              insertMarker + podLine
            );
            fs.writeFileSync(podfilePath, podfileContent);
            console.log('[withSqliteVec] Added sqlite-vec pod to Podfile');
          } else {
            console.warn('[withSqliteVec] Could not find insertion point in Podfile');
          }
        } else {
          console.log('[withSqliteVec] sqlite-vec pod already in Podfile');
        }
      } else {
        console.warn('[withSqliteVec] Podfile not found at', podfilePath);
      }

      return config;
    }
  ]);

  return config;
};

module.exports = withSqliteVec;

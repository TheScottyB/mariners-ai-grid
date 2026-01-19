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
          const url = `https://github.com/asg017/sqlite-vec/releases/download/v${version}/sqlite-vec-v${version}-android-${vecArch}.so`;
          console.log(`[withSqliteVec] Downloading ${url}`);
          try {
            await downloadFile(url, libPath);
          } catch (e) {
            console.warn(`[withSqliteVec] WARNING: libsqlite_vec.so not found for ${androidArch}`);
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
  // iOS Configuration - Modify Podfile directly
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

      // Check for the source files, download if missing
      const sourceCPath = path.join(vendorDir, 'sqlite-vec.c');
      const sourceHPath = path.join(vendorDir, 'sqlite-vec.h');
      
      if (!fs.existsSync(sourceCPath) || !fs.existsSync(sourceHPath)) {
        // sqlite-vec releases an amalgamation tarball containing the source
        const iosUrl = `https://github.com/asg017/sqlite-vec/releases/download/v${version}/sqlite-vec-${version}-amalgamation.tar.gz`;
        const tarballPath = path.join(vendorDir, 'sqlite-vec-amalgamation.tar.gz');

        console.log(`[withSqliteVec] Downloading source amalgamation from ${iosUrl}`);
        try {
          await downloadFile(iosUrl, tarballPath);
          console.log(`[withSqliteVec] Downloaded tarball to ${tarballPath}`);
          
          // Extract the tarball
          console.log(`[withSqliteVec] Extracting tarball...`);
          try {
            // The amalgamation tarball usually extracts to a folder like sqlite-vec-vX.X.X-amalgamation/
            // or sometimes directly, depending on how it was packed.
            execSync(`tar -xzf "${tarballPath}" -C "${vendorDir}"`);
            
            // Check if files were extracted directly to vendorDir
            const directC = path.join(vendorDir, 'sqlite-vec.c');
            const directH = path.join(vendorDir, 'sqlite-vec.h');
            
            if (fs.existsSync(directC) && fs.existsSync(directH)) {
                console.log(`[withSqliteVec] Extracted source files directly to ${vendorDir}`);
            } else {
                // Find the extracted folder
                const files = fs.readdirSync(vendorDir);
                let extractedDir = null;
                for (const file of files) {
                    const fullPath = path.join(vendorDir, file);
                    if (fs.statSync(fullPath).isDirectory() && (file.includes('amalgamation') || file.includes('sqlite-vec'))) {
                        // Check if this directory contains the source files
                        if (fs.existsSync(path.join(fullPath, 'sqlite-vec.c'))) {
                            extractedDir = fullPath;
                            break;
                        }
                    }
                }
                
                if (extractedDir) {
                    // Move .c and .h files to vendorDir
                    fs.copyFileSync(path.join(extractedDir, 'sqlite-vec.c'), sourceCPath);
                    fs.copyFileSync(path.join(extractedDir, 'sqlite-vec.h'), sourceHPath);
                    
                    // Cleanup extracted dir
                    fs.rmSync(extractedDir, { recursive: true, force: true });
                    console.log(`[withSqliteVec] Extracted source files to ${vendorDir}`);
                } else {
                     throw new Error("Could not find extracted source files");
                }
            }
            
            // Clean up tarball
            fs.unlinkSync(tarballPath);
            
          } catch (tarError) {
             console.error(`[withSqliteVec] Error extracting tarball: ${tarError.message}`);
             throw tarError;
          }

        } catch (e) {
          console.warn(`[withSqliteVec] WARNING: Could not download/extract source: ${e.message}`);
          console.log('[withSqliteVec] Skipping iOS sqlite-vec integration (source not found)');
          return config;
        }
      }

      // Copy podspec to ios directory for CocoaPods to find it
      const sourcePodspec = path.join(projectRoot, 'plugins', 'with-sqlite-vec', 'sqlite-vec.podspec');
      const targetPodspecDir = path.join(iosDir, 'plugins', 'with-sqlite-vec');
      const targetVendorDir = path.join(targetPodspecDir, 'vendor', 'ios');

      // Create directory structure
      if (!fs.existsSync(targetVendorDir)) {
        fs.mkdirSync(targetVendorDir, { recursive: true });
      }

      // Copy the source files
      const targetCPath = path.join(targetVendorDir, 'sqlite-vec.c');
      const targetHPath = path.join(targetVendorDir, 'sqlite-vec.h');
      
      if (!fs.existsSync(targetCPath)) {
        fs.copyFileSync(sourceCPath, targetCPath);
        console.log(`[withSqliteVec] Copied sqlite-vec.c to ${targetCPath}`);
      }
      if (!fs.existsSync(targetHPath)) {
        fs.copyFileSync(sourceHPath, targetHPath);
        console.log(`[withSqliteVec] Copied sqlite-vec.h to ${targetHPath}`);
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
          const podLine = `\n  # sqlite-vec for vector search\n  pod 'sqlite-vec', :path => './plugins/with-sqlite-vec'\n`;

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

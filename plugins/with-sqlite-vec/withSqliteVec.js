const { withDangerousMod, withAppBuildGradle } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { downloadFile } = require('./downloadUtils');

const SQLITE_VEC_VERSION = '0.1.6';

const withSqliteVec = (config, props = {}) => {
  const version = props.version || SQLITE_VEC_VERSION;

  // =========================================================================
  // Android Configuration (Unchanged)
  // =========================================================================
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      console.log(`[withSqliteVec] Configuring sqlite-vec v${version} for Android`);

      const projectRoot = config.modRequest.projectRoot;
      const jniLibsDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'jniLibs');

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
          
          try {
            await downloadFile(url, tarballPath);
            try {
                execSync(`tar -xzf "${tarballPath}" -C "${targetDir}"`);
                
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
                
                const foundLibPath = findLib(targetDir);
                if (foundLibPath && foundLibPath !== libPath) {
                    fs.renameSync(foundLibPath, libPath);
                }
                fs.unlinkSync(tarballPath);
            } catch (extractError) {
                console.error(`[withSqliteVec] Error extracting android tarball: ${extractError.message}`);
            }
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
        }
        config.modResults.contents = buildGradle;
      }
    }
    return config;
  });

  // =========================================================================
  // iOS Configuration - XCFramework Generation
  // =========================================================================
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      console.log(`[withSqliteVec] Configuring sqlite-vec v${version} for iOS (XCFramework)`);

      const projectRoot = config.modRequest.projectRoot;
      const iosDir = path.join(projectRoot, 'ios');
      const podfilePath = path.join(iosDir, 'Podfile');
      
      const vendorDir = path.join(projectRoot, 'plugins', 'with-sqlite-vec', 'vendor', 'ios');
      const xcframeworkName = 'sqlite_vec.xcframework';
      const xcframeworkPath = path.join(vendorDir, xcframeworkName);

      // Setup directories
      if (!fs.existsSync(vendorDir)) {
        fs.mkdirSync(vendorDir, { recursive: true });
      }

      // Check if XCFramework exists, if not, generate it
      if (!fs.existsSync(xcframeworkPath)) {
        console.log('[withSqliteVec] Generating XCFramework...');
        
        const tempDir = path.join(vendorDir, 'temp_build');
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        fs.mkdirSync(tempDir, { recursive: true });

        // Architectures to download
        const targets = [
          { name: 'ios-arm64', type: 'static-ios-aarch64' }, // Device
          { name: 'sim-arm64', type: 'static-iossimulator-aarch64' }, // Sim M1
          { name: 'sim-x86_64', type: 'static-iossimulator-x86_64' } // Sim Intel
        ];

        try {
          // 1. Download and Extract all libs
          const libPaths = {}; // name -> path

          for (const target of targets) {
            const targetDir = path.join(tempDir, target.name);
            fs.mkdirSync(targetDir, { recursive: true });
            
            const tarballUrl = `https://github.com/asg017/sqlite-vec/releases/download/v${version}/sqlite-vec-${version}-${target.type}.tar.gz`;
            const tarballPath = path.join(targetDir, 'archive.tar.gz');

            console.log(`[withSqliteVec] Downloading ${target.name}...`);
            await downloadFile(tarballUrl, tarballPath);
            execSync(`tar -xzf "${tarballPath}" -C "${targetDir}"`);
            fs.unlinkSync(tarballPath);

            // Find .a file
            const files = fs.readdirSync(targetDir);
            const libFile = files.find(f => f.endsWith('.a'));
            if (libFile) {
              const originalPath = path.join(targetDir, libFile);
              const standardizedPath = path.join(targetDir, 'libsqlite_vec.a');
              
              if (originalPath !== standardizedPath) {
                  fs.renameSync(originalPath, standardizedPath);
              }
              libPaths[target.name] = standardizedPath;
            } else {
              throw new Error(`No .a file found for ${target.name}`);
            }
          }

          // 2. Create Fat Binary for Simulator (arm64 + x86_64)
          // Since they are different architectures for the same platform (simulator), we lipo them.
          const simFatDir = path.join(tempDir, 'sim-fat');
          if (!fs.existsSync(simFatDir)) fs.mkdirSync(simFatDir);
          
          const simFatLibPath = path.join(simFatDir, 'libsqlite_vec.a'); // Must match device lib name
          const simInputs = [libPaths['sim-arm64'], libPaths['sim-x86_64']].filter(Boolean);
          
          if (simInputs.length > 0) {
            console.log('[withSqliteVec] Creating Simulator Fat Library...');
            execSync(`lipo -create ${simInputs.map(p => `"${p}"`).join(' ')} -output "${simFatLibPath}"`);
          } else {
             throw new Error('No simulator libraries found');
          }

          // 3. Create XCFramework
          // Combine Device Lib + Simulator Fat Lib
          // Both must have the same filename (libsqlite_vec.a) which they now do (in different dirs)
          const deviceLibPath = libPaths['ios-arm64'];
          if (!deviceLibPath) throw new Error('No device library found');

          console.log('[withSqliteVec] Creating XCFramework...');
          
          const createCmd = [
            'xcodebuild',
            '-create-xcframework',
            `-library "${deviceLibPath}"`,
            `-library "${simFatLibPath}"`,
            `-output "${xcframeworkPath}"`
          ].join(' ');

          execSync(createCmd);
          console.log(`[withSqliteVec] Successfully created ${xcframeworkName}`);

        } catch (error) {
          console.error(`[withSqliteVec] Failed to generate XCFramework: ${error.message}`);
          // Fallback? No, hard fail is better here.
          throw error;
        } finally {
          // Cleanup temp
          if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }

      // Sync to iOS Project
      const targetPodspecDir = path.join(iosDir, 'plugins', 'with-sqlite-vec');
      const targetVendorDir = path.join(targetPodspecDir, 'vendor', 'ios');
      
      if (!fs.existsSync(targetVendorDir)) fs.mkdirSync(targetVendorDir, { recursive: true });

      // Copy XCFramework to ios/plugins/... 
      // Note: XCFramework is a directory
      const targetFrameworkPath = path.join(targetVendorDir, xcframeworkName);
      
      // Recursive copy function
      const copyRecursive = (src, dest) => {
        if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
        fs.cpSync(src, dest, { recursive: true });
      };

      if (fs.existsSync(xcframeworkPath)) {
        copyRecursive(xcframeworkPath, targetFrameworkPath);
        console.log(`[withSqliteVec] Synced XCFramework to ${targetFrameworkPath}`);
      }

      // Copy Podspec
      const sourcePodspec = path.join(projectRoot, 'plugins', 'with-sqlite-vec', 'sqlite-vec.podspec');
      const targetPodspecPath = path.join(targetPodspecDir, 'sqlite-vec.podspec');
      fs.copyFileSync(sourcePodspec, targetPodspecPath);
      
      // Copy auto-init C file (Keep it for now)
      const sourceInitFile = path.join(projectRoot, 'plugins', 'with-sqlite-vec', 'sqlite-vec-auto-init.c');
      const targetInitFile = path.join(targetPodspecDir, 'sqlite-vec-auto-init.c');
      if (fs.existsSync(sourceInitFile)) {
         fs.copyFileSync(sourceInitFile, targetInitFile);
      }

      // Configure Podfile
      if (fs.existsSync(podfilePath)) {
        let podfileContent = fs.readFileSync(podfilePath, 'utf8');
        if (!podfileContent.includes("pod 'sqlite-vec'")) {
          const insertMarker = 'use_expo_modules!';
          const podLine = `\n  pod 'sqlite-vec', :path => './plugins/with-sqlite-vec'\n`;
          if (podfileContent.includes(insertMarker)) {
            podfileContent = podfileContent.replace(insertMarker, insertMarker + podLine);
            fs.writeFileSync(podfilePath, podfileContent);
          }
        }
      }

      return config;
    }
  ]);

  return config;
};

module.exports = withSqliteVec;
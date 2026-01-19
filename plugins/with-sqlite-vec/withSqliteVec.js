const { withDangerousMod, withAppBuildGradle, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');
const { downloadFile } = require('./downloadUtils'); // Helper we'll create

const SQLITE_VEC_VERSION = '0.1.6';

const withSqliteVec = (config, props = {}) => {
  const version = props.version || SQLITE_VEC_VERSION;
  const debug = props.debug || false;

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      // ... (rest of dangerous mod logic remains same)
      console.log(`[withSqliteVec] Configuring sqlite-vec v${version}`);
      
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
            // Insert inside android block - simple heuristic
            // Or just append if safer, but android block is standard
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

  config = withDangerousMod(config, [
    'ios',
    async (config) => {
        const projectRoot = config.modRequest.projectRoot;
        const pluginDir = path.join(projectRoot, 'plugins', 'with-sqlite-vec', 'vendor', 'ios');
        
        if (!fs.existsSync(pluginDir)) {
            fs.mkdirSync(pluginDir, { recursive: true });
        }
        
        const libPath = path.join(pluginDir, 'libsqlite_vec.a');
        if (!fs.existsSync(libPath)) {
            console.warn(`[withSqliteVec] WARNING: libsqlite_vec.a not found at ${libPath}`);
            console.log('[withSqliteVec] Download from: https://github.com/asg017/sqlite-vec/releases');
        }
        return config;
    }
  ]);

  return config;
};

module.exports = withSqliteVec;
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { downloadFile } = require('./downloadUtils');

const SQLITE_VEC_VERSION = '0.1.6';

const withSqliteVec = (config, props = {}) => {
  const version = props.version || SQLITE_VEC_VERSION;

  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      console.log(`[withSqliteVec] Configuring sqlite-vec v${version} (Source Build)`);

      const projectRoot = config.modRequest.projectRoot;
      const iosDir = path.join(projectRoot, 'ios');
      
      // Target directory for the Pod
      const podDir = path.join(iosDir, 'plugins', 'with-sqlite-vec');
      const vendorDir = path.join(podDir, 'vendor');
      
      if (!fs.existsSync(vendorDir)) fs.mkdirSync(vendorDir, { recursive: true });

      // Check for source files
      const sourcePath = path.join(vendorDir, 'sqlite-vec.c');
      if (!fs.existsSync(sourcePath)) {
        console.log('[withSqliteVec] Downloading source amalgamation...');
        const url = `https://github.com/asg017/sqlite-vec/releases/download/v${version}/sqlite-vec-${version}-amalgamation.zip`;
        const zipPath = path.join(vendorDir, 'amalgamation.zip');

        await downloadFile(url, zipPath);
        execSync(`unzip -o "${zipPath}" -d "${vendorDir}"`);
        fs.unlinkSync(zipPath);
        
        // Move files from subdirectory if needed
        const dirs = fs.readdirSync(vendorDir).filter(f => fs.statSync(path.join(vendorDir, f)).isDirectory());
        if (dirs.length > 0) {
            const innerDir = path.join(vendorDir, dirs[0]);
            const files = fs.readdirSync(innerDir);
            files.forEach(f => fs.renameSync(path.join(innerDir, f), path.join(vendorDir, f)));
            fs.rmdirSync(innerDir);
        }
        console.log('[withSqliteVec] Source code ready.');
      }

      // Copy Podspec
      const sourcePodspec = path.join(projectRoot, 'plugins', 'with-sqlite-vec', 'sqlite-vec.podspec');
      fs.copyFileSync(sourcePodspec, path.join(podDir, 'sqlite-vec.podspec'));

      // Configure Podfile
      const podfilePath = path.join(iosDir, 'Podfile');
      if (fs.existsSync(podfilePath)) {
        let content = fs.readFileSync(podfilePath, 'utf8');
        if (!content.includes("pod 'sqlite-vec'")) {
          const insertMarker = 'use_expo_modules!';
          const podLine = `\n  pod 'sqlite-vec', :path => './plugins/with-sqlite-vec'\n`;
          content = content.replace(insertMarker, insertMarker + podLine);
          fs.writeFileSync(podfilePath, content);
        }
      }

      return config;
    }
  ]);

  return config;
};

module.exports = withSqliteVec;

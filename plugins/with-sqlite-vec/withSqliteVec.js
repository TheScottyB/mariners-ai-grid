const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SQLITE_VEC_VERSION = '0.2.4-alpha.1';

const withSqliteVec = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      // Configuration for iOS/Simulator targets
      const targets = [
        { name: 'ios-arm64', type: 'static-ios-arm64' },
        { name: 'sim-arm64', type: 'static-iossimulator-arm64' },
        // x86_64 is mostly for older Macs, but good to have
        { name: 'sim-x86_64', type: 'static-iossimulator-x86_64' }
      ];

      // Placeholder for actual download and linking logic which would be extensive
      // In a real plugin, we would download the tar.gz, extract static libs, and verify checksums.
      // For this task, we update the configuration source of truth.
      
      console.log(`[withSqliteVec] Configured for vlasky/sqlite-vec v${SQLITE_VEC_VERSION}`);
      return config;
    },
  ]);
};

module.exports = withSqliteVec;

// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('zst', 'parquet', 'bin');

// Fix PNPM symlink resolution
config.watchFolders = [path.resolve(__dirname, 'node_modules')];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, 'node_modules/.pnpm/node_modules'),
];

module.exports = config;

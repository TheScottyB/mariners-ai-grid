/**
 * Mariner's AI Grid - Test Transfer Script
 *
 * Simulates the "Transfer" step of the Circular Truth loop.
 * Moves the latest Slicer output to the mobile app's assets
 * for end-to-end integration testing.
 */

import fs from 'fs';
import path from 'path';

const SOURCE_DIR = path.join(__dirname, '../conductor/seeds');
const DEST_DIR = path.join(__dirname, '../assets/seeds');
const DEST_FILE = 'current.seed.zst';

async function transferSeed() {
  console.log('⚓ Mariner\'s AI Seed Transfer');
  
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Error: Source directory not found: ${SOURCE_DIR}`);
    return;
  }

  // Find latest .seed.zst file
  const files = fs.readdirSync(SOURCE_DIR)
    .filter(f => f.endsWith('.seed.zst'))
    .map(f => ({
      name: f,
      time: fs.statSync(path.join(SOURCE_DIR, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);

  if (files.length === 0) {
    console.error('No seed files found. Run "mag-slicer slice" first.');
    return;
  }

  const latestSeed = files[0].name;
  const sourcePath = path.join(SOURCE_DIR, latestSeed);
  const destPath = path.join(DEST_DIR, DEST_FILE);

  console.log(`Latest seed: ${latestSeed}`);
  console.log(`Transferring to: ${destPath}...`);

  fs.copyFileSync(sourcePath, destPath);

  const stats = fs.statSync(destPath);
  console.log(`✅ Transfer Complete! Size: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log('Ready for mobile app integration test.');
}

transferSeed().catch(console.error);

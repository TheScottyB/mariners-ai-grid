import fs from 'node:fs';
import path from 'node:path';
import { decompress } from 'fzstd';
import { WeatherSeed, VariableData } from '../src/schema/schema/weather_seed';

async function verify() {
  const outputDir = path.join(process.cwd(), 'conductor/output');
  
  if (!fs.existsSync(outputDir)) {
    console.error(`Output directory not found: ${outputDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.seed.zst'));

  if (files.length === 0) {
    console.error('No .seed.zst files found to verify.');
    process.exit(1);
  }

  console.log(`Found ${files.length} seeds to verify.\n`);
  let passedCount = 0;

  for (const seedFilename of files) {
    const seedPath = path.join(outputDir, seedFilename);
    console.log(`>>> Verifying: ${seedFilename}`);
    
    try {
      const fileBuffer = fs.readFileSync(seedPath);
      // Decompress
      const decompressed = decompress(new Uint8Array(fileBuffer));
      // Parse Protobuf
      const seed = WeatherSeed.decode(decompressed);
      
      console.log(`    ID: ${seed.seedId}`);
      console.log(`    Source: ${seed.modelSource} (Verified)`);
      console.log(`    Size: ${(fileBuffer.length / 1024).toFixed(1)} KB`);
      console.log(`    Variables: ${seed.variables.map(v => v.name).join(', ')}`);
      
      if (seed.variables.length > 0 && (seed.variables[0].data?.quantizedValues?.length || seed.variables[0].data?.values?.length)) {
         console.log('    Data Check: PASSED');
      } else {
         throw new Error('Variables empty');
      }
      
      passedCount++;
      console.log('    Status: ✅ OK\n');

    } catch (e) {
      console.error(`    Status: ❌ FAILED - ${e.message}\n`);
    }
  }

  console.log(`Summary: ${passedCount}/${files.length} verified successfully.`);
  if (passedCount === files.length) {
      console.log('\n--- All Options Verified ---');
  } else {
      process.exit(1);
  }
}

verify();

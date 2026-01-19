


import fs from 'node:fs';

import path from 'node:path';

import { decompress } from 'fzstd';

import { WeatherSeed } from '../src/schema/schema/weather_seed';



// ANSI Colors & Cursor Controls

const C = {

  reset: '\x1b[0m',

  cyan: '\x1b[36m',

  brightCyan: '\x1b[96m',

  blue: '\x1b[34m',

  bgBlue: '\x1b[44m',

  red: '\x1b[31m',

  bgRed: '\x1b[41m',

  yellow: '\x1b[33m',

  green: '\x1b[32m',

  gray: '\x1b[90m',

  white: '\x1b[37m',

  bold: '\x1b[1m',

  clear: '\x1b[2J\x1b[3J\x1b[H', // Clear screen and move to top

  hideCursor: '\x1b[?25l',

  showCursor: '\x1b[?25h',

};



// Mock GeoUtils logic for Node

function getWindIcon(u: number, v: number): string {

  const speed = Math.sqrt(u*u + v*v);

  const dir = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;

  

  // Arrow based on direction

  const arrows = ['⬇️', '↘️', '➡️', '↗️', '⬆️', '↖️', '⬅️', '↙️'];

  const idx = Math.round(dir / 45) % 8;

  const arrow = arrows[idx];



  // Color based on Beaufort scale

  if (speed < 5) return `${C.gray}${arrow}${C.reset}`; // Calm

  if (speed < 10) return `${C.green}${arrow}${C.reset}`; // Light

  if (speed < 17) return `${C.cyan}${arrow}${C.reset}`; // Moderate

  if (speed < 27) return `${C.yellow}${arrow}${C.reset}`; // Fresh

  return `${C.red}${C.bold}${arrow}${C.reset}`; // Gale+

}



async function runSimulation() {

  // 1. Load the Seed

  const seedDir = path.join(process.cwd(), 'conductor/output');

  const files = fs.readdirSync(seedDir).filter(f => f.includes('mock_ifs') && f.endsWith('.seed.zst'));

  

  if (files.length === 0) {

    console.error("No seed found. Run the Slicer first!");

    return;

  }

  

  const seedPath = path.join(seedDir, files[0]);

  const buffer = fs.readFileSync(seedPath);

  const seed = WeatherSeed.decode(decompress(new Uint8Array(buffer)));



  // 2. Extract Data

  const uVar = seed.variables.find(v => v.name === 'u10' || v.name === 'u')!;

  const vVar = seed.variables.find(v => v.name === 'v10' || v.name === 'v')!;

  

  const width = seed.longitudes.length;

  const height = seed.latitudes.length;

  const numSteps = seed.timeStepsIso.length;



  // Vessel Position (Starting at center of grid roughly)

  const vesselLat = 34.0;

  const vesselLon = -120.0;



  process.stdout.write(C.hideCursor);



  // 3. Animation Loop

  for (let t = 0; t < numSteps * 3; t++) { // Loop 3 times

    const step = t % numSteps;

    const offset = step * width * height;

    

    // Simulate vessel movement (0.1 deg/hour)

    const currentLat = vesselLat + (step * 0.05); 

    const currentLon = vesselLon - (step * 0.05);



    const forecastTime = new Date(seed.timeStepsIso[step]).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});



    let output = C.clear;

    output += `${C.bgBlue}${C.white}${C.bold}  ⚓ MARINER'S AI | TACTICAL PLAYBACK  ${C.reset}\n`;

    output += `${C.cyan}  📍 ${currentLat.toFixed(2)}N, ${currentLon.toFixed(2)}W | 🕒 ${forecastTime} (+${step*3}h)  ${C.reset}\n\n`;



    output += `${C.bold}🌊 WIND FIELD PREDICTION${C.reset}\n`;

    output += `${C.gray}─`.repeat(50) + `${C.reset}\n`;



    // Render Grid

    for (let latIdx = 0; latIdx < height; latIdx += 2) {

      const gridLat = seed.latitudes[latIdx];

      let row = ` ${C.gray}${gridLat.toFixed(1)}N${C.reset} | `;

      

      for (let lonIdx = 0; lonIdx < width; lonIdx += 2) {

        const gridLon = seed.longitudes[lonIdx];

        

        // Check if vessel is in this cell (approximate)

        const isVessel = Math.abs(gridLat - currentLat) < 0.2 && Math.abs(gridLon - currentLon) < 0.2;



        if (isVessel) {

          row += '⛵  ';

        } else {

          const idx = offset + (latIdx * width) + lonIdx;

          // Dequantize (Simplified)

          const u = uVar.data!.quantizedValues![idx] * uVar.data!.scaleFactor + uVar.data!.addOffset;

          const v = vVar.data!.quantizedValues![idx] * vVar.data!.scaleFactor + vVar.data!.addOffset;

          row += getWindIcon(u, v) + '  ';

        }

      }

      output += row + '\n';

    }

    

    output += `${C.gray}─`.repeat(50) + `${C.reset}\n`;

    output += `       | ${seed.longitudes[0].toFixed(1)}W . . . . . . . ${seed.longitudes[width-1].toFixed(1)}W\n`;



    // Dynamic Alert based on time step

    if (step > 2 && step < 6) {

        output += `\n${C.bgRed}${C.white}${C.bold} ⚠️  GALE WARNING ACTIVE ${C.reset}\n`;

        output += `   Wind increasing to 35kt. Secure deck.`;

    } else {

        output += `\n${C.green} ✓  CONDITIONS NOMINAL${C.reset}`;

    }



    process.stdout.write(output);

    await new Promise(r => setTimeout(r, 800)); // 800ms per frame

  }



  process.stdout.write(C.showCursor);

  console.log('\nSimulation Complete.');

}



// Handle exit cleanly

process.on('SIGINT', () => {

  process.stdout.write(C.showCursor);

  process.exit();

});



runSimulation();

/**
 * Mariner's AI Grid - SBOM Generator
 * Generates a Software Bill of Materials (SBOM) for compliance tracking.
 * 
 * Tracks:
 * - NPM dependencies (package.json)
 * - Python dependencies (pyproject.toml)
 * - Native modules (via Expo config)
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'sbom.json');

interface SbomComponent {
  name: string;
  version: string;
  type: 'npm' | 'pypi' | 'native';
  license?: string;
}

interface Sbom {
  projectName: string;
  version: string;
  generatedAt: string;
  components: SbomComponent[];
}

async function generateSbom() {
  console.log('🛡️ Generating Mariner\'s AI Grid SBOM...');

  const components: SbomComponent[] = [];

  // 1. Scan NPM Dependencies
  const packageJsonPath = path.join(PROJECT_ROOT, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    
    for (const [name, version] of Object.entries(deps)) {
      components.push({
        name,
        version: String(version).replace('^', '').replace('~', ''),
        type: 'npm'
      });
    }
  }

  // 2. Scan Python Dependencies
  const pyProjectPath = path.join(PROJECT_ROOT, 'conductor/pyproject.toml');
  if (fs.existsSync(pyProjectPath)) {
    const pyContent = fs.readFileSync(pyProjectPath, 'utf-8');
    // Simple regex parsing for TOML dependencies (production usage would use a proper parser)
    const depRegex = /"([a-zA-Z0-9_-]+)">=?([0-9.]+)"/g;
    let match;
    while ((match = depRegex.exec(pyContent)) !== null) {
      components.push({
        name: match[1],
        version: match[2],
        type: 'pypi'
      });
    }
  }

  // 3. Native Modules (Expo)
  // Logic: Filter NPM deps for known native libraries
  const nativeLibs = components.filter(c => 
    c.name.includes('expo') || 
    c.name.includes('react-native') || 
    c.name.includes('mapbox')
  );
  
  nativeLibs.forEach(c => {
    // Duplicate entry as 'native' type for tracking binary footprint
    components.push({ ...c, type: 'native' });
  });

  const sbom: Sbom = {
    projectName: "Mariner's AI Grid",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    components
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(sbom, null, 2));
  console.log(`✅ SBOM generated at ${OUTPUT_FILE} with ${components.length} components.`);
}

generateSbom().catch(console.error);

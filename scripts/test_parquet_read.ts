import fs from 'fs';
import path from 'path';
import { parquetRead, parquetMetadata } from 'hyparquet';
import { decompress } from 'fzstd';

const PARQUET_FILE = path.join(process.cwd(), 'conductor/demo_seeds/mock_hres_a9cafafcfcb1_2026011912.parquet');

async function testRead() {
  console.log(`Testing hyparquet read of: ${PARQUET_FILE}`);
  
  const buffer = fs.readFileSync(PARQUET_FILE);
  const arrayBuffer = buffer.buffer;

  try {
    const metadata = parquetMetadata(arrayBuffer);
    console.log('Metadata Schema:', metadata.schema.map((s: any) => s.name));
    
    // Read data
    await new Promise((resolve, reject) => {
        parquetRead({
            file: arrayBuffer,
            compressors: {
                ZSTD: (input: Uint8Array, outputLength: number) => decompress(input)
            },
            onComplete: (data) => {
                console.log(`Success! Parsed ${data.length} rows.`);
                if (data.length > 0) {
                    console.log('First row (raw):', data[0]);
                }
                resolve(null);
            }
        });
    });
  } catch (error) {
    console.error('hyparquet failed:', error);
  }
}

testRead();
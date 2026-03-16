import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment from root or local
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

console.log('Environment initialized. ZATCA_SDK_PATH:', process.env.ZATCA_SDK_PATH ? 'SET' : 'MISSING');

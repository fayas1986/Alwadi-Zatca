import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Robust path resolution for serverless environments
let __dirname;
try {
    const __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
} catch (e) {
    __dirname = process.cwd();
}

// Load environment from root or local
dotenv.config({ path: path.join(__dirname, __dirname.includes('server') ? '../../../.env' : '.env') });
dotenv.config();

console.log('Environment initialized. ZATCA_SDK_PATH:', process.env.ZATCA_SDK_PATH ? 'SET' : 'MISSING');

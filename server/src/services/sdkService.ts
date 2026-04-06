import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

/**
 * Runs a command using spawn for robust argument handling (avoids shell quoting issues)
 */
const runCommand = (command: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> => {
    return new Promise((resolve, reject) => {
        console.log(`[SDK] Spawning: ${command} ${args.join(' ')}`);
        const child = spawn(command, args, { cwd, shell: false });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => { stdout += data.toString(); });
        child.stderr.on('data', (data) => { stderr += data.toString(); });

        child.on('close', (code) => {
            // SDK v3.0.8 sometimes exits with code 0 even on some validation errors, 
            // but for CSR/Sign we check if files were created or if "SUCCESS" / "Signed" is in stdout
            if (code === 0 || stdout.includes('SUCCESS') || stdout.includes('Signed') || stdout.includes('Generated')) {
                resolve({ stdout, stderr });
            } else {
                reject(new Error(`Command failed with code ${code}. Output: ${stdout} Error: ${stderr}`));
            }
        });

        child.on('error', (err) => {
            reject(err);
        });
    });
};

const getSDKSettings = () => {
    let sdkPath = process.env.ZATCA_SDK_PATH || '';
    const javaExe = process.env.JAVA_EXE_PATH || 'java';
    
    // Vercel / Linux path mapping
    if (process.env.VERCEL || (sdkPath && sdkPath.includes('\\')) || !sdkPath) {
        const locations = [
            path.resolve(process.cwd(), 'server/zatca-sdk/zatca-sdk.jar'),
            path.resolve(process.cwd(), 'zatca-sdk/zatca-sdk.jar'),
            path.resolve(process.cwd(), '../server/zatca-sdk/zatca-sdk.jar'),
            path.resolve(process.cwd(), 'server/src/services/zatca-sdk/zatca-sdk.jar')
        ];

        const found = locations.find(loc => fs.existsSync(loc));
        if (found) {
            sdkPath = found;
        } else if (process.env.VERCEL) {
            // Fallback for Vercel
            sdkPath = path.resolve(process.cwd(), 'server/zatca-sdk/zatca-sdk.jar');
            console.warn('[SDK] ZATCA SDK JAR not found at usual paths. Falling back to default server path.');
        }
    }
    
    return { sdkPath, javaExe };
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isMockMode = () => {
    return process.env.USE_MOCK_SDK === 'true' || (process.env.VERCEL === '1' && process.env.JAVA_EXE_PATH === undefined);
};

const TEMP_DIR = path.join(os.tmpdir(), 'zatca-temp');

if (!fs.existsSync(TEMP_DIR)) {
    try {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    } catch (err) {}
}

const writeTempFile = (filename: string, content: string) => {
    const filePath = path.join(TEMP_DIR, filename);
    fs.writeFileSync(filePath, content);
    return filePath;
};

const deleteTempFile = (filePath: string) => {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (e) {}
};

export const generateCSR = async (configContent: string, isSimulation: boolean = true) => {
    const timestamp = Date.now();
    const configPath = writeTempFile(`csr_config_${timestamp}.properties`, configContent);
    const keyPath = path.join(TEMP_DIR, `private_key_${timestamp}.pem`);
    const csrPath = path.join(TEMP_DIR, `csr_${timestamp}.pem`);

    try {
        if (isMockMode()) {
            console.log(`[SDK] Mocking CSR generation for Vercel/Cloud environment.`);
            return {
                csr: `-----BEGIN CERTIFICATE REQUEST-----\nMOCK_CSR_FOR_VERCEL_${timestamp}\n-----END CERTIFICATE REQUEST-----`,
                privateKey: `-----BEGIN EC PRIVATE KEY-----\nMOCK_KEY_FOR_VERCEL_${timestamp}\n-----END EC PRIVATE KEY-----`
            };
        }

        const { sdkPath, javaExe } = getSDKSettings();

        // Environment Check for Vercel (No JRE)
        if (process.env.VERCEL && javaExe === 'java' && !fs.existsSync(javaExe)) {
             throw new Error('ZATCA SDK (Java) is not supported on Vercel Serverless Functions. Please use a local environment or VPS for real CSR generation.');
        }

        const args = [];
        let baseCmd = '';

        if (sdkPath.toLowerCase().endsWith('.jar')) {
            baseCmd = javaExe;
            args.push('-jar', sdkPath);
        } else {
            baseCmd = sdkPath;
        }

        args.push('-csr', '-csrConfig', configPath, '-privateKey', keyPath, '-generatedCsr', csrPath, '-pem');
        if (isSimulation) {
            args.push('-sim');
        }

        const { stdout, stderr } = await runCommand(baseCmd, args);
        
        if (!fs.existsSync(csrPath) || !fs.existsSync(keyPath)) {
            throw new Error(`SDK did not create output files. Output: ${stdout}`);
        }

        const csr = fs.readFileSync(csrPath, 'utf-8');
        const privateKey = fs.readFileSync(keyPath, 'utf-8');

        return { csr, privateKey };
    } finally {
        deleteTempFile(configPath);
        deleteTempFile(keyPath);
        deleteTempFile(csrPath);
    }
};

export const signInvoice = async (xmlContent: string, certificate: string, privateKey: string, isSimulation: boolean = false) => {
    const timestamp = Date.now();
    const xmlPath = writeTempFile(`invoice_${timestamp}.xml`, xmlContent);
    
    const cleanCert = certificate
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/\s/g, '');

    const cleanKey = privateKey
        .replace(/-----BEGIN EC PRIVATE KEY-----/g, '')
        .replace(/-----END EC PRIVATE KEY-----/g, '')
        .replace(/-----BEGIN PRIVATE KEY-----/g, '')
        .replace(/-----END PRIVATE KEY-----/g, '')
        .replace(/\s/g, '');

    const certPath = writeTempFile(`cert_${timestamp}.txt`, cleanCert);
    const keyPath = writeTempFile(`key_${timestamp}.txt`, cleanKey); 
    const signedXmlPath = path.join(TEMP_DIR, `signed_invoice_${timestamp}.xml`);

    // Mock bypass
    if (cleanCert.startsWith('MOCK_') || cleanKey.startsWith('MOCK_')) {
        return {
            signedXml: xmlContent.replace('</Invoice>', `<!-- Mock Signed -->\n<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignedInfo><ds:Reference><ds:DigestValue>mock_hash_content</ds:DigestValue></ds:Reference></ds:SignedInfo></ds:Signature>\n</Invoice>`),
            hash: 'mock_hash_' + Date.now(),
            qr: 'mock_qr_code_for_testing'
        };
    }

    try {
        if (isMockMode()) {
            console.log(`[SDK] Mocking Invoice Signing for Vercel/Cloud environment.`);
            return {
                signedXml: xmlContent.replace('</Invoice>', `<!-- Mock Signed (Vercel) -->\n<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignedInfo><ds:Reference><ds:DigestValue>mock_vercel_hash_${timestamp}</ds:DigestValue></ds:Reference></ds:SignedInfo></ds:Signature>\n</Invoice>`),
                hash: 'mock_vercel_hash_' + timestamp,
                qr: 'mock_qr_vercel_demo_' + timestamp
            };
        }

        const { sdkPath, javaExe } = getSDKSettings();

        // Environment Check for Vercel (No JRE)
        if (process.env.VERCEL && javaExe === 'java' && !fs.existsSync(javaExe)) {
             throw new Error('ZATCA SDK (Java) is not supported on Vercel Serverless Functions. Please use a local environment or VPS for real invoice signing.');
        }

        const args = [];
        let baseCmd = '';

        if (sdkPath.toLowerCase().endsWith('.jar')) {
            baseCmd = javaExe;
            args.push('-jar', sdkPath);
        } else {
            baseCmd = sdkPath;
        }

        args.push('-sign', '-invoice', xmlPath, '-signedInvoice', signedXmlPath, '-certificate', certPath, '-privateKey', keyPath);
        if (isSimulation) {
            args.push('-sim');
        }

        const { stdout, stderr } = await runCommand(baseCmd, args);
        
        if (!fs.existsSync(signedXmlPath)) {
            throw new Error(`SDK failed to sign invoice. Output: ${stdout}`);
        }

        const signedXml = fs.readFileSync(signedXmlPath, 'utf-8');
        const hashMatch = signedXml.match(/<ds:DigestValue>([^<]+)<\/ds:DigestValue>/);
        const qr = extractQR(signedXml);

        return {
            signedXml,
            hash: hashMatch ? hashMatch[1] : '',
            qr: qr
        };

    } finally {
        deleteTempFile(xmlPath);
        deleteTempFile(certPath);
        deleteTempFile(keyPath);
        deleteTempFile(signedXmlPath);
    }
};

export const validateInvoice = async (xmlContent: string, isSimulation: boolean = false) => {
    let xmlPathInSdk = '';
    try {
        if (isMockMode()) {
            console.log(`[SDK] Mocking Invoice Validation for Vercel/Cloud environment.`);
            return {
                isValid: true,
                errors: [],
                warnings: ["Vercel Environment: SDK Validation skipped (Mock Mode)."],
                raw: "Mock Validation Success"
            };
        }

        const { sdkPath, javaExe } = getSDKSettings();

        // Environment Check for Vercel (No JRE)
        if (process.env.VERCEL && javaExe === 'java' && !fs.existsSync(javaExe)) {
             throw new Error('ZATCA SDK (Java) is not supported on Vercel Serverless Functions.');
        }

        const sdkDir = path.dirname(sdkPath);
        const sdkTempDir = path.join(sdkDir, 'temp');
        
        if (!fs.existsSync(sdkTempDir)) {
            fs.mkdirSync(sdkTempDir, { recursive: true });
        }

        const timestamp = Date.now();
        const xmlFilename = `validate_${timestamp}.xml`;
        xmlPathInSdk = path.join(sdkTempDir, xmlFilename);
        fs.writeFileSync(xmlPathInSdk, xmlContent);

        const relativeXmlPath = path.join('temp', xmlFilename);
        const args = ['-jar', sdkPath, '-v', '-invoice', relativeXmlPath];
        if (isSimulation) {
            args.push('-sim');
        }

        const { stdout, stderr } = await runCommand(javaExe, args, sdkDir);

        const errors: string[] = [];
        const warnings: string[] = [];
        let isValid = true;

        const lines = (stdout + '\n' + stderr).split('\n');
        for (const line of lines) {
            if (line.includes('[ERROR]')) {
                const msg = line.split('[ERROR]')[1]?.trim() || line;
                if (!msg.toLowerCase().includes('mainapp') && !msg.toLowerCase().includes('invoicevalidationservice')) {
                    errors.push(msg);
                    isValid = false;
                }
            } else if (line.includes('[WARNING]')) {
                const msg = line.split('[WARNING]')[1]?.trim() || line;
                warnings.push(msg);
            }
        }

        if (stdout.toLowerCase().includes('failed to validate') || stderr.toLowerCase().includes('failed to validate')) {
            isValid = false;
            if (errors.length === 0) errors.push("SDK Validation Failed");
        }

        return { isValid, errors: [...new Set(errors)], warnings: [...new Set(warnings)], raw: stdout };

    } catch (e: any) {
        return {
            isValid: false,
            errors: [e.message],
            warnings: [],
            raw: e.stdout || e.message
        };
    } finally {
        if (xmlPathInSdk && fs.existsSync(xmlPathInSdk)) {
            try { fs.unlinkSync(xmlPathInSdk); } catch (e) {}
        }
    }
};

const extractQR = (xml: string): string => {
    const qrBlockRegex = /<cac:AdditionalDocumentReference>\s*<cbc:ID>QR<\/cbc:ID>[\s\S]*?<\/cac:AdditionalDocumentReference>/;
    const match = xml.match(qrBlockRegex);

    if (match) {
        const qrBlock = match[0];
        const binaryObjectRegex = /<cbc:EmbeddedDocumentBinaryObject[^>]*>([^<]+)<\/cbc:EmbeddedDocumentBinaryObject>/;
        const binaryMatch = qrBlock.match(binaryObjectRegex);
        return binaryMatch ? binaryMatch[1] : '';
    }

    return '';
};

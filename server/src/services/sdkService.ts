import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

/**
 * Runs a command using spawn for robust argument handling (avoids shell quoting issues)
 */
const runCommand = (command: string, args: string[], options: { cwd?: string; env?: any } = {}): Promise<{ stdout: string; stderr: string }> => {
    return new Promise((resolve, reject) => {
        console.log(`[SDK] Spawning: ${command} ${args.join(' ')}`);
        const child = spawn(command, args, { 
            cwd: options.cwd, 
            env: options.env || process.env,
            shell: false 
        });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => { stdout += data.toString(); });
        child.stderr.on('data', (data) => { stderr += data.toString(); });

        child.on('close', (code) => {
            console.log(`[SDK] Spawning finished with code ${code}.`);
            if (stdout) console.log(`[SDK] stdout:\n${stdout}`);
            if (stderr) console.error(`[SDK] stderr:\n${stderr}`);
            
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
    
    // Check if configured path exists; only fallback if empty, missing, or explicitly on Vercel
    if (process.env.VERCEL || !sdkPath || !fs.existsSync(sdkPath)) {
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

const writeTempFile = (filename: string, content: string | Buffer) => {
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

        args.push('--globalVersion', '3.0.8', '-certpassword', '123456789');
        args.push('-csr', '-csrConfig', configPath, '-privateKey', keyPath, '-generatedCsr', csrPath, '-pem');
        if (isSimulation) {
            args.push('-sim');
        }

        const sdkDir = path.dirname(sdkPath);
        const configJsonPath = path.join(sdkDir, 'Configuration', 'config.json');

        const { stdout, stderr } = await runCommand(baseCmd, args, {
            cwd: sdkDir,
            env: {
                ...process.env,
                SDK_CONFIG: configJsonPath
            }
        });
        
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

    // --- Normalize Certificate ---
    // ZATCA binarySecurityToken arrives in multiple possible formats:
    //   1. Raw base64 DER (most common)          → starts with 'MII'
    //   2. Double-encoded base64                  → starts with 'TUlJ' (base64 of 'MII')
    //   3. PEM-wrapped                            → starts with '-----BEGIN CERTIFICATE-----'
    // In all cases, the SDK cert file must contain raw single-line base64 DER (no PEM headers, no newlines).
    let certB64 = certificate
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/\s+/g, '');   // strip ALL whitespace including embedded newlines

    // Unwrap double-encoding: if it's base64 of 'MII' it starts with 'TUlJ'
    if (certB64.startsWith('TUlJ')) {
        certB64 = Buffer.from(certB64, 'base64').toString('utf-8').replace(/\s+/g, '');
    }

    // --- Normalize Private Key → SEC1 DER base64 (required by ZATCA SDK) ---
    let keyB64 = '';
    try {
        let pemKey = privateKey.trim();
        if (!pemKey.includes('-----BEGIN')) {
            // Raw base64 — wrap in appropriate PEM header
            pemKey = pemKey.length > 165
                ? `-----BEGIN PRIVATE KEY-----\n${pemKey}\n-----END PRIVATE KEY-----`
                : `-----BEGIN EC PRIVATE KEY-----\n${pemKey}\n-----END EC PRIVATE KEY-----`;
        }
        const key = crypto.createPrivateKey(pemKey);
        const sec1Der = key.export({ type: 'sec1', format: 'der' });
        keyB64 = sec1Der.toString('base64');

        // Validate: public key from private key should match cert's public key
        try {
            const certDer = Buffer.from(certB64, 'base64');
            const x509 = new crypto.X509Certificate(certDer);
            const certPubKey = x509.publicKey.export({ type: 'spki', format: 'der' }).toString('base64').substring(0, 30);
            const privPubKey = crypto.createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('base64').substring(0, 30);
            if (certPubKey === privPubKey) {
                console.log(`[SDK] ✅ Key-cert pair validated — public keys match`);
            } else {
                console.warn(`[SDK] ⚠️  Key-cert mismatch! Cert pub: ${certPubKey}... | Key pub: ${privPubKey}...`);
            }
        } catch (_) { /* cert parse failure is non-fatal for signing */ }

    } catch (e: any) {
        console.warn(`[SDK] Failed to parse/export private key as SEC1: ${e.message}. Falling back to string clean.`);
        keyB64 = privateKey
            .replace(/-----BEGIN EC PRIVATE KEY-----/g, '')
            .replace(/-----END EC PRIVATE KEY-----/g, '')
            .replace(/-----BEGIN RSA PRIVATE KEY-----/g, '')
            .replace(/-----END RSA PRIVATE KEY-----/g, '')
            .replace(/-----BEGIN PRIVATE KEY-----/g, '')
            .replace(/-----END PRIVATE KEY-----/g, '')
            .replace(/\s+/g, '');
    }

    // Robust unwrap: if certificate is double-base64 encoded (starts with TUlJ), unwrap to single base64 (MIIC)
    while (certB64.startsWith('TUlJ') || certB64.startsWith('dFVJ')) {
        try {
            const unwrapped = Buffer.from(certB64, 'base64').toString('utf-8').replace(/\s+/g, '');
            if (unwrapped.startsWith('MII') || unwrapped.startsWith('TUlJ')) {
                certB64 = unwrapped;
            } else {
                break;
            }
        } catch (_) {
            break;
        }
    }

    console.log(`[SDK] certPath content: ${certB64.substring(0, 40)}...`);
    console.log(`[SDK] keyPath content: ${keyB64.substring(0, 40)}...`);

    const certPath = writeTempFile(`cert_${timestamp}.pem`, certB64).replace(/\\/g, '/');
    const keyPath  = writeTempFile(`key_${timestamp}.pem`,  keyB64).replace(/\\/g, '/');
    const signedXmlPath = path.join(TEMP_DIR, `signed_invoice_${timestamp}.xml`).replace(/\\/g, '/');

    // Mock bypass
    if (certB64.startsWith('MOCK_') || keyB64.startsWith('MOCK_')) {
        return {
            signedXml: xmlContent.replace('</Invoice>', `<!-- Mock Signed -->\n<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignedInfo><ds:Reference><ds:DigestValue>mock_hash_content</ds:DigestValue></ds:Reference></ds:SignedInfo></ds:Signature>\n</Invoice>`),
            hash: 'mock_hash_' + Date.now(),
            qr: 'mock_qr_code_for_testing'
        };
    }

    let tempConfigPath = '';
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

        if (process.env.VERCEL && javaExe === 'java' && !fs.existsSync(javaExe)) {
             throw new Error('ZATCA SDK (Java) is not supported on Vercel Serverless Functions.');
        }

        const args = [];
        let baseCmd = '';

        if (sdkPath.toLowerCase().endsWith('.jar')) {
            baseCmd = javaExe;
            args.push('-jar', sdkPath);
        } else {
            baseCmd = sdkPath;
        }

        const sdkDir = path.dirname(sdkPath);
        const configPath = path.join(sdkDir, 'Configuration', 'config.json');
        
        const backupConfigContent = fs.readFileSync(configPath, 'utf-8');
        let signedXml = '';
        let hash = '';
        let qr = '';

        const defaultCertPath = path.join(sdkDir, 'Data', 'Certificates', 'cert.pem');
        const defaultKeyPath = path.join(sdkDir, 'Data', 'Certificates', 'ec-secp256k1-priv-key.pem');
        const backupCertContent = fs.existsSync(defaultCertPath) ? fs.readFileSync(defaultCertPath, 'utf-8') : '';
        const backupKeyContent = fs.existsSync(defaultKeyPath) ? fs.readFileSync(defaultKeyPath, 'utf-8') : '';

        try {
            let newConfigContent = backupConfigContent;
            const escapedCertPath = certPath.replace(/\//g, '\\\\');
            const escapedKeyPath = keyPath.replace(/\//g, '\\\\');
            
            newConfigContent = newConfigContent.replace(/"certPath"\s*:\s*"[^"]*"/, `"certPath": "${escapedCertPath}"`);
            newConfigContent = newConfigContent.replace(/"privateKeyPath"\s*:\s*"[^"]*"/, `"privateKeyPath": "${escapedKeyPath}"`);
            
            fs.writeFileSync(configPath, newConfigContent, 'utf-8');
            fs.writeFileSync(defaultCertPath, certB64, 'utf-8');
            fs.writeFileSync(defaultKeyPath, keyB64, 'utf-8');

            args.push('--globalVersion', '3.0.8', '-certpassword', '123456789');
            args.push('-sign', '-invoice', xmlPath, '-signedInvoice', signedXmlPath);
            if (isSimulation) args.push('-sim');

            const { stdout } = await runCommand(baseCmd, args, {
                cwd: sdkDir,
                env: {
                    ...process.env,
                    SDK_CONFIG: configPath.replace(/\\/g, '/')
                }
            });
            
            if (!fs.existsSync(signedXmlPath)) {
                throw new Error(`SDK failed to sign invoice. Output: ${stdout}`);
            }

            signedXml = fs.readFileSync(signedXmlPath, 'utf-8');
            const realInvoiceHashMatch = stdout.match(/\*\*\* INVOICE HASH = ([^\s\r\n]+)/);
            hash = realInvoiceHashMatch ? realInvoiceHashMatch[1] : (signedXml.match(/<ds:DigestValue>([^<]+)<\/ds:DigestValue>/)?.[1] || '');
            qr = extractQR(signedXml);
        } finally {
            // Always restore the original config.json and default cert files
            fs.writeFileSync(configPath, backupConfigContent, 'utf-8');
            if (backupCertContent) fs.writeFileSync(defaultCertPath, backupCertContent, 'utf-8');
            if (backupKeyContent) fs.writeFileSync(defaultKeyPath, backupKeyContent, 'utf-8');
        }
        
        return {
            signedXml,
            hash,
            qr: qr
        };

    } finally {
        deleteTempFile(xmlPath);
        deleteTempFile(certPath);
        deleteTempFile(keyPath);
        deleteTempFile(signedXmlPath);
        if (tempConfigPath) {
            deleteTempFile(tempConfigPath);
        }
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

        const configJsonPath = path.join(sdkDir, 'Configuration', 'config.json');
        const { stdout, stderr } = await runCommand(javaExe, args, {
            cwd: sdkDir,
            env: {
                ...process.env,
                SDK_CONFIG: configJsonPath
            }
        });

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

        return { isValid, errors: Array.from(new Set(errors)), warnings: Array.from(new Set(warnings)), raw: stdout };

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
    // Robust extraction: Handle various whitespace patterns between tags
    const qrBlockRegex = /<cac:AdditionalDocumentReference>\s*<cbc:ID>\s*QR\s*<\/cbc:ID>[\s\S]*?<\/cac:AdditionalDocumentReference>/;
    const match = xml.match(qrBlockRegex);

    if (match) {
        const qrBlock = match[0];
        // Capture the Base64 content from the binary object, allowing for attributes and varying whitespace
        const binaryObjectRegex = /<cbc:EmbeddedDocumentBinaryObject[^>]*>\s*([^<\s]+)\s*<\/cbc:EmbeddedDocumentBinaryObject>/;
        const binaryMatch = qrBlock.match(binaryObjectRegex);
        return binaryMatch ? binaryMatch[1].trim() : '';
    }

    return '';
};

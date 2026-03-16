import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

const getSDKSettings = () => {
    const sdkPath = process.env.ZATCA_SDK_PATH || '';
    const javaExe = process.env.JAVA_EXE_PATH || 'java';
    
    if (!sdkPath) {
        console.warn("ZATCA_SDK_PATH is not set in .env");
    }
    
    return { sdkPath, javaExe };
};

const getSdkBaseCommand = () => {
    const { sdkPath, javaExe } = getSDKSettings();
    if (sdkPath.toLowerCase().endsWith('.jar')) {
        return `"${javaExe}" -jar "${sdkPath}"`;
    }
    return `"${sdkPath}"`;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Move TEMP_DIR to /tmp for Vercel compatibility (only writable area)
const TEMP_DIR = path.join(os.tmpdir(), 'zatca-temp');

if (!fs.existsSync(TEMP_DIR)) {
    try {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    } catch (err) {
        console.error(`Failed to create TEMP_DIR: ${TEMP_DIR}`, err);
    }
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
    } catch (e) {
        console.warn(`Failed to delete temp file ${filePath}`, e);
    }
};

export const generateCSR = async (configContent: string, isSimulation: boolean = true) => {
    const timestamp = Date.now();
    const configPath = writeTempFile(`csr_config_${timestamp}.properties`, configContent);
    const keyPath = path.join(TEMP_DIR, `private_key_${timestamp}.pem`);
    const csrPath = path.join(TEMP_DIR, `csr_${timestamp}.pem`);

    try {
        // Command: fatooraNet csr -csrConfig <config> -privateKey <key> -generatedCsr <csr> -pem -sim
        // Note: The flags might vary slightly based on the specific CLI version. 
        // Based on typical usage: 
        // fatooraNet csr -csrConfig config.properties -privateKey private_key.pem -generatedCsr csr.pem -pem
        // Add -sim for simulation if required by the specific version, or it might be controlled by the config/env.

        let cmd = `${getSdkBaseCommand()} csr -csrConfig "${configPath}" -privateKey "${keyPath}" -generatedCsr "${csrPath}" -pem`;
        if (isSimulation) {
            cmd += ' -sim';
        }

        console.log(`Executing SDK CSR command: ${cmd}`);
        const { stdout, stderr } = await execAsync(cmd);
        console.log('SDK Output:', stdout);

        if (!fs.existsSync(csrPath) || !fs.existsSync(keyPath)) {
            // Fallback: Check if it generated files with slightly different names or failed silently
            throw new Error(`SDK failed to generate files. Output: ${stdout} Error: ${stderr}`);
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

export const signInvoice = async (xmlContent: string, certificate: string, privateKey: string) => {
    const timestamp = Date.now();
    const xmlPath = writeTempFile(`invoice_${timestamp}.xml`, xmlContent);
    // NOTE: The SDK expects the certificate in a file, but for some reason it's sensitive to headers/extensions.
    // Based on testing, raw base64 content WITHOUT headers works best for "Parse Certificate" step, regardless of extension (.pem/.txt).
    
    // Ensure certificate is clean (no headers, no whitespace)
    const cleanCert = certificate
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/\s/g, '');

    // Ensure private key is clean (no headers, no whitespace)
    // The SDK generates keys with headers, but seems to expect raw base64 for the sign command
    const cleanKey = privateKey
        .replace(/-----BEGIN EC PRIVATE KEY-----/g, '')
        .replace(/-----END EC PRIVATE KEY-----/g, '')
        .replace(/-----BEGIN PRIVATE KEY-----/g, '')
        .replace(/-----END PRIVATE KEY-----/g, '')
        .replace(/\s/g, '');

    // We used to write .pem, but let's try .txt just to be safe and avoid any "smart" parsing by the SDK that might expect PEM format if it sees .pem
    const certPath = writeTempFile(`cert_${timestamp}.txt`, cleanCert);
    const keyPath = writeTempFile(`key_${timestamp}.txt`, cleanKey); // Changed extension to .txt to be consistent
    const signedXmlPath = path.join(TEMP_DIR, `signed_invoice_${timestamp}.xml`);

    console.log(`[DEBUG] signInvoice cert prefix: ${cleanCert.substring(0, 10)}`);
    console.log(`[DEBUG] signInvoice key prefix: ${cleanKey.substring(0, 10)}`);

    // --- MOCK BYPASS FOR TESTING ---

    if (cleanCert.startsWith('MOCK_') || cleanKey.startsWith('MOCK_')) {
        console.log('Mock certificate detected. Returning simulated signing result.');
        return {
            signedXml: xmlContent.replace('</Invoice>', `<!-- Mock Signed -->\n<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignedInfo><ds:Reference><ds:DigestValue>mock_hash_content</ds:DigestValue></ds:Reference></ds:SignedInfo></ds:Signature>\n</Invoice>`),
            hash: 'mock_hash_' + Date.now(),
            qr: 'mock_qr_code_for_testing'
        };
    }

    try {
        // Command: fatooraNet sign -invoice <xml> -signedInvoice <out> -certificate <cert> -privateKey <key>
        const cmd = `${getSdkBaseCommand()} sign -invoice "${xmlPath}" -signedInvoice "${signedXmlPath}" -certificate "${certPath}" -privateKey "${keyPath}"`;


        console.log(`Executing SDK Sign command: ${cmd}`);
        console.log(`Certificate Path: ${certPath} (Size: ${cleanCert.length})`);
        console.log(`Private Key Path: ${keyPath} (Size: ${cleanKey.length})`);
        
        // Debug: Print first/last chars of cert to ensure no hidden chars
        if (cleanCert.length > 50) {
            console.log(`Certificate Start: '${cleanCert.substring(0, 20)}'`);
            console.log(`Certificate End: '${cleanCert.substring(cleanCert.length - 20)}'`);
        } else {
            console.log(`Certificate Content: '${cleanCert}'`);
        }

        const { stdout, stderr } = await execAsync(cmd);
        console.log('SDK Sign Output:', stdout);

        if (!fs.existsSync(signedXmlPath)) {
            throw new Error(`SDK failed to sign invoice. Output: ${stdout} Error: ${stderr}`);
        }

        const signedXml = fs.readFileSync(signedXmlPath, 'utf-8');

        // Extract Hash and QR from Signed XML
        // The SDK might have simple helpers, but parsing the output XML is reliable.

        const hashMatch = signedXml.match(/<ds:DigestValue>([^<]+)<\/ds:DigestValue>/);

        // QR extraction logic
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

export const validateInvoice = async (xmlContent: string) => {
    const { sdkPath } = getSDKSettings();
    const sdkDir = path.dirname(sdkPath);
    const sdkTempDir = path.join(sdkDir, 'temp');
    
    if (!fs.existsSync(sdkTempDir)) {
        fs.mkdirSync(sdkTempDir, { recursive: true });
    }

    const timestamp = Date.now();
    const xmlFilename = `validate_${timestamp}.xml`;
    const xmlPathInSdk = path.join(sdkTempDir, xmlFilename);
    fs.writeFileSync(xmlPathInSdk, xmlContent);

    try {
        // Run from SDK directory to resolve Data/Lib dependencies
        // Invoice path relative to sdkDir
        const relativeXmlPath = path.join('temp', xmlFilename);
        
        const cmd = `${getSdkBaseCommand()} -v -invoice "${relativeXmlPath}"`;
        console.log(`Executing SDK Validate command in ${sdkDir}: ${cmd}`);

        const { stdout, stderr } = await execAsync(cmd, { cwd: sdkDir });
        console.log('SDK Validate Command:', cmd);
        console.log('SDK Validate STDOUT:', stdout);
        console.log('SDK Validate STDERR:', stderr);

        const errors: string[] = [];
        const warnings: string[] = [];
        let isValid = true;

        // Parse stdout/stderr for [ERROR] and [WARNING]
        // Example output snippet: 2026-03-15 ... [ERROR] ... Message
        const lines = (stdout + '\n' + stderr).split('\n');
        for (const line of lines) {
            if (line.includes('[ERROR]')) {
                // Heuristic: Extract the message after [ERROR]
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

        // If SDK output implies success but we found errors, trust the errors.
        // If SDK output has no explicit errors but says "failed", mark invalid.
        if (stdout.toLowerCase().includes('failed to validate') || stderr.toLowerCase().includes('failed to validate')) {
            isValid = false;
            if (errors.length === 0) {
                errors.push("SDK Validation Failed (check logs for details)");
            }
        }

        return {
            isValid,
            errors: [...new Set(errors)], // Deduplicate
            warnings: [...new Set(warnings)],
            raw: stdout
        };

    } catch (e: any) {
        console.error('Validation SDK Execution Error:', e);
        return {
            isValid: false,
            errors: [e.message.includes('failed to validate invoice - null') ? "Invalid XML file or path (SDK Error)" : e.message],
            warnings: [],
            raw: e.stdout || e.message
        };
    } finally {
        if (xmlPathInSdk && fs.existsSync(xmlPathInSdk)) {
            try { fs.unlinkSync(xmlPathInSdk); } catch (e) {}
        }
    }
};

// Helper to extract QR from standard ZATCA XML
const extractQR = (xml: string): string => {
    // Look for the QR node
    // <cac:AdditionalDocumentReference> ... <cbc:ID>QR</cbc:ID> ... <cbc:EmbeddedDocumentBinaryObject ...> ...
    // Regex needs to be robust enough to handle new lines and potential attributes.

    // Pattern: Find <cbc:ID>QR</cbc:ID>, then look ahead for the binary object.
    // Or simplified: Just find the EmbeddedDocumentBinaryObject that likely belongs to it.
    // However, there could be other attachments.

    // Strict approach:
    // 1. Find the AdditionalDocumentReference block containing ID=QR
    // 2. Extract EmbeddedDocumentBinaryObject from that block

    // For now, using a regex that assumes standard ZATCA ordering/nesting roughly:
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

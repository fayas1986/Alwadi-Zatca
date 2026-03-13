import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SDK_PATH = process.env.ZATCA_SDK_PATH || '';

if (!SDK_PATH) {
    console.warn("ZATCA_SDK_PATH is not set in .env");
}

const getSdkBaseCommand = () => {
    if (SDK_PATH.toLowerCase().endsWith('.jar')) {
        return `java -jar "${SDK_PATH}"`;
    }
    return `"${SDK_PATH}"`;
};

const TEMP_DIR = os.tmpdir();

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

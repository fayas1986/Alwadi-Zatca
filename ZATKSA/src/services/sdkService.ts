
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';

const execAsync = promisify(exec);

const getSdkPath = () => {
    const sdkPath = process.env.ZATCA_SDK_PATH || '';
    if (!sdkPath) {
        console.warn("ZATCA_SDK_PATH is not set in .env");
    }
    return sdkPath;
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
        let cmd = `"${getSdkPath()}" csr -csrConfig "${configPath}" -privateKey "${keyPath}" -generatedCsr "${csrPath}" -pem`;
        if (isSimulation) {
            cmd += ' -sim';
        }

        console.log(`Executing SDK CSR command: ${cmd}`);
        const { stdout, stderr } = await execAsync(cmd);
        console.log('SDK Output:', stdout);

        if (!fs.existsSync(csrPath) || !fs.existsSync(keyPath)) {
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
    const certPath = writeTempFile(`cert_${timestamp}.pem`, certificate);
    const keyPath = writeTempFile(`key_${timestamp}.pem`, privateKey);
    const signedXmlPath = path.join(TEMP_DIR, `signed_invoice_${timestamp}.xml`);

    try {
        const cmd = `"${getSdkPath()}" sign -invoice "${xmlPath}" -signedInvoice "${signedXmlPath}" -certificate "${certPath}" -privateKey "${keyPath}"`;

        console.log(`Executing SDK Sign command: ${cmd}`);
        const { stdout, stderr } = await execAsync(cmd);
        console.log('SDK Sign Output:', stdout);

        if (!fs.existsSync(signedXmlPath)) {
            throw new Error(`SDK failed to sign invoice. Output: ${stdout} Error: ${stderr}`);
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

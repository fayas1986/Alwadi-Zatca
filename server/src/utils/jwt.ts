import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'Zatca#SuperSecureJwtSecretKey!2026@Alwadi';

export interface JwtPayload {
    userId: string;
    email: string;
    role: string;
    companyId?: number;
    iat?: number;
    exp?: number;
}

function base64UrlEncode(str: string | Buffer): string {
    return Buffer.from(str)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4 !== 0) {
        str += '=';
    }
    return Buffer.from(str, 'base64').toString('utf8');
}

/**
 * Signs a JWT payload with HMAC-SHA256 signature.
 */
export function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, expiresInSeconds: number = 86400): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const fullPayload: JwtPayload = {
        ...payload,
        iat: now,
        exp: now + expiresInSeconds
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    const signature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(dataToSign)
        .digest();
    const encodedSignature = base64UrlEncode(signature);

    return `${dataToSign}.${encodedSignature}`;
}

/**
 * Verifies a JWT token signature and expiration.
 * Returns payload if valid, or null if tampered/invalid/expired.
 */
export function verifyJwt(token: string): JwtPayload | null {
    try {
        if (!token || typeof token !== 'string') return null;
        const cleanToken = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
        const parts = cleanToken.split('.');
        if (parts.length !== 3) return null;

        const [encodedHeader, encodedPayload, encodedSignature] = parts;
        const dataToSign = `${encodedHeader}.${encodedPayload}`;

        const expectedSignature = base64UrlEncode(
            crypto.createHmac('sha256', JWT_SECRET).update(dataToSign).digest()
        );

        const sigBuf = Buffer.from(encodedSignature);
        const expBuf = Buffer.from(expectedSignature);

        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            return null; // Signature mismatch / tampered token
        }

        const payload: JwtPayload = JSON.parse(base64UrlDecode(encodedPayload));
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
            return null; // Expired token
        }

        return payload;
    } catch (err) {
        return null;
    }
}

import jwt, { SignOptions, VerifyOptions } from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_ISSUER = 'zatca-connect-api';
const JWT_AUDIENCE = 'zatca-connect-users';
const MIN_SECRET_LENGTH = 32;

let testEphemeralSecret: string | null = null;

/**
 * Returns the securely provisioned JWT secret from environment variables.
 * Fails startup with FATAL_JWT_CONFIG_ERROR if missing or shorter than 32 characters.
 */
export function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    
    if (secret && secret.length >= MIN_SECRET_LENGTH) {
        return secret;
    }

    if (process.env.NODE_ENV === 'test') {
        if (!testEphemeralSecret) {
            testEphemeralSecret = crypto.randomBytes(64).toString('hex');
        }
        return testEphemeralSecret;
    }

    throw new Error(
        'FATAL_JWT_CONFIG_ERROR: process.env.JWT_SECRET is missing, unconfigured, or insecure (< 32 characters).'
    );
}

export interface AuthenticatedPrincipal {
    userId: string;
    email: string;
    role: string;
    companyId?: number;
}

/**
 * Signs a JWT token with explicit HS256 algorithm, issuer, audience, and required claims.
 */
export function signJwt(principal: AuthenticatedPrincipal, expiresInSeconds: number = 3600): string {
    const secret = getJwtSecret();
    const options: SignOptions = {
        algorithm: 'HS256',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        expiresIn: expiresInSeconds,
        subject: principal.userId
    };

    const payload = {
        userId: principal.userId,
        email: principal.email.toLowerCase().trim(),
        role: principal.role,
        companyId: principal.companyId
    };

    return jwt.sign(payload, secret, options);
}

export interface VerifiedJwtPayload {
    sub: string;
    userId: string;
    email: string;
    role: string;
    companyId?: number;
    iss?: string;
    aud?: string;
    iat?: number;
    exp?: number;
}

/**
 * Verifies a JWT token's signature, algorithm, issuer, audience, schema, and expiration using jsonwebtoken.
 * Returns decoded payload if valid, or null if tampered, expired, or invalid.
 */
export function verifyJwt(token: string): VerifiedJwtPayload | null {
    try {
        if (!token || typeof token !== 'string') return null;
        const secret = getJwtSecret();
        const cleanToken = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();

        const options: VerifyOptions = {
            algorithms: ['HS256'], // Explicitly enforce HS256 algorithm ONLY
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE
        };

        const decoded = jwt.verify(cleanToken, secret, options) as VerifiedJwtPayload;

        if (!decoded || typeof decoded !== 'object') {
            return null;
        }

        // Enforce required claims & claim types
        if (!decoded.sub || typeof decoded.sub !== 'string') return null;
        if (!decoded.userId || typeof decoded.userId !== 'string') return null;
        if (!decoded.email || typeof decoded.email !== 'string') return null;
        if (!decoded.role || typeof decoded.role !== 'string') return null;
        if (!decoded.exp || typeof decoded.exp !== 'number') return null;

        // Enforce sub === userId consistency
        if (decoded.sub !== decoded.userId) {
            console.warn(`[JWT] Token claim mismatch: sub (${decoded.sub}) !== userId (${decoded.userId})`);
            return null;
        }

        return decoded;
    } catch (err: any) {
        return null;
    }
}


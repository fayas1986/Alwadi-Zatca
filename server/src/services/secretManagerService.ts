export class SecretManagerService {
  /**
   * Fetches secret value by key name.
   * Priority: Environment variable -> AWS Secrets Manager -> Azure Key Vault.
   */
  static async getSecret(secretKey: string): Promise<string | undefined> {
    const envValue = process.env[secretKey];
    if (envValue) {
      return envValue;
    }
    // Abstract hook for AWS Secrets Manager / Azure Key Vault SDKs
    return undefined;
  }

  /**
   * Sanitizes object payloads before logging to prevent exposing sensitive invoice data,
   * private keys, CSRs, or authorization headers.
   */
  static sanitizeForLogging(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;

    const SENSITIVE_KEYS = [
      'private_key',
      'secret',
      'password',
      'jwt_secret',
      'authorization',
      'd365_client_secret',
      'client_secret',
      'csid'
    ];

    const sanitized = Array.isArray(obj) ? [...obj] : { ...obj };

    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.some(s => lowerKey.includes(s))) {
        sanitized[key] = '[REDACTED_SECRET]';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = SecretManagerService.sanitizeForLogging(sanitized[key]);
      }
    }

    return sanitized;
  }
}
export default SecretManagerService;

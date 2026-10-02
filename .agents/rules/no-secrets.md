# Security Rule: Never Hardcode Secrets or Fallback Credentials

1. **Zero Hardcoded Secrets**: NEVER hardcode API keys, passwords, connection strings, JWT secrets, or tokens in source code files, whether as active variables or fallback defaults.
2. **Environment Variables Only**: All credentials must be read exclusively from `process.env`. If a required environment variable is missing, throw an explicit error (`throw new Error(...)`) instead of providing a default string.
3. **No Database URL Defaults**: Database connection strings (`DATABASE_URL`, `DIRECT_URL`) must never contain inline passwords in source files.

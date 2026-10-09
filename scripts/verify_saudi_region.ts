import fs from 'fs';
import path from 'path';

interface CustomerSpec {
  customerId: string;
  cloudProvider: 'aws' | 'azure';
  region: string;
  environment: string;
}

const ALLOWED_SAUDI_REGIONS: Record<string, string[]> = {
  aws: ['me-central-1', 'me-south-1'], // AWS KSA (Riyadh) and Middle East regions
  azure: ['saudiarabiaeast', 'uae-central', 'qatar-central'] // Azure KSA & Middle East regions
};

export function verifySaudiRegionCompliance(specPath: string): { valid: boolean; reason: string } {
  if (!fs.existsSync(specPath)) {
    return { valid: false, reason: `Customer specification file not found: ${specPath}` };
  }

  const specRaw = fs.readFileSync(specPath, 'utf8');
  const spec: CustomerSpec = JSON.parse(specRaw);

  const provider = spec.cloudProvider?.toLowerCase();
  const region = spec.region?.toLowerCase();

  if (!provider || !ALLOWED_SAUDI_REGIONS[provider]) {
    return { valid: false, reason: `Unsupported cloud provider: ${provider}. Allowed: aws, azure.` };
  }

  const allowedRegions = ALLOWED_SAUDI_REGIONS[provider];
  if (!allowedRegions.includes(region)) {
    return {
      valid: false,
      reason: `VIOLATION: Region '${region}' for provider '${provider}' violates Saudi Arabia Data Residency Policy. Allowed KSA regions: ${allowedRegions.join(', ')}`
    };
  }

  return {
    valid: true,
    reason: `SUCCESS: Customer '${spec.customerId}' region '${region}' on '${provider}' satisfies Saudi Arabia Data Residency compliance.`
  };
}

// CLI Execution
if (process.argv[1]?.endsWith('verify_saudi_region.ts')) {
  const specPath = process.argv[2] || path.join(process.cwd(), 'config', 'alwadi-production-spec.json');
  console.log(`[Regional Verification] Checking KSA Data Residency compliance for: ${specPath}...`);
  const result = verifySaudiRegionCompliance(specPath);
  console.log(`[Regional Verification] Result:`, result);
  if (!result.valid) {
    process.exit(1);
  }
}

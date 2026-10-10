import fs from 'fs';
import path from 'path';

export interface CloudRegionMetadata {
  provider: 'aws' | 'azure';
  regionCode: string;
  regionName: string;
  countryCode: 'SA' | 'AE' | 'BH' | 'QA' | 'US' | 'EU' | 'OTHER';
  countryName: string;
  isSaudiArabia: boolean;
  requiredServicesAvailable: {
    compute: boolean;      // ECS/AppRunner/ContainerApps
    database: boolean;     // RDS PostgreSQL / Azure Flexible Server
    secretManager: boolean;// SecretsManager / KeyVault
  };
}

// Authoritative Master Region Directory
export const CLOUD_REGION_DIRECTORY: Record<string, CloudRegionMetadata> = {
  // AWS REGIONS
  'aws:me-south-2': {
    provider: 'aws',
    regionCode: 'me-south-2',
    regionName: 'AWS Middle East (Saudi Arabia - Dammam)',
    countryCode: 'SA',
    countryName: 'Kingdom of Saudi Arabia',
    isSaudiArabia: true,
    requiredServicesAvailable: { compute: true, database: true, secretManager: true }
  },
  'aws:me-central-1': {
    provider: 'aws',
    regionCode: 'me-central-1',
    regionName: 'AWS Middle East (UAE - Dubai)',
    countryCode: 'AE',
    countryName: 'United Arab Emirates',
    isSaudiArabia: false, // NOT KSA!
    requiredServicesAvailable: { compute: true, database: true, secretManager: true }
  },
  'aws:me-south-1': {
    provider: 'aws',
    regionCode: 'me-south-1',
    regionName: 'AWS Middle East (Bahrain)',
    countryCode: 'BH',
    countryName: 'Bahrain',
    isSaudiArabia: false, // NOT KSA!
    requiredServicesAvailable: { compute: true, database: true, secretManager: true }
  },

  // AZURE REGIONS
  'azure:saudiarabiaeast': {
    provider: 'azure',
    regionCode: 'saudiarabiaeast',
    regionName: 'Azure Saudi Arabia East (Riyadh/Dammam)',
    countryCode: 'SA',
    countryName: 'Kingdom of Saudi Arabia',
    isSaudiArabia: true,
    requiredServicesAvailable: { compute: true, database: true, secretManager: true }
  },
  'azure:uae-central': {
    provider: 'azure',
    regionCode: 'uae-central',
    regionName: 'Azure UAE Central (Abu Dhabi)',
    countryCode: 'AE',
    countryName: 'United Arab Emirates',
    isSaudiArabia: false,
    requiredServicesAvailable: { compute: true, database: true, secretManager: true }
  },
  'azure:uae-north': {
    provider: 'azure',
    regionCode: 'uae-north',
    regionName: 'Azure UAE North (Dubai)',
    countryCode: 'AE',
    countryName: 'United Arab Emirates',
    isSaudiArabia: false,
    requiredServicesAvailable: { compute: true, database: true, secretManager: true }
  },
  'azure:qatar-central': {
    provider: 'azure',
    regionCode: 'qatar-central',
    regionName: 'Azure Qatar Central (Doha)',
    countryCode: 'QA',
    countryName: 'Qatar',
    isSaudiArabia: false,
    requiredServicesAvailable: { compute: true, database: true, secretManager: true }
  }
};

export interface ComplianceResult {
  valid: boolean;
  customerId: string;
  provider: string;
  regionCode: string;
  countryName: string;
  isSaudiArabia: boolean;
  servicesVerified: boolean;
  reason: string;
}

export function verifySaudiRegionCompliance(specPath: string): ComplianceResult {
  if (!fs.existsSync(specPath)) {
    return {
      valid: false,
      customerId: 'UNKNOWN',
      provider: 'UNKNOWN',
      regionCode: 'UNKNOWN',
      countryName: 'UNKNOWN',
      isSaudiArabia: false,
      servicesVerified: false,
      reason: `FAIL-CLOSED: Customer specification file not found at path '${specPath}'`
    };
  }

  try {
    const raw = fs.readFileSync(specPath, 'utf8');
    const spec = JSON.parse(raw);

    const customerId = spec.customerId || 'UNKNOWN';
    const provider = (spec.cloudProvider || '').toLowerCase();
    const regionCode = (spec.region || '').toLowerCase();

    const lookupKey = `${provider}:${regionCode}`;
    const regionMeta = CLOUD_REGION_DIRECTORY[lookupKey];

    // 1. Verify Region Exists in Directory
    if (!regionMeta) {
      return {
        valid: false,
        customerId,
        provider,
        regionCode,
        countryName: 'UNVERIFIED',
        isSaudiArabia: false,
        servicesVerified: false,
        reason: `FAIL-CLOSED: Region '${regionCode}' on provider '${provider}' is unknown or unverified in authoritative directory.`
      };
    }

    // 2. Strict Country Check: Must be Kingdom of Saudi Arabia (SA)
    if (!regionMeta.isSaudiArabia || regionMeta.countryCode !== 'SA') {
      return {
        valid: false,
        customerId,
        provider,
        regionCode,
        countryName: regionMeta.countryName,
        isSaudiArabia: false,
        servicesVerified: false,
        reason: `VIOLATION: Region '${regionCode}' (${regionMeta.regionName}) is located in '${regionMeta.countryName}', NOT Kingdom of Saudi Arabia. Violates KSA Data Residency requirements.`
      };
    }

    // 3. Service Availability Check
    const services = regionMeta.requiredServicesAvailable;
    const allServicesAvailable = services.compute && services.database && services.secretManager;

    if (!allServicesAvailable) {
      return {
        valid: false,
        customerId,
        provider,
        regionCode,
        countryName: regionMeta.countryName,
        isSaudiArabia: true,
        servicesVerified: false,
        reason: `FAIL-CLOSED: Region '${regionCode}' is in Saudi Arabia, but lacks required enterprise services (Compute: ${services.compute}, DB: ${services.database}, Secrets: ${services.secretManager}).`
      };
    }

    return {
      valid: true,
      customerId,
      provider,
      regionCode,
      countryName: regionMeta.countryName,
      isSaudiArabia: true,
      servicesVerified: true,
      reason: `SUCCESS: Customer '${customerId}' is provisioned in '${regionMeta.regionName}' (${regionCode}), satisfying Saudi Arabia Data Residency laws and service requirements.`
    };
  } catch (err: any) {
    return {
      valid: false,
      customerId: 'ERROR',
      provider: 'ERROR',
      regionCode: 'ERROR',
      countryName: 'ERROR',
      isSaudiArabia: false,
      servicesVerified: false,
      reason: `FAIL-CLOSED: Parse error in specification: ${err.message}`
    };
  }
}

// CLI Execution
if (process.argv[1]?.endsWith('verify_saudi_region.ts')) {
  const specPath = process.argv[2] || path.join(process.cwd(), 'config', 'alwadi-production-spec.json');
  console.log(`[Saudi Residency Audit] Auditing: ${specPath}...`);
  const result = verifySaudiRegionCompliance(specPath);
  console.log(`[Saudi Residency Audit] Result:`, JSON.stringify(result, null, 2));
  if (!result.valid) {
    console.error(`[Saudi Residency Audit] ❌ REJECTED: ${result.reason}`);
    process.exit(1);
  } else {
    console.log(`[Saudi Residency Audit] ✅ APPROVED: ${result.reason}`);
  }
}

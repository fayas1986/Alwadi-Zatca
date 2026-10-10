import { describe, it, expect } from 'vitest';
import { 
  validateDatabaseUrlForEnvironment, 
  FatalDatabaseSecurityError 
} from '../lib/prisma.js';

describe('Prisma Production Database Guard Unit Test Suite', () => {
  it('1. Rejects Neon production URL in test environment', () => {
    const neonUrl = 'postgresql://neondb_owner:pass@ep-still-firefly-b3vitsw9-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
    
    expect(() => {
      validateDatabaseUrlForEnvironment(neonUrl, true);
    }).toThrow(FatalDatabaseSecurityError);

    expect(() => {
      validateDatabaseUrlForEnvironment(neonUrl, true);
    }).toThrow(/Test environment cannot connect to production host or database identifier matching 'neon.tech'/i);
  });

  it('2. Rejects alternate production hostnames and connection aliases containing prod-db or production', () => {
    const prodDbAlias = 'postgresql://db_user:pass@prod-db.internal.cloud:5432/my_app';
    
    expect(() => {
      validateDatabaseUrlForEnvironment(prodDbAlias, true);
    }).toThrow(/matching 'prod-db'/i);
  });

  it('3. Rejects production database name neondb even on unrecognized hosts', () => {
    const neondbUrl = 'postgresql://admin:secret@custom-host.org:5432/neondb';
    
    expect(() => {
      validateDatabaseUrlForEnvironment(neondbUrl, true);
    }).toThrow(/matching 'neondb'/i);
  });

  it('4. Rejects production database name alwadi_zatca_prod', () => {
    const prodDbNameUrl = 'postgresql://admin:secret@custom-host.org:5432/alwadi_zatca_prod';
    
    expect(() => {
      validateDatabaseUrlForEnvironment(prodDbNameUrl, true);
    }).toThrow(/matching 'alwadi_zatca_prod'/i);
  });

  it('5. Rejects missing or empty database connection URL', () => {
    expect(() => {
      validateDatabaseUrlForEnvironment('', true);
    }).toThrow(/Database connection URL is missing or empty/i);

    expect(() => {
      validateDatabaseUrlForEnvironment(undefined, true);
    }).toThrow(/Database connection URL is missing or empty/i);
  });

  it('6. Rejects unapproved host and unapproved database name combination', () => {
    const unapprovedUrl = 'postgresql://user:pass@external-unknown-db.com:5432/unknown_db';
    
    expect(() => {
      validateDatabaseUrlForEnvironment(unapprovedUrl, true);
    }).toThrow(/does not match approved test host allowlist/i);
  });

  it('7. Accepts approved test host localhost with approved test database alwadi_zatca_local', () => {
    const validLocalUrl = 'postgresql://postgres:postgrespassword@localhost:5432/alwadi_zatca_local?sslmode=disable';
    const result = validateDatabaseUrlForEnvironment(validLocalUrl, true);
    expect(result).toBe(validLocalUrl);
  });

  it('8. Accepts approved test host 127.0.0.1 with test_alwadi_zatca database', () => {
    const valid127Url = 'postgresql://test_user:test_pass@127.0.0.1:5432/test_alwadi_zatca';
    const result = validateDatabaseUrlForEnvironment(valid127Url, true);
    expect(result).toBe(valid127Url);
  });

  it('9. Accepts approved test host postgres (Docker Compose container)', () => {
    const validDockerUrl = 'postgresql://postgres:postgrespassword@postgres:5432/alwadi_zatca_local';
    const result = validateDatabaseUrlForEnvironment(validDockerUrl, true);
    expect(result).toBe(validDockerUrl);
  });
});

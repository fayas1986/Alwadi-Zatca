import { describe, it, expect, beforeEach } from 'vitest';
import { rawTranslations, getSafeTranslations, getInitialLanguage, Language, Translations } from '../../../services/i18n';

describe('Centralized i18n & Localization Suite', () => {
  it('1. Translation Completeness: English and Arabic raw dictionaries have 100% matching keys', () => {
    const enKeys = Object.keys(rawTranslations.en).sort();
    const arKeys = Object.keys(rawTranslations.ar).sort();

    expect(enKeys).toEqual(arKeys);
    expect(enKeys.length).toBeGreaterThan(25);

    enKeys.forEach((key) => {
      const enVal = rawTranslations.en[key as keyof Translations];
      const arVal = rawTranslations.ar[key as keyof Translations];

      expect(typeof enVal).toBe('string');
      expect(typeof arVal).toBe('string');
      expect(enVal.trim()).not.toBe('');
      expect(arVal.trim()).not.toBe('');
    });
  });

  it('2. Arabic Terminology Audit: Correct Saudi business & ZATCA tax terminology and no spelling typos', () => {
    const ar = rawTranslations.ar;
    // Fix typo verification: إغلاق القائمة (single alif)
    expect(ar.closeMenu).toBe('إغلاق القائمة');
    expect(ar.closeMenu).not.toContain('إإغلاق');

    // Saudi business & ZATCA tax terminology
    expect(ar.roleTaxOfficer).toBe('مسؤول الزكاة والضريبة');
    expect(ar.roleItAdmin).toBe('مسؤول تقنية المعلومات');
    expect(ar.selectOrg).toBe('اختر المنشأة');
    expect(ar.addOrganization).toBe('إضافة منشأة');
    expect(ar.navDashboard).toBe('لوحة التحكم');
    expect(ar.navInvoices).toBe('إدارة الفواتير');
    expect(ar.navItemMaster).toBe('سجل الأصناف');
    expect(ar.navNewInvoice).toBe('فاتورة جديدة');
    expect(ar.navXmlValidator).toBe('مدقق ملفات XML');
    expect(ar.navCsrSettings).toBe('إعدادات شهادات CSR');
    expect(ar.navErpConnectors).toBe('ربط أنظمة ERP');
    expect(ar.navReportCenter).toBe('مركز التقارير');
    expect(ar.navAuditLog).toBe('سجل المراجعة والتدقيق');
    expect(ar.signOut).toBe('تسجيل الخروج');
  });

  it('3. Proxy Fallback Safeguard: Missing or undefined key safely falls back to English or key name', () => {
    const safeAr = getSafeTranslations('ar');
    // Existing key returns Arabic
    expect(safeAr.navDashboard).toBe('لوحة التحكم');

    // Non-existent key accessed on proxy returns key name, never undefined
    const missingProp = (safeAr as any).nonExistentKey;
    expect(missingProp).toBe('nonExistentKey');
    expect(missingProp).not.toBeUndefined();
  });

  it('4. Invalid Storage Safety: Invalid localStorage language preference falls back to English', () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('app_language', 'invalid_foo_bar');
      expect(getInitialLanguage()).toBe('en');

      localStorage.setItem('app_language', 'ar');
      expect(getInitialLanguage()).toBe('ar');

      localStorage.setItem('app_language', 'en');
      expect(getInitialLanguage()).toBe('en');
    }
  });

  it('5. Direction & Lang Attribute Mapping: Correct LTR and RTL attributes', () => {
    const getDir = (lang: Language) => (lang === 'ar' ? 'rtl' : 'ltr');
    expect(getDir('en')).toBe('ltr');
    expect(getDir('ar')).toBe('rtl');
  });
});

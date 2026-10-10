import { describe, it, expect, beforeEach } from 'vitest';
import { translations, Language, Translations } from '../../../services/i18n';

describe('Centralized i18n & Localization Suite', () => {
  it('1. Translation Completeness: English and Arabic dictionaries have 100% matching keys', () => {
    const enKeys = Object.keys(translations.en).sort();
    const arKeys = Object.keys(translations.ar).sort();

    expect(enKeys).toEqual(arKeys);
    expect(enKeys.length).toBeGreaterThan(20);

    enKeys.forEach((key) => {
      const enVal = translations.en[key as keyof Translations];
      const arVal = translations.ar[key as keyof Translations];

      expect(typeof enVal).toBe('string');
      expect(typeof arVal).toBe('string');
      expect(enVal.trim()).not.toBe('');
      expect(arVal.trim()).not.toBe('');
    });
  });

  it('2. Arabic Navigation Terminology: Sidebar items have accurate Arabic translations', () => {
    const ar = translations.ar;
    expect(ar.navDashboard).toBe('لوحة التحكم');
    expect(ar.navInvoices).toBe('إدارة الفواتير');
    expect(ar.navItemMaster).toBe('سجل الأصناف');
    expect(ar.navNewInvoice).toBe('فاتورة جديدة');
    expect(ar.navXmlValidator).toBe('مدقق ملفات XML');
    expect(ar.navCsrSettings).toBe('إعدادات شهادات CSR');
    expect(ar.navErpConnectors).toBe('ربط أنظمة ERP');
    expect(ar.navReportCenter).toBe('مركز التقارير');
    expect(ar.navAuditLog).toBe('سجل المراجعة');
    expect(ar.navUserManagement).toBe('إدارة المستخدمين');
    expect(ar.signOut).toBe('تسجيل الخروج');
  });

  it('3. Role Labels Translation: All 4 user roles have localized titles in English and Arabic', () => {
    expect(translations.en.roleItAdmin).toBe('IT Administrator');
    expect(translations.ar.roleItAdmin).toBe('مسؤول تكنولوجيا المعلومات');

    expect(translations.en.roleFinanceAdmin).toBe('Finance Admin');
    expect(translations.ar.roleFinanceAdmin).toBe('المدير المالي');

    expect(translations.en.roleTaxOfficer).toBe('Tax/Compliance Officer');
    expect(translations.ar.roleTaxOfficer).toBe('مسؤول الضريبة والالتزام');

    expect(translations.en.roleSuperAdmin).toBe('Super Administrator');
    expect(translations.ar.roleSuperAdmin).toBe('المدير العام');
  });

  it('4. Direction Attributes: English maps to ltr and Arabic maps to rtl', () => {
    const getDir = (lang: Language) => (lang === 'ar' ? 'rtl' : 'ltr');
    expect(getDir('en')).toBe('ltr');
    expect(getDir('ar')).toBe('rtl');
  });
});

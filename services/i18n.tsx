import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'en' | 'ar';

export interface Translations {
  // Brand & Shell
  brandName: string;
  brandTagline: string;
  
  // Navigation Sections
  menuHeader: string;
  saasConsoleHeader: string;

  // Standard Navigation Items
  navDashboard: string;
  navInvoices: string;
  navItemMaster: string;
  navNewInvoice: string;
  navXmlValidator: string;
  navCsrSettings: string;
  navErpConnectors: string;
  navReportCenter: string;
  navAuditLog: string;

  // Admin Navigation Items
  navUserManagement: string;
  navReportDesigner: string;
  navApiDocs: string;

  // Settings & Account
  navSettings: string;
  myAccount: string;
  saasMasterConsole: string;
  signOut: string;
  loggedInAs: string;

  // Roles
  roleItAdmin: string;
  roleFinanceAdmin: string;
  roleTaxOfficer: string;
  roleSuperAdmin: string;

  // Organization & Branch Switcher
  selectOrg: string;
  branches: string;
  addOrganization: string;
  currentBranch: string;
  deleteOrg: string;

  // Environments
  envSimulation: string;
  envSandbox: string;
  envProduction: string;

  // Controls & Tooltips
  collapseSidebar: string;
  expandSidebar: string;
  closeMenu: string;
  openMobileMenu: string;
  notifications: string;

  // Header Titles
  titleDashboard: string;
  titleInvoices: string;
  titleCreateInvoice: string;
  titleInvoiceDetail: string;
  titleItems: string;
  titleCertificates: string;
  titleErpConnectors: string;
  titleAudit: string;
  titleReports: string;
  titleReportDesigner: string;
  titleSettings: string;

  // Language Selector
  language: string;
  english: string;
  arabic: string;
}

export const rawTranslations: Record<Language, Translations> = {
  en: {
    brandName: 'ZATCAConnect',
    brandTagline: 'Phase 2 E-Invoicing Platform',
    
    menuHeader: 'Menu',
    saasConsoleHeader: 'SaaS Console',

    navDashboard: 'Dashboard',
    navInvoices: 'Invoices',
    navItemMaster: 'Item Master',
    navNewInvoice: 'New Invoice',
    navXmlValidator: 'XML Validator',
    navCsrSettings: 'CSR Settings',
    navErpConnectors: 'ERP Connectors',
    navReportCenter: 'Report Center',
    navAuditLog: 'Audit Log',

    navUserManagement: 'User Management',
    navReportDesigner: 'Report Designer',
    navApiDocs: 'API Docs',

    navSettings: 'Settings',
    myAccount: 'My Account',
    saasMasterConsole: 'SaaS Master Console',
    signOut: 'Sign Out',
    loggedInAs: 'Logged in as',

    roleItAdmin: 'IT Administrator',
    roleFinanceAdmin: 'Finance Admin',
    roleTaxOfficer: 'Tax/Compliance Officer',
    roleSuperAdmin: 'Super Administrator',

    selectOrg: 'Select Org',
    branches: 'Branches',
    addOrganization: 'Add Organization',
    currentBranch: 'Current Branch',
    deleteOrg: 'Delete',

    envSimulation: 'Simulation',
    envSandbox: 'Sandbox Replica',
    envProduction: 'Live Production',

    collapseSidebar: 'Collapse Sidebar',
    expandSidebar: 'Expand Sidebar',
    closeMenu: 'Close Menu',
    openMobileMenu: 'Open Mobile Menu',
    notifications: 'Notifications',

    titleDashboard: 'Compliance Overview',
    titleInvoices: 'Invoice Management',
    titleCreateInvoice: 'Invoice Generation',
    titleInvoiceDetail: 'Invoice Details',
    titleItems: 'Item Master',
    titleCertificates: 'CSR Settings',
    titleErpConnectors: 'ERP Integration Hub',
    titleAudit: 'System Audit Log',
    titleReports: 'Report Center',
    titleReportDesigner: 'Report Designer',
    titleSettings: 'System Config',

    language: 'Language',
    english: 'English',
    arabic: 'العربية'
  },
  ar: {
    brandName: 'منصة ربط زكاة',
    brandTagline: 'منظومة الفوترة الإلكترونية المرحلة الثانية',
    
    menuHeader: 'القائمة الرئيسية',
    saasConsoleHeader: 'وحدة التحكم الإدارية',

    navDashboard: 'لوحة التحكم',
    navInvoices: 'إدارة الفواتير',
    navItemMaster: 'سجل الأصناف',
    navNewInvoice: 'فاتورة جديدة',
    navXmlValidator: 'مدقق ملفات XML',
    navCsrSettings: 'إعدادات شهادات CSR',
    navErpConnectors: 'ربط أنظمة ERP',
    navReportCenter: 'مركز التقارير',
    navAuditLog: 'سجل المراجعة والتدقيق',

    navUserManagement: 'إدارة المستخدمين',
    navReportDesigner: 'مصمم التقارير',
    navApiDocs: 'توثيق الواجهات',

    navSettings: 'الإعدادات',
    myAccount: 'حسابي',
    saasMasterConsole: 'لوحة التحكم الرئيسية',
    signOut: 'تسجيل الخروج',
    loggedInAs: 'مسجل كـ',

    roleItAdmin: 'مسؤول تقنية المعلومات',
    roleFinanceAdmin: 'المدير المالي',
    roleTaxOfficer: 'مسؤول الزكاة والضريبة',
    roleSuperAdmin: 'المدير العام',

    selectOrg: 'اختر المنشأة',
    branches: 'الفروع',
    addOrganization: 'إضافة منشأة',
    currentBranch: 'الفرع الحالي',
    deleteOrg: 'حذف',

    envSimulation: 'محاكاة',
    envSandbox: 'بيئة اختبار',
    envProduction: 'الإنتاج الحي',

    collapseSidebar: 'طي القائمة',
    expandSidebar: 'توسيع القائمة',
    closeMenu: 'إغلاق القائمة',
    openMobileMenu: 'فتح القائمة',
    notifications: 'الإشعارات',

    titleDashboard: 'نظرة عامة على الالتزام الضريبي',
    titleInvoices: 'إدارة الفواتير',
    titleCreateInvoice: 'إنشاء فاتورة',
    titleInvoiceDetail: 'تفاصيل الفاتورة',
    titleItems: 'سجل الأصناف',
    titleCertificates: 'إعدادات شهادات الفوترة',
    titleErpConnectors: 'مركز ربط أنظمة ERP',
    titleAudit: 'سجل مراجعة وتدقيق النظام',
    titleReports: 'مركز التقارير',
    titleReportDesigner: 'مصمم التقارير',
    titleSettings: 'إعدادات النظام',

    language: 'اللغة',
    english: 'English',
    arabic: 'العربية'
  }
};

/**
 * Creates a Proxy for translations that safely falls back to English,
 * and if missing in English, returns the key name rather than undefined.
 */
export function getSafeTranslations(lang: Language): Translations {
  const primary = rawTranslations[lang] || rawTranslations.en;
  const fallback = rawTranslations.en;

  return new Proxy(primary, {
    get(target, prop: string) {
      if (prop in target && (target as any)[prop] !== undefined) {
        return (target as any)[prop];
      }
      if (prop in fallback && (fallback as any)[prop] !== undefined) {
        return (fallback as any)[prop];
      }
      return prop;
    }
  });
}

export const translations: Record<Language, Translations> = {
  en: getSafeTranslations('en'),
  ar: getSafeTranslations('ar')
};

const STORAGE_KEY = 'app_language';

export function getInitialLanguage(): Language {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'ar' || saved === 'en') {
        return saved;
      }
    }
  } catch (e) {
    console.warn('Unable to read language preference from localStorage', e);
  }
  return 'en';
}

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
  dir: 'ltr' | 'rtl';
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function applyLanguageToDocument(lang: Language) {
  if (typeof document !== 'undefined') {
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }
}

// Apply immediately on module load
applyLanguageToDocument(getInitialLanguage());

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  const setLanguage = (lang: Language) => {
    const validLang: Language = lang === 'ar' ? 'ar' : 'en';
    setLanguageState(validLang);
    applyLanguageToDocument(validLang);
    try {
      localStorage.setItem(STORAGE_KEY, validLang);
    } catch (e) {
      console.warn('Unable to save language preference to localStorage', e);
    }
  };

  useEffect(() => {
    applyLanguageToDocument(language);
  }, [language]);

  const value: LanguageContextType = {
    language,
    setLanguage,
    t: getSafeTranslations(language),
    dir: language === 'ar' ? 'rtl' : 'ltr',
    isRTL: language === 'ar'
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    const lang = getInitialLanguage();
    return {
      language: lang,
      setLanguage: () => {},
      t: getSafeTranslations(lang),
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      isRTL: lang === 'ar'
    };
  }
  return context;
};

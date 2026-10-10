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

export const translations: Record<Language, Translations> = {
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
    brandName: 'ربط الفاتورة الرقمية',
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
    navAuditLog: 'سجل المراجعة',

    navUserManagement: 'إدارة المستخدمين',
    navReportDesigner: 'مصمم التقارير',
    navApiDocs: 'توثيق الواجهات',

    navSettings: 'الإعدادات',
    myAccount: 'حسابي',
    saasMasterConsole: 'لوحة التحكم الرئيسية',
    signOut: 'تسجيل الخروج',
    loggedInAs: 'مسجل كـ',

    roleItAdmin: 'مسؤول تكنولوجيا المعلومات',
    roleFinanceAdmin: 'المدير المالي',
    roleTaxOfficer: 'مسؤول الضريبة والالتزام',
    roleSuperAdmin: 'المدير العام',

    selectOrg: 'اختر المؤسسة',
    branches: 'الفروع',
    addOrganization: 'إضافة مؤسسة',
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

    titleDashboard: 'نظرة عامة على الالتزام',
    titleInvoices: 'إدارة الفواتير',
    titleCreateInvoice: 'إنشاء فاتورة جديدة',
    titleInvoiceDetail: 'تفاصيل الفاتورة',
    titleItems: 'سجل الأصناف',
    titleCertificates: 'إعدادات شهادات CSR',
    titleErpConnectors: 'مركز ربط أنظمة ERP',
    titleAudit: 'سجل مراجعة النظام',
    titleReports: 'مركز التقارير',
    titleReportDesigner: 'مصمم التقارير',
    titleSettings: 'تكوين النظام',

    language: 'اللغة',
    english: 'English',
    arabic: 'العربية'
  }
};

const STORAGE_KEY = 'app_language';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
  dir: 'ltr' | 'rtl';
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'ar' || saved === 'en') {
        return saved;
      }
    } catch (e) {
      console.warn('Unable to read language preference from localStorage', e);
    }
    return 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      console.warn('Unable to save language preference to localStorage', e);
    }
  };

  useEffect(() => {
    const dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
  }, [language]);

  const value: LanguageContextType = {
    language,
    setLanguage,
    t: translations[language],
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
    // Fallback if rendered outside provider for testing or isolation
    const lang: Language = typeof document !== 'undefined' && document.documentElement.lang === 'ar' ? 'ar' : 'en';
    return {
      language: lang,
      setLanguage: () => {},
      t: translations[lang],
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      isRTL: lang === 'ar'
    };
  }
  return context;
};

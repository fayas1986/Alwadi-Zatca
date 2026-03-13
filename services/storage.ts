
// Browser LocalStorage Wrapper

const PREFIX = 'zatca_sim_';

export const KEYS = {
    INVOICES: `${PREFIX}invoices`,
    CERTIFICATES: `${PREFIX}certificates`,
    AUDIT_LOGS: `${PREFIX}audit_logs`,
    ORGANIZATIONS: `${PREFIX}organizations`,
    ERPS: `${PREFIX}erps`
};

export const loadFromStorage = <T>(key: string, defaultValue: T): T => {
    if (typeof window === 'undefined') return defaultValue;
    
    try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : defaultValue;
    } catch (e) {
        console.warn(`Failed to load ${key} from storage`, e);
        return defaultValue;
    }
};

export const saveToStorage = <T>(key: string, data: T): void => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.error(`Failed to save ${key} to storage`, e);
    }
};

export const clearStorage = () => {
    Object.values(KEYS).forEach(key => localStorage.removeItem(key));
};

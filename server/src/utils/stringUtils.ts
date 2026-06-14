export const getSafeString = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) {
        if (value.length === 0) return '';
        const first = value[0];
        if (first === null || first === undefined) return '';
        return String(first);
    }
    return String(value);
};

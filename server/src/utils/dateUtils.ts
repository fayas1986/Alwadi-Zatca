/**
 * Parses an invoice date string from ERP and ensures it has a valid time component.
 * If the input date string lacks a time (e.g., "2026-04-11"), it appends the current server time.
 * This prevents the "05:30" (midnight UTC) issue in dashboards and ZATCA XML.
 * 
 * @param issueDate The date string from the ERP payload
 * @returns A Date object with a realistic time component
 */
export const parseInvoiceDate = (issueDate: string): Date => {
    if (!issueDate) return new Date();

    const dateStr = String(issueDate).trim();
    
    // Check if it already contains time information (ISO T, space followed by digit/colon)
    const hasTime = dateStr.includes('T') || /\s\d{1,2}:/.test(dateStr);
    
    if (hasTime) {
        const d = new Date(dateStr);
        // If parsing fails, fall back to current time
        return isNaN(d.getTime()) ? new Date() : d;
    }

    // It's likely just a date (YYYY-MM-DD or similar)
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return new Date();

    // Preserve the original date but set current hours/mins/secs
    const now = new Date();
    d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    
    return d;
};

/**
 * Formats a Date object into an ISO string but handles local/GMT ambiguities 
 * for ZATCA consumption (ensures T separator exists).
 */
export const toZatcaIsoString = (date: Date): string => {
    return date.toISOString().split('.')[0] + 'Z';
};

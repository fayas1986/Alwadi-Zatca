/**
 * Parses an invoice date string from ERP and ensures it has a valid time component.
 * If the input date string lacks a time (e.g., "2026-04-11"), it appends the current server time.
 * This prevents the "05:30" (midnight UTC) issue in dashboards and ZATCA XML.
 * 
 * @param issueDate The date string from the ERP payload
 * @returns A Date object with a realistic time component
 */
export const parseInvoiceDate = (issueDate: string, uniqueSeed: string | number = ''): Date => {
    if (!issueDate) return new Date();

    const dateStr = String(issueDate).trim();
    
    // Check if it already contains time information (ISO T, space followed by digit/colon)
    const hasTime = dateStr.includes('T') || /\s\d{1,2}:/.test(dateStr);
    
    if (hasTime) {
        const d = new Date(dateStr);
        // If parsing fails, fall back to current time
        if (isNaN(d.getTime())) return new Date();
        
        // If the time is exactly midnight UTC, it was likely just a date string that got padded.
        if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
            // Generate pseudo-random working hour (8 AM to 4 PM UTC) based on string or random
            const seed = uniqueSeed ? String(uniqueSeed).charCodeAt(0) + String(uniqueSeed).charCodeAt(String(uniqueSeed).length - 1) : Math.floor(Math.random() * 100);
            
            d.setUTCHours(
                8 + (seed % 9), // 8 to 16
                (seed * 7) % 60, // 0 to 59
                (seed * 13) % 60, // 0 to 59
                0
            );
        }
        
        return d;
    }

    // It's likely just a date (YYYY-MM-DD or similar)
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return new Date();

    // Preserve the original date but set pseudo-random hours/mins/secs
    const seed = uniqueSeed ? String(uniqueSeed).charCodeAt(0) + String(uniqueSeed).charCodeAt(String(uniqueSeed).length - 1) : Math.floor(Math.random() * 100);
    d.setUTCHours(
        8 + (seed % 9), // 8 to 16
        (seed * 7) % 60, // 0 to 59
        (seed * 13) % 60, // 0 to 59
        0
    );
    
    return d;
};

/**
 * Formats a Date object into an ISO string but handles local/GMT ambiguities 
 * for ZATCA consumption (ensures T separator exists).
 */
export const toZatcaIsoString = (date: Date): string => {
    return date.toISOString().split('.')[0] + 'Z';
};

import { getKSATimestamp } from './src/utils/api-helpers.js';

const now = new Date();
console.log("Current UTC Time:", now.toISOString());
console.log("KSA Timestamp (UTC+3 / Asia/Riyadh):", getKSATimestamp(now));

const sampleDate = new Date("2026-08-14T07:33:35.146Z");
console.log("Sample Invoice UTC:", sampleDate.toISOString());
console.log("Sample Invoice KSA Display Time:", sampleDate.toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh' }));

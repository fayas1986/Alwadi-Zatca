import { getKSATimestamp } from './src/utils/api-helpers.js';

const now = new Date();
const ksaRealTime = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh', hour12: false });
console.log("Current System Date (India Time usually):", now.toString());
console.log("KSA Real-time (Asia/Riyadh):", ksaRealTime);
console.log("ZATCA formatted IssueDate:", `${now.toISOString().split('T')[0]}T${ksaRealTime}+03:00`);

import './lib/env.js';
import QueueService from './services/queueService.js';
import SyncService from './services/syncService.js';
import KeyRotationService from './services/keyRotationService.js';
import KeepAliveService from './services/keepAliveService.js';

console.log('[Worker] Starting Alwadi-Zatca Background Queue & Sync Worker...');

// Start keep-alive heartbeat
KeepAliveService.start();

// Start API Key Rotation Service
KeyRotationService.start();

// Start Queue Service and Sync Loop
QueueService.resume()
  .then(() => {
    console.log('[Worker] Background queue resumed successfully.');
    SyncService.start();
  })
  .catch((err) => {
    console.error('[Worker] Fatal error resuming background worker:', err);
    process.exit(1);
  });

// Handle graceful shutdown
const gracefulShutdown = (signal: string) => {
  console.log(`[Worker] Received ${signal}. Initiating graceful worker shutdown...`);
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

'use strict';

require('dotenv').config();
const app = require('./src/app');
const logger = require('./src/utils/logger');
const { runMigrations } = require('./src/db/migrate');

const PORT = process.env.PORT || 3000;
const ENV = process.env.NODE_ENV || 'development';

(async () => {
  // Run DB migrations on startup (idempotent)
  await runMigrations();

  app.listen(PORT, () => {
    logger.info(`LOCI API server running`, {
      port: PORT,
      env: ENV,
      version: process.env.LOCI_API_VERSION || 'v1',
    });
  });
})();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
});

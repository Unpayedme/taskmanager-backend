import { stopLocalDatabase } from './local-database.mjs';
try { stopLocalDatabase(); }
catch (error) { console.error(`Could not stop the local database: ${error.message}`); process.exit(1); }

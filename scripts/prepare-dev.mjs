import { applyMigrations, createEnvironment, readEnvironment, startLocalDatabase } from './local-database.mjs';

try {
  if (!readEnvironment()) createEnvironment();
  if (startLocalDatabase()) applyMigrations();
} catch (error) {
  console.error(`Development setup failed: ${error.message}`);
  process.exit(1);
}

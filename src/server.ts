import app from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { startSessionMaintenance } from './services/maintenance.service.js';

try {
  await prisma.$connect();
  const server = app.listen(env.PORT, '0.0.0.0');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  console.log(`Task Manager API listening on port ${env.PORT}`);
  const stopMaintenance = env.NODE_ENV === 'production' ? startSessionMaintenance() : () => {};
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    stopMaintenance();
    server.close(() => { void prisma.$disconnect().then(() => process.exit(0), () => process.exit(1)); });
    server.closeIdleConnections();
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch {
  console.error('API startup failed. Check PostgreSQL connectivity, migrations and the configured port.');
  await prisma.$disconnect();
  process.exit(1);
}

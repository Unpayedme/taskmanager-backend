import app from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';

try {
  await prisma.$connect();
  const server = app.listen(env.PORT, () => console.log(`Task Manager API listening on http://localhost:${env.PORT}`));
  const shutdown = () => {
    server.close(() => { void prisma.$disconnect().finally(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch {
  console.error('Unable to connect to PostgreSQL. Check DATABASE_URL and apply the database migrations.');
  process.exit(1);
}

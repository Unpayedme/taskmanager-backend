process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://taskmanager_test@127.0.0.1:15432/taskmanager_test';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret-with-more-than-32-characters';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-with-more-than-32-characters';
process.env.COOKIE_SAME_SITE = 'lax';
process.env.TRUST_PROXY = '0';

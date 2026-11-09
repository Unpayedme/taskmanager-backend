import 'dotenv/config';
process.env.NODE_ENV = 'production';
try {
  await import('../src/config/env.js');
  console.log('Production configuration is valid. No secret values were printed.');
} catch (error) {
  const issues = error && typeof error === 'object' && 'issues' in error ? error.issues : null;
  if (Array.isArray(issues)) for (const issue of issues) console.error(`${issue.path.join('.') || 'configuration'}: ${issue.message}`);
  else console.error('Production configuration validation failed.');
  process.exitCode = 1;
}

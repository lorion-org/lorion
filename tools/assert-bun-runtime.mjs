import process from 'node:process';

if (!process.versions.bun) {
  throw new Error('The Bun compatibility suite must execute its test workers with Bun.');
}

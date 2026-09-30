import { defineConfig } from 'vitest/config';

// Separate from vitest.config.ts on purpose: these tests hit a real
// Postgres (TEST_DATABASE_URL) and must never run as part of `npm test`,
// which stays green with no database available.
export default defineConfig({
  test: {
    include: ['server/**/*.test.ts'],
    environment: 'node',
  },
});

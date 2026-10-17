import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    // Keep out e2e/: Playwright's test.describe() throws under vitest.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'localnet/*.test.ts', 'light/*.test.ts', 'marks/*.test.ts', '*.test.ts'],
  },
})

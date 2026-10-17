import { defineConfig, devices } from '@playwright/test'

// The test names exist only inside the browsers, so a proxy in the environment cannot resolve them.
const LOCAL_NAMES = ['sigil.test', 'altar.test']
for (const key of ['NO_PROXY', 'no_proxy']) process.env[key] = [process.env[key], ...LOCAL_NAMES].filter(Boolean).join(',')

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: 'http://127.0.0.1:4178',
    trace: 'retain-on-failure',
  },
  projects: [
    // sigil.test and altar.test resolve to this machine: plain http on a name that is not loopback.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: [`--host-resolver-rules=${LOCAL_NAMES.map((name) => `MAP ${name} 127.0.0.1`).join(', ')}`] } },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], launchOptions: { firefoxUserPrefs: { 'network.dns.localDomains': LOCAL_NAMES.join(',') } } },
    },
  ],
  webServer: {
    command: 'node scripts/serve.mjs dist 4178',
    url: 'http://127.0.0.1:4178/altar/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})

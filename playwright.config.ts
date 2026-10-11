import { defineConfig, devices } from '@playwright/test';

/**
 * Browser end-to-end tests. Boots an isolated game server (in-memory store,
 * test hooks ON) on :2600 and the Vite client on :5190.
 * Voice tests additionally need a LiveKit server (see README → Voice).
 */
const SERVER_PORT = 2600;
const WEB_PORT = 5190;
const livekit = process.env.E2E_LIVEKIT_URL ?? 'ws://127.0.0.1:7880';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    viewport: { width: 1366, height: 820 },
    trace: 'retain-on-failure',
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
    permissions: ['microphone'],
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 820 } } },
  ],
  webServer: [
    {
      command: 'npm run dev -w @corp/server',
      port: SERVER_PORT,
      reuseExistingServer: false,
      env: {
        PORT: String(SERVER_PORT),
        ENABLE_TEST_HOOKS: 'true',
        DATABASE_URL: '',
        REDIS_URL: '',
        LIVEKIT_URL: process.env.E2E_NO_VOICE ? '' : livekit,
        LIVEKIT_API_KEY: process.env.E2E_NO_VOICE ? '' : (process.env.E2E_LIVEKIT_KEY ?? 'devkey'),
        LIVEKIT_API_SECRET: process.env.E2E_NO_VOICE ? '' : (process.env.E2E_LIVEKIT_SECRET ?? 'secret'),
        SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret',
      },
      stdout: 'ignore',
    },
    {
      command: `npm run dev -w @corp/web -- --port ${WEB_PORT} --strictPort`,
      port: WEB_PORT,
      reuseExistingServer: false,
      env: { GAME_SERVER_URL: `http://localhost:${SERVER_PORT}` },
    },
  ],
});

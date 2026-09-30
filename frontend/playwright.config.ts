import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'
const python =
  process.env.E2E_PYTHON ||
  fileURLToPath(
    new URL(
      process.platform === 'win32' ? '../.venv/Scripts/python.exe' : '../.venv/bin/python',
      import.meta.url
    )
  )
const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1100 },
    headless: true,
    launchOptions: executable
      ? {
          executablePath: executable,
          args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--no-zygote',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ],
        }
      : {},
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: `"${python}" -m uvicorn app.main:app --host 127.0.0.1 --port 8000`,
          cwd: '../backend',
          url: 'http://127.0.0.1:8000/api/health',
          reuseExistingServer: true,
          timeout: 30000,
        },
        {
          command: 'npm run dev',
          url: 'http://127.0.0.1:5173',
          reuseExistingServer: true,
          timeout: 30000,
        },
      ],
})

import path from 'path';

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: path.resolve(__dirname, 'e2e'),
  use: { headless: true },
});

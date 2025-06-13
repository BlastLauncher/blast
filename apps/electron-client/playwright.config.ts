import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: path.resolve(__dirname, 'e2e'),
  use: { headless: true },
});

import path from 'path';

import { test, expect } from '@playwright/test';
import { _electron as electron, ElectronApplication, Page } from 'playwright';

test('launches main window', async () => {
  const appDir = path.join(__dirname, '..');
  const electronBinary = path.join(appDir, 'node_modules', '.bin', 'electron');
  const electronApp: ElectronApplication = await electron.launch({
    executablePath: electronBinary,
    args: ['--no-sandbox', appDir],
  });
  const window: Page = await electronApp.firstWindow();
  await expect(window).toHaveTitle(/Blast/);
  await electronApp.close();
});

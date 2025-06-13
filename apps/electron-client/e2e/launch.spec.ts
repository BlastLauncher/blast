import path from 'path';
import { _electron as electron, ElectronApplication, Page } from 'playwright';
import { test, expect } from '@playwright/test';

test('launches main window', async () => {
  const appDir = path.join(__dirname, '..');
  const electronBinary = path.join(appDir, 'node_modules', '.bin', 'electron');
  const electronApp: ElectronApplication = await electron.launch({
    executablePath: electronBinary,
    args: [appDir, '--no-sandbox'],
  });
  const window: Page = await electronApp.firstWindow();
  await expect(window).toHaveTitle(/Blast/);
  await electronApp.close();
});

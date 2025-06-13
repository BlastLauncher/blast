import path from 'path';
import { _electron as electron, ElectronApplication, Page } from 'playwright';
import { test, expect } from '@playwright/test';

test('launches main window', async () => {
  const appPath = path.join(__dirname, '..');
  const electronApp: ElectronApplication = await electron.launch({ args: [appPath] });
  const window: Page = await electronApp.firstWindow();
  await expect(window).toHaveTitle(/Blast/);
  await electronApp.close();
});

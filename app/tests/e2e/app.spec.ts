import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'
import os from 'os'
import fs from 'fs'

// Smoke test: launch the Electron app and verify the UI shell renders correctly.
// Requires `npm run build` to have been run first.

test.describe('SteamToolsCachyOS smoke test', () => {
  test('app launches and shows dashboard', async () => {
    const app = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')],
      env: {
        ...process.env,
        // Point to a non-existent steam path so we get the "not found" state
        STEAM_CLIENT: '/nonexistent/steam',
        NODE_ENV: 'test',
      },
    })

    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Sidebar should be visible
    const sidebar = window.locator('aside')
    await expect(sidebar).toBeVisible()

    // App name in sidebar
    await expect(window.getByText('SteamTools')).toBeVisible()

    // Nav links
    await expect(window.getByText('Dashboard')).toBeVisible()
    await expect(window.getByText('Symlink Hub')).toBeVisible()
    await expect(window.getByText('FSR DLL')).toBeVisible()
    await expect(window.getByText('Launch Options')).toBeVisible()
    await expect(window.getByText('Compat tools')).toBeVisible()

    await app.close()
  })
})

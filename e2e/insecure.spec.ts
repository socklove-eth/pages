import { test, expect } from '@playwright/test'
import { watchConsole } from './console'

// A name that is not this machine, served over plain http: no secure context, so no WebCrypto.
watchConsole()

test('Sigil outside a secure context says it cannot read the Marks', async ({ page }) => {
  await page.goto('http://sigil.test:4178/sigil/')
  expect(await page.evaluate(() => isSecureContext)).toBe(false)
  await page.locator('#hash').fill(`0x${'ab'.repeat(32)}`)

  await expect(page.locator('#msg')).toHaveText('This browser cannot read the Marks.')
  await expect(page.locator('#msg')).toHaveClass('thorn')
  await expect(page.locator('#out .mark')).toHaveCount(0)
})

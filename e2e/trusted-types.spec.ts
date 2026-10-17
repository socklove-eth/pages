import { test, expect } from '@playwright/test'
import { isolated } from './console'

for (const [name, path] of [['Altar', '/altar/'], ['Sigil', '/sigil/']] as const) {
  test(`${name} refuses HTML written from a string`, async ({ browser, baseURL }) => {
    await isolated(browser, baseURL, path, async (page) => {
      const outcome = await page.evaluate(() => {
        try {
          document.body.innerHTML = '<b>x</b>'
          return 'written'
        } catch (e) {
          return (e as Error).name
        }
      })
      expect(outcome).toBe('TypeError')
    })
  })
}

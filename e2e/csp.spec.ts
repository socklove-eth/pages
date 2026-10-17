import { test, expect } from '@playwright/test'
import { isolated } from './console'

test('Altar runs no script added at runtime, and no string as code', async ({ browser, baseURL }) => {
  await isolated(browser, baseURL, '/altar/', async (page) => {
    const outcome = await page.evaluate(async () => {
      const script = document.createElement('script')
      script.append(document.createTextNode('window.injected = true'))
      try {
        document.head.append(script)
      } catch {
        /* refused on insertion */
      }
      await new Promise((r) => setTimeout(r, 100))
      let evaluated = 'ran'
      try {
        // oxlint-disable-next-line no-eval -- the CSP must refuse it
        ;(0, eval)('1')
      } catch {
        evaluated = 'refused'
      }
      return { injected: 'injected' in window, evaluated }
    })
    expect(outcome).toEqual({ injected: false, evaluated: 'refused' })
  })
})

test('Sigil refuses a request made from the page', async ({ browser, baseURL }) => {
  await isolated(browser, baseURL, '/sigil/', async (page) => {
    // Its own address, which the server would answer: only the CSP refuses it.
    const outcome = await page.evaluate(() => fetch(location.href).then(() => 'fetched', (e: Error) => e.name))
    expect(outcome).toBe('TypeError')
  })
})

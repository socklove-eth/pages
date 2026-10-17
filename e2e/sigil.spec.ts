import { test, expect, type Page } from '@playwright/test'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { watchConsole } from './console'

const SIGIL = '/sigil/'

// What jsdom can't check: real WebCrypto, the CSP enforced, no requests made.
watchConsole()

// Reference vector, kept independent of the page: indices 57,1,27,29,42,7,18,55,39,38.
const VALID = '0xe0e486cadd1b2ce95a6105f8168186ffeb9af4241e7b4aa718c14c7430f8aaed'
const VALID_MARKS = 'tongue, seat, fire, hammer, moon, candle, pill, bed, hourglass, rose'
// A second vector, indices 8,5,55,39,14,29,45,37,44,55.
const SECOND = `0x${'ab'.repeat(32)}`
const SECOND_MARKS = 'sock, mirror, bed, hourglass, door, hammer, ring, diamond, scales, bed'

const marks = (page: Page) => page.locator('#out .mark')
const output = (page: Page) => page.locator('#out')

test.describe('Sigil', () => {
  test('shows its title and subtitle, the title in Cinzel, the lead in Outfit', async ({ page }) => {
    await page.goto(SIGIL)
    await expect(page).toHaveTitle('Sigil — SockLove')
    await expect(page.locator('.page-title')).toHaveText('Sigil')
    await expect(page.locator('.page-subtitle')).toHaveText('Ten marks. Two screens. One sigil.')
    await page.evaluate(() => document.fonts.ready)
    expect(await page.locator('.page-title').evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?Cinzel"?,/)
    expect(await page.locator('main .lead').evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?Outfit"?,/)
  })

  test('opens empty and asks for nothing', async ({ page }) => {
    await page.goto(SIGIL)

    await expect(page.locator('#hash')).toBeEmpty()
    await expect(marks(page)).toHaveCount(0)
    await expect(page.locator('#msg')).toBeEmpty()
    await expect(output(page)).toHaveAttribute('aria-label', 'No Marks')
    await expect(page.locator('main .lead')).toHaveText('Say the 🧿 Marks aloud and sign only if both agree.')
    await expect(page.locator('#hash')).toHaveAttribute('placeholder', 'Insert transaction hash…')
    await expect(page.getByLabel('Transaction hash', { exact: true })).toHaveCount(1)
  })

  test('says it is reading the Marks while it derives them', async ({ page }) => {
    await page.goto(SIGIL)
    await page.locator('#hash').fill(VALID)

    await expect(page.locator('#msg')).toHaveText('Reading the 🧿 Marks…')
    await expect(page.locator('#msg strong')).toHaveText('Marks')
    await expect(output(page)).toHaveAttribute('aria-label', 'Reading the Marks')
    await expect(marks(page)).toHaveCount(10, { timeout: 60_000 })
    await expect(page.locator('#msg')).toBeEmpty()
  })

  test('a newer hash wins over one still being read', async ({ page }) => {
    // The first derivation is held back, so it finishes after the second.
    await page.addInitScript(() => {
      const derive = crypto.subtle.deriveBits.bind(crypto.subtle)
      let calls = 0
      crypto.subtle.deriveBits = (...args: Parameters<SubtleCrypto['deriveBits']>) => {
        const first = calls++ === 0
        return derive(...args).then((bits) => (first ? new Promise((r) => setTimeout(() => r(bits), 3_000)) : bits))
      }
    })
    await page.goto(SIGIL)
    await page.locator('#hash').fill(VALID)
    await page.locator('#hash').fill(SECOND)

    await expect(output(page)).toHaveAttribute('aria-label', SECOND_MARKS, { timeout: 60_000 })
    await page.waitForTimeout(4_000)
    await expect(output(page)).toHaveAttribute('aria-label', SECOND_MARKS)
  })

  test('runs from a local file', async ({ page }) => {
    await page.goto(pathToFileURL(resolve(process.cwd(), 'dist/local/sigil.html')).href)
    await page.locator('#hash').fill(VALID)

    await expect(marks(page)).toHaveCount(10, { timeout: 60_000 })
    await expect(output(page)).toHaveAttribute('aria-label', VALID_MARKS)
  })

  /** Everything is inlined, so nothing is requested. */
  test('derives the reference vector with no request made', async ({ page }) => {
    const reached: string[] = []
    page.on('request', (r) => {
      if (!r.url().endsWith('/sigil/')) reached.push(r.url())
    })
    await page.goto(SIGIL)
    await page.locator('#hash').fill(VALID)

    // 4,000,000 PBKDF2 iterations by design, hence the long timeout.
    await expect(marks(page)).toHaveCount(10, { timeout: 60_000 })
    await expect(output(page)).toHaveAttribute('aria-label', VALID_MARKS)
    await expect(page.locator('#msg')).toBeEmpty()
    expect(reached).toEqual([])
  })

  test('says so when the browser cannot derive the Marks', async ({ page }) => {
    await page.addInitScript(() => {
      crypto.subtle.deriveBits = () => Promise.reject(new DOMException('refused', 'OperationError'))
    })
    await page.goto(SIGIL)
    await page.locator('#hash').fill(VALID)

    await expect(page.locator('#msg')).toHaveText('This browser cannot read the Marks.')
    await expect(page.locator('#msg')).toHaveClass('thorn')
    await expect(marks(page)).toHaveCount(0)
  })

  test('marks the field when Enter is pressed on something that is not a hash', async ({ page }) => {
    await page.goto(SIGIL)
    await page.locator('#hash').fill('0xdeadbeef')
    await page.locator('#hash').press('Enter')
    await expect(page.locator('#hash')).toHaveClass(/pricked/)
    await expect(page.locator('#hash')).toHaveValue('')
    await expect(page.locator('#msg')).toBeEmpty()
  })

  // `refused`: a whole hash-length value that is no hash marks the field, briefly.
  for (const [name, value, refused] of [
    ['a short hash', '0xdeadbeef', false],
    ['one character over', `0x${'a'.repeat(65)}`, false],
    ['non-hex of the right length', `0x${'z'.repeat(64)}`, true],
    ['a whole pasted terminal line', `tx: 0x${'a'.repeat(64)} (mined)`, false],
    ['the zero hash', `0x${'0'.repeat(64)}`, true],
  ] as const) {
    test(`says nothing for ${name}`, async ({ page }) => {
      await page.goto(SIGIL)
      await page.locator('#hash').fill(value)
      if (refused) await expect(page.locator('#hash')).toHaveClass(/pricked/)

      // Wait past a real derivation, then check nothing arrived.
      await page.waitForTimeout(3_000)

      await expect(marks(page)).toHaveCount(0)
      await expect(page.locator('#msg')).toBeEmpty()
      await expect(output(page)).toHaveAttribute('aria-label', 'No Marks')
      await expect(page.locator('#spoken')).toHaveText('')
    })
  }

  // A real paste, from the browser's own clipboard: Firefox strips the data from a synthetic one.
  test('a pasted hash draws the Marks; a pasted non-hash is refused', async ({ page, context, browserName }) => {
    if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(SIGIL)
    const paste = async (text: string) => {
      await page.locator('#hash').click()
      await page.evaluate((value) => navigator.clipboard.writeText(value), text)
      await page.keyboard.press('ControlOrMeta+V')
    }
    await paste('not a hash')
    await expect(page.locator('#hash')).toHaveClass(/pricked/)
    await expect(page.locator('#hash')).toHaveValue('')
    await expect(page.locator('#hash')).toHaveAttribute('aria-invalid', 'true')
    await paste(`\u00a0${VALID}\n`)
    await expect(page.locator('#hash')).not.toHaveAttribute('aria-invalid')
    await expect(marks(page)).toHaveCount(10, { timeout: 60_000 })
    await expect(output(page)).toHaveAttribute('aria-label', VALID_MARKS)
    await expect(page.locator('#spoken')).toHaveText(VALID_MARKS)
  })

})

test.describe('Sigil with JavaScript off', () => {
  test.use({ javaScriptEnabled: false })

  test('shows its line and its field, and draws nothing', async ({ page }) => {
    await page.goto(SIGIL)
    await expect(page.locator('main .lead')).toBeVisible()
    await page.locator('#hash').fill(VALID)
    await page.waitForTimeout(1_000)
    await expect(marks(page)).toHaveCount(0)
    await expect(page.locator('#msg')).toBeEmpty()
  })
})

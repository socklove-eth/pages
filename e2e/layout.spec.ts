import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { watchConsole } from './console'
import { installWallet, scannedLink } from './wallet'
import { freshChain, staged } from './chain'

// Layout at real viewport sizes; only a real browser lays out dvh, clamp() and scroll containers.
watchConsole()
// Each engine starts from the Safe as staged: 1-of-1, Nonce 0.
test.beforeAll(freshChain)

// The header animates in on a transform; reduced motion lets it be measured in place.
test.use({ reducedMotion: 'reduce' })

const PAGES = [
  { name: 'Altar', path: '/altar/', control: '#ask' },
  { name: 'Sigil', path: '/sigil/', control: '#hash' },
] as const

const SIZES = [
  { name: 'small phone', width: 320, height: 568 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'phone, landscape', width: 740, height: 360 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'wide', width: 1920, height: 1080 },
] as const

/** The header fades up into place; measure once it has arrived. */
const settled = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))

const overflows = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)

const bands = (page: Page) =>
  page.evaluate(() => {
    const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect()
    return {
      head: box('.page-header'),
      main: box('.page-main'),
      foot: box('.page-footer'),
      documentScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
    }
  })

for (const size of SIZES) {
  test.describe(`${size.name}, ${size.width}x${size.height}`, () => {
    for (const subject of PAGES) {
      test(`${subject.name} fits, and only its middle scrolls`, async ({ page }) => {
        await page.setViewportSize({ width: size.width, height: size.height })
        await page.goto(subject.path)
        await expect(page.locator(subject.control)).toBeVisible({ timeout: 30_000 })

        expect(await overflows(page)).toBe(false)

        await settled(page)
        const { head, main, foot, documentScrolls } = await bands(page)
        expect(documentScrolls).toBe(false)
        // Every band on screen, in order, with no gap or overlap.
        expect(head.top).toBeGreaterThanOrEqual(0)
        // Within a pixel: an engine may place a band on a fractional pixel either side of the round.
        expect(Math.abs(main.top - head.bottom)).toBeLessThanOrEqual(1)
        expect(Math.abs(foot.top - main.bottom)).toBeLessThanOrEqual(1)
        expect(foot.bottom).toBeLessThanOrEqual(size.height + 1)
        expect(main.height).toBeGreaterThan(80)
      })
    }
  })
}

/** Every screen, each reached as a user reaches it. */
const SCREENS: { name: string; open: (page: Page) => Promise<void> }[] = [
  {
    name: 'the Ask screen',
    open: async (page) => {
      await page.goto('/altar/')
      await expect(page.locator('#ask')).toBeVisible({ timeout: 30_000 })
    },
  },
  {
    name: 'the Handoff screen and its QR code',
    open: async (page) => {
      await installWallet(page, { account: 'A' })
      await page.goto('/altar/')
      await page.locator('#owner').fill(staged().ownerB)
      await page.locator('#ask').click()
      await expect(page.locator('.qr svg')).toBeVisible({ timeout: 60_000 })
    },
  },
  {
    name: 'the Answer screen',
    open: async (page) => {
      await installWallet(page, { account: 'A' })
      await page.goto('/altar/')
      await page.locator('#owner').fill(staged().ownerB)
      await page.locator('#ask').click()
      await expect(page.locator('.qr svg')).toBeVisible({ timeout: 60_000 })
      // The fragment changes in place, so the Page reloads itself into the Answer.
      await page.goto(await scannedLink(page))
      await expect(page.locator('#go')).toBeVisible({ timeout: 60_000 })
    },
  },
  {
    name: 'the RPC prompt',
    open: async (page) => {
      // An endpoint for another chain: refused, so the Page asks for one.
      await page.route('https://other-chain.test/', (route) => {
        const { id } = JSON.parse(route.request().postData() ?? '{}')
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id, result: '0xaa36a7' }) })
      })
      await page.addInitScript(() => sessionStorage.setItem('rpc', 'https://other-chain.test/'))
      await page.goto('/altar/')
      await expect(page.locator('#rpc')).toBeVisible({ timeout: 60_000 })
    },
  },
  {
    name: 'Which wallet?',
    open: async (page) => {
      await installWallet(page, { account: 'A', announce: ['Wallet one', 'Wallet two'] })
      await page.goto('/altar/')
      await page.locator('#owner').fill(staged().ownerB)
      await page.locator('#ask').click()
      await expect(page.locator('#status [data-wallet]')).toHaveCount(2, { timeout: 30_000 })
    },
  },
  {
    name: 'ten Marks',
    open: async (page) => {
      await page.goto('/sigil/')
      await page.locator('#hash').fill(`0x${'ab'.repeat(32)}`)
      await expect(page.locator('#out .mark')).toHaveCount(10, { timeout: 60_000 })
    },
  },
]

/** Every visible control in the middle and the footer, copy targets included, with its height. */
const controls = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(':is(main, footer) :is(button, input, a, [role="button"])')]
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({ what: el.id || el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 20) || el.className, height: el.getBoundingClientRect().height })),
  )

for (const size of SIZES.slice(0, 3)) {
  test.describe(`${size.name}, every screen`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })
    for (const screen of SCREENS) {
      test(`${screen.name}: nothing overflows, the document stands still, every target is 44px`, async ({ page }) => {
        await screen.open(page)
        await settled(page)

        expect(await overflows(page)).toBe(false)
        expect((await bands(page)).documentScrolls).toBe(false)
        const found = await controls(page)
        expect(found.length).toBeGreaterThan(0)
        for (const { what, height } of found) expect(height, what).toBeGreaterThanOrEqual(44)
      })
    }
  })
}

test.describe('what a finger needs', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })

  test('the field is large enough not to zoom the page on focus', async ({ page }) => {
    await page.goto('/altar/')
    const field = page.locator('#owner')
    await expect(field).toBeVisible({ timeout: 30_000 })

    const size = await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(size).toBeGreaterThanOrEqual(16)
  })
})

for (const { name, path } of PAGES) {
  test(`${name} carries the logo favicon on black`, async ({ page }) => {
    await page.goto(path)
    const icons = page.locator('link[rel="icon"]')
    await expect(icons).toHaveCount(1)
    await expect(icons).toHaveAttribute('type', 'image/png')
    const corner = await icons.evaluate(async (link: HTMLLinkElement) => {
      const img = new Image()
      img.src = link.href
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      return { size: [img.width, img.height], rgba: [...ctx.getImageData(0, 0, 1, 1).data] }
    })
    expect(corner.size).toEqual([64, 64])
    expect(corner.rgba).toEqual([0, 0, 0, 255])
  })
}

for (const size of SIZES) {
  test(`${size.name}: every Page starts its middle at the same height`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    const offsets: number[] = []
    for (const subject of PAGES) {
      await page.goto(subject.path)
      await expect(page.locator(subject.control)).toBeVisible({ timeout: 30_000 })
      await settled(page)
      offsets.push(
        await page.evaluate(() => {
          const first = document.querySelector('.panel')!.firstElementChild!.getBoundingClientRect()
          return Math.round(first.top - document.querySelector('.page-main')!.getBoundingClientRect().top)
        }),
      )
    }
    expect(offsets[1]).toBe(offsets[0])
  })
}

for (const { name, path } of PAGES) {
  test(`${name} shows its tagline as written`, async ({ page }) => {
    await page.goto(path)
    await expect(page.locator('.page-tagline')).toHaveJSProperty('innerText', 'Consent as Architecture')
  })
}

const NAMES = (JSON.parse(readFileSync(new URL('../marks/marks.json', import.meta.url), 'utf8')) as Array<[string, string]>).map(([, name]) => name)

// Ten Marks never leave one alone: five to a row, or two where five will not fit; every name fits its cell; read row by row, they number 1 to 10.
for (const width of [320, 359, 360, 390, 430, 768, 1280]) {
  test(`at ${width}px the Marks sit in even rows, every name fits, and they read 1 to 10`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/sigil/')
    await page.locator('#hash').fill('0xe0e486cadd1b2ce95a6105f8168186ffeb9af4241e7b4aa718c14c7430f8aaed')
    await expect(page.locator('.mark')).toHaveCount(10, { timeout: 90_000 })
    const { rows, overflowing, order } = await page.evaluate(() => {
      const tops = new Map<number, number>()
      for (const m of document.querySelectorAll('.mark')) {
        const top = Math.round(m.getBoundingClientRect().top)
        tops.set(top, (tops.get(top) ?? 0) + 1)
      }
      const wide = [...document.querySelectorAll('.mark')].filter((m) => {
        const cell = m.getBoundingClientRect()
        const name = m.querySelector('.mark-name')!.getBoundingClientRect()
        return name.left < cell.left - 1 || name.right > cell.right + 1
      }).length
      // Read as a person reads: row by row, left to right.
      const read = [...document.querySelectorAll('.mark')]
        .map((m) => ({ box: m.getBoundingClientRect(), n: m.querySelector('.mark-number')!.textContent }))
        .sort((a, b) => Math.round(a.box.top) - Math.round(b.box.top) || a.box.left - b.box.left)
        .map((m) => m.n)
        .join(' ')
      return { rows: [...tops.values()], overflowing: wide, order: read }
    })
    expect(rows).toEqual(width < 360 ? [2, 2, 2, 2, 2] : [5, 5])
    expect(overflowing).toBe(0)
    expect(order).toBe('1 2 3 4 5 6 7 8 9 10')
    // Every one of the 64 names, written into every cell, fits it too.
    const tooWide = await page.evaluate((names) => {
      const cells = [...document.querySelectorAll('.mark')]
      return names.filter((name) => cells.some((m) => {
        const label = m.querySelector('.mark-name')!
        label.textContent = name
        const cell = m.getBoundingClientRect()
        const box = label.getBoundingClientRect()
        return box.left < cell.left - 1 || box.right > cell.right + 1
      }))
    }, NAMES)
    expect(tooWide).toEqual([])
  })
}

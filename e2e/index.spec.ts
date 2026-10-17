import { test, expect, type Page } from '@playwright/test'
import { watchConsole } from './console'
import { namesWithEmoji } from './names'

// The Index and Localnet: never pinned, they open the Pages against mainnet or a local chain.
watchConsole()

const links = (page: Page) =>
  page.locator('a.step').evaluateAll((els) => els.map((el) => [el.textContent, el.getAttribute('href')]))

test('the Index offers each Page and Localnet', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.page-title')).toHaveText('Index')
  await expect(page.locator('.page-subtitle')).toHaveText('The bytes you pin.')
  expect(await links(page)).toEqual([['💒altar', '/altar/'], ['👀sigil', '/sigil/'], ['🪞Localnet', '/local/']])
})

test('Localnet offers Altar and the Index, and names its endpoint', async ({ page }) => {
  await page.goto('/local/')
  await expect(page.locator('.page-title')).toHaveText('Localnet')
  await expect(page.locator('.page-subtitle')).toHaveText('The bytes you pin. A chain you own.')
  expect(await links(page)).toEqual([['💒altar', 'altar.html'], ['📑Index', '../']])
  expect(await page.evaluate(() => sessionStorage.getItem('rpc'))).toBe('http://127.0.0.1:8545')
  await expect(page.locator('.page-notice')).toHaveText('☝️ The RPC endpoint, 127.0.0.1:8545, sees you ask.')
  await expect(page.locator('.page-notice .inscription[role="button"]')).toHaveText('127.0.0.1:8545')
})

test('the Index forgets the local endpoint and keeps any other', async ({ page }) => {
  await page.goto('/local/')
  await page.goto('/')
  await expect(page.locator('.page-title')).toHaveText('Index')
  expect(await page.evaluate(() => sessionStorage.getItem('rpc'))).toBeNull()

  await page.evaluate(() => sessionStorage.setItem('rpc', 'https://rpc.example'))
  await page.goto('/')
  expect(await page.evaluate(() => sessionStorage.getItem('rpc'))).toBe('https://rpc.example')
})

test('no button on the Index or Localnet is read with its emoji', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'altar', exact: true })).toBeVisible()
  expect(await namesWithEmoji(page)).toEqual([])
  await page.goto('/local/')
  await expect(page.getByRole('link', { name: 'Index', exact: true })).toBeVisible()
  expect(await namesWithEmoji(page)).toEqual([])
})

test('Localnet shows no ✓ when the copy fails', async ({ page }) => {
  await page.goto('/local/')
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')) } })
    document.execCommand = () => false
  })
  const host = page.locator('.page-notice [data-copy], .page-notice .inscription')
  await host.click()
  await page.waitForTimeout(500)
  await expect(host).not.toHaveClass(/sealed/)
})

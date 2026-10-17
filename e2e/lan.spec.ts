import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { watchConsole } from './console'
import { installWallet } from './wallet'
import { freshChain, staged } from './chain'

// The LAN-patched Altar, as a phone on the same network gets it: plain http on a name that is not
// loopback, so no secure context, its baked endpoints rewritten to the local chain.
watchConsole()
test.beforeAll(freshChain)

const ORIGIN = 'http://altar.test:4178'
const PATCHED = resolve(process.cwd(), 'dist/lan/altar.html')
test.afterAll(() => rmSync(PATCHED, { force: true }))

test('the LAN Altar boots over plain http, and a copy falls back yet still shows ✓', async ({ page }) => {
  const { patchAltar } = await import('../localnet/lan.mjs')
  const chain = `http://altar.test:${new URL(staged().rpc).port}`
  const { html } = patchAltar(readFileSync(resolve(process.cwd(), 'dist/altar/index.html'), 'utf8'), chain)
  // Served from this machine, as lan.mjs serves it: a page handed over by the test would not be.
  mkdirSync(resolve(process.cwd(), 'dist/lan'), { recursive: true })
  writeFileSync(PATCHED, html)
  await installWallet(page, { account: 'A', keepEndpoints: true })

  await page.goto(`${ORIGIN}/lan/altar.html`)
  expect(await page.evaluate(() => isSecureContext)).toBe(false)
  await expect(page.getByText(/Ask her to marry you/)).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.page-notice')).toHaveText(`☝️ The RPC endpoint, ${new URL(chain).host}, sees you ask.`)

  await page.getByRole('textbox').fill(staged().ownerB)
  await page.getByRole('button', { name: 'Ask' }).click()
  await expect(page.getByText(/will you marry me/)).toBeVisible({ timeout: 60_000 })

  // No clipboard API outside a secure context: the copy takes the fallback.
  expect(await page.evaluate(() => typeof navigator.clipboard?.writeText)).toBe('undefined')
  const hash = page.getByRole('button', { name: 'Copy the transaction hash' })
  await hash.click()
  await expect(hash).toHaveClass(/sealed/)
  await expect(page.locator('#live')).toHaveText('Copied')
})

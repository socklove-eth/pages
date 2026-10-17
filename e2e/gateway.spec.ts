import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { watchConsole } from './console'

watchConsole()

const PAGES = [
  { name: 'Altar', dir: 'altar' },
  { name: 'Sigil', dir: 'sigil' },
] as const

// A path gateway serves every CID from one origin; each Page must refuse to run there.
// Gateways decode the path, so an encoded /ipfs/ must be refused too, and so must one mounted under a prefix.
for (const { name, dir } of PAGES) for (const path of ['/ipfs/bafypage/', '/%69pfs/bafypage/', '/ipf%73/bafypage/', '/IPNS/name/', '/gw/ipfs/bafypage/']) {
  test(`${name} refuses to run under ${path}`, async ({ page, baseURL }) => {
    const body = readFileSync(resolve(process.cwd(), `dist/${dir}/index.html`), 'utf8')
    await page.route(`${baseURL}${path}`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body }),
    )
    await page.goto(path)

    await expect(page.getByText('This Page cannot run here.')).toBeVisible()
    await expect(page.locator('.page-title')).toBeVisible()
    await expect(page.getByText('Consent as Architecture')).toBeVisible()
  })
}

// frame-ancestors is ignored in a <meta> CSP, so the script refuses framing.
for (const { name, dir } of PAGES) {
  test(`${name} refuses to run inside a frame`, async ({ page, baseURL }) => {
    await page.setContent(`<iframe src="${baseURL}/${dir}/" style="width:600px;height:600px"></iframe>`)
    const framed = page.frameLocator('iframe')

    await expect(framed.getByText('This Page cannot run here.')).toBeVisible({ timeout: 30_000 })
    await expect(framed.getByRole('textbox')).toHaveCount(0)
    await expect(framed.locator('.page-title')).toHaveText(name)
    await expect(framed.locator('.page-notice')).toHaveCount(0)
    await expect(framed.getByText('Consent as Architecture')).toBeVisible()
  })
}

test('Altar opened from file:// refuses to run, reading and storing nothing', async ({ page }) => {
  let calls = 0
  await page.route('**/*', (route) => (route.request().url().startsWith('file:') ? route.continue() : (calls++, route.abort())))
  await page.goto(pathToFileURL(resolve(process.cwd(), 'dist/local/altar.html')).href)

  await expect(page.getByText('This Page cannot run here.')).toBeVisible()
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await expect(page.locator('.page-title')).toHaveText('Altar')
  await expect(page.locator('.page-notice')).toHaveCount(0)
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0)
  expect(calls).toBe(0)
})

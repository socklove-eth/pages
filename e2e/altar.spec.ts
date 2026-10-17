import { test, expect, type Page } from '@playwright/test'
import { installWallet, emit, scannedLink, type WalletOptions } from './wallet'
import { bumpNonce, freshChain, loadStage, moveResolver, staged } from './chain'
import { watchConsole } from './console'
import { namesWithEmoji } from './names'
import { pageConfig } from '../scripts/env.mjs'

const ALTAR = '/altar/'

watchConsole()
// Each engine starts from the Safe as staged: 1-of-1, Nonce 0.
test.beforeAll(freshChain)

/** Waits for the Ask screen, enters owner B and presses Ask. */
async function pressAsk(page: Page): Promise<void> {
  await expect(page.getByText(/Ask her to marry you/)).toBeVisible({ timeout: 30_000 })
  await page.getByRole('textbox').fill(staged().ownerB)
  await page.getByRole('button', { name: 'Ask' }).click()
}

/** Asks as owner A and waits for the handoff screen. */
async function ask(page: Page): Promise<void> {
  await pressAsk(page)
  await expect(page.getByText(/will you marry me/)).toBeVisible({ timeout: 60_000 })
}

test.describe('Altar', () => {
  test('asks the wallet to switch to the local chain, then starts over without a word', async ({ page }) => {
    const wallet = await installWallet(page, { account: 'A', chain: 1 })
    await page.goto(ALTAR)
    await expect(page.getByText(/Ask her to marry you/)).toBeVisible({ timeout: 30_000 })
    await page.getByRole('textbox').fill(staged().ownerB)
    const reloaded = page.waitForEvent('load')
    await page.getByRole('button', { name: 'Ask' }).click()

    await reloaded
    await expect(page.getByText(/Ask her to marry you/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/Your wallet is not on/)).toHaveCount(0)
    // The typed address survives the reload.
    await expect(page.getByRole('textbox')).toHaveValue(staged().ownerB)
    expect(wallet.calls).toContain('wallet_switchEthereumChain')
    expect(wallet.calls).not.toContain('eth_signTypedData_v4')
  })

  test('says the wallet is on the wrong chain when it cannot switch', async ({ page }) => {
    await installWallet(page, { account: 'A', chain: 1, failSwitch: true })
    await page.goto(ALTAR)
    await pressAsk(page)

    await expect(page.getByText('Your wallet is not on the right chain.')).toBeVisible({ timeout: 30_000 })
  })

  test('says nothing when the switch is declined', async ({ page }) => {
    await installWallet(page, { account: 'A', chain: 1, declineSwitch: true })
    await page.goto(ALTAR)
    await pressAsk(page)

    await expect(page.locator('#status')).toBeEmpty({ timeout: 30_000 })
    await expect(page.getByRole('textbox')).toHaveValue(staged().ownerB)
  })

  test('refuses a kept endpoint on another chain, and says so', async ({ page }) => {
    await page.route('https://other-chain.test/', (route) => {
      const { id } = JSON.parse(route.request().postData() ?? '{}')
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id, result: '0xaa36a7' }) })
    })
    await page.addInitScript(() => sessionStorage.setItem('rpc', 'https://other-chain.test/'))
    await page.goto(ALTAR)

    await expect(page.getByText('Enter your own RPC endpoint:')).toBeVisible({ timeout: 30_000 })
    // Not typed just now: the field is emptied and marked, one line says why, and the endpoint is forgotten.
    await expect(page.locator('#rpc')).toHaveClass(/pricked/)
    await expect(page.locator('#rpc')).toHaveValue('')
    await expect(page.locator('#panel .thorn')).toHaveText('Your RPC endpoint was not reached.')
    expect(await page.evaluate(() => sessionStorage.getItem('rpc'))).toBeNull()
  })

  test('boots on its baked endpoints through the CSP, no wallet', async ({ page }) => {
    await page.goto(ALTAR)

    await expect(page.getByText(/Ask her to marry you/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('No wallet.', { exact: true })).toBeVisible()
    await expect(page.getByText(/wallet is asking/)).toHaveCount(0)
    // The footer says who it talks to, and offers only a copy of its host.
    const notice = page.locator('.page-notice')
    await expect(notice).toHaveText(/^☝️ The RPC endpoint, [a-z0-9.-]+(:\d+)?, sees you ask\.$/, { timeout: 30_000 })
    await expect(notice).toBeVisible()
    const host = notice.locator('[data-copy]')
    await expect(host).toHaveCount(1)
    await expect(host).toHaveClass('inscription')
    await expect(host).toHaveAttribute('data-copy', /^[a-z0-9.-]+(:\d+)?$/)
    await expect(notice.locator('a, button')).toHaveCount(0)
  })

  test('names a supplied endpoint in the footer, by its host alone', async ({ page }) => {
    await installWallet(page, { account: 'A' })
    await page.goto(ALTAR)

    await expect(page.locator('.page-notice')).toHaveText(
      `☝️ The RPC endpoint, ${new URL(staged().rpc).host}, sees you ask.`,
    )
  })

  /** Wallets grant accounts per site; the granted one may not be the one selected. */

  test('says the wallet is asking when a request is already open', async ({ page }) => {
    await installWallet(page, { account: 'A', pending: true })
    await page.goto(ALTAR)

    await pressAsk(page)

    await expect(page.getByText('Your wallet is asking…')).toBeVisible({ timeout: 60_000 })
  })

  test('clears a complaint when the wallet switches accounts', async ({ page }) => {
    // B is not yet an owner of the Safe, so asking is refused with a message.
    await installWallet(page, { account: 'B' })
    await page.goto(ALTAR)

    await pressAsk(page)
    await expect(page.locator('#status')).toContainText('Your wallet is not on the right account.', { timeout: 15_000 })

    await emit(page, 'accountsChanged', [staged().ownerB])
    await expect(page.locator('#status')).toBeEmpty({ timeout: 15_000 })
  })

  /** A different chain means different addresses, so nothing may carry across. */
  test('starts over when the wallet switches chain', async ({ page }) => {
    await installWallet(page, { account: 'A' })
    await page.goto(ALTAR)

    await expect(page.getByText(/Ask her to marry you/)).toBeVisible({ timeout: 30_000 })
    await page.getByRole('textbox').fill(staged().ownerB)

    const reloaded = page.waitForNavigation({ timeout: 30_000 })
    await emit(page, 'chainChanged', '0x1')
    await reloaded

    await expect(page.getByText(/Ask her to marry you/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('textbox')).toHaveValue('')
  })

  test('makes the hash click-to-copy, by mouse and keyboard, and nothing else in the panel', async ({ page }) => {
    await installWallet(page, { account: 'A' })
    await page.goto(ALTAR)
    await ask(page)

    await expect(page.locator('#panel .inscription')).toHaveCount(1)
    await expect(page.locator('#panel [data-copy]')).toHaveCount(1)
    await expect(page.locator('.inscription:not([data-copy])')).toHaveCount(0)

    // Measured against the parent: clicking scrolls the middle, so viewport positions shift.
    const shape = (l: ReturnType<Page['getByRole']>) =>
      l.evaluate((el) => {
        const value = el.getBoundingClientRect()
        const above = el.parentElement!.getBoundingClientRect()
        return JSON.stringify({
          w: Math.round(value.width),
          h: Math.round(value.height),
          under: Math.round(value.top - above.top),
        })
      })

    const hash = page.getByRole('button', { name: 'Copy the transaction hash' })
    const hashText = await hash.innerText()
    const hashBefore = await shape(hash)
    await hash.click()
    // Copy feedback must not change or move the hash.
    await expect(hash).toHaveClass(/sealed/)
    await expect(hash).toHaveText(hashText)
    expect(await shape(hash)).toEqual(hashBefore)

    await expect(page.locator('#live')).toHaveText('Copied')

    await hash.focus()
    await page.keyboard.press('Enter')
    await expect(hash).toHaveClass(/sealed/)
    expect(await shape(hash)).toEqual(hashBefore)

    await expect(hash).not.toHaveClass(/sealed/, { timeout: 5_000 })
    await page.evaluate(() => document.getElementById('live')!.replaceChildren())
    await hash.focus()
    await page.keyboard.press('Space')
    await expect(hash).toHaveClass(/sealed/)
    await expect(page.locator('#live')).toHaveText('Copied')
  })

  test('copies the endpoint\'s host from the notice, here and on Localnet', async ({ page, context, browserName }) => {
    // Firefox grants no clipboard reads to a test; there the ✓ is the proof.
    const readable = browserName === 'chromium'
    if (readable) await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const clipboard = () => (readable ? page.evaluate(() => navigator.clipboard.readText()) : Promise.resolve(null))
    await installWallet(page, { account: 'A' })
    await page.goto(ALTAR)
    const host = page.locator('.page-notice [data-copy]')
    await expect(host).toHaveText(new URL(staged().rpc).host, { timeout: 30_000 })
    await host.click()
    await expect(host).toHaveClass(/sealed/)
    if (readable) expect(await clipboard()).toBe(new URL(staged().rpc).host)

    await page.goto('/local/')
    const local = page.locator('.page-notice .inscription')
    await local.click()
    await expect(local).toHaveClass(/sealed/)
    if (readable) expect(await clipboard()).toBe('127.0.0.1:8545')
  })

  test('puts the question, the hash and then the code in that order, and the link only in the code', async ({ page }) => {
    await installWallet(page, { account: 'A' })
    await page.goto(ALTAR)
    await ask(page)

    const order = await page.evaluate(() =>
      [...document.querySelectorAll('#panel .lead, #panel .qr, #panel .caption, #panel .inscription')].map((el) => el.className.split(' ')[0]),
    )
    expect(order).toEqual(['lead', 'caption', 'inscription', 'qr'])

    // The QR code is the only place the link appears: not in any text, attribute or copy target.
    await expect(page.locator('.caption')).toHaveText(['Verify this transaction hash:'])
    const fragment = new URL(await scannedLink(page)).hash.slice(1)
    const outsideQr = await page.evaluate(() => {
      const copy = document.documentElement.cloneNode(true) as HTMLElement
      for (const qr of copy.querySelectorAll('.qr')) qr.remove()
      return copy.outerHTML
    })
    expect(outsideQr).not.toContain(fragment)
    expect(await page.locator('[data-copy]').evaluateAll((els) => els.map((el) => el.getAttribute('data-copy')))).not.toContainEqual(expect.stringContaining(fragment))
  })

  test('reloads into the new state when the fragment changes', async ({ page }) => {
    await installWallet(page, { account: 'A' })
    await page.goto(ALTAR)
    await ask(page)

    const fragment = new URL(await scannedLink(page)).hash
    await page.evaluate((h) => {
      location.hash = h
    }, fragment)

    await expect(page.getByText(/Just say yes/)).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('button', { name: 'Yes' })).toBeVisible()
  })

  test('the added owner executes the batch the link carries', async ({ page }) => {
    const { safe } = staged()
    const { pub, SAFE_FULL_ABI } = await loadStage()

    await installWallet(page, { account: 'A' })
    await page.goto(ALTAR)
    await ask(page)
    const link = await scannedLink(page)

    const executorPage = await page.context().newPage()
    await installWallet(executorPage, { account: 'B' })
    await executorPage.goto(`${ALTAR}${new URL(link).hash}`)

    await expect(executorPage.getByText(/Just say yes/)).toBeVisible({ timeout: 60_000 })
    await executorPage.getByRole('button', { name: 'Yes' }).click()

    await expect
      .poll(() => pub.readContract({ address: safe, abi: SAFE_FULL_ABI, functionName: 'getThreshold' }), { timeout: 90_000 })
      .toBe(2n)

    await expect(executorPage.getByText(/She said yes\. The 💍 Ring is whole/)).toBeVisible({ timeout: 60_000 })
    expect(new URL(executorPage.url()).hash).toBe('')
    await executorPage.close()
  })
})

test.describe('Altar from a fresh chain', () => {
  // After the execution above the Safe is 2-of-2; these start from it as staged.
  test.beforeAll(freshChain)
  /** Asks as owner A, then opens the signed link in a second tab of the same context. */
  async function answer(page: Page, options: WalletOptions, link?: string) {
    await installWallet(page, { account: 'A' })
    await page.goto(ALTAR)
    await ask(page)
    const target = link ?? (await scannedLink(page))
    const answering = await page.context().newPage()
    const wallet = await installWallet(answering, options)
    await answering.goto(target)
    return { answering, wallet }
  }

  test('no button on any Altar screen is read with its emoji', async ({ page }) => {
    await installWallet(page, { account: 'A', announce: ['Wallet one', 'Wallet two'] })
    await page.goto(ALTAR)
    await pressAsk(page)
    await expect(page.locator('#status [data-wallet]')).toHaveCount(2, { timeout: 30_000 })
    expect(await namesWithEmoji(page)).toEqual([])

    await page.getByRole('button', { name: 'Wallet one' }).click()
    await expect(page.getByText(/will you marry me/)).toBeVisible({ timeout: 60_000 })
    expect(await namesWithEmoji(page)).toEqual([])

    const answering = await page.context().newPage()
    await installWallet(answering, { account: 'B' })
    await answering.goto(await scannedLink(page))
    await expect(answering.getByRole('button', { name: 'Yes' })).toBeVisible({ timeout: 60_000 })
    expect(await namesWithEmoji(answering)).toEqual([])
  })

  test('asks which wallet at the Answer, and the chosen one is asked', async ({ page }) => {
    const { answering, wallet } = await answer(page, { account: 'B', decline: true, announce: ['Wallet one', 'Wallet two'] })
    await expect(answering.getByText(/Just say yes/)).toBeVisible({ timeout: 60_000 })
    await answering.getByRole('button', { name: 'Yes' }).click()

    await expect(answering.locator('#status .note')).toHaveText('Which wallet?')
    await expect(answering.locator('#status [data-wallet]')).toHaveText(['👛Wallet one', '👛Wallet two'])
    await answering.getByRole('button', { name: 'Wallet two' }).click()

    // Declined in the wallet: nothing said, YES ready again.
    await expect.poll(() => wallet.calls.includes('eth_sendTransaction'), { timeout: 30_000 }).toBe(true)
    await expect(answering.locator('#status')).toBeEmpty()
    await expect(answering.getByRole('button', { name: 'Yes' })).toBeEnabled()
  })

  test('says nothing when the account picker is refused at the Answer', async ({ page }) => {
    const { answering, wallet } = await answer(page, { account: 'B', granted: 'A', declinePicker: true })
    await expect(answering.getByText(/Just say yes/)).toBeVisible({ timeout: 60_000 })
    await answering.getByRole('button', { name: 'Yes' }).click()

    await expect.poll(() => wallet.calls.includes('wallet_requestPermissions'), { timeout: 30_000 }).toBe(true)
    await expect(answering.locator('#status')).toBeEmpty()
    await expect(answering.getByRole('button', { name: 'Yes' })).toBeEnabled()
    expect(wallet.calls).not.toContain('eth_sendTransaction')
  })

  test('says it did not happen when the wallet returns a signature no Safe accepts', async ({ page }) => {
    await installWallet(page, { account: 'A', badSignature: true })
    await page.goto(ALTAR)
    await pressAsk(page)

    await expect(page.locator('#status')).toHaveText('It did not go through.', { timeout: 30_000 })
    await expect(page.getByText(/will you marry me/)).toHaveCount(0)
  })

  test('never redraws while a transaction is open in the wallet', async ({ page }) => {
    const { answering, wallet } = await answer(page, { account: 'B', holdSend: true })
    await expect(answering.getByText(/Just say yes/)).toBeVisible({ timeout: 60_000 })
    await answering.getByRole('button', { name: 'Yes' }).click()
    await expect(answering.locator('#status')).toHaveText('Your wallet is asking…', { timeout: 30_000 })

    // The Nonce moves and the tab comes back into view: a redraw would orphan the open send.
    await bumpNonce()
    await answering.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await answering.waitForTimeout(3_000)
    await expect(answering.getByText(/Just say yes/)).toBeVisible()
    await expect(answering.locator('#status')).toHaveText('Your wallet is asking…')

    wallet.release()
    await expect(answering.getByText('It did not go through.')).toBeVisible({ timeout: 60_000 })
    await freshChain()
  })

  test('a reload of the Handoff screen starts over at Ask', async ({ page }) => {
    await installWallet(page, { account: 'A' })
    await page.goto(ALTAR)
    await ask(page)
    const link = await scannedLink(page)

    await page.reload()
    await expect(page.getByText(/Ask her to marry you/)).toBeVisible({ timeout: 30_000 })
    expect(await page.evaluate(() => Object.values(sessionStorage).some((v) => v.includes('sig')))).toBe(false)

    // Asked again, the same signature: the same link.
    await pressAsk(page)
    await expect(page.getByText(/will you marry me/)).toBeVisible({ timeout: 60_000 })
    expect(await scannedLink(page)).toBe(link)
  })

  test('re-reads the Nonce before signing: a moved one redraws instead', async ({ page }) => {
    const wallet = await installWallet(page, { account: 'A' })
    await page.goto(ALTAR)
    await expect(page.getByText(/Ask her to marry you/)).toBeVisible({ timeout: 30_000 })
    // A typed address keeps the screen from redrawing while the Nonce moves under it.
    await page.getByRole('textbox').fill(staged().ownerB)
    await bumpNonce()
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await page.waitForTimeout(1_000)

    await page.getByRole('button', { name: 'Ask' }).click()
    await page.waitForTimeout(3_000)
    expect(wallet.calls).not.toContain('eth_signTypedData_v4')
    await expect(page.getByRole('textbox')).toHaveValue(staged().ownerB)

    // Pressed again on the redrawn screen, it signs for the Nonce as it now is.
    await page.getByRole('button', { name: 'Ask' }).click()
    await expect(page.getByText(/will you marry me/)).toBeVisible({ timeout: 60_000 })
    expect(JSON.parse(Buffer.from(new URL(await scannedLink(page)).hash.slice(1), 'base64url').toString()).nonce).toBe('1')
    await freshChain()
  })

  test('re-reads the Nonce before sending: a moved one refuses the link instead', async ({ page }) => {
    const { answering, wallet } = await answer(page, { account: 'B' })
    await expect(answering.getByText(/Just say yes/)).toBeVisible({ timeout: 60_000 })
    await bumpNonce()

    await answering.getByRole('button', { name: 'Yes' }).click()
    await expect(answering.locator('#panel')).toHaveText('This Proposal cannot be answered.', { timeout: 30_000 })
    expect(wallet.calls).not.toContain('eth_sendTransaction')
    await freshChain()
  })

  test('says it no longer reads the name once the name moves to another resolver, read through the baked set', async ({ page }) => {
    await moveResolver()
    await installWallet(page, { account: 'A' })
    await page.addInitScript(() => sessionStorage.removeItem('rpc'))
    await page.goto(ALTAR)

    await expect(page.locator('#panel')).toHaveText(`This Page no longer reads ${pageConfig(process.cwd()).name}.`, { timeout: 60_000 })
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await freshChain()
  })

  test('read through an endpoint you supplied, a moved name opens the RPC prompt, says what it read and forgets the endpoint', async ({ page }) => {
    await moveResolver()
    await installWallet(page, { account: 'A' })
    await page.goto(ALTAR)

    await expect(page.getByText('Enter your own RPC endpoint:')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('#status')).toHaveText(`This Page no longer reads ${pageConfig(process.cwd()).name}.`)
    expect(await page.evaluate(() => sessionStorage.getItem('rpc'))).toBeNull()
    await freshChain()
  })

  test('marks a copy target with ⧉, a copy with ✓ in the seal colour, and an error in the thorn colour', async ({ page }) => {
    await installWallet(page, { account: 'A' })
    await page.goto(ALTAR)
    await ask(page)
    const hash = page.locator('#panel [data-copy]')
    const after = () => hash.evaluate((el) => { const s = getComputedStyle(el, '::after'); return [s.content, s.color] })

    expect((await after())[0]).toBe('"⧉"')
    await hash.click()
    await expect(hash).toHaveClass(/sealed/)
    expect(await after()).toEqual(['"✓"', 'rgb(111, 211, 255)'])

    const refused = await page.context().newPage()
    await installWallet(refused, { account: 'B' })
    await refused.goto(ALTAR)
    await pressAsk(refused)
    await expect(refused.locator('#status .thorn')).toHaveText('Your wallet is not on the right account.', { timeout: 30_000 })
    await expect(refused.locator('#status .thorn')).toHaveCSS('color', 'rgb(255, 122, 89)')
  })

  test('sets its title and names in Cinzel, its words in Outfit, and says exactly what it is', async ({ page }) => {
    await page.goto(ALTAR)
    await expect(page.getByText(/Ask her to marry you/)).toBeVisible({ timeout: 30_000 })

    await expect(page).toHaveTitle('Altar — SockLove')
    await expect(page.locator('.page-title')).toHaveText('Altar')
    await expect(page.locator('.page-subtitle')).toHaveText('Propose. Scan. Verify. Execute. 2-of-2.')
    await page.evaluate(() => document.fonts.ready)
    const family = (sel: string) => page.locator(sel).evaluate((el) => getComputedStyle(el).fontFamily)
    expect(await family('.page-title')).toMatch(/^"?Cinzel"?,/)
    expect(await family('#panel .lead')).toMatch(/^"?Outfit"?,/)
    expect(await page.evaluate(() => ['Cinzel', 'Outfit'].map((f) => document.fonts.check(`16px ${f}`)))).toEqual([true, true])
  })
})

test.describe('Altar with JavaScript off', () => {
  test.use({ javaScriptEnabled: false })

  test('says nothing is running', async ({ page }) => {
    await page.goto(ALTAR)
    await expect(page.getByText('Nothing burns here without JavaScript.')).toBeVisible()
  })
})

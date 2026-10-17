import { test, expect } from '@playwright/test'
import { installWallet } from './wallet'
import { loadStage, staged } from './chain'
import { watchConsole } from './console'

const ALTAR = '/altar/'

watchConsole()
test.describe.configure({ mode: 'serial' })

test.describe('Altar at 2-of-2', () => {
  test('shows the done screen once the Safe is 2-of-2', async ({ page }) => {
    const { safe } = staged()
    const { addSecondOwner, SAFE_FULL_ABI, pub } = await loadStage()

    const threshold = await pub.readContract({ address: safe, abi: SAFE_FULL_ABI, functionName: 'getThreshold' })
    // Makes the Safe 2-of-2 if it is not.
    if (threshold === 1n) await addSecondOwner(safe)

    await installWallet(page, { account: 'A' })
    await page.goto(ALTAR)

    await expect(page.getByText(/She said yes\. The 💍 Ring is whole/)).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('#panel .bond')).toHaveText('She said yes. The 💍 Ring is whole.')
    // The --bond colour, not the grey of an ordinary line.
    await expect(page.locator('#panel .bond')).toHaveCSS('color', 'rgb(180, 92, 255)')
    // Only the notice's host stays pressable, and it only copies.
    await expect(page.locator('#panel').getByRole('button')).toHaveCount(0)
  })

  // Runs the clock past one polling interval.
  test('and keeps showing it', async ({ page }) => {
    await page.clock.install()
    await installWallet(page, { account: 'A' })
    await page.goto(ALTAR)
    await expect(page.getByText(/She said yes\. The 💍 Ring is whole/)).toBeVisible({ timeout: 60_000 })

    await page.clock.runFor('05:10')

    await expect(page.getByText(/She said yes\. The 💍 Ring is whole/)).toBeVisible()
    await expect(page.locator('#panel').getByRole('button')).toHaveCount(0)
  })
})

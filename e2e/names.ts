import type { Page } from '@playwright/test'

/** Every button and link whose accessible name carries an emoji: a screen reader would read it out. */
export async function namesWithEmoji(page: Page): Promise<string[]> {
  const tree = await page.locator('body').ariaSnapshot()
  return tree
    .split('\n')
    .map((line) => line.match(/^\s*- (button|link) "(.*)"/))
    .filter((m): m is RegExpMatchArray => !!m && /\p{Extended_Pictographic}/u.test(m[2]!))
    .map((m) => `${m[1]} "${m[2]}"`)
}

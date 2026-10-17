import { test, expect, type Browser, type BrowserContext, type Page, type Route } from '@playwright/test'
import { rpcUrls } from '../scripts/env.mjs'
import { staged } from './chain'

// Fails a spec if a page logs anything, a request fails, or a request tries to leave this machine.
// Real browsers enforce the CSP; jsdom does not.

const rpcHosts = rpcUrls(process.cwd()).map((u) => new URL(u).host)

// Match on URL host, not message text, so a CSP violation naming an RPC host still fails.
const isRpcHost = (url: string) => {
  try {
    return rpcHosts.includes(new URL(url).host)
  } catch {
    return false
  }
}

// CONSOLE=1 prints everything captured, filtered noise included.
const verbose = !!process.env.CONSOLE
const trace = (line: string, filtered = false) => {
  if (verbose) console.log(`  ${filtered ? '·' : '!'} ${line}`)
}

// Names the browsers resolve to this machine (playwright.config.ts maps them).
const LOCAL = new Set(['127.0.0.1', 'localhost', 'sigil.test', 'altar.test'])

/** A baked endpoint is answered by the staged chain, which runs mainnet's contracts at mainnet's addresses. */
async function answerFromStagedChain(route: Route): Promise<void> {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' }
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
  const res = await fetch(staged().rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: route.request().postData() ?? '' })
  return route.fulfill({ status: res.status, headers: { ...cors, 'content-type': 'application/json' }, body: await res.text() })
}

/** Keeps every request on this machine; anything else is recorded and refused. */
async function stayLocal(context: BrowserContext, left: string[]): Promise<void> {
  await context.route(
    (url) => /^(https?|wss?):$/.test(url.protocol) && !LOCAL.has(url.hostname),
    (route) => {
      if (isRpcHost(route.request().url())) return answerFromStagedChain(route)
      left.push(`[left the machine] ${route.request().url()}`)
      return route.abort()
    },
  )
}

/** Runs `check` on a page in a context of its own, where a logged violation is expected, not a defect. */
export async function isolated(browser: Browser, baseURL: string | undefined, path: string, check: (page: Page) => Promise<void>): Promise<void> {
  const context = await browser.newContext({ baseURL })
  const left: string[] = []
  await stayLocal(context, left)
  const page = await context.newPage()
  await page.goto(path)
  await check(page)
  expect(left).toEqual([])
  await context.close()
}

/** Call once per spec file, at the top level. */
export function watchConsole(): void {
  const noise: string[] = []

  const attach = (page: Page) => {
    page.on('console', (m) => {
      const line = `[${m.type()}] ${m.text()} ${m.location()?.url ?? ''}`.trim()
      if (isRpcHost(m.location()?.url ?? '')) return trace(line, true)
      // Playwright's own Firefox driver warns from its chrome:// scripts; the Page logged nothing.
      if ((m.location()?.url ?? '').startsWith('chrome://juggler/')) return trace(line, true)
      trace(line)
      noise.push(line)
    })
    page.on('pageerror', (e) => {
      trace(`[pageerror] ${e.message}`)
      noise.push(`[pageerror] ${e.message}`)
    })
    // Everything is inlined, so any other failed request is a defect.
    page.on('requestfailed', (r) => {
      const line = `[requestfailed] ${r.url()} — ${r.failure()?.errorText ?? ''}`
      if (isRpcHost(r.url())) return trace(line, true)
      trace(line)
      noise.push(line)
    })
  }

  test.beforeEach(async ({ page, context }) => {
    // Later windows arrive through the context.
    attach(page)
    context.on('page', attach)
    await stayLocal(context, noise)
  })

  test.afterAll(() => {
    if (noise.length) throw new Error(`the page was not silent:\n  ${noise.join('\n  ')}`)
  })
}

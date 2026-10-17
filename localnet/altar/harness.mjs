/** Shared by the Altar harness files: the built page in jsdom, a stub wallet and stub endpoints. */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { toHex } from 'viem'
import { foundry } from 'viem/chains'
import { RPC, OWNER_A, OWNER_B, pub, wallet } from '../stage.mjs'
import { rpcUrls } from '../../scripts/env.mjs'
import { encodeHandoff } from '../../src/altar/lib/handoff.ts'
import { scan } from '../scan.mjs'
import { until, watchedConsole } from '../check.mjs'

const PAGE = readFileSync(fileURLToPath(new URL('../../dist/altar/index.html', import.meta.url)), 'utf8')
export const URL_BASE = 'http://localhost/altar.html'
export const DEAD = '0x000000000000000000000000000000000000dEaD'
/** The same address with one letter's case flipped: mixed case that fails its checksum. */
export const brokenChecksum = (address) =>
  address.replace(/(?<=^0x.*)[a-fA-F]/, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()))
// The page's refusal of any link it cannot answer.
export const UNANSWERABLE = 'This Proposal cannot be answered.'
/** The first endpoint the build bakes in; a test routes it to a local one. */
export const BAKED = rpcUrls(fileURLToPath(new URL('../..', import.meta.url)))[0]
export const BAKED_ORIGIN = new URL(BAKED).origin
/** What an endpoint on Sepolia answers to eth_chainId. */
export const SEPOLIA = '0xaa36a7'

const PENDING = { code: -32002, message: 'Request of type already pending.' }
const DECLINED = { code: 4001, message: 'User rejected the request.' }
const INTERNAL = { code: -32603, message: 'Internal error.' }

/**
 * EIP-1193 provider over a viem wallet; rejections are plain { code, message } objects, as wallets send.
 *   decline      refuse signing and sending (4001)
 *   declineAccounts  share no account until asked, then refuse the request (4001)
 *   declineSend  refuse sending only (4001)
 *   pendingSend  answer sending with -32002
 *   failSign     fail signing with -32603, as a wallet's own error
 *   failSend     fail sending with -32603
 *   pendingSwitch      answer a chain switch with -32002
 *   pendingPermissions answer the account picker with -32002
 *   granted      the account the site was granted, which may differ from `account`
 *   noAccounts   share no account at all
 *   grantAfterMs eth_requestAccounts answers -32002; accounts appear after this delay
 *   chainId      the chain the wallet reports
 *   gas          send with this gas limit, skipping estimation
 *   beforeSend   awaited just before a transaction is sent
 *   replaceSend  send a 0-value transfer to itself instead, as a cancel in the wallet does
 *   dropSend     answer with a hash no transaction has, as a send the network drops
 *   signAs       sign with this account instead, as a wallet on another key would
 *   highS        answer with the high-s twin of the signature, as some signers do
 *   lowV         answer with v as 0 or 1, as some signers do
 *   calls        an object counting requests by method
 */
export function stubWallet(account, opts = {}) {
  const w = wallet(account)
  const started = Date.now()
  let shared = opts.noAccounts ? [] : [opts.granted ?? account.address]
  const shareable = () => (opts.grantAfterMs && Date.now() - started < opts.grantAfterMs ? [] : shared)
  return {
    async request({ method, params }) {
      if (opts.calls) opts.calls[method] = (opts.calls[method] ?? 0) + 1
      switch (method) {
        case 'eth_accounts':
          return opts.declineAccounts ? [] : shareable()
        case 'eth_requestAccounts':
          if (opts.declineAccounts) throw DECLINED
          if (opts.grantAfterMs) throw PENDING
          return shared
        case 'wallet_requestPermissions':
          if (opts.pendingPermissions) throw PENDING
          if (!opts.noAccounts) shared = [account.address]
          return [{ parentCapability: 'eth_accounts' }]
        case 'eth_chainId':
          return toHex(opts.chainId ?? foundry.id)
        case 'wallet_switchEthereumChain':
          if (opts.pendingSwitch) throw PENDING
          return pub.request({ method, params })
        case 'eth_sendTransaction': {
          if (opts.decline || opts.declineSend) throw DECLINED
          if (opts.pendingSend) throw PENDING
          if (opts.failSend) throw INTERNAL
          await opts.beforeSend?.()
          if (opts.replaceSend) return w.sendTransaction({ to: account.address, value: 0n })
          if (opts.dropSend) return `0x${'ab'.repeat(32)}`
          const [tx] = params
          return w.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n, gas: opts.gas })
        }
        case 'eth_signTypedData_v4': {
          if (opts.decline) throw DECLINED
          if (opts.failSign) throw INTERNAL
          const td = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1]
          // JSON carries uint fields as strings.
          const message = { ...td.message }
          for (const k of ['value', 'safeTxGas', 'baseGas', 'gasPrice', 'nonce']) message[k] = BigInt(message[k])
          message.operation = Number(message.operation)
          const sig = await (opts.signAs ?? account).signTypedData({
            domain: { ...td.domain, chainId: Number(td.domain.chainId) },
            types: td.types,
            primaryType: td.primaryType,
            message,
          })
          if (opts.highS) {
            const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
            const s = n - BigInt(`0x${sig.slice(66, 130)}`)
            return `${sig.slice(0, 66)}${s.toString(16).padStart(64, '0')}${sig.slice(130) === '1b' ? '1c' : '1b'}`
          }
          // Some signers return v as 0 or 1 rather than 27 or 28.
          return opts.lowV ? sig.slice(0, -2) + (parseInt(sig.slice(-2), 16) - 27).toString(16).padStart(2, '0') : sig
        }
        default:
          return pub.request({ method, params })
      }
    },
  }
}

export const consoleNoise = []

/**
 * Only local endpoints answer, so baked-in public RPCs are never reached.
 * Counts per page, since several pages stay open and keep polling.
 */
const stubFetch = (count, refuse = [], route = {}, hosts = new Set()) => (input, init) => {
  const asked = typeof input === 'string' ? input : input.url
  const url = route[new URL(asked).origin] ?? asked
  if (url !== asked) input = url
  hosts.add(new URL(asked).host)
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) return Promise.reject(new TypeError('fetch failed'))
  if (refuse.length && refuse.some((m) => (init?.body ?? '').includes(`"${m}"`))) {
    return Promise.reject(new TypeError('fetch failed'))
  }
  try {
    count.n += JSON.parse(init?.body ?? 'null')?.length ?? 1
  } catch {
    count.n += 1
  }
  return globalThis.fetch(input, init)
}

/**
 * Boots the built page. `account` null means no wallet is injected.
 * `rpc` null means no endpoint is stored.
 * `announce` installs EIP-6963 wallets, which need no global to be found.
 * `refuse` lists JSON-RPC methods whose requests fail as a dropped connection.
 * `route` answers a baked endpoint's origin from a local one; `hosts` collects every host asked.
 * `blockStorage` makes sessionStorage throw, as a browser blocking it does; `fastClock` runs
 * Date.now thirty times faster; `setup` gets the window before the page runs.
 */
export function open(url, account, walletOpts = {}, {
  rpc = RPC, owner, sent, announce = [], count = { n: 0 }, refuse = [], route = {}, hosts, blockStorage, fastClock, setup,
} = {}) {
  return new JSDOM(PAGE, {
    virtualConsole: watchedConsole(consoleNoise),
    url,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(win) {
      if (account) win.ethereum = stubWallet(account, walletOpts)
      for (const w of announce) {
        const provider = stubWallet(w.account, w.opts ?? {})
        win.addEventListener('eip6963:requestProvider', () => {
          win.dispatchEvent(
            new win.CustomEvent('eip6963:announceProvider', {
              detail: { info: { rdns: w.rdns, name: w.name }, provider },
            }),
          )
        })
      }
      // viem's http transport needs the whole fetch surface, which jsdom lacks.
      win.fetch = stubFetch(count, refuse, route, hosts)
      win.Request = globalThis.Request
      win.Response = globalThis.Response
      win.Headers = globalThis.Headers
      win.AbortController = globalThis.AbortController
      win.AbortSignal = globalThis.AbortSignal
      if (rpc) win.sessionStorage.setItem('rpc', rpc)
      if (owner) win.sessionStorage.setItem('owner', owner)
      if (sent) win.sessionStorage.setItem('sent', sent)
      if (blockStorage) {
        Object.defineProperty(win, 'sessionStorage', {
          configurable: true,
          get() { throw new win.DOMException('The operation is insecure.', 'SecurityError') },
        })
      }
      if (fastClock) {
        const now = win.Date.now.bind(win.Date)
        const started = now()
        win.Date.now = () => started + (now() - started) * 30
      }
      setup?.(win)
      // The poll runs three times faster here; the period it asks for is recorded.
      const setInterval = win.setInterval.bind(win)
      win.periods = []
      win.setInterval = (fn, ms, ...rest) => {
        win.periods.push(ms)
        return setInterval(fn, ms >= 60000 ? ms / 3 : ms, ...rest)
      }
    },
  })
}

export const doc = (dom) => dom.window.document
/** What a screen reader names a button: its text, the aria-hidden emoji skipped. */
export const buttonName = (el) => [...(el?.childNodes ?? [])].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('')
/** The tab coming back into view: the page reads the nonce at once. */
export const shown = (dom) => doc(dom).dispatchEvent(new dom.window.Event('visibilitychange'))
export const text = (dom) => doc(dom).getElementById('panel').textContent.replace(/\s+/g, ' ').trim()
export const status = (dom) => doc(dom).getElementById('status')?.textContent?.trim() ?? ''
export const notice = (dom) => doc(dom).querySelector('.page-notice')?.textContent ?? ''
export const noticeFor = (host) => `☝️ The RPC endpoint, ${host}, sees you ask.`
/** The signed link, read from the QR code the screen shows. */
export const linkOf = (dom) => {
  const svg = doc(dom).querySelector('.qr svg')
  const d = svg?.querySelector('path')?.getAttribute('d')
  return d ? scan(d, Number(svg.getAttribute('viewBox').split(' ')[2])) : ''
}

export const says = (dom, needle, timeoutMs) => until(() => text(dom).includes(needle), timeoutMs)

export function pressEnter(dom, id) {
  doc(dom).getElementById(id).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
}

export function typeAndAsk(dom, value) {
  doc(dom).getElementById('owner').value = value
  doc(dom).getElementById('ask').click()
}

/** Read independently of handoff.ts, so a field the page adds or drops shows. */
export const decode = (link) => JSON.parse(Buffer.from(link.split('#')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
export const withFragment = (obj) => `${URL_BASE}#${encodeHandoff(obj)}`

/** Owner A asks for owner B; returns the page and its link. */
export async function askAsA() {
  const dom = open(URL_BASE, OWNER_A)
  await says(dom, 'Ask her to marry you')
  typeAndAsk(dom, OWNER_B.address)
  await says(dom, 'will you marry me')
  return { dom, link: linkOf(dom) }
}

/** A stub JSON-RPC endpoint, for chain states Anvil cannot stage; `delayMs` holds each answer back. */
export function stubRpc(answer, delayMs = 0) {
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const { id, method, params } = JSON.parse(body)
      setTimeout(async () => {
        res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
        // An answer may be a promise: a stub can forward to the local chain, an error going back as one.
        const reply = await Promise.resolve(answer(method, params)).then((result) => ({ result }), (e) => ({ error: { code: -32000, message: e?.shortMessage ?? String(e) } }))
        res.end(JSON.stringify({ jsonrpc: '2.0', id, ...reply }))
      }, delayMs)
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, server })))
}

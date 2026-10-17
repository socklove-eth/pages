import { BaseError, HttpRequestError, TimeoutError, type Transport } from 'viem'

export const RPC_ENDPOINTS_TEXT_KEY = 'rpc.endpoints'

/** Plain http is let through only to this machine, as the CSP allows. */
export function isLoopback(url: URL): boolean {
  return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
}

/**
 * A host on this machine or its network: loopback, private, link-local and
 * shared address ranges, single-label names, and the reserved local suffixes.
 */
export function isLocalHost(hostname: string): boolean {
  // A trailing dot names the same host: localhost. still reaches this machine.
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  // Every :: prefix (loopback, unspecified, IPv4-mapped or -compatible), NAT64, discard, documentation, 6to4,
  // unique-local, link-local, multicast.
  if (host.includes(':')) return /^(::.*|64:ff9b:.*|100::.*|2001:db8:.*|2002:.*|f[cd].*|fe[89ab].*|ff.*)$/.test(host)
  const ip = host.split('.').map(Number)
  if (ip.length === 4 && ip.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    const [a = 0, b = 0, c = 0] = ip
    // Every IPv4 range that is not publicly routable, multicast and reserved included.
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
      || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113) || (a === 192 && b === 88 && c === 99)
  }
  return !host.includes('.') || /\.(localhost|local|internal|lan|home\.arpa)$/.test(host)
}

/**
 * The endpoints a record names, in order: comma-separated, https on public
 * hosts only, whatever chain an endpoint claims. Malformed entries and repeats
 * are dropped, never repaired.
 */
export function endpointsFrom(record: string): string[] {
  const urls: string[] = []
  for (const part of record.split(',')) {
    const entry = part.trim()
    let url: URL
    try {
      url = new URL(entry)
    } catch {
      continue
    }
    // An entry the URL parser had to repair (slashes, backslashes, whitespace, an empty login) is malformed.
    if (url.href !== entry && url.href !== `${entry}/`) continue
    if (url.protocol !== 'https:' || isLocalHost(url.hostname) || url.username || url.password) continue
    if (!urls.includes(url.href)) urls.push(url.href)
  }
  return urls
}

/** viem's own cap on an answer's size. */
const MAX_ANSWER_BYTES = 10_485_760

/**
 * fetch, its body read before it returns: viem's timeout ends where fetch
 * returns, so a body that stalls is then still under it, and the request, and
 * the fallback, never hang. A host is named only once its whole answer is in.
 * The body is counted as it arrives and given up past viem's cap.
 */
export const fetchWhole: typeof fetch = async (input, init) => {
  const response = await fetch(input, init)
  const reader = response.body?.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const read = await reader?.read()
    if (!read || read.done) break
    size += read.value.byteLength
    if (size > MAX_ANSWER_BYTES) {
      await reader?.cancel()
      throw new Error('The answer is too large.')
    }
    chunks.push(read.value)
  }
  const body = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    body.set(chunk, at)
    at += chunk.byteLength
  }
  // These statuses carry no body, and a Response refuses one.
  const empty = [204, 205, 304].includes(response.status)
  return new Response(empty ? null : new TextDecoder().decode(body), { status: response.status, statusText: response.statusText, headers: response.headers })
}

/** An endpoint that answers for another chain than the one this tab reads. */
export class WrongChain extends Error {}

/** A connection that failed or timed out, as opposed to an endpoint's own error. */
const lost = (e: unknown): boolean =>
  e instanceof BaseError && e.walk((c) => c instanceof HttpRequestError || c instanceof TimeoutError) !== null

/**
 * Lets a named endpoint serve only once it has answered for the expected
 * chain. One that answers for another fails every request for the rest of the
 * tab, so a fallback passes over it at once; so does one that cannot be reached,
 * first or later, unless `retry` asks it again next time. `onTrusted` runs once
 * it has answered for the expected chain.
 */
export function onChain(transport: Transport, chainId: number, onTrusted: () => void = () => {}, retry = false): Transport {
  // Outside the factory: a fallback builds its transports afresh for every request.
  let verdict: Promise<boolean> | undefined
  return (options) => {
    const inner = transport(options)
    const check = (): Promise<boolean> =>
      (verdict ??= inner.request({ method: 'eth_chainId' }).then(
        (id) => {
          const trusted = Number(id) === chainId
          if (trusted) onTrusted()
          return trusted
        },
        (e: unknown) => {
          if (retry) verdict = undefined
          throw e
        },
      ))
    const request = (async (args: Parameters<typeof inner.request>[0]) => {
      if (!(await check())) throw new WrongChain('This endpoint answers for another chain.')
      try {
        return await inner.request(args)
      } catch (e) {
        if (!retry && lost(e)) {
          verdict = Promise.reject(e)
          verdict.catch(() => {})
        }
        throw e
      }
    }) as typeof inner.request
    return { ...inner, request }
  }
}

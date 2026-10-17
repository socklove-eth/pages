/**
 * A static file server for dist/, with no dependency.
 *
 *   node scripts/serve.mjs <dir> <port> [host]
 */
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

const TYPES = { html: 'text/html; charset=utf-8', svg: 'image/svg+xml', css: 'text/css' }

export function serve(dir, port, { host = '127.0.0.1' } = {}) {
  const root = resolve(dir)
  return createServer((req, res) => {
    try {
      const path = decodeURIComponent((req.url ?? '/').split(/[?#]/)[0])
      const file = join(root, path.endsWith('/') ? `${path}index.html` : path)
      // join() folds '..'; the trailing sep rejects siblings such as dist-foo.
      if (!file.startsWith(root + sep) || !existsSync(file)) {
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('not found')
        return
      }
      if (statSync(file).isDirectory()) {
        res.writeHead(302, { location: `${path}/` })
        res.end()
        return
      }
      res.writeHead(200, {
        'content-type': TYPES[file.split('.').pop()] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      })
      res.end(readFileSync(file))
    } catch {
      res.writeHead(400, { 'content-type': 'text/plain' })
      res.end('bad request')
    }
  }).listen(port, host)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, port, host] = process.argv.slice(2)
  if (!dir || !port) {
    console.error('usage: node scripts/serve.mjs <dir> <port> [host]')
    process.exit(1)
  }
  serve(dir, Number(port), { host })
}
